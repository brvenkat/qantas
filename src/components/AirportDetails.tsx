import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import currencies from 'country-to-currency'
import type { Airport } from '../airports'

const countryCurrency = new Map(Object.entries(currencies))

function usePageHeading() {
  const ref = useRef<HTMLHeadingElement>(null)
  const { pathname } = useLocation()
  useLayoutEffect(() => {
    window.scrollTo(0, 0)
    ref.current?.focus({ preventScroll: true })
  }, [pathname])
  return ref
}

export function Missing({ title, back }: { title: string; back?: ReactNode }) {
  const heading = usePageHeading()
  return <section className="intro">
    <h1 ref={heading} tabIndex={-1}>{title}</h1>
    {back ?? <Link className="back" to="/">Back to airports</Link>}
  </section>
}

export function AirportDetails({ airports }: { airports: Airport[] }) {
  const { code } = useParams()
  const { state } = useLocation()
  const navigate = useNavigate()
  const heading = usePageHeading()
  const airport = airports.find(item => item.code === code?.toUpperCase())
  const fromList = typeof state?.listKey === 'string' && typeof state?.list === 'string' && /^\/(\?|$)/.test(state.list)
  const list = fromList ? state.list as string : '/'
  const back = <Link className="back" to={list} onClick={event => {
    if (fromList &&
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
