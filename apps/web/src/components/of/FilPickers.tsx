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
// Each picker comes in two shapes:
//   • `…Panel` — the picker alone, opened and closed by the caller. The
//     création dialog triggers it from its section caption (top right), so the
//     trigger and the panel sit in different parts of the layout.
//   • `Add…Button` — the §7.1 dashed add-row affordance, owning its own open
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

/** Pick a (fil, coloris) pair. The lot is chosen afterwards, on the row itself
 *  — a composition row can legitimately carry no lot yet. */
export function FilPickerPanel({
  label, onAdd, onCancel,
}: {
  label: string
  onAdd: (pair: FilPair, lot: LotLookup | null) => void
  onCancel: () => void
}) {
  const [pairKey, setPairKey] = useState(0)
  const { data: pairs, isLoading } = useQuery<FilPair[]>({
    queryKey: ['of-trm-fils'],
    queryFn: () => apiFetch('/of-trm/lookups/fils'),
    staleTime: 5 * 60_000,
  })
  const selected = (pairs ?? []).find((_, i) => i + 1 === pairKey) ?? null

  return (
    <div className="rounded-lg border border-accent/25 bg-card p-3 space-y-2 shadow-sm">
      <p className="text-xs font-semibold text-accent uppercase tracking-wide">{label}</p>
      <SearchableCombobox
        options={(pairs ?? []).map((p, i) => ({ ...p, _idx: i + 1 }))}
        value={pairKey}
        onChange={(id) => setPairKey(id)}
        getId={(p: FilPair & { _idx: number }) => p._idx}
        getPrimary={(p) => p.ref_label}
        getSecondary={(p) => `${p.coloris_label || 'ecru'} · ${fmtNum(p.stock, 1)} Kg`}
        loading={isLoading}
        placeholder="Choisir un fil en stock…"
      />
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onCancel}>Annuler</Button>
        <Button
          size="sm"
          disabled={!selected}
          onClick={() => { if (selected) onAdd(selected, null) }}
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />Ajouter
        </Button>
      </div>
    </div>
  )
}

/** Incorporer picks a LOT, not a pair: the weight is taken off that very lot,
 *  so the row is meaningless without it (hence the two-step picker). */
export function LotPickerPanel({
  onAdd, onCancel,
}: {
  onAdd: (lot: LotLookup, pair: FilPair) => void
  onCancel: () => void
}) {
  const [pairIdx, setPairIdx] = useState(0)
  const [lotId, setLotId] = useState(0)
  const { data: pairs, isLoading } = useQuery<FilPair[]>({
    queryKey: ['of-trm-fils'],
    queryFn: () => apiFetch('/of-trm/lookups/fils'),
    staleTime: 5 * 60_000,
  })
  const selectedPair = (pairs ?? [])[pairIdx - 1] ?? null
  const { data: lots } = useQuery<LotLookup[]>({
    queryKey: ['of-trm-lots', selectedPair?.IDref_fil ?? 0, selectedPair?.IDcolori_fil ?? 0],
    queryFn: () => apiFetch(`/of-trm/lookups/lots?refFil=${selectedPair!.IDref_fil}&coloriFil=${selectedPair!.IDcolori_fil}`),
    enabled: selectedPair !== null,
    staleTime: 60_000,
  })
  const chosenLot = (lots ?? []).find((l) => l.id === lotId) ?? null

  return (
    <div className="rounded-lg border border-accent/25 bg-card p-3 space-y-2 shadow-sm">
      <p className="text-xs font-semibold text-accent uppercase tracking-wide">Ajouter un lot</p>
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
      {selectedPair && (
        // Same rule as the création dialog: the field names the lot, its
        // weight is a label right of it. `description` keeps the weight in the
        // popover rows without letting it onto the trigger button.
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <PopoverSelect
              options={(lots ?? []).map((l) => ({ id: l.id, primary: l.lot || `#${l.id}`, description: `${fmtNum(l.stock, 1)} Kg en stock` }))}
              value={lotId}
              onChange={setLotId}
              emptyLabel="Choisir un lot"
              size="sm"
              widthClass="w-full"
            />
          </div>
          {chosenLot && (
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
              stock <span className="tabular-nums font-semibold">{fmtNum(chosenLot.stock, 1)} Kg</span>
            </span>
          )}
        </div>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onCancel}>Annuler</Button>
        <Button
          size="sm"
          disabled={!selectedPair || lotId === 0}
          onClick={() => {
            const lot = (lots ?? []).find((l) => l.id === lotId)
            if (selectedPair && lot) onAdd(lot, selectedPair)
          }}
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />Ajouter
        </Button>
      </div>
    </div>
  )
}

/** Dashed-trigger wrappers — the shape the OF fiche uses in its Tricoter and
 *  Incorporer cards. */
export function AddFilButton({
  label, onAdd,
}: {
  label: string
  onAdd: (pair: FilPair, lot: LotLookup | null) => void
}) {
  const [open, setOpen] = useState(false)
  if (!open) return <DashedTrigger label={label} onClick={() => setOpen(true)} />
  return (
    <FilPickerPanel
      label={label}
      onCancel={() => setOpen(false)}
      onAdd={(pair, lot) => { onAdd(pair, lot); setOpen(false) }}
    />
  )
}

export function AddIncorporeButton({ onAdd }: { onAdd: (lot: LotLookup, pair: FilPair) => void }) {
  const [open, setOpen] = useState(false)
  if (!open) return <DashedTrigger label="Ajouter un lot" onClick={() => setOpen(true)} />
  return (
    <LotPickerPanel
      onCancel={() => setOpen(false)}
      onAdd={(lot, pair) => { onAdd(lot, pair); setOpen(false) }}
    />
  )
}
