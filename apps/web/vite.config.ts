import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// Screens shared verbatim with ETM are imported straight from the sister
// repo (single source of truth — editing the file updates both apps). The
// ETM checkout must live next to this repo: C:\dev\etsmalterre\ETM.
// Their `@/` imports resolve to THIS app's src (same alias), so shared
// screens use TRM's local copies of components/lib.
const etmSrc = path.resolve(__dirname, '../../../ETM/apps/web/src')

export default defineConfig({
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
    dedupe: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query', 'lucide-react']
  }
})
