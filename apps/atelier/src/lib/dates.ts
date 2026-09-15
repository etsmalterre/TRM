// HFSQL hands a DATE column back as `YYYYMMDD` (no separators) and a DATETIME
// as `YYYYMMDDHHMMSS…`; the ERP's `formatHfsqlDate` covers the same shapes.
// The eight digits are sliced, never fed to `new Date()`: a bare date parsed
// as UTC shows the previous day west of Greenwich, and a phone travels.

/** `YYYYMMDD…` → « jj/mm/aaaa »; any other parseable string → the same,
 *  through the browser's locale; '' when there is nothing to show. */
export function formatDateHfsql(raw: string | null | undefined): string {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  if (/^\d{8}/.test(s)) return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR')
}
