// Création d'un ordre de fabrication — port of the legacy "Gestion d'un OF"
// window in its creation state (FEN_Lancement_OF).
//
// ── Why it lives here and not in a page ──
// Two screens open it, and they must stay the same dialog:
//   • Production › Gestion des OF — "Nouveau", the user picks the line;
//   • Clients › Commandes — the line drawer's Stock de fil tab, where the user
//     ticks the lots to knit from and the line is imposed (`presetLigneId` +
//     `presetLotIds`). That is the legacy's "Créer OF" button.
// Forking it per screen is how the two entry points would drift apart, so the
// page-level difference is a prop, not a copy.
//
// ── Layout: split sheet — the OF on the left, the régleur's panel on the right
// The legacy window is split the same way, and the reason is the work:
//   • LEFT (bg-secondary, 96 %) — the OF itself: its settings (métier, weights,
//     visitage, nettoyage, options) and its yarns. Everything the OF *is*.
//   • RIGHT (bg-sand, 93 % — one notch deeper, so it reads as a panel) — what
//     the régleur READS before launching: the reference's standing comments,
//     then the consigne he writes to the bonnetiers and the auto-activation.
// The consigne sits directly under those comments because it is usually
// written in answer to them. Below `lg` the columns stack.
//
// ── Warm sheet, with the §43 navy band as its header ──
// The sheet is `bg-secondary` (38 12% 96% — the app's WARM near-white) and the
// things you type into stay pure white: inputs (`inputClass`), the two tables
// (`bg-card`). Both earlier attempts were wrong and were user-rejected on
// 2026-08-26: the §18.D composition first (navy band + zinc body + zinc
// footer) — "the grey backgrounds are nowhere in the Malterre softwares",
// and zinc is indeed the drawer / panel language, reserved for dialogs that
// present a *bilan* to read (Fils › Stock's ArchiverDialog) — then a pure
// white sheet, which reads aggressive and leaves white fields with no edge to
// sit on. Warm 96 % is the middle: same hue family as the app's body gradient
// (§19), one notch below the fields so every input frames itself.
// One knob if it ever needs tuning: `bg-secondary` → `bg-background` (99 %,
// lighter) or `bg-sand` (93 %, deeper). Never a zinc/cool grey.
//
// Grouping is carried by the app's own cards (the `Section` below): white
// `card-premium` surfaces on the warm sheet, exactly like the fiche screens.
//
// The navy band is kept as the header: this dialog carries a record identity
// (the écru, and the commande it is knitted for) that a one-line DialogTitle
// cannot, and the band is the app's standard identity surface (§43).
//
// ── The composition is a list of FEEDING POSITIONS, not of yarns ──
// A blend can feed the same (fil, coloris) twice — ref 119/ecru is 71 % +
// 14,5 % + 14,5 % of two yarns, and only all three rows add up to the 100 %
// the legacy checks. So rows are keyed by the composition row id (`key`),
// never by the pair, and two rows sharing a pair each keep their own lot pick.
// See `of-trm.ts` § lookups/composition.

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertCircle, AlertTriangle, Eye, Factory, Layers, Loader2, MessageSquare, Play, Plus, ShoppingCart, Split, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PopoverSelect, SearchableCombobox, type PopoverSelectOption } from '@/components/ui/popover-select'
import { BobineIcon } from '@/components/icons/BobineIcon'
import { AddTrigger, FilPickerPanel, LotPickerPanel, nextDraftKey, type LotLookup } from '@/components/of/FilPickers'
import { HorsRefBadge } from '@/components/of/HorsRefBadge'
import { apiFetch } from '@/lib/api'
import { fmtNum } from '@/lib/format'
import { formatHfsqlDate } from '@/lib/dates'
import { cn } from '@/lib/utils'

const inputClass = 'w-full h-8 px-2.5 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring'

/** The legacy Visitage combo captions (value 0 exists only on 20 pre-2021
 *  migrated rows and is not offered). Mirrors ProductionOf.tsx. */
const VISITAGE_OPTIONS: PopoverSelectOption[] = [
  { id: 1, primary: '2 premières pièces et toutes les 3 pièces' },
  { id: 2, primary: 'Toutes les pièces' },
]

export interface LigneLookup {
  id: number
  IDcommande_client: number
  commande_numero: number
  client_nom: string
  IDreference: number
  IDcolori: number
  ref_label: string
  contexture: string
  poids_piece_defaut: number
  coloris_label: string
  quantite: number
  couvert: number
  restant: number
}

interface MachineLookup { id: number; nom: string; jauge: number; diametre: number; emplacement: string; archive: number }

interface SeedComponent {
  /** composition_ecru row id — stable, and distinct for two rows of one pair. */
  key: number
  IDref_fil: number
  IDcolori_fil: number
  pourcentage: number
  ref_label: string
  coloris_label: string
  lots: LotLookup[]
  defaultLot: number
}

/** A standing note on the écru reference (`obs_ref_ecru`), scoped per machine
 *  and per coloris — written in Tombé Métier › Références, read here. */
interface RefObservation {
  id: number
  date: string | null
  observation: string
  machine: string
  coloris: string
  cible_machine: boolean
  cible_coloris: boolean
}

interface CompositionSeed {
  components: SeedComponent[]
  compatibles: Array<{ id: number; nom: string }>
  defaults: { poids_piece: number; ouvert_visiteuse: number; maille_ouverture: number; sonneter: number }
  total_pourcentage: number
}

function parseNum(v: string): number {
  const x = parseFloat(v.replace(',', '.'))
  return Number.isFinite(x) ? x : 0
}

