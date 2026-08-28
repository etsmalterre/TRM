/// <reference lib="webworker" />
//
// The TRS tablet service worker (copied from apps/atelier at scaffold time). We own this file (vite-plugin-pwa runs in
// `injectManifest` mode) rather than letting workbox generate one, because
// this is the only place a `push` handler can live — and push to a CLOSED app
// is the whole point of the notification work (see CLAUDE.md § TRS).
//
// Right now it does exactly what the generated worker did: precache the build
// and serve index.html for navigations. The push handler lands with the
// notification feature; the plumbing is here so that lands as one file change
// instead of a strategy switch.

import { precacheAndRoute, createHandlerBoundToURL, cleanupOutdatedCaches } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { clientsClaim } from 'workbox-core'

declare const self: ServiceWorkerGlobalScope

// `registerType: 'autoUpdate'` in vite.config.ts makes the client call
// skipWaiting for us via the generated registration code, but the worker has
// to agree to it — without these two the new build installs and then sits in
// `waiting` forever, which is precisely the "click twice to get the new
// version" bug apps/web hit (lib/sw-refresh.ts).
self.skipWaiting()
clientsClaim()

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// SPA navigations → index.html.
//
// ⚠️ NEVER drop the /api/ denylist. Without it the worker answers API
// navigations with index.html and React Router breaks in ways that look like
// backend failures. Same rule as apps/web's `navigateFallbackDenylist`.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/api\//],
  }),
)
