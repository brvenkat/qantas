type HttpFailure =
  | { kind: 'http'; status: number; retryAfter: string | null }
  | { kind: 'timeout' }
  | { kind: 'network' }
  | { kind: 'invalid-json' }

export class HttpRequestError extends Error {
  constructor(public readonly failure: HttpFailure, cause?: unknown) {
    super(
      failure.kind === 'http' ? `HTTP request failed (${failure.status})` : `HTTP request failed (${failure.kind})`,
      { cause },
    )
    this.name = 'HttpRequestError'
  }
}

const transientStatuses = new Set([408, 500, 502, 504])

function canRetry(error: unknown): boolean {
  if (!(error instanceof HttpRequestError) || globalThis.navigator?.onLine === false) return false
  const { failure } = error
  if (failure.kind === 'http') return failure.retryAfter === null && transientStatuses.has(failure.status)
  return failure.kind === 'network' || failure.kind === 'timeout'
}

export async function getJson(
  url: string,
  { timeoutMs = 10_000, maxAttempts = 3 } = {},
): Promise<unknown> {
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError('maxAttempts must be a positive integer')
  }

  for (let attempt = 1; ; attempt++) {
    try {
      return await fetchJson(url, timeoutMs)
    } catch (error) {
      if (attempt >= maxAttempts || !canRetry(error)) throw error
      const ceiling = Math.min(4_000, 500 * 2 ** (attempt - 1))
      const delay = ceiling * (0.5 + Math.random() / 2)
      await new Promise<void>(resolve => setTimeout(resolve, delay))
    }
  }
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    let response: Response
    try {
      response = await fetch(url, { signal: controller.signal, credentials: 'omit' })
    } catch (cause) {
      if (!controller.signal.aborted && cause instanceof TypeError) {
        throw new HttpRequestError({ kind: 'network' }, cause)
      }
      throw cause
    }
    if (!response.ok) {
      const { status } = response
      const retryAfter = response.headers.get('Retry-After')
      controller.abort()
      throw new HttpRequestError({ kind: 'http', status, retryAfter })
    }

    // Await decoding here so the timeout still covers a slow response body.
    const body: unknown = await response.json()
    return body
  } catch (cause) {
    if (cause instanceof HttpRequestError) throw cause
    if (controller.signal.aborted) throw new HttpRequestError({ kind: 'timeout' }, cause)
    if (cause instanceof SyntaxError) throw new HttpRequestError({ kind: 'invalid-json' }, cause)
    throw cause
  } finally {
    clearTimeout(timer)
  }
}
