// API refusals → a sentence the salarié can act on (§45.3: inline text, never a
// raw code, never a toast). One mapper for every write of the tablet.
import type { ApiError } from '@/lib/api'

export function messagePourErreur(e: ApiError): string {
  switch (e.code) {
    case 'appareil_non_enrole':
      return "Cette pointeuse n'est pas enrôlée. Prévenez le bureau."
    case 'code_invalide':
      return 'Code inconnu ou expiré. Demandez un nouveau code au bureau.'
    case 'trop_d_essais':
      return "Trop d'essais. Attendez un quart d'heure avant de réessayer."
    case 'etat_change':
      // Not the salarié's fault: a double tap, or the old pointeuse / the
      // office wrote in between. The screen has already re-read the state.
      return "Le pointage a changé entre-temps. Vérifiez l'écran, puis recommencez."
    case 'salarie_inconnu':
      return "Ce salarié n'est plus dans le pointage. Prévenez le bureau."
  }
  switch (e.status) {
    case 401:
      return "Cette pointeuse n'est pas enrôlée. Prévenez le bureau."
    case 409:
      return "Le pointage a changé entre-temps. Vérifiez l'écran, puis recommencez."
    default:
      return "Le pointage n'a pas été enregistré. Réessayez ; si ça recommence, prévenez le bureau."
  }
}
