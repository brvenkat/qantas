import { isAirport, parseAirports, record, type Airport } from './airports'
import { getJson, HttpRequestError } from './services/http'

export const endpoint = 'https://api.qantas.com/flight/refData/airport'
const cacheKey = 'airport-directory:v1'
const cooldownKey = 'airport-directory:cooldown:v1'
const freshFor = 15 * 60_000
const staleFor = 7 * 24 * 60 * 60_000
const attemptTimeout = 3_500
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

function readSnapshot(): Snapshot | null {
  try {
    const snapshot = record(JSON.parse(read(cacheKey) ?? 'null'))
    if (typeof snapshot.fetchedAt === 'number' && snapshot.fetchedAt <= Date.now() &&
      Array.isArray(snapshot.airports) && snapshot.airports.length && snapshot.airports.every(isAirport) &&
      new Set(snapshot.airports.map(airport => airport.code)).size === snapshot.airports.length) {
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

function readFailure(snapshot: Snapshot | null): DirectoryError | null {
  try {
    const entry = record(JSON.parse(read(cooldownKey) ?? 'null'))
    if (typeof entry.message === 'string' && typeof entry.retryAt === 'number') {
      // A newer successful snapshot supersedes a cooldown that storage could not remove.
      if (snapshot && typeof entry.failedAt === 'number' && snapshot.fetchedAt > entry.failedAt) return null
      return new DirectoryError(entry.message, entry.retryAt)
    }
  } catch { /* The in-memory deadline still applies. */ }
  return null
}

function toDirectoryError(cause: unknown): DirectoryError {
  const now = Date.now()
  const failure = cause instanceof HttpRequestError ? cause.failure : null
  if (failure?.kind === 'http' && (failure.status === 429 || failure.status === 503)) {
    const limited = failure.status === 429
    return new DirectoryError(
      limited ? 'The airport service is receiving too many requests.' : 'The airport service is temporarily unavailable.',
      retryDeadline(failure.retryAfter, now, limited ? rateLimitCooldown : 15_000),
    )
  }

  const message = failure?.kind === 'timeout'
    ? 'The airport service took too long to respond.'
    : navigator.onLine === false
      ? 'You appear to be offline.'
      : 'The airport directory could not be loaded.'
  const retryAt = failure?.kind === 'http'
    ? retryDeadline(failure.retryAfter, now, ordinaryCooldown)
    : now + ordinaryCooldown
  return new DirectoryError(message, retryAt)
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

    const sharedFailure = readFailure(snapshot)
    if (sharedFailure && sharedFailure.retryAt > (failure?.retryAt ?? 0)) failure = sharedFailure
    if (failure && Date.now() < failure.retryAt) throw failure

    try {
      const airports = parseAirports(await getJson(endpoint, { timeoutMs: attemptTimeout }))
      snapshot = { airports, fetchedAt: Date.now() }
      write(cacheKey, JSON.stringify(snapshot))
      failure = null
      try { localStorage.removeItem(cooldownKey) } catch { /* The successful snapshot supersedes this entry. */ }
      return snapshot
    } catch (cause) {
      failure = toDirectoryError(cause)
      write(cooldownKey, JSON.stringify({ message: failure.message, retryAt: failure.retryAt, failedAt: Date.now() }))
      throw failure
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
