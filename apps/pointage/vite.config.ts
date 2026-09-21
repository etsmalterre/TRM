import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { readFileSync } from 'fs'

// The pointage tablet — a wall tablet shared by every salarié, replacing the
// WinDev pointeuse (design: ~/.claude/plans/pointage-pwa.md, dossier
// claude_doc/pointage-pwa.md). Same plumbing as apps/atelier on purpose: its
// own version, an owned service worker, updates that arrive on their own.
//
// Version single source of truth: THIS app's package.json (it ships on its own
// host on its own cadence). Injected as __APP_VERSION__, declared in
// src/vite-env.d.ts; no vitest.config.ts, so the define also covers tests.
const pkg = JSON.parse(readFileSync(path.resolve(__dirname, './package.json'), 'utf-8'))

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    VitePWA({
      // injectManifest + no injected registration: src/lib/mise-a-jour.ts
      // registers the worker and reloads on a new build — a wall tablet is
      // never closed, exactly like the atelier phones (see apps/atelier).
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: null,
      includeAssets: ['favicon.svg', 'icons/*.png', 'logo-full.png', 'logo-m.png'],
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,svg}'],
      },
      manifest: {
        name: 'Pointage',
        short_name: 'Pointage',
        lang: 'fr',
        description: 'Pointeuse des salariés — Tricotage Malterre',
        theme_color: '#143D6B',
        background_color: '#143D6B',
        // A kiosk: nothing of the tablet's own chrome on the wall.
        display: 'fullscreen',
        // Hung on the wall on its side: the faces and the day table sit side by side.
        orientation: 'landscape',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          // Android shows only the central 66 % of a maskable icon (adaptive icon
          // safe zone), narrower than the W3C 80 %: this variant has the word fitted
          // to that circle. The plain icons above keep the wider word for the
          // install dialog, splash screen and task switcher, which do not mask.
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      devOptions: { enabled: false, type: 'module' },
    }),
  ],
  server: {
    // 5178 is in the MPS API's dev CORS_ORIGIN (TRM_PWA_PORTS in
    // ETM/scripts/worktree/lib.mjs). If this port changes, update that list too.
    port: 5178,
    host: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
