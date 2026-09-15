// How often every screen of this app re-reads the server while it is on
// screen, and the one place that number lives.
//
// The floor changes under the operator: the ERP terminates an OF, a régleur
// launches the next one from another phone, a bonnetier records a fin de
// pièce on the poste next door. Until 2026-09-15 a phone only noticed on the
// next window focus, behind 15–30 s stale windows, so two phones could show
// two different truths for half a minute. Now every query polls on this
// interval (QueryClient defaults in main.tsx) and refetches the moment the app
// comes back to the foreground or the network comes back.
//
// 10 s is the TRS tablet's `POLL_MS` (apps/trs/pages/Atelier.tsx): the recorder
// rewrites the machine state every ~10 s, so nothing gets fresher than this.
// Only MOUNTED queries poll, and never while the app is in the background
// (`refetchIntervalInBackground: false`): a phone on the poste costs the API
// two bounded reads every 10 s, a phone in a pocket costs nothing.
export const POLL_MS = 10_000
