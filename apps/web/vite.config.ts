import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { readFileSync } from 'fs'

// App version single source of truth: the monorepo root package.json.
// Injected as __APP_VERSION__ and shown in the header profile menu.
// Mirrors ETM (see CLAUDE.md §Versioning) — TRM has no vitest.config.ts, so
// this `define` covers the test run too.
const rootPkg = JSON.parse(
  readFileSync(path.resolve(__dirname, '../../package.json'), 'utf-8')
)

// Screens shared verbatim with ETM are imported straight from the sister
// repo (single source of truth — editing the file updates both apps). The
// ETM checkout must live next to this repo: C:\dev\etsmalterre\ETM.
// Their `@/` imports resolve to THIS app's src (same alias), so shared
// screens use TRM's local copies of components/lib.
//
// `ETM_WEB_SRC` (gitignored `.env.local`) repoints the alias at a paired NG
// worktree — e.g. `../../../ETM-dashboard/apps/web/src` — while a shared
// screen is being changed there and hasn't landed on ETM master yet. Pair it
// with `tsconfig.local.json` for `tsc`. Never commit a value: the default is
// what production builds from. See CLAUDE.md § Shared screens.

const DEFAULT_ETM_SRC = '../../../ETM/apps/web/src'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')
  const etmSrc = path.resolve(__dirname, env.ETM_WEB_SRC || DEFAULT_ETM_SRC)
  if (env.ETM_WEB_SRC) console.log(`[vite] @etm → ${etmSrc} (ETM_WEB_SRC override)`)

  return {
  define: {
    __APP_VERSION__: JSON.stringify(rootPkg.version),
    // react-draggable (inside react-grid-layout) gates its debug logging on
    // process.env.DRAGGABLE_DEBUG — Vite only substitutes NODE_ENV in deps, so
    // without this define the browser throws "process is not defined" the
    // moment a dashboard widget is dragged. Same define as ETM's.
    'process.env.DRAGGABLE_DEBUG': 'undefined',
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Small shell assets are precached explicitly here (logos < 15 KB,
      // icons < 150 KB) — `png` stays out of workbox.globPatterns so any
      // future large png doesn't blow the precache size cap.
      includeAssets: ['favicon.svg', 'icons/*.png', 'logo-full.png', 'logo-small.png'],
      manifest: {
        name: 'TRM - Tricotage Malterre',
        short_name: 'TRM',
        lang: 'fr',
        description: 'Système ERP pour Tricotage Malterre - Production tricotage',
        theme_color: '#143D6B',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        // `png` deliberately omitted (see includeAssets above).
        globPatterns: ['**/*.{js,css,html,ico,svg}'],
        // NEVER remove: without it the SW intercepts /api/ navigations and
        // serves index.html, breaking React Router.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\./i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24
              }
            }
          }
        ]
      }
    })
  ],
  server: {
    port: 5175,
    fs: {
      // Specifying `allow` replaces Vite's default (workspace root), so the
      // repo root must be listed alongside the shared ETM sources.
      allow: [path.resolve(__dirname, '../..'), etmSrc]
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@etm': etmSrc
    },
    // Bare imports inside shared ETM screens would otherwise resolve to
    // ETM's node_modules — a second React copy crashes hooks at runtime.
    dedupe: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query', 'lucide-react', 'react-grid-layout']
  }
  }
})
