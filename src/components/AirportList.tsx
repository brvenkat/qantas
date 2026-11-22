import { useLayoutEffect, useMemo, useRef } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { searchAirports, type Airport } from '../airports'

const pageSizes = [20, 50, 100]
const number = new Intl.NumberFormat('en-AU')

export type ListSelection = { code: string; scroll: number }

export function AirportList({ airports, selections }: {
  airports: Airport[]
  selections: Map<string, ListSelection>
}) {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const url = location.pathname + location.search
  const query = params.get('q') ?? ''
  const requestedSize = Number(params.get('size'))
  const pageSize = pageSizes.find(size => size === requestedSize) ?? pageSizes[0]
  const filtered = useMemo(() => searchAirports(airports, query), [airports, query])
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const requestedPage = Number(params.get('page')) || 1
  const page = Math.min(pages, Math.max(1, Math.floor(requestedPage)))
  const heading = useRef<HTMLHeadingElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const start = (page - 1) * pageSize
  const end = Math.min(start + pageSize, filtered.length)

  useLayoutEffect(() => {
    const lastSelection = selections.get(location.key)
    if (lastSelection) {
      document.getElementById(`airport-${lastSelection.code}`)?.focus({ preventScroll: true })
      window.scrollTo(0, lastSelection.scroll)
    }
  }, [selections, location.key])

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
    const updated = new URLSearchParams(params)
    updated.delete('page')
    if (text) updated.set('q', text)
    else updated.delete('q')
    setParams(updated, { replace: true })
  }

  function changePageSize(size: number) {
    const updated = new URLSearchParams(params)
    updated.delete('page')
    if (size === pageSizes[0]) updated.delete('size')
    else updated.set('size', String(size))
    setParams(updated)
  }

  return <>
    <section className="intro">
      <h1>Explore airports</h1>
      <p>Find an airport and view its location, time zone and currency.</p>
      <label htmlFor="airport-search">Search airports</label>
      <input id="airport-search" ref={searchInput} type="search" placeholder="Name, country or airport code"
        value={query} onChange={event => changeQuery(event.target.value)} />
    </section>
    <section aria-labelledby="results-heading" className="panel results">
      <div className="results-header">
        <div>
          <h2 id="results-heading" ref={heading} tabIndex={-1}>Airports</h2>
          <p className="result-count" role="status">
            {filtered.length > 1
              ? `Showing ${number.format(start + 1)}–${number.format(end)} of ${number.format(filtered.length)} airports`
              : filtered.length === 1 ? '1 airport' : '0 airports'}
          </p>
        </div>
        <div className="results-controls">
          <label htmlFor="page-size">Airports per page</label>
          <select id="page-size" value={pageSize} onChange={event => changePageSize(Number(event.target.value))}>
            {pageSizes.map(size => <option key={size} value={size}>{size}</option>)}
          </select>
        </div>
      </div>
      {filtered.length ? <ul className="airport-list">
        {filtered.slice(start, end).map(airport => <li key={airport.code}>
          <Link id={`airport-${airport.code}`} to={`/airports/${airport.code}`} state={{ list: url, listKey: location.key }}
            onClick={event => {
              if (!event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
                selections.set(location.key, { code: airport.code, scroll: window.scrollY })
              }
            }}>
            <span className="code">{airport.code}</span>
            <span className="airport-label"><strong>{airport.name}</strong><span>{airport.country || 'Country unavailable'}</span></span>
            <span className="row-chevron" aria-hidden="true">›</span>
          </Link>
        </li>)}
      </ul> : <div className="empty">
        <p>No airports match your search.</p>
        <button type="button" onClick={() => {
          changeQuery('')
          searchInput.current?.focus()
        }}>Clear search</button>
      </div>}
      {pages > 1 && <nav className="pagination" aria-label="Airport results pages">
        <button type="button" disabled={page === 1} onClick={() => changePage(page - 1)}>Previous</button>
        <span>Page {number.format(page)} of {number.format(pages)}</span>
        <button type="button" disabled={page === pages} onClick={() => changePage(page + 1)}>Next</button>
      </nav>}
    </section>
  </>
}