/** Stable empty fallback — a fresh `new Map()` per render would re-render every
 *  row on every keystroke. */
const EMPTY_BESOIN: Map<number, number> = new Map()

/** A group of fields — rendered as the app's own card (`card-premium`:
 *  rounded-xl white surface, blue-tinted shadow, 4×4 gold icon + `text-sm
 *  font-semibold` title), exactly like every card of the OF fiche and of the
 *  fiche screens. The earlier caption-and-hairline version organised the same
 *  content correctly but in a vocabulary the app speaks nowhere, which is what
 *  made the dialog read as foreign. Padding is p-4 rather than the fiche's p-6:
 *  same card, five of them inside a dialog. */
function Section({
  icon: Icon, title, aside, action, children,
}: {
  icon: React.ElementType
  title: string
  aside?: React.ReactNode
  /** Section-level action, pinned top right (the two "Ajouter" triggers). It
   *  sits outside the truncating `aside` so it can never be clipped. */
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Card className="card-premium">
      <CardHeader className="flex flex-row items-center gap-2 p-4 pb-2 space-y-0">
        <Icon className="h-4 w-4 text-accent flex-shrink-0" />
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {aside ? <span className="ml-auto min-w-0 text-[11px] text-muted-foreground truncate">{aside}</span> : null}
        {action ? <div className={cn('flex-shrink-0', !aside && 'ml-auto')}>{action}</div> : null}
      </CardHeader>
      <CardContent className="p-4 pt-2 space-y-3">{children}</CardContent>
    </Card>
  )
}

/** Field label — the fiche's `KV` caption, so a field in this dialog and the
 *  same field on the OF fiche are typeset identically. */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-medium text-muted-foreground">{children}</p>
}

/** One feeding position of the draft composition. `lots` is null on a row the
 *  user added — its lot list is fetched by the row itself. */
interface CompRow {
  key: number
  IDref_fil: number
  IDcolori_fil: number
  ref_label: string
  coloris_label: string
  pourcentage: string
  IDstock_fil: number
  lots: LotLookup[] | null
}

interface IncRow {
  key: number
  IDstock_fil: number
  lot: string
  ref_label: string
  coloris_label: string
  poids: string
}

/** Lot picker for a composition row. Seeded rows already carry their lots;
 *  a row added through "Ajouter un fil" fetches them here, on the same query
 *  key the OF fiche uses.
 *
 *  The lot's stock rides in `description` (popover rows only), never in
 *  `secondary` — `secondary` is also concatenated onto the trigger button,
 *  which would leave the closed field reading "10131 — 168,8 Kg". The field
 *  names the lot; its weight is an *information*, so it sits as a plain label
 *  right of the field once a lot is picked (user decision, 2026-08-26). */
function LotPicker({
  row, besoinAilleurs, onChange,
}: {
  row: CompRow
  /** Kg the OTHER rows already draw from each lot. Annotated in the list so
   *  picking a lot a sibling row is already on is an informed choice: it is
   *  legitimate (two feeding positions of one blend really do share a lot —
   *  83 of the 105 duplicate groups in the ledger), but it is also how a split
   *  gets silently pointed back at its own source and overdraws it. */
  besoinAilleurs: Map<number, number>
  onChange: (IDstock_fil: number) => void
}) {
  const { data, isLoading } = useQuery<LotLookup[]>({
    queryKey: ['of-trm-lots', row.IDref_fil, row.IDcolori_fil],
    queryFn: () => apiFetch(`/of-trm/lookups/lots?refFil=${row.IDref_fil}&coloriFil=${row.IDcolori_fil}`),
    enabled: row.lots === null,
    staleTime: 60_000,
  })
  const lots = row.lots ?? data ?? []
  if (row.lots === null && isLoading) return <div className="h-8 bg-muted animate-pulse rounded-md" />
  return (
    <PopoverSelect
      options={lots.map((l) => {
        const pris = besoinAilleurs.get(l.id) ?? 0
        return {
          id: l.id,
          primary: l.lot || `#${l.id}`,
          description: pris > 0
            ? `${fmtNum(l.stock, 1)} Kg en stock\ndéjà ${fmtNum(pris, 1)} Kg pris par une autre ligne`
            : `${fmtNum(l.stock, 1)} Kg en stock`,
        }
      })}
      value={row.IDstock_fil}
      onChange={onChange}
      emptyLabel="Sans lot"
      size="sm"
      widthClass="w-full"
    />
  )
}

/** The lot a composition row currently points at, for the "manque" check. */
function useRowLot(row: CompRow): LotLookup | null {
  const { data } = useQuery<LotLookup[]>({
    queryKey: ['of-trm-lots', row.IDref_fil, row.IDcolori_fil],
    queryFn: () => apiFetch(`/of-trm/lookups/lots?refFil=${row.IDref_fil}&coloriFil=${row.IDcolori_fil}`),
    enabled: row.lots === null,
    staleTime: 60_000,
  })
  return (row.lots ?? data ?? []).find((l) => l.id === row.IDstock_fil) ?? null
}

