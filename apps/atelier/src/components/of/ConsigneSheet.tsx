// The consigne, written from the réglage sheet — a bottom sheet over the
// screen the régleur is already reading, rather than a trip to the Consigne
// screen and back (the legacy's IMG_Consigne → FEN_Consigne → retour).
//
// §46.2: an input is never dressed as an alert — the field is plain, the red
// callout is what it becomes once saved. Same 64 px gold commit and 64 px
// « Annuler » as ConfirmSheet, so the gesture is the one learnt on every
// other sheet of the app. The failure renders inline (§45.3), never a toast.
//
// Saving the empty string IS the delete (lib/consigne.ts); the sheet lets it
// through so a régleur who clears the field gets what they asked for, but the
// réglage screen offers « Supprimer » as its own button with its own
// confirmation, because clearing a field is not how anyone expects to delete
// an order.
//
// The viewport carries `interactive-widget=resizes-content` (index.html) so
// the sheet — `fixed` at the bottom — rises above the keyboard instead of
// hiding behind it while the régleur types.
import { useState } from 'react'
import { Loader2, Save, AlertTriangle } from 'lucide-react'
import { useEcrireConsigne, messagePourErreurConsigne } from '@/lib/consigne'

export function ConsigneSheet({
  ofId,
  initiale,
  IDbonnetier,
  onClose,
}: {
  ofId: number
  initiale: string
  IDbonnetier: number
  onClose: () => void
}) {
  const [texte, setTexte] = useState(initiale)
  const [erreur, setErreur] = useState<string | null>(null)
  const ecrire = useEcrireConsigne(ofId, IDbonnetier)

  const modifie = texte.trim() !== initiale.trim()
  const empeche = ecrire.isPending ? 'Enregistrement en cours…' : !modifie ? 'Rien à enregistrer.' : null

  const enregistrer = () => {
    if (empeche) return
    ecrire.mutate(texte, {
      onSuccess: onClose,
      onError: (e) => setErreur(messagePourErreurConsigne(e as Error & { status?: number })),
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-end"
      onClick={ecrire.isPending ? undefined : onClose}
      role="presentation"
    >
      <div
        className="w-full bg-card text-foreground rounded-t-2xl p-5 pb-8 space-y-3 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-xl font-heading font-bold tracking-tight">
            {initiale.trim() ? 'Modifier la consigne' : 'Ajouter une consigne'}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Elle s'affiche en rouge sur le poste et sur la fiche OF de l'ERP.
          </p>
        </div>
        <textarea
          value={texte}
          onChange={(e) => {
            setTexte(e.target.value)
            if (erreur) setErreur(null)
          }}
          rows={5}
          autoFocus
          placeholder="Ex. : Max 1 maille jusqu'à la fin de la pièce. Réparer à chaque nouvelle pièce."
          className="w-full rounded-xl border border-border bg-background p-3 text-base leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {erreur && (
          <p className="flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>{erreur}</span>
          </p>
        )}
        <div className="space-y-2">
          <button
            type="button"
            disabled={!!empeche}
            title={empeche ?? 'Enregistrer la consigne'}
            onClick={enregistrer}
            className="w-full h-16 rounded-xl bg-gold text-gold-foreground text-lg font-semibold flex items-center justify-center gap-2 active:opacity-90 disabled:opacity-40"
          >
            {ecrire.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
            Enregistrer
          </button>
          <button
            type="button"
            disabled={ecrire.isPending}
            onClick={onClose}
            className="w-full h-16 rounded-xl border border-border bg-background text-lg font-semibold active:bg-muted disabled:opacity-40"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  )
}
