export interface Airport {
  code: string
  name: string
  country: string
  countryCode: string
  city: string
  state: string
  timezone: string
  coordinates: [number, number] | null
}

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {}
}

export function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export const airportCode = /^[A-Z0-9]{3}$/

export function parseAirports(input: unknown): Airport[] {
  if (!Array.isArray(input) || input.length === 0) throw new Error('Empty or invalid directory')
  const airports = new Map<string, Airport>()
  for (const entry of input) {
    const data = record(entry)
    const code = clean(data.airportCode).toUpperCase()
    const name = clean(data.airportName)
    if (!airportCode.test(code) || !name || airports.has(code)) continue

    const country = record(data.country)
    const city = record(data.city)
    const location = record(data.location)
    const latitude = location.latitudeRadius
    const longitude = location.longitudeRadius
    const coordinates: Airport['coordinates'] =
      typeof latitude === 'number' && Math.abs(latitude) <= Math.PI / 2 &&
      typeof longitude === 'number' && Math.abs(longitude) <= Math.PI
        ? [latitude * 180 / Math.PI, longitude * 180 / Math.PI]
        : null
    airports.set(code, {
      code,
      name,
      country: clean(country.countryName),
      countryCode: clean(country.countryCode).toUpperCase(),
      city: clean(city.cityName),
      state: clean(record(data.state).stateName),
      timezone: clean(city.timeZoneName),
      coordinates,
    })
  }
  if (!airports.size) throw new Error('Directory has no usable airports')
  return [...airports.values()].sort((a, b) =>
    a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.code.localeCompare(b.code))
}

function searchText(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

export function searchAirports(airports: Airport[], query: string) {
  const words = searchText(query).trim().split(/\s+/)
  return airports.filter(({ name, country, city, code }) => {
    const text = searchText([name, country, city, code].join(' '))
    return words.every(word => text.includes(word))
  })
}
