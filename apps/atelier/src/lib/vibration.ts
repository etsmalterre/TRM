// The phone's buzz — the one place this app vibrates, and the one place the
// patterns live.
//
// The legacy Android app called `vibrationDeclenche(100)` on almost every tap
// (34 call sites: a face, a métier, retour, the fil and info icons…), the same
// 100 ms everywhere, so the buzz said « touched » and nothing more. The
// operators have had that feedback for years, and the workshop suits it —
// noise, gloves, eyes on the machine rather than on the screen. This app keeps
// the habit but makes the buzz carry information:
//
//  - `confirme` — one short, firm pulse: the SERVER accepted a write.
//  - `refuse`   — two quick pulses: a write was refused or never arrived
//    (no network, phone not enrolled, the OF moved under the operator).
//  - `tick`     — a very light tick: picking a face or a métier, the gestures
//    the legacy buzzed and that open something.
//  - nothing   — scrolling, segments, tabs, retour.
//
// ⚠️ A write buzzes when the server answers, never when the finger lands:
// a buzz on the tap would say « done » for a write that then fails, and there
// is no undo on this app. That is why `confirme` / `refuse` are not called
// from any screen — the QueryClient's MutationCache fires them for every
// mutation (main.tsx), so a new write gets the right buzz without anyone
// remembering to add it. Only `tick` is called from a click handler.
//
// What the web allows (Chrome on Android, installed PWA included): duration
// and rhythm only, no intensity; only once the page has had a user tap (a
// server answer arriving after the tap qualifies, a background poll on a phone
// nobody touched does not); and a phone with vibration off in its own settings
// stays silent. Everywhere without the API (desktop, iOS) this is a no-op.

export type Vibration = 'confirme' | 'refuse' | 'tick'

/** Milliseconds, or on/off/on… patterns. Short on purpose: 100 ms on every
 *  tap, the legacy's, reads as a buzz; a tick under ~10 ms does not spin up
 *  the motor on the cheaper phones. */
export const MOTIFS: Record<Vibration, number | number[]> = {
  confirme: 60,
  refuse: [50, 70, 50],
  tick: 12,
}

type VibrationNavigator = { vibrate?: (motif: number | number[]) => boolean }

export function vibrer(v: Vibration, nav: VibrationNavigator | undefined = globalThis.navigator): void {
  if (typeof nav?.vibrate !== 'function') return
  try {
    nav.vibrate(MOTIFS[v])
  } catch {
    // A refused vibration is never the operator's problem.
  }
}
