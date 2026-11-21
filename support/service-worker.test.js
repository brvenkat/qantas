import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'

const source = readFileSync('support/service-worker.js', 'utf8')
const origin = 'https://directory.example'
const asset = 'assets/index-hash.js'

it('precaches a complete release and serves offline list and detail URLs', async () => {
  const handlers = new Map()
  const savedShell = new Response('<html>Airport directory</html>')
  const savedAsset = new Response('/* application */')
  const cache = {
    addAll: vi.fn().mockResolvedValue(undefined),
    match: vi.fn(async request => {
      if (request === origin + '/index.html') return savedShell
      if (request.url === origin + '/' + asset) return savedAsset
    }),
  }
  const caches = {
    open: vi.fn().mockResolvedValue(cache),
    keys: vi.fn().mockResolvedValue(['airport-directory-shell:v0', 'airport-directory-shell:v1', 'unrelated']),
    delete: vi.fn().mockResolvedValue(true),
  }
  const fetch = vi.fn().mockRejectedValue(new Error('Offline'))
  const self = {
    location: { origin },
    registration: { scope: origin + '/' },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
    addEventListener: (type, handler) => handlers.set(type, handler),
  }
  runInNewContext(source, { BUILD_ID: 'v1', BUILD_ASSETS: [asset], self, caches, URL, fetch })

  let lifecycle
  handlers.get('install')({ waitUntil: promise => { lifecycle = promise } })
  await lifecycle
  expect(cache.addAll).toHaveBeenCalledWith([origin + '/index.html', origin + '/' + asset])
  expect(self.skipWaiting).toHaveBeenCalledOnce()

  handlers.get('activate')({ waitUntil: promise => { lifecycle = promise } })
  await lifecycle
  expect(caches.delete).toHaveBeenCalledExactlyOnceWith('airport-directory-shell:v0')
  expect(self.clients.claim).toHaveBeenCalledOnce()

  const respondWith = vi.fn()
  const route = (url, mode = 'navigate') => handlers.get('fetch')({
    request: { url, mode, method: 'GET' }, respondWith,
  })
  route(origin + '/?q=sydney')
  route(origin + '/airports/SYD')
  route(origin + '/' + asset, 'cors')
  route('https://api.qantas.com/flight/refData/airport', 'cors')
  expect(respondWith).toHaveBeenCalledTimes(3)
  expect(await Promise.all(respondWith.mock.calls.map(([response]) => response)))
    .toEqual([savedShell, savedShell, savedAsset])
  expect(fetch).not.toHaveBeenCalled()
})
