/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// App version injected at build time from apps/pointage/package.json (see
// `define` in vite.config.ts).
//
// ⚠️ Hand-written source, not a build artifact: .gitignore blanks
// `apps/pointage/src/**/*.d.ts` and carries an explicit negation for this path.
// Do not re-ignore it (apps/web lost a day to that in August 2026).
declare const __APP_VERSION__: string
