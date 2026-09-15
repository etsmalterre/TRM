// « il y a 3 j » — how long ago a stamp is, at the precision a phone tile
// can spend. An idle métier's tile says when its last OF stopped: minutes and
// hours while it is today's news, days while a régleur still counts them, the
// date once it is history (a métier idle since November is not « il y a
// 290 j »). Pure, so the ladder is tested against a fixed clock.

const MIN = 60_000
const HEURE = 60 * MIN
const JOUR = 24 * HEURE

/** Beyond this, the date itself is the honest answer. */
export const DEPUIS_MAX_JOURS = 30

const dateCourte = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })

export function depuis(ms: number | null, maintenant: number = Date.now()): string {
  if (ms === null) return '—'
  const delta = maintenant - ms
  if (delta < MIN) return "à l'instant"
  if (delta < HEURE) return `il y a ${Math.floor(delta / MIN)} min`
  if (delta < JOUR) return `il y a ${Math.floor(delta / HEURE)} h`
  const jours = Math.floor(delta / JOUR)
  if (jours <= DEPUIS_MAX_JOURS) return `il y a ${jours} j`
  return `le ${dateCourte.format(new Date(ms))}`
}
