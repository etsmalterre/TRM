// Status codes → sentences the operator can act on (§45.3: never a raw code,
// never a toast). One mapper for every write of the app, so the same failure
// reads the same on every screen.
//
// 409 in particular is not an error the operator caused — the floor moved
// under them, usually because someone else advanced the same OF.
export function messagePourErreur(e: Error & { status?: number }): string {
  switch (e.status) {
    case 401:
      return "Ce téléphone n'est pas connecté. Prévenez le régleur."
    case 403:
      return "Ce téléphone n'a pas le droit d'enregistrer. Prévenez le régleur."
    case 409:
      return "Cette action n'est plus possible — l'OF a changé. Revenez en arrière et rouvrez le métier."
    case 404:
      return "Cet OF n'existe plus."
    default:
      return "L'enregistrement a échoué. Réessayez ; si ça recommence, prévenez le régleur."
  }
}
