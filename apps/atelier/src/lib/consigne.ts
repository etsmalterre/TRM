// Writing the consigne — ONE mutation for the two places a régleur edits it:
// the Consigne screen's full-tab editor (legacy FEN_Consigne plan 3) and the
// réglage sheet's bottom sheet (the legacy reached the same plan from
// FEN_Reglage_Machine's IMG_Consigne). Both must invalidate the same reads —
// the OF (poste callout), the réglage sheet, the machine list (`a_consigne`)
// — and read the same refusal, so the rule lives here and not twice.
//
// Deleting a consigne is writing the empty string: `ordre_fabrication.
// observations` is one column, and the API trims it. There is no separate
// delete route, and none is wanted — one write path (§45.3).
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ecrireConsigne } from './atelier-api'
import { messagePourErreur } from './erreurs'

export function useEcrireConsigne(ofId: number, IDbonnetier: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (consigne: string) => ecrireConsigne(ofId, { IDbonnetier, consigne }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['atelier', 'of', ofId] })
      qc.invalidateQueries({ queryKey: ['atelier', 'reglage', ofId] })
      qc.invalidateQueries({ queryKey: ['atelier', 'machines'] })
    },
  })
}

/** The consigne route's own refusals, on top of the app-wide mapper. */
export function messagePourErreurConsigne(e: Error & { status?: number }): string {
  if (e.status === 403) return 'Seul un régleur peut écrire la consigne.'
  if (e.status === 409) return 'Cet OF est terminé — sa consigne ne peut plus changer.'
  return messagePourErreur(e)
}
