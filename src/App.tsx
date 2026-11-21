import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Link, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import currencies from 'country-to-currency'
import { searchAirports, type Airport } from './airports'
import { directory, DirectoryError } from './directory'

const pageSize = 30
const number = new Intl.NumberFormat('en-AU')
const date = new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
const countryCurrency = new Map(Object.entries(currencies))

function useDirectory() {
  const [snapshot, setSnapshot] = useState(directory.cached)
  const [pending, setPending] = useState(true)
  const [offline, setOffline] = useState(() => !navigator.onLine)
  const [error, setError] = useState<DirectoryError | null>(null)
  const generation = useRef(0)

  const refresh = useCallback(async () => {
    const request = ++generation.current
    setPending(true)
    setError(null)
    try {
      const next = await directory.load()
      if (request === generation.current) setSnapshot(next)
    } catch (cause) {
      if (request === generation.current) {
        setSnapshot(directory.cached())
        setError(cause instanceof DirectoryError ? cause : new DirectoryError('The airport directory could not be loaded.', Date.now() + 5000))
      }
    } finally {
      if (request === generation.current) setPending(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const reconnect = () => {
      setOffline(false)
      void refresh()
    }
    const disconnect = () => setOffline(true)
    window.addEventListener('online', reconnect)
    window.addEventListener('offline', disconnect)
    return () => {
      generation.current++
      window.removeEventListener('online', reconnect)
      window.removeEventListener('offline', disconnect)
    }
  }, [refresh])

  return { snapshot, pending, error, offline, refresh }
}

function Retry({ error, onRetry }: { error: DirectoryError; onRetry: () => void }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => {
      const time = Date.now()
      setNow(time)
      if (time >= error.retryAt) window.clearInterval(timer)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [error.retryAt])
  const seconds = Math.max(0, Math.ceil((error.retryAt - now) / 1000))
  return <button type="button" disabled={seconds > 0} onClick={onRetry}>
    {seconds > 0 ? `Retry in ${number.format(seconds)}s` : 'Try again'}
  </button>
}

export function App() {
  const { snapshot, pending, error, offline, refresh } = useDirectory()
  const selection = useRef<Selection | null>(null)

  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="masthead">
      <div className="shell masthead-inner">
        <div className="brand">Qantas <span>Airport directory</span></div>
      </div>
    </header>
    <main className="shell main" id="main" tabIndex={-1}>
      {error && <div className="notice">
        <div role={snapshot ? 'status' : 'alert'}>
          <strong>{error.message}</strong>
          {snapshot && <div>Showing saved airport data from {date.format(snapshot.fetchedAt)}.</div>}
        </div>
        <Retry key={error.retryAt} error={error} onRetry={() => void refresh()} />
      </div>}
      {offline && snapshot && !error && <div className="notice" role="status">
        You’re offline. Showing saved airport data from {date.format(snapshot.fetchedAt)}.
      </div>}
      {pending && !snapshot && <div className="loading panel" role="status">
        <span className="spinner" aria-hidden="true" />
        <strong>Loading airports</strong>
        <span>Fetching the airport directory from Qantas.</span>
      </div>}
      {pending && snapshot && !offline && <p className="background-status" role="status">Checking for updated airport data…</p>}
      {snapshot && <Routes>
        <Route path="/" element={<AirportList airports={snapshot.airports} selection={selection} />} />
        <Route path="/airports/:code" element={<AirportDetails airports={snapshot.airports} selection={selection} />} />
        <Route path="*" element={<Missing title="Page unavailable" />} />
      </Routes>}
    </main>
    <footer className="shell footer">Airport data provided by Qantas</footer>
  </>
}

type Selection = { url: string; code: string; scroll: number }

function AirportList({ airports, selection }: {
  airports: Airport[]
  selection: RefObject<Selection | null>
}) {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const url = location.pathname + location.search
  const query = params.get('q') ?? ''
  const filtered = useMemo(() => searchAirports(airports, query), [airports, query])
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const requestedPage = Number(params.get('page')) || 1
  const page = Math.min(pages, Math.max(1, Math.floor(requestedPage)))
  const heading = useRef<HTMLHeadingElement>(null)
  const start = (page - 1) * pageSize
  const end = Math.min(start + pageSize, filtered.length)

  useLayoutEffect(() => {
    const lastSelection = selection.current
    if (lastSelection?.url === url) {
      document.getElementById(`airport-${lastSelection.code}`)?.focus({ preventScroll: true })
      window.scrollTo(0, lastSelection.scroll)
      selection.current = null
    }
  }, [selection, url])

  function changePage(next: number) {
    setParams(current => {
      const updated = new URLSearchParams(current)
      if (next === 1) updated.delete('page')
      else updated.set('page', String(next))
      return updated
    })
    heading.current?.focus()
  }

  function changeQuery(text: string) {
    const updated = new URLSearchParams()
    if (text) updated.set('q', text)
    setParams(updated, { replace: true })
  }

  return <>
    <section className="intro">
      <h1>Explore airports</h1>
      <p>Find an airport and view its location, time zone and currency.</p>
      <label htmlFor="airport-search">Search airports</label>
      <input id="airport-search" type="search" placeholder="Name, country or airport code"
        value={query} onChange={event => changeQuery(event.target.value)} />
    </section>
    <section aria-labelledby="results-heading" className="panel results">
      <div className="results-header">
        <h2 id="results-heading" ref={heading} tabIndex={-1}>Airports</h2>
        <div role="status">
          {filtered.length ? `${number.format(start + 1)}–${number.format(end)} of ${number.format(filtered.length)}` : '0 results'}
        </div>
      </div>
      {filtered.length ? <ul className="airport-list">
        {filtered.slice(start, end).map(airport => <li key={airport.code}>
          <Link id={`airport-${airport.code}`} to={`/airports/${airport.code}`} state={{ list: url }}
            onClick={event => {
              if (!event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
                selection.current = { url, code: airport.code, scroll: window.scrollY }
              }
            }}>
            <span className="code">{airport.code}</span>
            <span className="airport-label"><strong>{airport.name}</strong><span>{airport.country || 'Country unavailable'}</span></span>
            <span className="row-chevron" aria-hidden="true">›</span>
          </Link>
        </li>)}
      </ul> : <p className="empty">No airports match your search.</p>}
      {pages > 1 && <nav className="pagination" aria-label="Airport results pages">
        <button type="button" disabled={page === 1} onClick={() => changePage(page - 1)}>Previous</button>
        <span>Page {number.format(page)} of {number.format(pages)}</span>
        <button type="button" disabled={page === pages} onClick={() => changePage(page + 1)}>Next</button>
      </nav>}
    </section>
  </>
}

function usePageHeading() {
  const ref = useRef<HTMLHeadingElement>(null)
  const { pathname } = useLocation()
  useLayoutEffect(() => {
    window.scrollTo(0, 0)
    ref.current?.focus({ preventScroll: true })
  }, [pathname])
  return ref
}

function Missing({ title, back }: { title: string; back?: ReactNode }) {
  const heading = usePageHeading()
  return <section className="intro">
    <h1 ref={heading} tabIndex={-1}>{title}</h1>
    {back ?? <Link className="back" to="/">Back to airports</Link>}
  </section>
}

function AirportDetails({ airports, selection }: {
  airports: Airport[]
  selection: RefObject<Selection | null>
}) {
  const { code } = useParams()
  const { state } = useLocation()
  const navigate = useNavigate()
  const heading = usePageHeading()
  const airport = airports.find(item => item.code === code?.toUpperCase())
  const list = typeof state?.list === 'string' && /^\/(\?|$)/.test(state.list) ? state.list : '/'
  const back = <Link className="back" to={list} onClick={event => {
    if (selection.current?.url === list && selection.current?.code === code &&
      !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
      event.preventDefault()
      void navigate(-1)
    }
  }}>Back to airports</Link>
  if (!airport) return <Missing title="Airport unavailable" back={back} />

  const location = [...new Set([airport.city, airport.state, airport.country].filter(Boolean))].join(', ')
  const coordinates = airport.coordinates?.map(coordinate => coordinate.toFixed(4)).join(', ')
  return <article>
    {back}
    <div className="intro detail-intro">
      <span className="code">{airport.code}</span>
      <h1 ref={heading} tabIndex={-1}>{airport.name}</h1>
      {airport.country && <p>{airport.country}</p>}
    </div>
    <div className="panel details">
      <h2>Airport details</h2>
      <dl>
        <div><dt>Location</dt><dd>{location || 'Unavailable'}</dd></div>
        <div><dt>Time zone</dt><dd>{airport.timezone || 'Unavailable'}</dd></div>
        <div><dt>Country currency</dt><dd>{countryCurrency.get(airport.countryCode) ?? 'Unavailable'}</dd></div>
        <div><dt>Coordinates</dt><dd>{coordinates || 'Unavailable'}</dd></div>
      </dl>
    </div>
  </article>
}