/** One editable row of the Tricoter table: share, need, lot, split, remove. */
function CompositionRow({
  row, quantite, horsRef, besoinAilleurs, onChange, onSplit, onRemove,
}: {
  row: CompRow
  quantite: number
  /** This yarn is not in the reference's own composition (see HorsRefBadge). */
  horsRef: boolean
  /** Kg the OTHER rows draw from each lot — the shortage test is per LOT, not
   *  per row. Two rows on one lot is legitimate (feeding positions), so the
   *  question is never "is this lot used twice" but "do the rows together ask
   *  it for more than it holds". Checking row by row let a split pointed back
   *  at its own source read green while both halves drew on the same stock. */
  besoinAilleurs: Map<number, number>
  onChange: (next: CompRow) => void
  /** Serve the rest of this share from a second lot. `couvert` is the share the
   *  current lot can actually cover; the caller splits the row on it. */
  onSplit: (couvert: number) => void
  onRemove: () => void
}) {
  const lot = useRowLot(row)
  const pct = parseNum(row.pourcentage)
  const besoin = quantite * (pct / 100)
  const pris = lot ? besoinAilleurs.get(lot.id) ?? 0 : 0
  // What the lot still has for THIS row once its siblings are served.
  const dispo = lot ? Math.max(0, lot.stock - pris) : 0
  const short = lot !== null && dispo < besoin
  const partage = pris > 0
  // What this lot covers, as a share of the run. The régleur's real gesture
  // when a lot is short is to take the rest off another lot of the same yarn —
  // 18 OFs in the ledger do exactly that (ref 97 % knitted as 70 + 27). Every
  // figure needed is already on the row, so the split is one click rather than
  // "Ajouter un fil", re-find the same yarn, retype both percentages.
  const couvert = quantite > 0 && lot ? Math.round((dispo / quantite) * 10000) / 100 : 0
  // Not offered when the shortage comes from SHARING the lot with a sibling
  // row: there the answer is not "split me further" — it is "one of us has to
  // move to another lot", and adding a third row on top of an already
  // overdrawn lot only muddles it. The red « reste 0,0 Kg · manque » plus the
  // picker's « déjà N Kg pris » is the message in that case.
  const splittable = short && !partage && couvert > 0 && couvert < pct
  return (
    <tr className="border-b border-border/40 last:border-0">
      <td className="px-2.5 py-2">
        <span className="font-medium text-sm">{row.ref_label}</span>
        <span className="text-muted-foreground"> {row.coloris_label}</span>
        {horsRef && <HorsRefBadge className="ml-1.5 align-middle" />}
      </td>
      <td className="px-2.5 py-2">
        <div className="flex items-center justify-end gap-1.5">
          <input
            className={cn(inputClass, 'w-16 text-right')}
            value={row.pourcentage}
            onChange={(e) => onChange({ ...row, pourcentage: e.target.value })}
            inputMode="decimal"
            placeholder="%"
          />
          <span className="text-[11px] text-muted-foreground">%</span>
        </div>
      </td>
      <td className={cn('px-2.5 py-2 text-right tabular-nums whitespace-nowrap', short && 'text-destructive font-medium')}>
        {pct > 0 ? `${fmtNum(besoin, 1)} Kg` : '—'}
      </td>
      <td className="px-2.5 py-2">
        <div className="flex items-center gap-2">
          <div className="w-24 flex-shrink-0">
            <LotPicker
              row={row}
              besoinAilleurs={besoinAilleurs}
              onChange={(id) => onChange({ ...row, IDstock_fil: id })}
            />
          </div>
          {lot && (
            <span
              className={cn(
                'inline-flex items-center gap-1 text-[11px] whitespace-nowrap',
                short ? 'text-destructive font-medium' : 'text-muted-foreground',
              )}
              title={
                partage
                  ? `Ce lot tient ${fmtNum(lot.stock, 1)} Kg, dont ${fmtNum(pris, 1)} Kg déjà pris par une autre ligne : il en reste ${fmtNum(dispo, 1)} Kg pour celle-ci.`
                  : short
                    ? 'Le lot ne couvre pas le besoin de cet OF'
                    : 'Stock de ce lot'
              }
            >
              {!!short && <AlertTriangle className="h-3 w-3" />}
              {/* Once a sibling row draws on the same lot, the lot's own stock
                  stops being the useful number — what this row can have is what
                  is LEFT. Showing the full stock next to a red "manque" is what
                  made the double-pick read as fine. */}
              {partage ? 'reste ' : 'stock '}
              <span className="tabular-nums font-semibold">{fmtNum(partage ? dispo : lot.stock, 1)} Kg</span>
              {/* The word is dropped when « compléter » is offered: the button
                  appears on exactly the same condition, so it would repeat what
                  the red weight and the button already say — and it is the one
                  case where the cell is at its widest. */}
              {!!short && !splittable && <span>· manque</span>}
            </span>
          )}
          {splittable && (
            <Button
              variant="ghost" size="sm"
              className="h-7 px-1.5 text-[11px] text-accent hover:text-accent hover:bg-accent/10 whitespace-nowrap"
              title={`Ce lot couvre ${fmtNum(couvert, 2)} % du mélange. Le reste (${fmtNum(pct - couvert, 2)} %) passe sur un second lot du même fil.`}
              onClick={() => onSplit(couvert)}
            >
              <Split className="h-3 w-3 mr-1" />compléter
            </Button>
          )}
        </div>
      </td>
      <td className="px-1 py-2">
        <Button
          variant="ghost" size="icon"
          className="h-7 w-7 text-destructive hover:text-destructive"
          title="Retirer ce fil"
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </td>
    </tr>
  )
}

/** Read-only derived value, shaped like the fields it sits next to so the grid
 *  keeps one baseline. */
function Derived({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <FieldLabel>{label}</FieldLabel>
      <p className="h-8 flex items-center text-sm tabular-nums text-muted-foreground">{children}</p>
    </div>
  )
}

