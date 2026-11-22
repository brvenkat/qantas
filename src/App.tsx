import { useEffect, useRef, useState } from 'react'
import { Route, Routes } from 'react-router'
import { AirportDetails, Missing } from './components/AirportDetails'
import { AirportList, type ListSelection } from './components/AirportList'
import type { DirectoryError } from './directory'
import { useDirectory } from './hooks/useDirectory'

const number = new Intl.NumberFormat('en-AU')
const date = new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' })

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
  const selections = useRef(new Map<string, ListSelection>()).current

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
        <Route path="/" element={<AirportList airports={snapshot.airports} selections={selections} />} />
        <Route path="/airports/:code" element={<AirportDetails airports={snapshot.airports} />} />
        <Route path="*" element={<Missing title="Page unavailable" />} />
      </Routes>}
    </main>
    <footer className="shell footer">Airport data provided by Qantas</footer>
  </>
}
