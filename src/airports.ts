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

const airportCode = /^[A-Z0-9]{3}$/

function isCoordinate(value: unknown, limit: number): value is number {
  return typeof value === 'number' && Math.abs(value) <= limit
}

export function isAirport(value: unknown): value is Airport {
  const { code, name, country, countryCode, city, state, timezone, coordinates } = record(value)
  return typeof code === 'string' && airportCode.test(code) &&
    typeof name === 'string' && name.length > 0 && name === clean(name) &&
    [country, countryCode, city, state, timezone].every(field => typeof field === 'string' && field === clean(field)) &&
    (coordinates === null || (Array.isArray(coordinates) && coordinates.length === 2 &&
      isCoordinate(coordinates[0], 90) && isCoordinate(coordinates[1], 180)))
}

export function parseAirports(input: unknown): Airport[] {
  if (!Array.isArray(input) || input.length === 0) throw new Error('Empty or invalid directory')
  const airports = new Map<string, Airport>()
  for (const entry of input) {
    const data = record(entry)
    const code = clean(data.airportCode).toUpperCase()
    const name = clean(data.airportName)

    const country = record(data.country)
    const city = record(data.city)
    const location = record(data.location)
    const latitude = location.latitudeRadius
    const longitude = location.longitudeRadius
    const coordinates: Airport['coordinates'] =
      isCoordinate(latitude, Math.PI / 2) && isCoordinate(longitude, Math.PI)
        ? [latitude * 180 / Math.PI, longitude * 180 / Math.PI]
        : null
    const airport = {
      code,
      name,
      country: clean(country.countryName),
      countryCode: clean(country.countryCode).toUpperCase(),
      city: clean(city.cityName),
      state: clean(record(data.state).stateName),
      timezone: clean(city.timeZoneName),
      coordinates,
    }
    if (isAirport(airport) && !airports.has(code)) airports.set(code, airport)
  }
  if (!airports.size) throw new Error('Directory has no usable airports')
  return [...airports.values()].sort((a, b) =>
    a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.code.localeCompare(b.code))
}

function searchText(value: string) {
  return value.normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase()
}

export function searchAirports(airports: Airport[], query: string) {
  const normalized = searchText(query)
  if (!normalized) return airports
  const words = normalized.split(' ')
  // Each word can match a different field, such as "Sydney Australia" matching name and country.
  return airports.filter(({ name, country, city, code }) => {
    const fields = [name, country, city, code].map(searchText)
    return words.every(word => fields.some(field => field.includes(word)))
  })
}
