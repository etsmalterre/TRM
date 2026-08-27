// Send a PDF straight to the printer without leaving the screen.
//
// Why this exists: the visitage poste has a Dymo bolted to it and prints a
// label per roll the moment a piece is validated. Every other print button in
// the app does `window.open(url)` and lets the operator press Ctrl+P — at a
// weighing station that is a tab, a scroll and two clicks per roll.
//
// The mechanic is the print-js one, and the blob step is the load-bearing part:
// the PDF is fetched WITH credentials and re-served from a `blob:` URL, which
// inherits this page's origin. A cross-origin iframe (the dev API on :8080)
// would throw SecurityError on contentWindow.print(); a blob one never does.
//
// On the poste, Chrome is expected to run with `--kiosk-printing` and the Dymo
// as its default printer — then this prints silently, which is what the legacy
// did. Without that flag the print dialog simply opens pre-loaded, which is
// still one gesture instead of four. Any failure falls back to opening the PDF
// in a tab, so a printer problem never costs the operator the document.

/** Milliseconds the hidden iframe is kept alive after print() is called.
 *  Chrome's print dialog is modal and reads the document lazily; revoking the
 *  blob or removing the node too early prints a blank page. */
const CLEANUP_DELAY_MS = 60_000

/**
 * Fetch `url` and hand it to the browser's print dialog.
 *
 * Resolves `true` when the print path was taken, `false` when it fell back to
 * opening a tab — callers use that to decide whether to offer a manual link.
 * Never throws: a station must not lose a validated piece to a printer error.
 */
export async function printPdf(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { credentials: 'include' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)

    const ok = await new Promise<boolean>((resolve) => {
      const frame = document.createElement('iframe')
      frame.style.position = 'fixed'
      frame.style.right = '0'
      frame.style.bottom = '0'
      frame.style.width = '0'
      frame.style.height = '0'
      frame.style.border = '0'
      frame.style.visibility = 'hidden'
      // Never resolve twice: `load` can fire again while the dialog is open.
      let settled = false
      const done = (value: boolean) => {
        if (settled) return
        settled = true
        resolve(value)
      }
      frame.onload = () => {
        try {
          const win = frame.contentWindow
          if (!win) throw new Error('no contentWindow')
          win.focus()
          win.print()
          done(true)
        } catch {
          done(false)
        }
        window.setTimeout(() => {
          URL.revokeObjectURL(blobUrl)
          frame.remove()
        }, CLEANUP_DELAY_MS)
      }
      frame.onerror = () => {
        URL.revokeObjectURL(blobUrl)
        frame.remove()
        done(false)
      }
      frame.src = blobUrl
      document.body.appendChild(frame)
    })

    if (ok) return true
    window.open(url, '_blank')
    return false
  } catch {
    window.open(url, '_blank')
    return false
  }
}
