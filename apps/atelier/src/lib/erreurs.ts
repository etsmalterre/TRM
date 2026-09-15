// Status codes → sentences the operator can act on (§45.3: never a raw code,
// never a toast). One mapper for every write of the app, so the same failure
// reads the same on every screen.
//
// The API's machine-readable `error` codes come first (lib/api.ts attaches
// them): those are refusals with a precise cause the phone can name. The
// status is the fallback.
//
// 409 in particular is not an error the operator caused — the floor moved
// under them, usually because someone else advanced the same OF.
import type { ApiError } from '@/lib/api'

export function messagePourErreur(e: ApiError): string {
  switch (e.code) {
    case 'appareil_non_enrole':
      return "Ce téléphone n'est pas enrôlé. Demandez son enrôlement au bureau."
    case 'identite_appareil':
      return "Ce téléphone n'enregistre que pour son régleur."
    case 'regleur_hors_appareil':
      return 'Un régleur enregistre depuis son propre téléphone.'
    case 'code_invalide':
      return 'Code inconnu ou expiré. Demandez un nouveau code au bureau.'
    case 'trop_d_essais':
      return "Trop d'essais. Attendez un quart d'heure avant de réessayer."
  }
  switch (e.status) {
    case 401:
      return "Ce téléphone n'est pas connecté. Prévenez le régleur."
    case 403:
      return "Ce téléphone n'a pas le droit d'enregistrer. Prévenez le bureau."
    case 409:
      return "Cette action n'est plus possible — l'OF a changé. Revenez en arrière et rouvrez le métier."
    case 404:
      return "Cet OF n'existe plus."
    default:
      return "L'enregistrement a échoué. Réessayez ; si ça recommence, prévenez le régleur."
  }
}
