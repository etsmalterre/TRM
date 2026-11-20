// « Livrer » des cols / bandes (LIVA #1381) — Clients › Commandes.
//
// A rectiligne line (machine plate: cols, bandes) has no roll to tick: what
// leaves is a count. This dialog lists the order's rectiligne lines with what
// is left of each, takes the quantities of the batch that is leaving, and
// posts them as ONE avis d'expédition (POST /commandes-trm/:id/livrer) — the
// same avis that is then printed, emailed and invoiced like the rolls'.
//
// §18.A form dialog. Delivering more than what remains is allowed (a batch
// comes out a few pieces over): the row says by how much, nothing is refused.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { CheckCircle2, Loader2, Truck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { apiFetch } from '@/lib/api'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'
import { resumerLivraison, saisiesDuReste } from '@/lib/livraison-rectiligne'

export interface LigneRectiligne {
  IDligne_commande_client: number
  ref_label: string | null
  colori_reference: string | null
  ref_designation: string | null
  quantite: number
  /** Pieces already delivered. */
  expedie: number
  reste_a_livrer: number
  livree: boolean
  unite_label: string
}

export function LivrerDialog({
  open, commandeId, numero, clientNom, lignes, focusLineId, onClose, onDone,
}: {
  open: boolean
  commandeId: number
  numero: number | null
  clientNom: string
  /** The order's rectiligne lines, in order. */
  lignes: LigneRectiligne[]
  /** The line the dialog was opened from: prefilled with what remains of it. */
  focusLineId: number | null
  onClose: () => void
  /** Called with the avis just created. */
  onDone: (IDexpedition: number) => void
}) {
  const [saisies, setSaisies] = useState<Record<number, string>>({})
  const [error, setError] = useState<string | null>(null)
  const focusRef = useRef<HTMLInputElement | null>(null)
  // One POST per opening: a second Enter while the first is in flight would
  // create a second avis (`isPending` flips a render too late to stop it).
  const envoye = useRef(false)

  useEffect(() => {
    if (!open) return
    envoye.current = false
    setError(null)
    const cible = lignes.find((l) => l.IDligne_commande_client === focusLineId)
    setSaisies(cible && cible.reste_a_livrer > 0
      ? { [cible.IDligne_commande_client]: String(cible.reste_a_livrer).replace('.', ',') }
      : {})
    const t = setTimeout(() => { focusRef.current?.focus(); focusRef.current?.select() }, 50)
    return () => clearTimeout(t)
  }, [open, focusLineId]) // eslint-disable-line react-hooks/exhaustive-deps

  const resume = useMemo(() => resumerLivraison(lignes, saisies), [lignes, saisies])
  const resteTotal = lignes.reduce((s, l) => s + l.reste_a_livrer, 0)

  const livrerMut = useMutation({
    mutationFn: () => apiFetch<{ IDexpedition: number }>(`/commandes-trm/${commandeId}/livrer`, {
      method: 'POST',
      body: JSON.stringify({ lignes: resume.lignes }),
    }),
    onSuccess: (res) => onDone(res.IDexpedition),
    onError: (e: Error & { status?: number; body?: { message?: string } }) => {
      envoye.current = false
      setError(
        e.status === 403
          ? "Vous n'avez pas le droit de livrer (droit « Édition des expéditions »)."
          : e.body?.message ?? 'La livraison n’a pas pu être enregistrée.',
      )
    },
  })

  const submit = () => {
    if (resume.lignes.length === 0 || envoye.current) return
    envoye.current = true
    setError(null)
    livrerMut.mutate()
  }

  // The first line still owed takes the focus when the opener is already delivered.
  const focusId = lignes.find((l) => l.IDligne_commande_client === focusLineId && l.reste_a_livrer > 0)?.IDligne_commande_client
    ?? lignes.find((l) => l.reste_a_livrer > 0)?.IDligne_commande_client
    ?? lignes[0]?.IDligne_commande_client

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-2xl" onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-accent" />
            Livrer des pièces
          </DialogTitle>
        </DialogHeader>
        <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); submit() }}>
          <p className="text-sm text-muted-foreground">
            Commande n° {numero ?? '—'}{clientNom ? ` · ${clientNom}` : ''}. Saisissez ce qui part aujourd’hui : un avis d’expédition est créé pour ces pièces.
          </p>

          <div className="rounded-lg border border-border/60 overflow-hidden">
            <div className="max-h-[50dvh] overflow-y-auto scrollbar-transparent">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-zinc-200/60 backdrop-blur text-[10px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left font-semibold px-3 py-2">Référence</th>
                    <th className="text-right font-semibold px-2 py-2">Commandé</th>
                    <th className="text-right font-semibold px-2 py-2">Déjà livré</th>
                    <th className="text-right font-semibold px-2 py-2">Reste</th>
                    <th className="text-right font-semibold px-3 py-2 w-32">À livrer</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((l) => {
                    const id = l.IDligne_commande_client
                    const excess = resume.depassements.get(id)
                    return (
                      <tr key={id} className="border-t border-border/60 align-top">
                        <td className="px-3 py-2 min-w-0">
                          <p className="font-medium truncate">
                            {l.ref_label || '—'}
                            {l.colori_reference ? <span className="text-muted-foreground"> / {l.colori_reference}</span> : null}
                          </p>
                          {!!l.ref_designation && <p className="text-[11px] text-muted-foreground truncate">{l.ref_designation}</p>}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">{fmtNum(l.quantite)}</td>
                        <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap text-muted-foreground">{fmtNum(l.expedie)}</td>
                        <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                          {l.livree
                            ? <span className="inline-flex items-center gap-1 text-green-600"><CheckCircle2 className="h-3.5 w-3.5" />Livrée</span>
                            : <span className="font-semibold">{fmtNum(l.reste_a_livrer)}</span>}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <input
                            ref={id === focusId ? focusRef : undefined}
                            type="text"
                            inputMode="decimal"
                            value={saisies[id] ?? ''}
                            onChange={(e) => setSaisies((prev) => ({ ...prev, [id]: e.target.value }))}
                            placeholder="0"
                            aria-label={`Quantité à livrer, ${l.ref_label ?? ''} ${l.colori_reference ?? ''}`}
                            className="w-24 h-8 px-2.5 text-sm text-right tabular-nums rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                          {excess !== undefined && (
                            <p className="mt-0.5 text-[11px] text-muted-foreground italic whitespace-nowrap">
                              {fmtNum(excess)} de plus que le reste
                            </p>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {resteTotal > 0 && (
              <Button
                type="button" variant="ghost" size="sm"
                className="h-7 text-xs text-accent hover:text-accent hover:bg-accent/10"
                onClick={() => setSaisies(saisiesDuReste(lignes))}
                title="Remplir chaque ligne avec ce qui reste à livrer"
              >
                Tout le reste
              </Button>
            )}
            {Object.values(saisies).some((v) => v.trim() !== '') && (
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSaisies({})}>
                Vider
              </Button>
            )}
            <span className={cn('ml-auto tabular-nums', resume.total > 0 && 'text-foreground font-semibold')}>
              {resume.total > 0
                ? `${fmtNum(resume.total)} pièce${resume.total > 1 ? 's' : ''} sur ${resume.lignes.length} ligne${resume.lignes.length > 1 ? 's' : ''}`
                : 'Aucune quantité saisie'}
            </span>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">{error}</div>
          )}

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={resume.lignes.length === 0 || livrerMut.isPending}>
              {livrerMut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Truck className="h-3.5 w-3.5 mr-1.5" />}
              Livrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