export function CreateOfDialog({
  open, onClose, onCreated, presetLigneId, presetLotIds,
}: {
  open: boolean
  onClose: () => void
  onCreated: (id: number) => void
  /** When set, the line is imposed and its picker is replaced by the band. */
  presetLigneId?: number
  /** stock_fil ids ticked by the user — assigned to the components they can feed. */
  presetLotIds?: number[]
}) {
  const [ligneId, setLigneId] = useState(0)
  const [machineId, setMachineId] = useState(0)
  const [quantite, setQuantite] = useState('')
  const [poidsPiece, setPoidsPiece] = useState('')
  const [visitage, setVisitage] = useState(1)
  const [nettoyage, setNettoyage] = useState(1)
  const [finirFil, setFinirFil] = useState(false)
  const [ouvertVisiteuse, setOuvertVisiteuse] = useState(false)
  const [mailleOuverture, setMailleOuverture] = useState(false)
  const [sonneter, setSonneter] = useState(false)
  const [autoActivation, setAutoActivation] = useState(false)
  const [observations, setObservations] = useState('')
  // Composition and incorporés are DRAFTS, not the seed read back: the legacy
  // window lets the user add a fil the écru sheet doesn't know about (and a
  // reference with no composition at all could otherwise never be launched
  // from here — the API requires at least one row).
  const [comp, setComp] = useState<CompRow[]>([])
  const [inc, setInc] = useState<IncRow[]>([])
  const [addFilOpen, setAddFilOpen] = useState(false)
  const [addLotOpen, setAddLotOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const preset = (presetLigneId ?? 0) > 0
  const effectiveLigneId = preset ? (presetLigneId as number) : ligneId

  // Line picker (free mode) vs the single imposed line (preset mode) — the
  // `?ligne=` form also answers for a line whose commande is already soldée,
  // which the open-orders list deliberately omits.
  const { data: lignes, isLoading: lignesLoading } = useQuery<LigneLookup[]>({
    queryKey: preset ? ['of-trm-ligne', presetLigneId] : ['of-trm-lignes-commande'],
    queryFn: () => apiFetch(preset ? `/of-trm/lookups/lignes-commande?ligne=${presetLigneId}` : '/of-trm/lookups/lignes-commande'),
    enabled: open,
    staleTime: 60_000,
  })
  const { data: machines } = useQuery<MachineLookup[]>({
    queryKey: ['of-trm-machines'],
    queryFn: () => apiFetch('/of-trm/lookups/machines'),
    enabled: open,
    staleTime: 5 * 60_000,
  })
  // Reference-level notes, re-filtered as soon as a métier is picked (0 = the
  // "Toutes" ones only, which is the legacy predicate, not a missing filter).
  const observationsQ = useQuery<RefObservation[]>({
    queryKey: ['of-trm-obs-ref', effectiveLigneId, machineId],
    queryFn: () => apiFetch(`/of-trm/lookups/observations?ligne=${effectiveLigneId}&machine=${machineId}`),
    enabled: open && effectiveLigneId > 0,
    staleTime: 60_000,
  })
  const { data: seed, isLoading: seedLoading } = useQuery<CompositionSeed>({
    queryKey: ['of-trm-composition-seed', effectiveLigneId],
    queryFn: () => apiFetch(`/of-trm/lookups/composition?ligne=${effectiveLigneId}`),
    enabled: open && effectiveLigneId > 0,
  })

  const ligne = (lignes ?? []).find((l) => l.id === effectiveLigneId) ?? null

  // Reset everything per open — the dialog is mounted for the whole session.
  useEffect(() => {
    if (open) return
    setLigneId(0); setMachineId(0); setQuantite(''); setPoidsPiece('')
    setVisitage(1); setNettoyage(1)
    setFinirFil(false); setOuvertVisiteuse(false); setMailleOuverture(false); setSonneter(false)
    setAutoActivation(false); setObservations(''); setComp([]); setInc([])
    setAddFilOpen(false); setAddLotOpen(false); setError(null)
  }, [open])

  // Line-driven prefill: the remaining weight, and the écru's nominal piece.
  useEffect(() => {
    if (!ligne) return
    setQuantite(ligne.restant > 0 ? String(ligne.restant) : String(ligne.quantite))
    setPoidsPiece(ligne.poids_piece_defaut > 0 ? String(ligne.poids_piece_defaut) : '20')
    setMachineId(0)
    setComp([]); setInc([])
  }, [ligne])

  // Seed-driven prefill: the ref's knitting flags, then a lot per component —
  // the ticked ones win over "biggest stock" wherever they can feed the row.
  useEffect(() => {
    if (!seed) return
    setOuvertVisiteuse(seed.defaults.ouvert_visiteuse === 1)
    setMailleOuverture(seed.defaults.maille_ouverture === 1)
    setSonneter(seed.defaults.sonneter === 1)
    const picked = new Set(presetLotIds ?? [])
    setComp(seed.components.map((c) => {
      const ticked = c.lots.find((l) => picked.has(l.id))
      return {
        key: nextDraftKey(),
        IDref_fil: c.IDref_fil,
        IDcolori_fil: c.IDcolori_fil,
        ref_label: c.ref_label,
        coloris_label: c.coloris_label,
        pourcentage: String(c.pourcentage),
        IDstock_fil: ticked?.id ?? c.defaultLot,
        lots: c.lots,
      }
    }))
  }, [seed, presetLotIds])

  // The (fil, coloris) pairs the reference itself declares. Anything the draft
  // carries beyond them is a deliberate variation of the reference — the
  // « hors réf » marker (see HorsRefBadge). Computed here rather than flagged
  // per row, because a row can become hors réf and back as the user edits.
  const refPairs = useMemo(
    () => new Set((seed?.components ?? []).map((c) => `${c.IDref_fil}:${c.IDcolori_fil}`)),
    [seed],
  )

  // Only the métiers the écru has a machine sheet for (`ref_ecru_machine`) —
  // the whole park is 30-odd machines and knitting this reference on an
  // unlisted one is not a real choice, so the picker offers what is actually
  // knittable. When the reference has no sheet at all the list would be empty
  // and no OF could be created, so it falls back to the whole park and the
  // field says why.
  const compatIds = useMemo(
    () => new Set((seed?.compatibles ?? []).map((c) => c.id)),
    [seed],
  )
  const noSheet = seed !== undefined && compatIds.size === 0
  const machineOptions: PopoverSelectOption[] = useMemo(() => (
    [...(machines ?? [])]
      .filter((m) => compatIds.size === 0 || compatIds.has(m.id))
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
      // No "compatible" tag any more: with the list filtered, every row is.
      .map((m) => ({ id: m.id, primary: m.nom }))
  ), [machines, compatIds])

  const machine = (machines ?? []).find((m) => m.id === machineId) ?? null
  const qte = parseNum(quantite)
  const pp = parseNum(poidsPiece)
  const nbPieces = pp > 0 ? Math.max(1, Math.ceil(qte / pp)) : 0

  // Kg every row draws from each lot, then — per row — what the OTHER rows
  // draw from it. The shortage test has to be per LOT, not per row: two rows
  // legitimately share one (feeding positions, 83 of the 105 duplicate groups
  // in the ledger), so "is this lot used twice" is the wrong question and "do
  // they together ask it for more than it holds" is the right one. Without it,
  // a « compléter » pointed back at its own source read green while both halves
  // drew on the same stock — 54,2 + 45,8 Kg taken from a 54,2 Kg lot
  // (user-reported, 2026-08-26).
  const besoinParLot = useMemo(() => {
    const m = new Map<number, number>()
    for (const r of comp) {
      if (r.IDstock_fil <= 0) continue
      m.set(r.IDstock_fil, (m.get(r.IDstock_fil) ?? 0) + qte * (parseNum(r.pourcentage) / 100))
    }
    return m
  }, [comp, qte])
  const besoinAilleursParRow = useMemo(() => {
    const m = new Map<number, Map<number, number>>()
    for (const r of comp) {
      const autres = new Map(besoinParLot)
      if (r.IDstock_fil > 0) {
        const reste = (autres.get(r.IDstock_fil) ?? 0) - qte * (parseNum(r.pourcentage) / 100)
        if (reste > 0.005) autres.set(r.IDstock_fil, reste)
        else autres.delete(r.IDstock_fil)
      }
      m.set(r.key, autres)
    }
    return m
  }, [comp, qte, besoinParLot])

  // Lots the user ticked that no composition row can take — usually the sign
  // that the selection spans two different écrus, so say so rather than
  // dropping them silently.
  const ignoredLots = useMemo(() => {
    if (!seed || !presetLotIds || presetLotIds.length === 0) return 0
    const usable = new Set(seed.components.flatMap((c) => c.lots.map((l) => l.id)))
    return presetLotIds.filter((id) => !usable.has(id)).length
  }, [seed, presetLotIds])

  const createMut = useMutation({
    mutationFn: async () => {
      const body = {
        IDligne_commande_client: effectiveLigneId,
        IDmachine: machineId,
        quantite: qte,
        poids_piece: pp || undefined,
        visitage,
        nettoyage: nettoyage === 2 ? 2 : 1,
        finir_fil: finirFil ? 1 : 0,
        ouvert_visiteuse: ouvertVisiteuse ? 1 : 0,
        maille_ouverture: mailleOuverture ? 1 : 0,
        sonneter: sonneter ? 1 : 0,
        auto_activation: autoActivation ? 1 : 0,
        observations,
        composition: comp.map((c) => ({
          IDref_fil: c.IDref_fil,
          IDcolori_fil: c.IDcolori_fil,
          IDstock_fil: c.IDstock_fil,
          pourcentage: parseNum(c.pourcentage),
        })),
        incorpore: inc
          .filter((i) => i.IDstock_fil > 0 && parseNum(i.poids) > 0)
          .map((i) => ({ IDstock_fil: i.IDstock_fil, poids: parseNum(i.poids) })),
      }
      return apiFetch<{ id: number }>('/of-trm', { method: 'POST', body: JSON.stringify(body) })
    },
    onSuccess: (r) => onCreated(r.id),
    onError: () => setError('Création refusée — vérifiez la ligne de commande et la composition.'),
  })

  const totalPct = comp.reduce((s, c) => s + parseNum(c.pourcentage), 0)
  // Every row must carry a share: the API rejects 0, and a row at 0 % would
  // consume nothing anyway.
  const compValid = comp.length > 0 && comp.every((c) => parseNum(c.pourcentage) > 0)
  const canCreate = effectiveLigneId > 0 && machineId > 0 && qte > 0 && compValid

  const options: Array<{ label: string; checked: boolean; set: (v: boolean) => void }> = [
    { label: 'Finir le fil', checked: finirFil, set: setFinirFil },
    { label: 'Ouvert au large', checked: ouvertVisiteuse, set: setOuvertVisiteuse },
    { label: "Maille d'ouverture", checked: mailleOuverture, set: setMailleOuverture },
    { label: 'Sonneter', checked: sonneter, set: setSonneter },
  ]

  const identity = ligne
    ? [
        `${ligne.ref_label}${ligne.coloris_label ? ` - ${ligne.coloris_label}` : ''}`,
        ligne.contexture,
        `commande N° ${fmtNum(ligne.commande_numero)}`,
        ligne.client_nom,
      ].filter(Boolean).join(' • ')
    : 'Choisir une ligne de commande'

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      {/* p-0 overrides the primitive's p-6; no onClose prop — the band carries
          the close button (§18.D). */}
      <DialogContent className="max-w-6xl p-0 border-0 bg-transparent overflow-hidden max-h-[90dvh] flex flex-col">
        {/* 1. Header band — §43 verbatim */}
        <div className="flex-shrink-0 flex items-center gap-2.5 rounded-t-lg border-b-2 border-gold bg-primary px-4 py-2.5">
          <div className="h-8 w-8 flex-shrink-0 rounded-lg flex items-center justify-center shadow-sm bg-gold text-gold-foreground">
            <Factory className="h-[18px] w-[18px]" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-heading font-bold tracking-tight truncate text-primary-foreground">
              Nouvel ordre de fabrication
            </h2>
            <p className="text-xs text-white/70 truncate">{identity}</p>
          </div>
          <Button
            variant="ghost" size="icon"
            className="h-8 w-8 flex-shrink-0 text-white/80 hover:bg-white/15 hover:text-white"
            title="Fermer" onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* 2. Body — two columns (mps_designer §18.C): what the OF
            MAKES on the left, what the régleur must READ and how it
            RUNS on the right. The consigne sits under the standing
            observations on purpose — it is usually written in answer
            to them. Below lg the columns stack and the body scrolls
            as one. */}
        <div className="flex-1 min-h-0 bg-secondary flex flex-col overflow-y-auto lg:flex-row lg:overflow-hidden scrollbar-transparent">
          <div className="flex-1 min-w-0 p-4 space-y-4 lg:overflow-y-auto scrollbar-transparent">
          {!preset && (
            <Section icon={ShoppingCart} title="Ligne de commande client">
              <SearchableCombobox
                options={lignes ?? []}
                value={ligneId}
                onChange={setLigneId}
                getId={(l: LigneLookup) => l.id}
                getPrimary={(l) => `N° ${fmtNum(l.commande_numero)} · ${l.ref_label}${l.coloris_label ? ` - ${l.coloris_label}` : ''}`}
                getSecondary={(l) => `${l.client_nom} · reste ${fmtNum(l.restant, 1)} / ${fmtNum(l.quantite, 1)} Kg`}
                loading={lignesLoading}
                placeholder="Choisir une ligne de commande…"
              />
            </Section>
          )}

          {effectiveLigneId > 0 && (
            <>
              <Section
                icon={Factory}
                title="Tricotage"
                aside={ligne ? <>reste <span className="font-semibold text-foreground tabular-nums">{fmtNum(ligne.restant, 1)}</span> / {fmtNum(ligne.quantite, 1)} Kgs sur la ligne</> : null}
              >
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <FieldLabel>Métier</FieldLabel>
                      <PopoverSelect
                        options={machineOptions}
                        value={machineId}
                        onChange={setMachineId}
                        emptyLabel="Choisir un métier"
                        size="sm"
                        widthClass="w-full"
                      />
                      <p className={cn('text-[10px] leading-tight', noSheet && !machine ? 'text-amber-700' : 'text-muted-foreground tabular-nums')}>
                        {machine
                          ? <>Jauge {machine.jauge || '—'}{machine.diametre ? ` · Ø${machine.diametre}"` : ''}</>
                          : noSheet
                            ? 'Aucune fiche machine pour cette référence — tous les métiers sont proposés.'
                            : null}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <FieldLabel>Poids / pièce (Kg)</FieldLabel>
                      <input className={inputClass} value={poidsPiece} onChange={(e) => setPoidsPiece(e.target.value)} inputMode="decimal" />
                    </div>
                    <div className="space-y-1">
                      <FieldLabel>Quantité (Kg)</FieldLabel>
                      <input className={inputClass} value={quantite} onChange={(e) => setQuantite(e.target.value)} inputMode="decimal" />
                    </div>
                    <Derived label="Nb pièces">
                      {nbPieces > 0 ? `${fmtNum(nbPieces)} pièce${nbPieces > 1 ? 's' : ''}` : '—'}
                    </Derived>
                  </div>

                  {/* Visitage / nettoyage / options — the legacy keeps them
                      in the same grid as the métier: they are the OF's own
                      settings, not the régleur's reading matter. */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <FieldLabel>Visitage</FieldLabel>
                      <PopoverSelect
                        options={VISITAGE_OPTIONS}
                        value={visitage}
                        onChange={setVisitage}
                        hideEmpty
                        size="sm"
                        widthClass="w-full"
                      />
                    </div>
                    <div className="space-y-1">
                      <FieldLabel>Nettoyage</FieldLabel>
                      {/* Segmented row, gold active pill — the two legacy radios
                          wrapped their own captions in this column width. */}
                      <div className="flex gap-1 h-8 items-stretch">
                        {[1, 2].map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setNettoyage(v)}
                            className={cn(
                              'flex-1 px-2 text-xs rounded-md transition-colors cursor-pointer whitespace-nowrap',
                              nettoyage === v
                                ? 'bg-accent text-accent-foreground shadow-sm font-medium'
                                : 'text-muted-foreground hover:bg-accent/10',
                            )}
                          >
                            {v} Nettoyage{v > 1 ? 's' : ''}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border/60 pt-3">
                    {options.map((o) => (
                      <label key={o.label} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox checked={o.checked} onCheckedChange={(v) => o.set(v === true)} />
                        {o.label}
                      </label>
                    ))}
                  </div>
                </div>
              </Section>


              {/* Fils à tricoter — one row per feeding position (file header). */}
              <Section
                icon={BobineIcon}
                title="Fils à tricoter"
                aside={qte > 0 ? <>besoin total <span className="font-semibold text-foreground tabular-nums">{fmtNum(qte, 1)} Kg</span></> : null}
                action={!addFilOpen ? <AddTrigger label="Ajouter un fil" onClick={() => setAddFilOpen(true)} /> : null}
              >
                {seedLoading ? (
                  <div className="h-16 bg-muted animate-pulse rounded-md" />
                ) : (
                  <div className="space-y-2">
                    {comp.length === 0 ? (
                      <p className="text-xs text-amber-700">
                        Aucune composition connue pour cette référence — ajoutez le ou les fils à tricoter.
                      </p>
                    ) : (
                      <div className="rounded-lg border border-border/60 overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-sand border-b border-border/60">
                            <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              <th className="text-left font-semibold px-2.5 py-2">Fil</th>
                              <th className="text-right font-semibold px-2.5 py-2">%</th>
                              <th className="text-right font-semibold px-2.5 py-2">Besoin</th>
                              <th className="text-left font-semibold px-2.5 py-2">Lot</th>
                              <th className="w-8" />
                            </tr>
                          </thead>
                          <tbody>
                            {comp.map((row) => (
                              <CompositionRow
                                key={row.key}
                                row={row}
                                quantite={qte}
                                horsRef={refPairs.size > 0 && !refPairs.has(`${row.IDref_fil}:${row.IDcolori_fil}`)}
                                besoinAilleurs={besoinAilleursParRow.get(row.key) ?? EMPTY_BESOIN}
                                onChange={(next) => setComp((cur) => cur.map((x) => (x.key === row.key ? next : x)))}
                                onSplit={(couvert) => setComp((cur) => {
                                  const i = cur.findIndex((x) => x.key === row.key)
                                  if (i < 0) return cur
                                  const src = cur[i]
                                  const reste = Math.round((parseNum(src.pourcentage) - couvert) * 100) / 100
                                  const next = [...cur]
                                  next[i] = { ...src, pourcentage: String(couvert) }
                                  // The sibling inherits `lots`, so its picker
                                  // is ready without a second fetch — and sits
                                  // right under its source, not at the end.
                                  next.splice(i + 1, 0, {
                                    ...src,
                                    key: nextDraftKey(),
                                    pourcentage: String(reste),
                                    IDstock_fil: 0,
                                  })
                                  return next
                                })}
                                onRemove={() => setComp((cur) => cur.filter((x) => x.key !== row.key))}
                              />
                            ))}
                          </tbody>
                          <tfoot className="bg-sand border-t border-border/60">
                            <tr className="text-[11px]">
                              <td className="px-2.5 py-2 text-muted-foreground">Total des pourcentages</td>
                              <td className={cn(
                                'px-2.5 py-2 text-right tabular-nums font-semibold',
                                Math.abs(totalPct - 100) > 0.01 ? 'text-amber-700' : 'text-foreground',
                              )}>
                                {fmtNum(totalPct, 2)} %
                              </td>
                              <td colSpan={3} />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}

                    {/* The legacy toolbar's "Ajouter un fil" — a run can use a
                        yarn the écru sheet doesn't list, and a reference with
                        no composition at all is only launchable this way. The
                        trigger lives in the section caption; this is its panel. */}
                    {addFilOpen && (
                      <FilPickerPanel
                        label="Ajouter un fil"
                        onCancel={() => setAddFilOpen(false)}
                        onAdd={(pair) => {
                          setComp((cur) => [...cur, {
                            key: nextDraftKey(),
                            IDref_fil: pair.IDref_fil,
                            IDcolori_fil: pair.IDcolori_fil,
                            ref_label: pair.ref_label,
                            coloris_label: pair.coloris_label,
                            pourcentage: cur.length === 0 ? '100' : '',
                            IDstock_fil: 0,
                            lots: null,
                          }])
                          setAddFilOpen(false)
                        }}
                      />
                    )}
                  </div>
                )}
                {ignoredLots > 0 && (
                  <p className="mt-2 text-[11px] text-amber-700 flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                    {ignoredLots} lot{ignoredLots > 1 ? 's' : ''} sélectionné{ignoredLots > 1 ? 's' : ''} n'entre{ignoredLots > 1 ? 'nt' : ''} pas dans cette composition et {ignoredLots > 1 ? 'sont ignorés' : 'est ignoré'}.
                  </p>
                )}
              </Section>

              {/* "Incorporer un fil" — the legacy's second table: extra lots
                  fed into the run, weighed in Kg rather than shared as a
                  percentage of the blend (fil_incorpore). */}
              <Section
                icon={Layers}
                title="Incorporer"
                aside={inc.length > 0 ? <>{inc.length} lot{inc.length > 1 ? 's' : ''}</> : null}
                action={!addLotOpen ? <AddTrigger label="Ajouter un lot" onClick={() => setAddLotOpen(true)} /> : null}
              >
                <div className="space-y-2">
                  {inc.length > 0 && (
                    <div className="rounded-lg border border-border/60 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-sand border-b border-border/60">
                          <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            <th className="text-left font-semibold px-2.5 py-2">Lot</th>
                            <th className="text-left font-semibold px-2.5 py-2">Fil</th>
                            <th className="text-right font-semibold px-2.5 py-2">Poids</th>
                            <th className="w-8" />
                          </tr>
                        </thead>
                        <tbody>
                          {inc.map((row) => (
                            <tr key={row.key} className="border-b border-border/40 last:border-0">
                              <td className="px-2.5 py-2 font-mono">{row.lot || '—'}</td>
                              <td className="px-2.5 py-2">
                                <span className="font-medium text-sm">{row.ref_label}</span>
                                <span className="text-muted-foreground"> {row.coloris_label}</span>
                              </td>
                              <td className="px-2.5 py-2">
                                <div className="flex items-center justify-end gap-1.5">
                                  <input
                                    className={cn(inputClass, 'w-20 text-right')}
                                    value={row.poids}
                                    onChange={(e) => setInc((cur) => cur.map((x) => (x.key === row.key ? { ...x, poids: e.target.value } : x)))}
                                    inputMode="decimal"
                                    placeholder="Kg"
                                  />
                                  <span className="text-[11px] text-muted-foreground">Kg</span>
                                </div>
                              </td>
                              <td className="px-1 py-2">
                                <Button
                                  variant="ghost" size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  title="Retirer ce lot"
                                  onClick={() => setInc((cur) => cur.filter((x) => x.key !== row.key))}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {inc.length === 0 && !addLotOpen && (
                    <p className="text-xs text-muted-foreground">Aucun lot incorporé.</p>
                  )}
                  {addLotOpen && (
                    <LotPickerPanel
                      onCancel={() => setAddLotOpen(false)}
                      onAdd={(lot, pair) => {
                        setInc((cur) => [...cur, {
                          key: nextDraftKey(),
                          IDstock_fil: lot.id,
                          lot: lot.lot,
                          ref_label: pair.ref_label,
                          coloris_label: pair.coloris_label,
                          poids: '',
                        }])
                        setAddLotOpen(false)
                      }}
                    />
                  )}
                </div>
              </Section>

            </>
          )}
          </div>

          {effectiveLigneId > 0 && (
          <div className="lg:w-[340px] lg:flex-shrink-0 bg-sand border-t border-border/60 p-4 space-y-4 lg:border-t-0 lg:border-l lg:overflow-y-auto scrollbar-transparent">
              {/* Observations régleur — the reference's standing notes, the
                  whole point of showing them HERE: the régleur reads the
                  history of this écru on this métier before launching, and
                  passes it to the bonnetiers. See the endpoint's header. */}
              <Section
                icon={MessageSquare}
                title="Commentaires historiques"
                aside={observationsQ.data && observationsQ.data.length > 0
                  ? <>{observationsQ.data.length} observation{observationsQ.data.length > 1 ? 's' : ''}</>
                  : null}
              >
                {observationsQ.isLoading ? (
                  <div className="h-12 bg-muted animate-pulse rounded-md" />
                ) : (observationsQ.data?.length ?? 0) === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Aucun commentaire sur cette référence.
                    {machineId === 0 && ' Choisissez le métier pour voir aussi celles qui lui sont propres.'}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {observationsQ.data!.map((o) => (
                      <div key={o.id} className="rounded-lg border border-gold/30 border-l-4 border-l-gold bg-gold-light/60 px-3 py-2">
                        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                          <span className="tabular-nums">{o.date ? formatHfsqlDate(o.date) : '—'}</span>
                          <span className={cn(o.cible_machine && 'font-semibold text-foreground')}>{o.machine}</span>
                          <span>·</span>
                          <span className={cn(o.cible_coloris && 'font-semibold text-foreground')}>{o.coloris}</span>
                        </div>
                        <p className="mt-1 text-sm whitespace-pre-line">{o.observation}</p>
                      </div>
                    ))}
                    {machineId === 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        Choisissez le métier pour voir aussi les observations qui lui sont propres.
                      </p>
                    )}
                  </div>
                )}
              </Section>

              <Section icon={Play} title="Lancement">
                <div className="space-y-3">
                  <div className="space-y-1">
                    <FieldLabel>Consigne au bonnetier</FieldLabel>
                    <textarea
                      rows={2}
                      value={observations}
                      onChange={(e) => setObservations(e.target.value)}
                      placeholder="Visible sur la fiche de l'OF et à l'atelier…"
                      className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                    />
                  </div>
                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <Checkbox className="mt-0.5" checked={autoActivation} onCheckedChange={(v) => setAutoActivation(v === true)} />
                    <span>
                      Activation automatique
                      <span className="block text-[11px] text-muted-foreground">
                        L'OF démarre seul quand le précédent du métier se termine. Sinon il attend en file.
                      </span>
                    </span>
                  </label>
                </div>
              </Section>
          </div>
          )}
        </div>

        {/* 3. Footer strip — not <DialogFooter> (§18.D) */}
        <div className="flex-shrink-0 flex items-center gap-3 rounded-b-lg border-t border-border/60 bg-secondary px-4 py-3">
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive min-w-0">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">{error}</span>
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button
              disabled={!canCreate || createMut.isPending}
              onClick={() => createMut.mutate()}
              title={!canCreate ? 'Choisissez un métier et une quantité' : undefined}
            >
              {createMut.isPending
                ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                : <Plus className="h-3.5 w-3.5 mr-1.5" />}
              Créer l'OF
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
