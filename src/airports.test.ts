import { describe, expect, it } from 'vitest'
import { parseAirports, searchAirports } from './airports'

describe('airport data', () => {
  it('normalizes coordinates and preserves airports with missing optional fields', () => {
    const airports = parseAirports([
      { airportCode: 'syd', airportName: 'Sydney', location: { latitudeRadius: -Math.PI / 6, longitudeRadius: Math.PI / 2 } },
      { airportCode: 'CGH', airportName: ' São Paulo ', country: { countryName: 'Brazil' } },
      { airportCode: 'syd', airportName: 'Duplicate' },
      { airportCode: 'ABCD', airportName: 'Invalid' },
      null,
    ])
    expect(airports.map(airport => airport.code)).toEqual(['CGH', 'SYD'])
    expect(airports[0]).toMatchObject({ name: 'São Paulo', country: 'Brazil', coordinates: null })
    expect(airports[1].coordinates?.[0]).toBeCloseTo(-30)
    expect(airports[1].coordinates?.[1]).toBeCloseTo(90)
    expect(searchAirports(airports, '  sao BRA  ').map(airport => airport.code)).toEqual(['CGH'])
    expect(searchAirports(airports, 'SYD')).toEqual([airports[1]])
  })

  it('rejects empty and unusable response bodies', () => {
    for (const input of [[], { airports: [] }, [null]]) {
      expect(() => parseAirports(input)).toThrow()
    }
  })
})
