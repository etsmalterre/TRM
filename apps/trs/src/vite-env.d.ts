/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// App version injected at build time from apps/trs/package.json (see
// `define` in vite.config.ts). Ships independently of apps/web and
// apps/atelier — see CLAUDE.md § TRS.
//
// ⚠️ Hand-written source, not a build artifact: the repo's .gitignore blanks
// `apps/*/src/**/*.d.ts` and carries an explicit negation for this path. Do
// not re-ignore it (apps/web lost a day to exactly that in August 2026).
declare const __APP_VERSION__: string
