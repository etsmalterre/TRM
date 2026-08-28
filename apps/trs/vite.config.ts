import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { readFileSync } from 'fs'

// Version single source of truth: THIS app's package.json, like apps/atelier
// and unlike apps/web — the TRS tablet ships to its own host on its own
// cadence. Injected as __APP_VERSION__, declared in src/vite-env.d.ts. There
// is no vitest.config.ts here, so this `define` also covers the test run.
const pkg = JSON.parse(readFileSync(path.resolve(__dirname, './package.json'), 'utf-8'))

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    VitePWA({
      // injectManifest, as in apps/atelier: we own src/sw.ts. A wall tablet
      // keeps the PWA open for weeks, which is exactly where a stale service
      // worker hurts most — the update path stays the one lib/sw-refresh.ts
      // already fixed for the ERP.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png', 'logo-full.png'],
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,svg}'],
      },
      manifest: {
        // Both just 'TRS' — the tablet is known as "le TRS" on the shop floor, and
        // 'name' is what the install dialog and Android app-info show.
        name: 'TRS',
        short_name: 'TRS',
        lang: 'fr',
        description: 'TRS des métiers — écran mural de l’atelier de tricotage Tricotage Malterre',
        theme_color: '#143D6B',
        background_color: '#143D6B',
        display: 'standalone',
        // A wall tablet, laid flat or on its side: the floor plan is wide.
        orientation: 'landscape',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      devOptions: { enabled: false, type: 'module' },
    }),
  ],
  server: {
    // 5177 is already in the MPS API's CORS_ORIGIN list
    // (ETM/apps/api/.env.development). 5175 is the TRM ERP, 5176 the atelier.
    port: 5177,
    host: true, // expose on the LAN so the real tablet can hit the dev server
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
