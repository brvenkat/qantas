import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDirectory, retryDeadline } from './directory'

const payload = [{ airportCode: 'SYD', airportName: 'Sydney' }]
const now = Date.UTC(2026, 0, 1)
const minutes = (value: number) => value * 60_000

describe('airport directory requests', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('shares concurrent calls and reuses fresh data across instances', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(payload))
    vi.stubGlobal('fetch', fetch)
    const directory = createDirectory()
    const first = directory.load()
    expect(directory.load()).toBe(first)
    await expect(first).resolves.toMatchObject({ airports: [{ code: 'SYD' }] })
    await createDirectory().load()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('rechecks shared storage after acquiring a cross-tab lock', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(payload))
    vi.stubGlobal('fetch', fetch)
    let tail: Promise<unknown> = Promise.resolve()
    const navigatorData = navigator
    vi.stubGlobal('navigator', {
      onLine: navigatorData.onLine,
      locks: {
        request: (_name: string, callback: () => Promise<unknown>) => {
          const result = tail.then(callback)
          tail = result.catch(() => undefined)
          return result
        },
      },
    })
    const first = createDirectory()
    const second = createDirectory()
    await Promise.all([first.load(), second.load()])
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('preserves stale data when a refresh fails and expires it after seven days', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json(payload))
      .mockResolvedValueOnce(Response.json({ error: 'Unavailable' }, { status: 500 }))
    vi.stubGlobal('fetch', fetch)

    await createDirectory().load()
    vi.setSystemTime(now + minutes(16))
    const directory = createDirectory()
    await expect(directory.load()).rejects.toThrow('could not be loaded')
    expect(directory.cached()?.airports[0].code).toBe('SYD')
    vi.setSystemTime(now + minutes(7 * 24 * 60))
    expect(directory.cached()).toBeNull()
  })

  it('honors Retry-After and blocks subsequent callers until the shared deadline', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'Retry-After': '90' } }))
      .mockResolvedValueOnce(Response.json(payload))
    vi.stubGlobal('fetch', fetch)
    await expect(createDirectory().load()).rejects.toMatchObject({ retryAt: now + 90_000 })
    vi.setSystemTime(now + 89_000)
    await expect(createDirectory().load()).rejects.toMatchObject({ retryAt: now + 90_000 })
    expect(fetch).toHaveBeenCalledTimes(1)
    vi.setSystemTime(now + 90_000)
    await expect(createDirectory().load()).resolves.toMatchObject({ airports: [{ code: 'SYD' }] })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('parses date-form deadlines and falls back when CORS hides the header', () => {
    expect(retryDeadline(new Date(now + 120_000).toUTCString(), now, 60_000)).toBe(now + 120_000)
    expect(retryDeadline(null, now, 60_000)).toBe(now + 60_000)
    expect(retryDeadline('invalid', now, 60_000)).toBe(now + 60_000)
  })

  it('bounds the response wait and allows a later retry', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      }))
      .mockResolvedValueOnce(Response.json(payload))
    vi.stubGlobal('fetch', fetch)
    const directory = createDirectory()

    const rejected = expect(directory.load()).rejects.toThrow('took too long')
    await vi.advanceTimersByTimeAsync(10_000)
    await rejected
    await vi.advanceTimersByTimeAsync(5_000)
    await expect(directory.load()).resolves.toMatchObject({ airports: [{ code: 'SYD' }] })
  })

  it('recovers after an invalid payload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json([])).mockResolvedValueOnce(Response.json(payload)))
    const directory = createDirectory()
    await expect(directory.load()).rejects.toThrow('could not be loaded')
    expect(directory.cached()).toBeNull()
    vi.setSystemTime(now + 5000)
    await expect(directory.load()).resolves.toMatchObject({ airports: [{ code: 'SYD' }] })
  })
})
