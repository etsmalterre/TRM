// The atelier's confirmation: a bottom sheet with two 64 px choices.
//
// Purpose-built rather than the ERP's ConfirmDialog (§33): that component is a
// desk-sized centred dialog with `h-9` buttons, and this is a phone held in a
// gloved hand. §33's actual rule is "never window.confirm" — which this
// honours — and §45 asks for station-scale targets, so the two choices are
// full-width and 64 px tall. Same navy/gold vocabulary as everything else.
//
// One component for every confirmation of the app (enregistrer, lancer l'OF,
// supprimer un message, quitter le poste), so the gesture is learnt once.
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function ConfirmSheet({
  titre,
  detail,
  oui,
  icone,
  variante = 'gold',
  onCancel,
  onConfirm,
}: {
  titre: ReactNode
  detail?: ReactNode
  /** Label of the confirming button, e.g. « Oui, enregistrer ». */
  oui: ReactNode
  icone?: ReactNode
  /** gold = a commit (§45.3), primary = a plain yes, destructive = a delete. */
  variante?: 'gold' | 'primary' | 'destructive'
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end" onClick={onCancel} role="presentation">
      <div
        className="w-full bg-card text-foreground rounded-t-2xl p-5 pb-8 space-y-4 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-xl font-heading font-bold tracking-tight">{titre}</h2>
          {detail && <p className="text-base text-muted-foreground mt-1">{detail}</p>}
        </div>
        <div className="space-y-2">
          <button
            type="button"
            onClick={onConfirm}
            className={cn(
              'w-full h-16 rounded-xl text-lg font-semibold flex items-center justify-center gap-2 active:opacity-90',
              variante === 'gold' && 'bg-gold text-gold-foreground',
              variante === 'primary' && 'bg-primary text-primary-foreground',
              variante === 'destructive' && 'bg-destructive text-destructive-foreground',
            )}
          >
            {icone}
            {oui}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full h-16 rounded-xl border border-border bg-background text-lg font-semibold active:bg-muted"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  )
}
