import { useEffect, useState } from 'react'
import { CalendarClock, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  JOURS_SEMAINE, REGIME_LIBELLES, fmtJour,
  type Horaire, type Plan, type RegimeId, type SemaineHoraires,
} from '@/lib/planning-prod'

// The atelier-wide working régime used past the filled bonnetier planning
// (Production › Planning, LIVA #1250). Presets 3×8 / 2×8 / 2×7, or one window
// per weekday. A window whose end is not after its start runs into the next
// day (05:00 → 05:00 = 24 h, the 3×8).

const PRESETS: Array<{ id: RegimeId; detail: string }> = [
  { id: '3x8', detail: 'Lundi 5 h → samedi 5 h, nuit comprise' },
  { id: '2x8', detail: 'Lundi à vendredi, 5 h → 21 h' },
  { id: '2x7', detail: 'Lundi à vendredi, 6 h → 20 h' },
  { id: 'custom', detail: 'Un horaire par jour de la semaine' },
]

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/

function dureeFenetre(h: Horaire): number {
  const [a, b] = [h.debut, h.fin].map((x) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3, 5)))
  return b > a ? b - a : b + 24 * 60 - a
}

export function RegimeDialog({
  open,
  onOpenChange,
  plan,
  canEdit,
  saving,
  error,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  plan: Plan
  canEdit: boolean
  saving: boolean
  error: string | null
  onSave: (regime: RegimeId, horaires: SemaineHoraires | null) => void
}) {
  const [regime, setRegime] = useState<RegimeId>(plan.reglage.regime)
  const [semaine, setSemaine] = useState<SemaineHoraires>(plan.reglage.semaine)

  // Re-seed from the server state each time the dialog opens.
  useEffect(() => {
    if (!open) return
    setRegime(plan.reglage.regime)
    setSemaine(plan.reglage.horaires ?? plan.reglage.semaine)
  }, [open, plan.reglage])

  const choisir = (id: RegimeId) => {
    setRegime(id)
    // Custom starts from what the current preset shows, so it is an edit, not a blank form.
    if (id === 'custom' && regime !== 'custom') setSemaine(plan.regimes[regime].semaine)
  }

  const setJour = (i: number, h: Horaire | null) => setSemaine((s) => s.map((x, j) => (j === i ? h : x)))

  const affiche = regime === 'custom' ? semaine : plan.regimes[regime].semaine
  const invalide = regime === 'custom' && (
    semaine.every((h) => h === null) || semaine.some((h) => h !== null && (!HHMM.test(h.debut) || !HHMM.test(h.fin)))
  )
  const heuresSemaine = affiche.reduce((t, h) => t + (h ? dureeFenetre(h) : 0), 0) / 60
  const aDuReel = plan.reel_jusqua > plan.maintenant

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-accent" />
            Régime de travail
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            {aDuReel
              ? <>Jusqu’au {fmtJour(plan.reel_jusqua - 1)}, le planning suit le planning des bonnetiers. Au-delà, il compte sur ce régime.</>
              : <>Le planning des bonnetiers n’a rien de saisi à venir : tout le planning compte sur ce régime.</>}
          </p>

          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={!canEdit}
                onClick={() => choisir(p.id)}
                className={cn(
                  'text-left rounded-lg border p-2.5 transition-colors disabled:cursor-default',
                  regime === p.id ? 'border-accent ring-1 ring-accent bg-accent/10' : 'border-border hover:border-accent/50',
                )}
              >
                <div className="text-sm font-semibold">{REGIME_LIBELLES[p.id]}</div>
                <div className="text-xs text-muted-foreground">{p.detail}</div>
              </button>
            ))}
          </div>

          <div className="rounded-lg border border-border/60 bg-zinc-100/80 p-2.5 space-y-1">
            {affiche.map((h, i) => (
              <div key={JOURS_SEMAINE[i]} className="flex items-center gap-2 text-sm h-8">
                <label className="flex items-center gap-2 w-28 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={h !== null}
                    disabled={regime !== 'custom' || !canEdit}
                    onChange={(e) => setJour(i, e.target.checked ? { debut: '05:00', fin: '21:00' } : null)}
                    className="h-4 w-4 rounded border-input text-accent focus:ring-2 focus:ring-ring cursor-pointer"
                  />
                  <span className={cn(h === null && 'text-muted-foreground')}>{JOURS_SEMAINE[i]}</span>
                </label>
                {h === null ? (
                  <span className="text-xs text-muted-foreground italic">Non travaillé</span>
                ) : regime === 'custom' && canEdit ? (
                  <>
                    <input
                      type="time"
                      value={h.debut}
                      onChange={(e) => setJour(i, { ...h, debut: e.target.value })}
                      className="h-7 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring tabular-nums"
                    />
                    <span className="text-muted-foreground">→</span>
                    <input
                      type="time"
                      value={h.fin}
                      onChange={(e) => setJour(i, { ...h, fin: e.target.value })}
                      className="h-7 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring tabular-nums"
                    />
                  </>
                ) : (
                  <span className="tabular-nums">{h.debut} → {h.fin}</span>
                )}
                {h !== null && (
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                    {Math.round(dureeFenetre(h) / 6) / 10} h{h.fin <= h.debut ? ' · finit le lendemain' : ''}
                  </span>
                )}
              </div>
            ))}
            <div className="pt-1 border-t border-border/60 flex justify-end text-xs text-muted-foreground tabular-nums">
              {Math.round(heuresSemaine * 10) / 10} h par semaine
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {!canEdit && (
            <p className="text-xs text-muted-foreground">Le choix du régime demande le droit « Édition du planning de production ».</p>
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{canEdit ? 'Annuler' : 'Fermer'}</Button>
          {canEdit && (
            <Button
              disabled={saving || invalide}
              onClick={() => onSave(regime, regime === 'custom' ? semaine : null)}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Enregistrer
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
