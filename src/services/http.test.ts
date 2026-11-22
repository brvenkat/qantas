import { afterEach, expect, it, vi } from 'vitest'
import { getJson } from './http'

const url = 'https://api.example.test/items'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

it('retries transient GET failures with exponential backoff and jitter', async () => {
  vi.useFakeTimers()
  vi.spyOn(Math, 'random').mockReturnValue(0)
  const fetch = vi.fn()
    .mockResolvedValueOnce(new Response(null, { status: 502 }))
    .mockRejectedValueOnce(new TypeError('Connection reset'))
    .mockResolvedValueOnce(Response.json({ items: [] }))
  vi.stubGlobal('fetch', fetch)

  const result = getJson(url)
  await vi.advanceTimersByTimeAsync(249)
  expect(fetch).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1)
  expect(fetch).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(499)
  expect(fetch).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(1)
  await expect(result).resolves.toEqual({ items: [] })
  expect(fetch).toHaveBeenCalledTimes(3)
  expect(fetch).toHaveBeenCalledWith(url, expect.objectContaining({ credentials: 'omit' }))
})

it('preserves HTTP status and Retry-After for the caller without retrying', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, {
    status: 429, headers: { 'Retry-After': '90' },
  }))
  vi.stubGlobal('fetch', fetch)
  await expect(getJson(url)).rejects.toMatchObject({
    failure: { kind: 'http', status: 429, retryAfter: '90' },
  })
  expect(fetch).toHaveBeenCalledOnce()
})

it('does not retry malformed JSON', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('<html>Unexpected page</html>'))
  vi.stubGlobal('fetch', fetch)
  await expect(getJson(url)).rejects.toMatchObject({ failure: { kind: 'invalid-json' } })
  expect(fetch).toHaveBeenCalledOnce()
})

it('keeps the timeout active while the body is being read', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn((_url, options: RequestInit) => Promise.resolve({
    ok: true,
    json: () => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }),
  })))
  const rejection = expect(getJson(url, { maxAttempts: 1, timeoutMs: 100 }))
    .rejects.toMatchObject({ failure: { kind: 'timeout' } })
  await vi.advanceTimersByTimeAsync(100)
  await rejection
})
