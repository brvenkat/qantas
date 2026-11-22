# Qantas Airport Directory

Browse all airports returned by the Qantas reference API. Search by airport name, country, city or code, then open an airport to view its location, time zone, country currency and coordinates.

## Run locally

You’ll need Git, Node.js 24.x (with npm), and Google Chrome. The first load needs internet access to retrieve airport data from the public Qantas API.

1. Clone the repository and enter the project folder.

   ```sh
   git clone https://github.com/brvenkat/qantas.git
   cd qantas
   ```

2. Run `node --version` and confirm it shows `v24.x.x`. If you use nvm, run `nvm install` and `nvm use` from this folder to select the version in `.nvmrc`.
3. Install dependencies and start the development server.

   ```sh
   npm ci
   npm run dev
   ```

4. Open [http://127.0.0.1:5173/](http://127.0.0.1:5173/) in Chrome, or use the **Local** URL printed by Vite if the port is already in use. Search for `SYD`, open Sydney (Kingsford Smith), and use **Back to airports** to return to the filtered list.

## Run the tests

After installing dependencies, run this from the project folder.

```sh
npm test
```

Vitest covers response parsing, search, concurrent calls, same-origin refresh coordination, cooldowns, timeouts, exponential backoff and recovery, stale-data expiry, detail navigation, focus restoration, API failure and the service worker's offline routing. The tests stub the network for repeatability.

## Build and preview

Run these commands from the project folder. If the development server is still running, use a second terminal.

```sh
npm run build
npm run preview
```

Open [http://127.0.0.1:4173/](http://127.0.0.1:4173/) in Chrome, or use the **Local** URL printed by Vite.

### Try offline mode

1. In the production preview, wait for the airport list to load and confirm that the service worker is active under **Application → Service Workers** in Chrome DevTools.
2. In the **Network** panel, select **Offline** and leave **Disable cache** unchecked.
3. Reload the list or an airport details page. The app should open and show the saved airport data and its timestamp. Switch back to **No throttling** when finished.

## Design and trade-offs

- **Navigation and UX.** React, TypeScript and Vite power a mobile-first site. Search ignores accents and punctuation. Each search word can match a different field, such as airport name and country. Search, the current page and the selected page size live in the URL. The list defaults to 20 airports per page, with options for 50 and 100. A detail route can be opened directly, and returning from an in-app detail restores the list state, scroll and keyboard focus. Pagination bounds DOM work on the full directory. Motion follows the system reduced-motion setting.
- **Source and fields.** The Qantas endpoint returned a JSON array with permissive CORS and a 15-minute HTTP cache lifetime when checked. The brief asks for every airport, so the app displays the complete reference feed without inferring flight availability from the operational flags. Airport code identifies each record. Missing optional fields have a readable fallback, and malformed or duplicate records are excluded. Coordinates are converted from the feed’s signed radian fields. The feed has no currency field, so `country-to-currency` supplies the default currency for each country code. Local exceptions and multiple currencies may differ.
- **Concurrency and rate limits.** A shared in-flight promise coalesces callers in one tab. On browsers with Web Locks, same-origin tabs serialize refreshes and recheck shared cache and cooldown state after taking the lock. A successful snapshot is fresh for 15 minutes. The shared JSON client in `src/services/http.ts` retries transient GET failures up to twice with capped exponential backoff and jitter. The airport directory gives each attempt 3.5 seconds, including body reads, for a total of up to about 12 seconds. HTTP 429 and 503 use an observable `Retry-After` value or fall back to 60 and 15 seconds respectively. Other failures use a five-second cooldown. After automatic retries end, the user can retry once the cooldown expires, and browser reconnection can trigger a refresh subject to the same rules. The browser handles limits for that origin and profile. A shared server cache and upstream request budget would be the next step if a wider rollout required coordination across devices.
- **Caching and failures.** The last valid snapshot can be used for up to seven days on a new load or failed refresh. The UI shows the snapshot timestamp when it falls back. Storage denial or quota exhaustion still allows a successful online load, with in-memory caching for that session. The production service worker precaches the versioned app shell so a repeat visit can load the list or an airport detail offline. Cached data and the app shell use separate stores. They can be cleared by browser storage policies.
- **Hosting.** Serve `dist/` at the site root over HTTPS and configure an SPA fallback to `index.html` for detail URLs. Keep `service-worker.js` revalidatable so clients can pick up new releases. The local Vite preview already supports direct links.

## AI assistance

I used ChatGPT Codex to scaffold the React and TypeScript project, inspect the Qantas API response, implement the directory and its error handling, and write and run Vitest tests. Codex also helped debug focus restoration when returning from airport details.
