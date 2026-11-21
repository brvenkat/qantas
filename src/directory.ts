import { airportCode, parseAirports, record, type Airport } from './airports'

export const endpoint = 'https://api.qantas.com/flight/refData/airport'
const cacheKey = 'airport-directory:v1'
const cooldownKey = 'airport-directory:cooldown:v1'
const freshFor = 15 * 60_000
const staleFor = 7 * 24 * 60 * 60_000
const timeout = 10_000
const ordinaryCooldown = 5_000
const rateLimitCooldown = 60_000

interface Snapshot {
  airports: Airport[]
  fetchedAt: number
}

export class DirectoryError extends Error {
  constructor(message: string, public retryAt: number) {
    super(message)
  }
}

function read(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

function write(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* Storage may be disabled or full. */ }
}

function isAirport(value: unknown): value is Airport {
  const entry = record(value)
  const { code, name, coordinates } = entry
  return typeof code === 'string' && airportCode.test(code) &&
    typeof name === 'string' && name.length > 0 &&
    ['country', 'countryCode', 'city', 'state', 'timezone'].every(key => typeof entry[key] === 'string') &&
    (coordinates === null || (Array.isArray(coordinates) && coordinates.length === 2 &&
      coordinates.every(value => typeof value === 'number' && Number.isFinite(value))))
}

function readSnapshot(): Snapshot | null {
  try {
    const snapshot = record(JSON.parse(read(cacheKey) ?? 'null'))
    if (typeof snapshot.fetchedAt === 'number' && snapshot.fetchedAt <= Date.now() &&
      Array.isArray(snapshot.airports) && snapshot.airports.length && snapshot.airports.every(isAirport)) {
      return { fetchedAt: snapshot.fetchedAt, airports: snapshot.airports }
    }
  } catch { /* A damaged cache can be replaced by the next fetch. */ }
  return null
}

export function retryDeadline(header: string | null, now: number, fallback: number): number {
  if (header && /^\d+$/.test(header.trim())) {
    const at = now + Number(header) * 1000
    if (Number.isSafeInteger(at)) return Math.max(now + ordinaryCooldown, at)
    return now + fallback
  }
  const parsed = header ? Date.parse(header) : NaN
  return Number.isFinite(parsed) ? Math.max(now + ordinaryCooldown, parsed) : now + fallback
}

function readFailure(): DirectoryError | null {
  try {
    const entry = record(JSON.parse(read(cooldownKey) ?? 'null'))
    if (typeof entry.message === 'string' && typeof entry.retryAt === 'number') {
      return new DirectoryError(entry.message, entry.retryAt)
    }
  } catch { /* The in-memory deadline still applies. */ }
  return null
}

export function createDirectory() {
  let snapshot = readSnapshot()
  let failure: DirectoryError | null = null
  let inFlight: Promise<Snapshot> | null = null

  function cached(): Snapshot | null {
    return snapshot && Date.now() - snapshot.fetchedAt < staleFor ? snapshot : null
  }

  async function refresh(): Promise<Snapshot> {
    const stored = readSnapshot()
    if (stored && (!snapshot || stored.fetchedAt > snapshot.fetchedAt)) snapshot = stored
    if (snapshot && Date.now() - snapshot.fetchedAt < freshFor) return snapshot

    const sharedFailure = readFailure()
    if (sharedFailure && sharedFailure.retryAt > (failure?.retryAt ?? 0)) failure = sharedFailure
    if (failure && Date.now() < failure.retryAt) throw failure

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)
    try {
      const response = await fetch(endpoint, { signal: controller.signal, credentials: 'omit' })
      if (response.status === 429 || response.status === 503) {
        const limited = response.status === 429
        throw new DirectoryError(
          limited ? 'The airport service is receiving too many requests.' : 'The airport service is temporarily unavailable.',
          retryDeadline(response.headers.get('Retry-After'), Date.now(), limited ? rateLimitCooldown : 15_000),
        )
      }
      if (!response.ok) throw new Error('Airport request failed')
      const airports = parseAirports(await response.json())
      snapshot = { airports, fetchedAt: Date.now() }
      write(cacheKey, JSON.stringify(snapshot))
      return snapshot
    } catch (cause) {
      const message = controller.signal.aborted
        ? 'The airport service took too long to respond.'
        : navigator.onLine === false
          ? 'You appear to be offline.'
          : 'The airport directory could not be loaded.'
      failure = cause instanceof DirectoryError ? cause : new DirectoryError(message, Date.now() + ordinaryCooldown)
      write(cooldownKey, JSON.stringify({ message: failure.message, retryAt: failure.retryAt }))
      throw failure
    } finally {
      clearTimeout(timer)
    }
  }

  function load(): Promise<Snapshot> {
    if (inFlight) return inFlight
    const work = Promise.resolve(navigator.locks ? navigator.locks.request(cacheKey, refresh) : refresh())
    inFlight = work.finally(() => { inFlight = null })
    return inFlight
  }

  return { cached, load }
}

export const directory = createDirectory()
