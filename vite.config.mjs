import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'offline-app-shell',
      apply: 'build',
      generateBundle(_, bundle) {
        const worker = readFileSync(new URL('./support/service-worker.js', import.meta.url), 'utf8')
        const assets = Object.keys(bundle).filter(name => name.startsWith('assets/')).sort()
        const version = createHash('sha256')
          .update(JSON.stringify([assets, worker, readFileSync('index.html', 'utf8')]))
          .digest('hex').slice(0, 16)
        this.emitFile({
          type: 'asset',
          fileName: 'service-worker.js',
          source: `const BUILD_ID = ${JSON.stringify(version)};\nconst BUILD_ASSETS = ${JSON.stringify(assets)};\n${worker}`,
        })
      },
    },
  ],
  test: { environment: 'jsdom' },
})
