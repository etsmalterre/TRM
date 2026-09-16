// The two yarn pickers of an OF — "Ajouter un fil" (Tricoter) and "Ajouter un
// lot" (Incorporer), plus the lookup shapes they share.
//
// Extracted from ProductionOf.tsx so the création dialog can offer the same
// two actions the legacy "Gestion d'un OF" window puts in its toolbar. The OF
// fiche and the dialog draw their ROWS differently on purpose — the fiche
// stacks editable cards inside a panel, the dialog keeps a table because at
// creation the "besoin" per fil is what tells you whether the lot is enough —
// but the pickers themselves are one implementation, here.
//
// Since 2026-09-16 (LIVA #1160) the picker is a DIALOG, not a panel that grows
// inside the card. The inline version cascaded — click the dashed row, a
// panel appears, pick a fil, a second field appears, then Ajouter — at the
// very bottom of a long fiche, and read as complicated even once its
// dropdowns stopped painting off-screen. The dialog shows both fields from
// the start (the lot one disabled until a fil is chosen) in a stable frame.
// It is the mps_designer §18.0 / row-creation rule too: a row that needs real
// data to exist (a lot for Incorporer, a fil for Tricoter) is created through
// a modal, not an inline placeholder.
//
// Two shapes share the one dialog:
//   • `AjouterFilDialog` — the dialog alone, opened and closed by the caller.
//     The création dialog triggers it from its section caption (top right)
//     and stacks it over itself.
//   • `Add…Button` — the §7.1 dashed add-row affordance owning its own open
//     state. That is the shape the OF fiche uses, under its list.
//
// Both read `/of-trm/lookups/fils` (the pairs actually in stock: TRM knits à
// façon, so the yarn on hand IS the working catalogue) and, for a chosen pair,
// `/of-trm/lookups/lots`. Query keys are shared with the fiche so opening one
// after the other costs nothing.

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PopoverSelect, SearchableCombobox } from '@/components/ui/popover-select'
import { apiFetch } from '@/lib/api'
import { fmtNum } from '@/lib/format'

export interface FilPair {
  key: string
  IDref_fil: number
  IDcolori_fil: number
  ref_label: string
  coloris_label: string
  stock: number
  lots: number
}

export interface LotLookup {
  id: number
  lot: string
  IDref_fil: number
  IDcolori_fil: number
  stock: number
  emplacement: string
  /** Affected to the ETM sst line behind this commande (only set by the
   *  composition lookup, LIVA #1159) — the row's default lot. */
  affecte?: boolean
}

/** Client-side row ids for draft compositions. Module-level so the fiche and
 *  the dialog can never hand out the same key. */
let draftKeySeq = 1
export function nextDraftKey(): number {
  return draftKeySeq++
}

/** Dashed add-row affordance (§7.1) — the OF fiche's trigger shape. */
function DashedTrigger({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      variant="ghost" size="sm"
      onClick={onClick}
      className="w-full bg-card text-muted-foreground hover:text-accent hover:bg-accent/5 border border-dashed border-border/60 hover:border-accent/40"
    >
      <Plus className="h-3.5 w-3.5 mr-1.5" />{label}
    </Button>
  )
}

/** Compact trigger for a section caption row — the création dialog's shape. */
export function AddTrigger({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      variant="outline" size="sm"
      onClick={onClick}
      className="h-7 shrink-0 bg-card px-2 text-[11px]"
    >
      <Plus className="h-3 w-3 mr-1" />{label}
    </Button>
  )
}

// ── The dialog ───────────────────────────────────────────

/** `fil` = Tricoter: the row is a (fil, coloris) pair, the lot is optional
 *  and can be chosen later on the row itself. `lot` = Incorporer: the weight
 *  is taken off that very lot, so the row is meaningless without it. */
export type AjouterFilMode = 'fil' | 'lot'

const TITLES: Record<AjouterFilMode, string> = { fil: 'Ajouter un fil', lot: 'Ajouter un lot' }

export function AjouterFilDialog({
  mode, open, onClose, onAdd,
}: {
  mode: AjouterFilMode
  open: boolean
  onClose: () => void
  /** `lot` is null only in `fil` mode, when the user left it for later. */
  onAdd: (pair: FilPair, lot: LotLookup | null) => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      {/* Mounted only while open so every opening starts from a blank form. */}
      {open && <AjouterFilForm mode={mode} onClose={onClose} onAdd={onAdd} />}
    </Dialog>
  )
}

