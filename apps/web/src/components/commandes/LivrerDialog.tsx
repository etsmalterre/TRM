// « Livrer » des cols / bandes (LIVA #1381) — Clients › Commandes.
//
// A rectiligne line (machine plate: cols, bandes) has no roll to tick: what
// leaves is a count. One line, one question — how many are leaving — and the
// answer becomes an avis d'expédition (POST /commandes-trm/:id/livrer), then
// printed, emailed and invoiced like the rolls'.
//
// Kept this small on purpose (Vincent, 2026-11-20): a first version listed
// every rectiligne line of the order, a second one hid them behind « Livrer
// aussi d'autres lignes ». Both were removed — do not bring a table back here.
// Delivering more than what remains is allowed (a batch comes out a few pieces
// over): the dialog says so, nothing is refused.

import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Loader2, Truck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { apiFetch } from '@/lib/api'
import { fmtNum } from '@/lib/format'
import { lireQuantite } from '@/lib/livraison-rectiligne'

export interface LigneRectiligne {
  IDligne_commande_client: number
  ref_label: string | null
  colori_reference: string | null
  ref_designation: string | null
  reste_a_livrer: number
  unite_label: string
}

export function LivrerDialog({ open, commandeId, ligne, onClose, onDone }: {
  open: boolean
  commandeId: number
  ligne: LigneRectiligne
  onClose: () => void
  /** Called with the avis just created. */
  onDone: (IDexpedition: number) => void
}) {
  const [saisie, setSaisie] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  // One POST per opening: a second Enter while the first is in flight would
  // create a second avis (`isPending` flips a render too late to stop it).
  const envoye = useRef(false)

  useEffect(() => {
    if (!open) return
    envoye.current = false
    setError(null)
    setSaisie(ligne.reste_a_livrer > 0 ? String(ligne.reste_a_livrer).replace('.', ',') : '')
    const t = setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 50)
    return () => clearTimeout(t)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const quantite = lireQuantite(saisie)
  const excess = Math.round((quantite - ligne.reste_a_livrer) * 100) / 100

  const livrerMut = useMutation({
    mutationFn: () => apiFetch<{ IDexpedition: number }>(`/commandes-trm/${commandeId}/livrer`, {
      method: 'POST',
      body: JSON.stringify({ lignes: [{ IDligne_commande_client: ligne.IDligne_commande_client, quantite }] }),
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
    if (!(quantite > 0) || envoye.current) return
    envoye.current = true
    setError(null)
    livrerMut.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-sm" onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-accent" />
            Livrer
          </DialogTitle>
        </DialogHeader>
        <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); submit() }}>
          <p className="text-sm text-muted-foreground truncate">
            {ligne.ref_label || '—'}{ligne.colori_reference ? ` / ${ligne.colori_reference}` : ''}
            {ligne.ref_designation ? ` · ${ligne.ref_designation}` : ''}
          </p>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="livrer-quantite">Quantité à livrer</label>
            <input
              id="livrer-quantite"
              ref={inputRef}
              type="text"
              inputMode="decimal"
              value={saisie}
              onChange={(e) => setSaisie(e.target.value)}
              className="w-full h-9 px-2.5 text-sm tabular-nums rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-[11px] text-muted-foreground tabular-nums">
              Reste {fmtNum(ligne.reste_a_livrer)} {ligne.unite_label}
              {excess > 0 ? ` · ${fmtNum(excess)} de plus que le reste` : ''}
            </p>
          </div>
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">{error}</div>
          )}
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={!(quantite > 0) || livrerMut.isPending}>
              {livrerMut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Truck className="h-3.5 w-3.5 mr-1.5" />}
              Livrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
