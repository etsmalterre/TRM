// Create / edit / remove a periodic maintenance item (operation_maintenance):
// either an ATELIER item (one date for the building — the air leaks, …) or a
// per-MÉTIER item (one date per métier — Ventilateurs, Couronnes, …).
// The portée is chosen at creation and fixed afterwards: turning an atelier
// date into thirty métier dates (or back) has no faithful answer.

import { useEffect, useState } from 'react'
import { Loader2, Plus, Pencil, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type Portee = 'atelier' | 'metier'

export interface OperationDraft {
  nom: string
  frequenceMois: number
  portee: Portee
}

const PORTEES: { id: Portee; label: string; detail: string }[] = [
  { id: 'metier', label: 'Sur chaque métier', detail: 'Une date par métier, suivie dans sa fiche' },
  { id: 'atelier', label: "Pour l'atelier", detail: 'Une seule date pour tout le bâtiment' },
]

export function OperationDialog({
  open,
  onOpenChange,
  initial,
  editing,
  saving,
  error,
  onSave,
  onDelete,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Values to start from (portée preset when creating from a given place). */
  initial: OperationDraft
  /** true = edit an existing item (portée fixed, « Supprimer » offered). */
  editing: boolean
  saving: boolean
  error: string | null
  onSave: (d: OperationDraft) => void
  onDelete?: () => void
}) {
  const [nom, setNom] = useState(initial.nom)
  const [freq, setFreq] = useState(String(initial.frequenceMois || ''))
  const [portee, setPortee] = useState<Portee>(initial.portee)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!open) return
    setNom(initial.nom)
    setFreq(initial.frequenceMois ? String(initial.frequenceMois) : '')
    setPortee(initial.portee)
    setConfirmDelete(false)
  }, [open, initial])

  const frequence = Number(freq)
  const valide = nom.trim() !== '' && Number.isInteger(frequence) && frequence >= 1 && frequence <= 120
  const Icon = editing ? Pencil : Plus

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-accent" />
            {editing ? "Modifier l'entretien" : 'Nouvel entretien'}
          </DialogTitle>
        </DialogHeader>

        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (valide && !saving) onSave({ nom: nom.trim(), frequenceMois: frequence, portee })
          }}
        >
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">Nom</label>
            <input
              type="text"
              autoFocus
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Ventilateurs, Fuites d'air…"
              maxLength={100}
              className="w-full h-9 px-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">Fréquence</label>
            <div className="flex items-center gap-2">
              <span className="text-sm">Tous les</span>
              <input
                type="number"
                min={1}
                max={120}
                value={freq}
                onChange={(e) => setFreq(e.target.value)}
                className="w-20 h-9 px-2 text-sm tabular-nums rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <span className="text-sm">mois</span>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground">Portée</p>
            <div className="grid grid-cols-2 gap-2">
              {PORTEES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={editing}
                  onClick={() => setPortee(p.id)}
                  className={cn(
                    'text-left rounded-lg border p-2.5 transition-colors disabled:cursor-default',
                    portee === p.id
                      ? 'border-accent ring-1 ring-accent bg-accent/10'
                      : 'border-border hover:border-accent/50 disabled:opacity-50 disabled:hover:border-border',
                  )}
                >
                  <div className="text-sm font-semibold">{p.label}</div>
                  <div className="text-xs text-muted-foreground">{p.detail}</div>
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {confirmDelete && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {portee === 'metier'
                ? "L'entretien disparaît de toutes les fiches métier. Ses dates restent en base."
                : "L'entretien disparaît de l'atelier. Sa date reste en base."}
            </div>
          )}

          <DialogFooter className="mt-4 gap-2 sm:gap-2">
            {editing && onDelete && (
              <Button
                type="button"
                variant="outline"
                className="sm:mr-auto text-destructive hover:text-destructive hover:bg-destructive/10"
                disabled={saving}
                onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                {confirmDelete ? 'Confirmer la suppression' : 'Supprimer'}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Annuler
            </Button>
            <Button type="submit" disabled={!valide || saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