function AjouterFilForm({
  mode, onClose, onAdd,
}: {
  mode: AjouterFilMode
  onClose: () => void
  onAdd: (pair: FilPair, lot: LotLookup | null) => void
}) {
  const [pairIdx, setPairIdx] = useState(0)
  const [lotId, setLotId] = useState(0)
  const { data: pairs, isLoading } = useQuery<FilPair[]>({
    queryKey: ['of-trm-fils'],
    queryFn: () => apiFetch('/of-trm/lookups/fils'),
    staleTime: 5 * 60_000,
  })
  const selectedPair = (pairs ?? [])[pairIdx - 1] ?? null
  const { data: lots, isLoading: lotsLoading } = useQuery<LotLookup[]>({
    queryKey: ['of-trm-lots', selectedPair?.IDref_fil ?? 0, selectedPair?.IDcolori_fil ?? 0],
    queryFn: () => apiFetch(`/of-trm/lookups/lots?refFil=${selectedPair!.IDref_fil}&coloriFil=${selectedPair!.IDcolori_fil}`),
    enabled: selectedPair !== null,
    staleTime: 60_000,
  })
  const chosenLot = (lots ?? []).find((l) => l.id === lotId) ?? null
  const lotRequired = mode === 'lot'
  const canAdd = selectedPair !== null && (!lotRequired || chosenLot !== null)

  const submit = () => {
    if (!canAdd || !selectedPair) return
    onAdd(selectedPair, chosenLot)
    onClose()
  }

  return (
    <DialogContent className="max-w-md" onClose={onClose}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Plus className="h-5 w-5 text-accent" />
          {TITLES[mode]}
        </DialogTitle>
      </DialogHeader>
      <div className="mt-4 space-y-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Fil *</label>
          <SearchableCombobox
            options={(pairs ?? []).map((p, i) => ({ ...p, _idx: i + 1 }))}
            value={pairIdx}
            onChange={(id) => { setPairIdx(id); setLotId(0) }}
            getId={(p: FilPair & { _idx: number }) => p._idx}
            getPrimary={(p) => p.ref_label}
            getSecondary={(p) => `${p.coloris_label || 'ecru'} · ${fmtNum(p.stock, 1)} Kg`}
            loading={isLoading}
            placeholder="Choisir un fil en stock…"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">{lotRequired ? 'Lot *' : 'Lot'}</label>
          {/* Same rule as the composition rows: the field names the lot, its
              weight travels in `description` (popover rows only), never on
              the closed button. */}
          <PopoverSelect
            options={(lots ?? []).map((l) => ({ id: l.id, primary: l.lot || `#${l.id}`, description: `${fmtNum(l.stock, 1)} Kg en stock` }))}
            value={lotId}
            onChange={setLotId}
            emptyLabel={selectedPair === null ? "Choisissez d'abord un fil" : lotsLoading ? 'Chargement…' : 'Choisir un lot'}
            disabled={selectedPair === null || lotsLoading}
            widthClass="w-full"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            {chosenLot
              ? <>stock <span className="tabular-nums font-semibold text-foreground">{fmtNum(chosenLot.stock, 1)} Kg</span>{chosenLot.emplacement ? ` · ${chosenLot.emplacement}` : ''}</>
              : lotRequired
                ? 'Le poids incorporé sera déduit de ce lot.'
                : 'Facultatif — le lot peut être choisi plus tard sur la ligne.'}
          </p>
        </div>
      </div>
      <DialogFooter className="mt-4">
        <Button variant="outline" onClick={onClose}>Annuler</Button>
        <Button disabled={!canAdd} onClick={submit}>
          <Plus className="h-4 w-4 mr-1.5" />Ajouter
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

// ── Dashed-trigger wrappers — the OF fiche's shape ───────

export function AddFilButton({
  label, onAdd,
}: {
  label: string
  onAdd: (pair: FilPair, lot: LotLookup | null) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <DashedTrigger label={label} onClick={() => setOpen(true)} />
      <AjouterFilDialog mode="fil" open={open} onClose={() => setOpen(false)} onAdd={onAdd} />
    </>
  )
}

export function AddIncorporeButton({ onAdd }: { onAdd: (lot: LotLookup, pair: FilPair) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <DashedTrigger label="Ajouter un lot" onClick={() => setOpen(true)} />
      <AjouterFilDialog
        mode="lot"
        open={open}
        onClose={() => setOpen(false)}
        onAdd={(pair, lot) => { if (lot) onAdd(lot, pair) }}
      />
    </>
  )
}
