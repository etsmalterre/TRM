// How often the tablet re-reads the server while a screen is on — the one
// place that number lives (QueryClient defaults in main.tsx).
//
// The day table and the faces' status change under the tablet: the old WinDev
// pointeuse runs in parallel during the rollout, and Admin Pointage corrects
// lines from the office. Same 10 s as the atelier phones and the TRS wall.
export const POLL_MS = 10_000

/** An employee screen left alone goes back to the faces — the next person
 *  must never find someone else's buttons (legacy: back to the home window
 *  after every pointage). */
export const INACTIVITE_MS = 30_000

/** How long the « enregistré » confirmation stays before the faces return. */
export const CONFIRMATION_MS = 4_000
