/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// App version injected at build time from apps/atelier/package.json (see
// `define` in vite.config.ts). Unlike apps/web this does NOT come from the
// monorepo root — the atelier ships independently. See CLAUDE.md § Atelier.
//
// ⚠️ This file is hand-written source, not a build artifact. The repo's
// .gitignore blanks `apps/*/src/**/*.d.ts` to stop an accidental `tsc -b`
// from shadowing .tsx sources, so there is an explicit negation for this
// path — apps/web lost a whole day to that in August 2026 (every fresh
// worktree failed the build on TS2304: Cannot find name '__APP_VERSION__').
// Do not re-ignore it.
declare const __APP_VERSION__: string
