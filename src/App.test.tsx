import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { App } from './App'
import { directory, DirectoryError } from './directory'

const airports = [
  { code: 'SYD', name: 'Sydney (Kingsford Smith)', country: 'Australia', countryCode: 'AU',
    city: 'Sydney', state: 'New South Wales', timezone: 'Australia/Sydney', coordinates: [-33.93, 151.17] as [number, number] },
  { code: 'LHR', name: 'Heathrow', country: 'United Kingdom', countryCode: 'GB',
    city: 'London', state: '', timezone: 'Europe/London', coordinates: null },
]
const snapshot = { airports, fetchedAt: Date.now() }

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  vi.spyOn(directory, 'cached').mockReturnValue(null)
  vi.spyOn(directory, 'load').mockResolvedValue(snapshot)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function open(path = '/') {
  render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
}

it('loads, filters, opens details, and restores the search on return', async () => {
  open()
  expect(screen.getByRole('status').textContent).toContain('Loading airports')
  const search = await screen.findByRole<HTMLInputElement>('searchbox', { name: 'Search airports' })
  fireEvent.change(search, { target: { value: 'syd' } })
  expect(screen.queryByRole('link', { name: /heathrow/i })).toBeNull()
  fireEvent.click(screen.getByRole('link', { name: /kingsford smith/i }))
  expect(screen.getByRole('heading', { name: /kingsford smith/i })).toBe(document.activeElement)
  expect(screen.getByText('AUD')).toBeTruthy()
  expect(screen.getByText('Australia/Sydney')).toBeTruthy()
  expect(screen.getByText('Sydney, New South Wales, Australia')).toBeTruthy()
  fireEvent.click(screen.getByRole('link', { name: 'Back to airports' }))
  expect(screen.getByRole<HTMLInputElement>('searchbox').value).toBe('syd')
  expect(screen.getByRole('link', { name: /kingsford smith/i })).toBe(document.activeElement)
})

it('opens a detail URL directly and provides a fallback for missing fields', async () => {
  open('/airports/LHR')
  expect(await screen.findByRole('heading', { name: 'Heathrow' })).toBeTruthy()
  expect(screen.getByText('GBP')).toBeTruthy()
  expect(screen.getByText('Unavailable')).toBeTruthy()
})

it('keeps cached results available after an API failure', async () => {
  vi.mocked(directory.cached).mockReturnValue(snapshot)
  vi.mocked(directory.load).mockRejectedValue(new DirectoryError('Temporarily unavailable', Date.now() + 60_000))
  open()
  expect(await screen.findByText(/showing saved airport data/i)).toBeTruthy()
  expect(screen.getByRole<HTMLButtonElement>('button', { name: /retry in/i }).disabled).toBe(true)
  expect(screen.getByRole('link', { name: /heathrow/i })).toBeTruthy()
})

it('recovers from a first-load failure with an explicit retry', async () => {
  vi.mocked(directory.load).mockRejectedValueOnce(new DirectoryError('Network error', Date.now() - 1))
  open()
  expect((await screen.findByRole('alert')).textContent).toContain('Network error')
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByRole('link', { name: /heathrow/i })).toBeTruthy()
})

it('changes page size, resets to page one, and preserves the size through search and detail navigation', async () => {
  const manyAirports = Array.from({ length: 101 }, (_, index) => ({
    ...airports[0],
    code: String(index).padStart(3, '0'),
    name: `Sydney Terminal ${index}`,
  }))
  vi.mocked(directory.load).mockResolvedValue({ ...snapshot, airports: manyAirports })
  open('/?page=2')
  const size = await screen.findByRole<HTMLSelectElement>('combobox', { name: 'Airports per page' })
  expect(size.value).toBe('20')
  expect(screen.getByText('Showing 21–40 of 101 airports')).toBeTruthy()

  fireEvent.change(size, { target: { value: '50' } })
  expect(screen.getByText('Showing 1–50 of 101 airports')).toBeTruthy()
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'sydney' } })
  fireEvent.click(screen.getByRole('link', { name: /^000.*sydney terminal 0/i }))
  fireEvent.click(screen.getByRole('link', { name: 'Back to airports' }))
  expect(screen.getByRole<HTMLSelectElement>('combobox').value).toBe('50')

  fireEvent.change(screen.getByRole('combobox'), { target: { value: '100' } })
  expect(screen.getByText('Showing 1–100 of 101 airports')).toBeTruthy()
})

it('clears an empty search and returns focus to the search field', async () => {
  open('/?q=unmatched')
  expect(await screen.findByText('0 airports')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
  const search = screen.getByRole<HTMLInputElement>('searchbox')
  expect(search.value).toBe('')
  expect(document.activeElement).toBe(search)
  expect(screen.getByText('Showing 1–2 of 2 airports')).toBeTruthy()
})
