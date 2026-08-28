import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { readFileSync } from 'fs'

// Version single source of truth: THIS app's package.json — not the monorepo
// root like apps/web. The atelier bundle ships to its own host on its own
// cadence, so sharing TRM's number would make every atelier release read as a
// TRM release (and vice-versa). Injected as __APP_VERSION__, declared in
// src/vite-env.d.ts. There is no vitest.config.ts here, so this `define` also
// covers the test run — if one is ever added, duplicate the define into it.
const pkg = JSON.parse(readFileSync(path.resolve(__dirname, './package.json'), 'utf-8'))

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    VitePWA({
      // ⚠️ injectManifest, NOT the generateSW default that apps/web uses.
      // We own src/sw.ts, which is the only place a `push` handler can live
      // (see CLAUDE.md § Atelier). Chosen at scaffold time on purpose:
      // switching later would touch the update path that lib/sw-refresh.ts
      // already fixed once, and the atelier phones keep the PWA installed
      // permanently — exactly where a stale-service-worker bug hurts most.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      // `png` is deliberately out of injectManifest.globPatterns below, so
      // anything that must be offline lists itself here. logo-full.png is the
      // first thing the picker paints — without it a cold launch on a dropped
      // connection shows a broken image where the brand should be.
      includeAssets: ['favicon.svg', 'icons/*.png', 'logo-full.png'],
      injectManifest: {
        // `png` deliberately omitted — icons are precached via includeAssets,
        // and this keeps a future large asset out of the precache size cap.
        globPatterns: ['**/*.{js,css,html,ico,svg}'],
      },
      manifest: {
        name: 'Atelier',
        // Android truncates around 12 characters on the home screen — 'Atelier'
        // fits whole, which 'Atelier TRM' did not.
        short_name: 'Atelier',
        lang: 'fr',
        description: "Poste bonnetier et régleur — atelier de tricotage Tricotage Malterre",
        theme_color: '#143D6B',
        background_color: '#143D6B',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // The service worker stays OFF in dev: the atelier is developed in
      // Chrome device mode with fast reloads, and a precaching SW there turns
      // every edit into a "why am I seeing the old build?" hunt. Flip this on
      // deliberately when working on push or offline behaviour.
      devOptions: { enabled: false, type: 'module' },
    }),
  ],
  server: {
    // 5176 is already in the MPS API's CORS_ORIGIN list
    // (ETM/apps/api/.env.development). 5175 belongs to the TRM ERP, so both
    // can run side by side. If this port changes, update that list too.
    port: 5176,
    host: true, // expose on the LAN so a real phone can hit the dev server
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
