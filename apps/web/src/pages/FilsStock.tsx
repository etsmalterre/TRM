// Fils › Stock — TRM port of the legacy FI_Stock_Fil_TRM.wdw (Tricotage
// Malterre mode). Tableau layout (mps_designer §27 + §40), based on ETM's
// FilsStock.tsx but NOT shared via @etm: stock_fil is one un-partitioned
// table, yet the two screens are different flavors — this one adds the
// Client column (the yarn's owner: TRM knits à façon), the Disponible /
// Archivé / Tous filter, and the lifecycle actions (nouveau lot with client
// + auto lot number, division, contrôle de titrage, archivage with the
// freinte / second-choix bilan and the visitage-defects verdict).
//
// API: ETM/apps/api/src/routes/stock-fil-trm.ts (mounted at /api/stock).
// stock, dernier_mouvement, stock_initial are strictly read-only here — the
// production flow and the Archivage own them (see the route file's header).

import { useState, useMemo, useCallback, useEffect, useRef, useDeferredValue, memo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UnsavedChangesDialog } from '@/components/shared/UnsavedChangesDialog'
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard'
import {
  Boxes,
  Loader2,
  AlertCircle,
  Pencil,
  Plus,
  X,
  Save,
  ArrowUp,
  ArrowDown,
  Leaf,
  Recycle,
  ShieldCheck,
  Calendar,
  MapPin,
  Factory,
  Package,
  MessageSquare,
  Eye,
  Printer,
  Split,
  Archive,
  Gauge,
  User,
  Smile,
  Frown,
  TrendingDown,
  Layers,
  FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { BobineIcon } from '@/components/icons/BobineIcon'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { PopoverSelect, SearchableCombobox } from '@/components/ui/popover-select'
import { cn } from '@/lib/utils'
import { formatHfsqlDate, hfsqlDateToInput, inputDateToHfsql } from '@/lib/dates'
import { apiFetch, API_URL } from '@/lib/api'
import { fmtNum } from '@/lib/format'
import { useHasPermission } from '@/contexts/PermissionsContext'
import { CardKV, MobileSortRow } from '@/components/stock/StockCardParts'
import {
  SmartSearchInput,
  filterRowsByChips,
  type SearchChip,
} from '@/components/stock/SmartSearchInput'

// ── Types ──────────────────────────────────────────────

interface StockRow {
  IDstock_fil: number
  IDclient: number | null
  IDfournisseur: number | null
  IDref_fil: number | null
  IDcolori_fil: number | null
  IDref_fil_commande: number | null
  IDMagasin: number | null
  stock: number | null
  stock_initial: number | null
  lot: string | null
  lot_frs: string | null
  emplacement: string | null
  date_entree: string | null
  dernier_mouvement: string | null
  dernier_pointage: string | null
  niveau: number | null
  termine: number | null
  controle: number | null
  commentaire: string | null
  observation_freinte: string | null
  ref_fil: string | null
  titrage: number | null
  bio: number | null
  recycle: number | null
  colori_reference: string | null
  fournisseur_nom: string | null
  magasin_nom: string | null
  client_nom: string | null
}

interface ControleTitrage {
  IDcontrole_titrage: number
  date: string
  titrage: number
  nb_fil: number
  nb_brin: number
  IDunite_titrage: number
}

interface StockDetail extends StockRow {
  IDcommande_fil: number | null
  has_certif_bio: boolean
  has_certif_recycle: boolean
  titrage_ref: { titrage: number; nb_fil: number; nb_brin: number; unite: string } | null
  controles: ControleTitrage[]
}

interface BilanOf {
  of: number
  ref_ecru: string
  pourcentage: number
  premier_choix: number
  second_choix: number
}

interface BilanData {
  IDstock_fil: number
  lot: string | null
  stock_initial: number
  stock: number
  observation_freinte: string | null
  ofs: BilanOf[]
  produit: number
  freinte_kg: number
  freinte_pct: number | null
  poids_total: number
  poids_second: number
  second_choix_pct: number | null
  defauts: Array<{ label: string; nombre: number }>
}

interface ClientOption {
  IDclient: number
  nom: string
}

interface FournisseurOption {
  IDfournisseur: number
  nom: string
}

interface RefFilOption {
  IDref_fil: number
  IDcolori_fil: number
  reference: string
  colori_reference: string
  [key: string]: unknown
}

type EtatFilter = 'disponible' | 'archive' | 'tous'

// ── API hooks ──────────────────────────────────────────

function useStockList(etat: EtatFilter) {
  return useQuery<StockRow[]>({
    queryKey: ['stock-fil-trm', { etat }],
    queryFn: () => apiFetch<StockRow[]>(`/stock/fil-trm?etat=${etat}`),
  })
}

function useStockDetail(id: number | null) {
  return useQuery<StockDetail>({
    queryKey: ['stock-fil-trm', 'detail', id],
    queryFn: () => apiFetch<StockDetail>(`/stock/fil-trm/${id}`),
    enabled: id !== null,
  })
}

function useClientsLookup(enabled: boolean) {
  return useQuery<ClientOption[]>({
    queryKey: ['stock-fil-trm', 'lookups', 'clients'],
    queryFn: () => apiFetch<ClientOption[]>('/stock/fil-trm/lookups/clients'),
    enabled,
  })
}

// ── Helpers ────────────────────────────────────────────

function formatKg(v: number | null): string {
  if (v == null) return '—'
  return `${fmtNum(v, 1)} kg`
}

// dd/mm/yy for the three tight date columns of the table (the drawer keeps the
// full formatHfsqlDate rendering).
function fmtDateShort(ymd: string | null): string {
  if (!ymd) return '—'
  return formatHfsqlDate(ymd).replace(/\/20(\d\d)$/, '/$1')
}

function ageDays(dateEntree: string | null): number | null {
  if (!dateEntree || dateEntree.length !== 8) return null
  const d = new Date(`${dateEntree.slice(0, 4)}-${dateEntree.slice(4, 6)}-${dateEntree.slice(6, 8)}`)
  if (isNaN(d.getTime())) return null
  const diff = Date.now() - d.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

// Archivage verdict thresholds (user-confirmed): freinte green ≤ 10 %, red
// above or negative; second choix green at 0, amber ≤ 5 %, red above. Kept in
// sync with the RapportFreintePdf colors. Rendered through the §7 status card
// system (left edge + icon box + value share one tone).
type VerdictTone = 'success' | 'warning' | 'danger' | 'neutral'

const VERDICT_TONE: Record<VerdictTone, { border: string; iconBg: string; icon: string; value: string }> = {
  success: { border: 'border-l-green-500/60', iconBg: 'bg-green-500/10', icon: 'text-green-600', value: 'text-green-600' },
  warning: { border: 'border-l-amber-400/60', iconBg: 'bg-amber-400/10', icon: 'text-amber-600', value: 'text-amber-600' },
  danger: { border: 'border-l-destructive/60', iconBg: 'bg-destructive/10', icon: 'text-destructive/70', value: 'text-destructive' },
  neutral: { border: 'border-l-border', iconBg: 'bg-muted', icon: 'text-muted-foreground', value: 'text-foreground' },
}

function freinteTone(pct: number | null): VerdictTone {
  if (pct == null) return 'neutral'
  if (pct < 0 || pct > 10) return 'danger'
  return 'success'
}
function secondChoixTone(pct: number | null): VerdictTone {
  if (pct == null) return 'neutral'
  if (pct === 0) return 'success'
  if (pct <= 5) return 'warning'
  return 'danger'
}

/** One stat tile of the Archivage bilan — status-colored card (§7) with the
 *  big figure carrying the verdict color. */
function VerdictTile({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: string
  detail: string
  tone: VerdictTone
}) {
  const t = VERDICT_TONE[tone]
  return (
    <div className={cn('rounded-lg border-l-4 border border-border/60 bg-card p-3 shadow-sm', t.border)}>
      <div className="flex items-center gap-2">
        <div className={cn('h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0', t.iconBg, t.icon)}>
          {icon}
        </div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      </div>
      <p className={cn('mt-2 text-2xl font-bold tabular-nums leading-none', t.value)}>{value}</p>
      <p className="mt-1.5 text-xs tabular-nums text-muted-foreground">{detail}</p>
    </div>
  )
}

// ── Sort handling ──────────────────────────────────────

type SortKey =
  | 'ref_fil'
  | 'colori_reference'
  | 'lot'
  | 'stock'
  | 'stock_initial'
  | 'client_nom'
  | 'emplacement'
  | 'niveau'
  | 'fournisseur_nom'
  | 'date_entree'
  | 'dernier_mouvement'
  | 'dernier_pointage'
  | 'commentaire'

interface SortState {
  key: SortKey
  dir: 'asc' | 'desc'
}

// Column set mirrors the legacy TRM list (Fil, Colori, Lot, Stock, Stock
// initial, Client, Emplacement, Niveau, Fournisseur, Date entrée, Dernier
// mouvement, Dernier pointage, Commentaire). Widths sum to 100% minus the
// trailing icon column.
const COLUMNS: { key: SortKey; label: string; width: string; align?: 'left' | 'right' }[] = [
  // Widths favor the text columns (Fil / Coloris / Client / Fournisseur used
  // to truncate while the numeric and date columns idled half-empty) — the
  // numbers and dd/mm/yy dates need little room at the 13px table font.
  { key: 'ref_fil', label: 'Fil', width: '13%' },
  { key: 'colori_reference', label: 'Coloris', width: '9%' },
  { key: 'lot', label: 'Lot', width: '5%' },
  { key: 'stock', label: 'Stock', width: '6%', align: 'right' },
  { key: 'stock_initial', label: 'Initial', width: '6%', align: 'right' },
  { key: 'client_nom', label: 'Client', width: '10%' },
  { key: 'emplacement', label: 'Empl.', width: '6%' },
  { key: 'niveau', label: 'Niv.', width: '3%', align: 'right' },
  { key: 'fournisseur_nom', label: 'Fournisseur', width: '10%' },
  { key: 'date_entree', label: 'Entrée', width: '6.5%' },
  { key: 'dernier_mouvement', label: 'Mouv.', width: '6.5%' },
  { key: 'dernier_pointage', label: 'Pointage', width: '6.5%' },
  { key: 'commentaire', label: 'Commentaire', width: '9.5%' },
]
const ICON_COL_WIDTH = '3%'

function compareRows(a: StockRow, b: StockRow, key: SortKey): number {
  const va = a[key]
  const vb = b[key]
  if (va == null && vb == null) return 0
  if (va == null) return 1
  if (vb == null) return -1
  if (typeof va === 'number' && typeof vb === 'number') return va - vb
  return String(va).localeCompare(String(vb), 'fr', { numeric: true, sensitivity: 'base' })
}

// ── Field-scoped search chips ──────────────────────────
// The toolbar search accepts field-scoped chips ("Emplacement : B/7") on top
// of the free-text multi-term search (mps_designer §27.2bis). Widget + chip
// semantics live in the shared SmartSearchInput; this screen only declares
// which of its columns can be scoped.
const SEARCH_FIELDS = [
  { key: 'ref_fil', label: 'Fil' },
  { key: 'colori_reference', label: 'Coloris' },
  { key: 'lot', label: 'Lot' },
  { key: 'lot_frs', label: 'Lot fournisseur' },
  { key: 'client_nom', label: 'Client' },
  { key: 'fournisseur_nom', label: 'Fournisseur' },
  { key: 'emplacement', label: 'Emplacement' },
  { key: 'commentaire', label: 'Commentaire' },
] as const
type SearchFieldKey = (typeof SEARCH_FIELDS)[number]['key']

/** Lower-cased text columns of a row, for the any-column match. */
function rowHaystacks(r: StockRow): string[] {
  return [
    r.ref_fil,
    r.colori_reference,
    r.lot,
    r.lot_frs,
    r.client_nom,
    r.fournisseur_nom,
    r.emplacement,
    r.commentaire,
  ]
    .filter((f): f is string => !!f)
    .map((f) => f.toLowerCase())
}

const ETAT_OPTIONS = [
  { id: 1, primary: 'Disponible' },
  { id: 2, primary: 'Archivé' },
  { id: 3, primary: 'Tous' },
]
const ETAT_BY_ID: Record<number, EtatFilter> = { 1: 'disponible', 2: 'archive', 3: 'tous' }
const ETAT_TO_ID: Record<EtatFilter, number> = { disponible: 1, archive: 2, tous: 3 }

// ── Main Page ──────────────────────────────────────────

export function FilsStock() {
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  // Field-scoped chips (see SEARCH_FIELDS above).
  const [searchChips, setSearchChips] = useState<SearchChip<SearchFieldKey>[]>([])
  const [etat, setEtat] = useState<EtatFilter>('disponible')
  const [sort, setSort] = useState<SortState>({ key: 'date_entree', dir: 'desc' })
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  // Permission gate — admins always pass; non-admins need create_stock_fil.
  // The same key gates the other stock-mutating actions (diviser, archiver).
  const canCreate = useHasPermission('create_stock_fil')

  const { data: rows, isLoading, isError, error } = useStockList(etat)

  // Keystrokes update the input immediately; the 1.7k-row filter/sort and the
  // table re-render follow at lower priority (same as TombeMetierStock).
  const deferredSearch = useDeferredValue(searchQuery)

  const filteredSorted = useMemo(() => {
    // Field-scoped chips first (each chip ANDs, restricted to its column),
    // then the free text: AND across terms, OR across columns.
    let out = filterRowsByChips(rows ?? [], searchChips, rowHaystacks)
    const terms = deferredSearch.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length > 0) {
      out = out.filter((r) => {
        const haystacks = rowHaystacks(r)
        return terms.every((t) => haystacks.some((h) => h.includes(t)))
      })
    }
    out = [...out].sort((a, b) => {
      const cmp = compareRows(a, b, sort.key)
      return sort.dir === 'asc' ? cmp : -cmp
    })
    return out
  }, [rows, deferredSearch, searchChips, sort])

  const handleSort = useCallback((key: SortKey) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }, [])

  const lotCount = filteredSorted.length
  const totalStock = filteredSorted.reduce((sum, r) => sum + (r.stock ?? 0), 0)

  // Drawer dirty tracking — populated by the drawer via refs (§28 ref-bridge).
  const [drawerDirty, setDrawerDirty] = useState(false)
  const drawerSaveRef = useRef<() => Promise<void>>(async () => {})
  const drawerDiscardRef = useRef<() => void>(() => {})

  const guard = useUnsavedGuard({
    isDirty: drawerDirty,
    save: async () => { await drawerSaveRef.current() },
    onDiscard: () => drawerDiscardRef.current(),
  })

  // The guard object is recreated every render; route the row handler through
  // a ref so its identity is stable and the memoized rows don't re-render on
  // every keystroke.
  const guardRef = useRef(guard)
  guardRef.current = guard

  const handleClose = useCallback(() => {
    guardRef.current.guardAction(() => setSelectedId(null))
  }, [])

  const handleRowClick = useCallback((rowId: number) => {
    guardRef.current.guardAction(() => {
      setSelectedId((prev) => (prev === rowId ? null : rowId))
    })
  }, [])

  const onMutationSuccess = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['stock-fil-trm'] })
  }, [queryClient])

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">

      {/* Toolbar — search row 1; the état select is forced onto its own
          full-width row below sm (§40.5 wrapper rule); Nouveau stays top-right
          at every width. */}
      <div className="flex-shrink-0 flex flex-wrap items-center gap-3">
        <SmartSearchInput<SearchFieldKey>
          className="order-1 flex-1 min-w-0"
          value={searchQuery}
          onValueChange={setSearchQuery}
          chips={searchChips}
          onChipsChange={setSearchChips}
          fields={SEARCH_FIELDS}
          placeholder="Rechercher (réf, coloris, lot, client, fournisseur, emplacement, commentaire…)"
        />

        <div className="order-3 w-full flex items-center gap-3 sm:contents">
          <div className="w-40 flex-shrink-0 sm:order-2">
            <PopoverSelect
              options={ETAT_OPTIONS}
              value={ETAT_TO_ID[etat]}
              onChange={(id) => setEtat(ETAT_BY_ID[id] ?? 'disponible')}
              hideEmpty
            />
          </div>
        </div>

        {canCreate && (
          <Button size="sm" onClick={() => setCreateOpen(true)} className="flex-shrink-0 order-2 sm:order-3" title="Nouveau">
            <Plus className="h-3.5 w-3.5 sm:mr-1" />
            <span className="hidden sm:inline">Nouveau</span>
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 flex flex-col rounded-lg border border-border/60 bg-white shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-full text-destructive gap-2">
            <AlertCircle className="h-8 w-8" />
            <p className="text-sm">{(error as Error)?.message || 'Erreur de chargement'}</p>
          </div>
        ) : filteredSorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <Boxes className="h-12 w-12 opacity-30" />
            <p className="text-sm">Aucun lot en stock</p>
          </div>
        ) : (
          <>
            {/* Desktop table (md+) — split header/body sharing one colgroup */}
            <div className="hidden md:flex md:flex-col flex-1 min-h-0">
            {/* 13px table font (vs the app's text-sm) — user-requested density:
                13 columns is the widest table in the app. */}
            <table className="w-full text-[13px]" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                {COLUMNS.map((c) => (
                  <col key={c.key} style={{ width: c.width }} />
                ))}
                <col style={{ width: ICON_COL_WIDTH }} />
              </colgroup>
              <thead className="bg-zinc-200/60 border-b border-border/60">
                <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                  {COLUMNS.map((c) => (
                    <SortHeader
                      key={c.key}
                      label={c.label}
                      sortKey={c.key}
                      sort={sort}
                      onSort={handleSort}
                      align={c.align}
                    />
                  ))}
                  <th className="px-2 py-2.5 text-left font-semibold"></th>
                </tr>
              </thead>
            </table>

            <div className="flex-1 min-h-0 overflow-auto scrollbar-transparent">
              <table className="w-full text-[13px]" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  {COLUMNS.map((c) => (
                    <col key={c.key} style={{ width: c.width }} />
                  ))}
                  <col style={{ width: ICON_COL_WIDTH }} />
                </colgroup>
                <tbody>
                  {filteredSorted.map((r) => (
                    <StockRow
                      key={r.IDstock_fil}
                      row={r}
                      selected={r.IDstock_fil === selectedId}
                      onRowClick={handleRowClick}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            </div>

            {/* Mobile card list (< md) — same rows, selection and sort state */}
            <div className="md:hidden flex-1 min-h-0 flex flex-col">
              <MobileSortRow columns={COLUMNS} sort={sort} onSortChange={setSort} />
              <div className="flex-1 min-h-0 overflow-y-auto scrollbar-transparent p-2 space-y-2 bg-zinc-100/80">
                {filteredSorted.map((r) => (
                  <StockLotCard
                    key={r.IDstock_fil}
                    row={r}
                    selected={r.IDstock_fil === selectedId}
                    onRowClick={handleRowClick}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Totalizer — standalone summary bar, detached from the table */}
      {!isLoading && !isError && filteredSorted.length > 0 && (
        <div className="flex-shrink-0 flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-zinc-100/80 shadow-sm px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm">
            <Boxes className="h-4 w-4 text-accent" />
            <span className="font-semibold">{lotCount}</span>
            <span className="text-muted-foreground">lot{lotCount > 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="hidden sm:inline text-xs uppercase tracking-wide text-muted-foreground">Stock total</span>
            <span className="text-sm sm:text-base font-bold tabular-nums">{fmtNum(totalStock, 1)} kg</span>
          </div>
        </div>
      )}

      <StockDetailDrawer
        id={selectedId}
        canMutate={canCreate}
        onClose={handleClose}
        onMutationSuccess={onMutationSuccess}
        onSelect={setSelectedId}
        onDirtyChange={setDrawerDirty}
        saveRef={drawerSaveRef}
        discardRef={drawerDiscardRef}
      />

      <UnsavedChangesDialog
        open={guard.showDialog}
        onAction={guard.handleAction}
        isSaving={guard.isSaving}
      />

      <NewStockFilDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(newId) => {
          onMutationSuccess()
          setSelectedId(newId)
        }}
      />
    </div>
  )
}

// ── Sort header cell ───────────────────────────────────

interface SortHeaderProps {
  label: string
  sortKey: SortKey
  sort: SortState
  onSort: (k: SortKey) => void
  align?: 'left' | 'right'
}
function SortHeader({ label, sortKey, sort, onSort, align = 'left' }: SortHeaderProps) {
  const active = sort.key === sortKey
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={cn(
        'px-2 py-2.5 font-semibold cursor-pointer select-none whitespace-nowrap',
        align === 'right' ? 'text-right' : 'text-left',
        active && 'text-accent'
      )}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </span>
    </th>
  )
}

// ── Table row (memoized) ──────────────────────────────
// Up to 1.7k rows × 14 cells in "Tous" — memoized on (row, selected) so a
// search keystroke or a selection change only re-renders the rows that
// actually changed (same pattern as TombeMetierStock).

const StockRow = memo(function StockRow({
  row: r,
  selected,
  onRowClick,
}: {
  row: StockRow
  selected: boolean
  onRowClick: (id: number) => void
}) {
  return (
    <tr
      data-stock-row
      onClick={() => onRowClick(r.IDstock_fil)}
      className={cn(
        'border-b border-border/40 cursor-pointer transition-colors',
        selected ? 'bg-accent/10' : 'hover:bg-accent/5'
      )}
    >
      <td className="px-2 py-1.5 font-medium truncate" title={r.ref_fil ?? undefined}>{r.ref_fil ?? '—'}</td>
      <td className="px-2 py-1.5 truncate" title={r.colori_reference ?? undefined}>{r.colori_reference ?? '—'}</td>
      <td className="px-2 py-1.5 tabular-nums truncate">{r.lot ?? '—'}</td>
      {/* Kg without the unit in the table — the header names it, and the
          fr-FR thousand separators wrap inside tight cells */}
      <td className="px-2 py-1.5 text-right tabular-nums font-medium whitespace-nowrap truncate">
        {r.stock != null ? fmtNum(r.stock, 1) : '—'}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground whitespace-nowrap truncate">
        {r.stock_initial != null ? fmtNum(r.stock_initial, 1) : '—'}
      </td>
      <td className="px-2 py-1.5 truncate" title={r.client_nom ?? undefined}>{r.client_nom ?? '—'}</td>
      <td className="px-2 py-1.5 truncate" title={r.emplacement ?? undefined}>{r.emplacement ?? '—'}</td>
      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{r.niveau ?? '—'}</td>
      <td className="px-2 py-1.5 truncate" title={r.fournisseur_nom ?? undefined}>{r.fournisseur_nom ?? '—'}</td>
      <td className="px-2 py-1.5 tabular-nums text-muted-foreground whitespace-nowrap truncate">
        {fmtDateShort(r.date_entree)}
      </td>
      <td className="px-2 py-1.5 tabular-nums text-muted-foreground whitespace-nowrap truncate">
        {fmtDateShort(r.dernier_mouvement)}
      </td>
      <td className="px-2 py-1.5 tabular-nums text-muted-foreground whitespace-nowrap truncate">
        {fmtDateShort(r.dernier_pointage)}
      </td>
      <td className="px-2 py-1.5 text-muted-foreground truncate" title={r.commentaire ?? undefined}>
        {r.commentaire?.trim() || ''}
      </td>
      <td className="px-2 py-1.5 text-right">
        <div className="flex items-center justify-end gap-1">
          {!!r.bio && <Leaf className="h-3.5 w-3.5 text-green-600" />}
          {!!r.recycle && <Recycle className="h-3.5 w-3.5 text-blue-600" />}
          {!!r.termine && <Badge variant="outline" className="text-[10px] py-0">A</Badge>}
        </div>
      </td>
    </tr>
  )
})

// ── Mobile card (below md) ─────────────────────────────

const StockLotCard = memo(function StockLotCard({
  row,
  selected,
  onRowClick,
}: {
  row: StockRow
  selected: boolean
  onRowClick: (id: number) => void
}) {
  const isSelected = selected
  return (
    <div
      data-stock-row
      onClick={() => onRowClick(row.IDstock_fil)}
      className={cn(
        'rounded-lg border p-3 cursor-pointer transition-colors shadow-sm',
        isSelected ? 'bg-accent/10 border-accent ring-1 ring-accent' : 'bg-white border-border/60 hover:border-accent/40'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium truncate">{row.ref_fil ?? '—'}</p>
        <div className="flex items-center gap-1 flex-shrink-0">
          {!!row.bio && <Leaf className="h-3.5 w-3.5 text-green-600" />}
          {!!row.recycle && <Recycle className="h-3.5 w-3.5 text-blue-600" />}
          {!!row.termine && <Badge variant="outline" className="text-[10px] py-0">A</Badge>}
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-0.5 truncate">{row.colori_reference ?? '—'}</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2">
        <CardKV label="Lot" value={row.lot ?? '—'} mono />
        <CardKV label="Stock" value={formatKg(row.stock)} mono strong />
        <CardKV label="Client" value={row.client_nom ?? '—'} />
        <CardKV label="Emplacement" value={row.emplacement ?? '—'} />
      </div>
      {!!(row.date_entree || row.commentaire?.trim()) && (
        <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-border/40 text-[11px] text-muted-foreground">
          <span className="truncate italic">{row.commentaire?.trim() ?? ''}</span>
          <span className="flex-shrink-0 tabular-nums">{row.date_entree ? formatHfsqlDate(row.date_entree) : ''}</span>
        </div>
      )}
    </div>
  )
})

// ── Side drawer ────────────────────────────────────────

interface DrawerProps {
  id: number | null
  canMutate: boolean
  onClose: () => void
  onMutationSuccess: () => void
  onSelect: (id: number) => void
  onDirtyChange: (dirty: boolean) => void
  saveRef: React.MutableRefObject<() => Promise<void>>
  discardRef: React.MutableRefObject<() => void>
}

function StockDetailDrawer({ id, canMutate, onClose, onMutationSuccess, onSelect, onDirtyChange, saveRef, discardRef }: DrawerProps) {
  const { data: detail, isLoading } = useStockDetail(id)
  const drawerRef = useRef<HTMLDivElement>(null)
  const [searchParams] = useSearchParams()
  const embed = searchParams.get('embed') === 'true'

  const [isEditing, setIsEditing] = useState(false)
  const [editCommentaire, setEditCommentaire] = useState('')
  const [editEmplacement, setEditEmplacement] = useState('')
  const [editNiveau, setEditNiveau] = useState(0)
  const [editLotFrs, setEditLotFrs] = useState('')
  const [editPointage, setEditPointage] = useState('')
  const [editClient, setEditClient] = useState(0)

  const [diviserOpen, setDiviserOpen] = useState(false)
  const [titrageOpen, setTitrageOpen] = useState(false)
  const [archiverOpen, setArchiverOpen] = useState(false)

  const originalDraftRef = useRef<{
    commentaire: string
    emplacement: string
    niveau: number
    lotFrs: string
    pointage: string
    client: number
  } | null>(null)

  // Reset edit state when selecting a different lot
  useEffect(() => {
    setIsEditing(false)
    setDiviserOpen(false)
    setTitrageOpen(false)
    setArchiverOpen(false)
  }, [id])

  // Close on outside click (ignore clicks on rows/cards — they switch
  // selection — and keep the drawer open while one of its dialogs is up:
  // dialogs render in a portal, physically outside drawerRef).
  const anyDialogOpen = diviserOpen || titrageOpen || archiverOpen
  useEffect(() => {
    if (id === null || anyDialogOpen) return
    function handleMouseDown(e: MouseEvent) {
      const target = e.target as Node | null
      if (!target) return
      if (drawerRef.current?.contains(target)) return
      if ((target as Element).closest?.('[data-stock-row]')) return
      onClose()
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [id, anyDialogOpen, onClose])

  // Client options — needed in edit mode only.
  const clientsQuery = useClientsLookup(isEditing)

  const startEdit = useCallback(() => {
    if (!detail) return
    const snapshot = {
      commentaire: detail.commentaire ?? '',
      emplacement: detail.emplacement ?? '',
      niveau: detail.niveau ?? 0,
      lotFrs: detail.lot_frs ?? '',
      pointage: hfsqlDateToInput(detail.dernier_pointage),
      client: detail.IDclient ?? 0,
    }
    setEditCommentaire(snapshot.commentaire)
    setEditEmplacement(snapshot.emplacement)
    setEditNiveau(snapshot.niveau)
    setEditLotFrs(snapshot.lotFrs)
    setEditPointage(snapshot.pointage)
    setEditClient(snapshot.client)
    originalDraftRef.current = snapshot
    setIsEditing(true)
  }, [detail])

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/stock/fil-trm/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          commentaire: editCommentaire,
          emplacement: editEmplacement,
          niveau: editNiveau,
          lot_frs: editLotFrs,
          IDclient: editClient,
          dernier_pointage: editPointage ? inputDateToHfsql(editPointage) : '',
        }),
      }),
    onSuccess: () => {
      onMutationSuccess()
      setIsEditing(false)
    },
  })

  const isDirty = useMemo(() => {
    if (!isEditing) return false
    const o = originalDraftRef.current
    if (!o) return false
    if (editCommentaire !== o.commentaire) return true
    if (editEmplacement !== o.emplacement) return true
    if (editNiveau !== o.niveau) return true
    if (editLotFrs !== o.lotFrs) return true
    if (editPointage !== o.pointage) return true
    if (editClient !== o.client) return true
    return false
  }, [isEditing, editCommentaire, editEmplacement, editNiveau, editLotFrs, editPointage, editClient])

  useEffect(() => { onDirtyChange(isDirty) }, [isDirty, onDirtyChange])
  useEffect(() => () => { onDirtyChange(false) }, [onDirtyChange])

  useEffect(() => {
    saveRef.current = async () => { await saveMutation.mutateAsync() }
  })
  useEffect(() => {
    discardRef.current = () => setIsEditing(false)
  })

  const open = id !== null
  const age = detail ? ageDays(detail.date_entree) : null
  const isArchived = !!detail?.termine

  return (
    <div
      ref={drawerRef}
      className={cn(
        'fixed right-0 bottom-0 w-full max-w-[440px] bg-white border-l border-border/60 shadow-xl z-30 transition-transform duration-300 flex flex-col',
        embed ? 'top-0' : 'top-14',
        open ? 'translate-x-0' : 'translate-x-full'
      )}
    >
      <div className="flex-1 min-h-0 flex flex-col bg-zinc-100/80">
      {/* Header band — widget treatment (mps_designer §27.5bis / §43) */}
      <div className="flex-shrink-0 flex items-center gap-2.5 border-b-2 border-gold bg-primary px-4 py-2.5">
        <div
          className={cn(
            'h-8 w-8 flex-shrink-0 rounded-lg flex items-center justify-center shadow-sm transition-colors',
            isEditing ? 'bg-white text-primary' : 'bg-gold text-gold-foreground'
          )}
        >
          <BobineIcon className="h-[18px] w-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          {isLoading || !detail ? (
            <div className="h-5 w-40 bg-white/20 animate-pulse rounded" />
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-heading font-bold tracking-tight truncate text-primary-foreground">
                  {detail.ref_fil ?? '—'}
                </h2>
                {isArchived && (
                  <span className="rounded-full border border-white/25 bg-white/15 px-1.5 py-0 text-[10px] font-medium text-white">
                    Archivé
                  </span>
                )}
                {!!detail.bio && (
                  <Badge className="bg-green-100 text-green-700 border-green-200 gap-1 text-[10px] py-0">
                    <Leaf className="h-2.5 w-2.5" />
                    Bio
                  </Badge>
                )}
                {!!detail.recycle && (
                  <Badge className="bg-blue-100 text-blue-700 border-blue-200 gap-1 text-[10px] py-0">
                    <Recycle className="h-2.5 w-2.5" />
                    Recyclé
                  </Badge>
                )}
              </div>
              <p className="text-xs text-white/70 truncate">
                {detail.colori_reference ?? '—'} • Lot {detail.lot ?? '—'}
              </p>
            </>
          )}
        </div>
        {/* Two-row action cluster: the canonical labeled gold Modifier (or
            Annuler / Enregistrer) on top, the icon-only secondary actions
            (Diviser · Archiver · Imprimer) underneath — keeps the band's width
            for the title instead of a five-button row. */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            {detail && !isArchived &&
              (isEditing ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-2 text-white/80 hover:bg-white/15 hover:text-white"
                    onClick={() => setIsEditing(false)}
                    title="Annuler"
                  >
                    <X className="h-3.5 w-3.5 sm:mr-1.5" />
                    <span className="hidden sm:inline">Annuler</span>
                  </Button>
                  <Button
                    variant="gold"
                    size="sm"
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                    title="Enregistrer"
                  >
                    {saveMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 sm:mr-1.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5 sm:mr-1.5" />
                    )}
                    <span className="hidden sm:inline">Enregistrer</span>
                  </Button>
                </>
              ) : (
                <Button variant="gold" size="sm" onClick={startEdit} title="Modifier">
                  <Pencil className="h-3.5 w-3.5 sm:mr-1.5" />
                  <span className="hidden sm:inline">Modifier</span>
                </Button>
              ))}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 flex-shrink-0 md:hidden text-white/80 hover:bg-white/15 hover:text-white"
              onClick={onClose}
              title="Fermer"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          {detail && !isEditing && (
            <div className="flex items-center gap-1.5">
              {canMutate && !isArchived && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-white/80 hover:bg-white/15 hover:text-white"
                  title="Diviser le lot"
                  onClick={() => setDiviserOpen(true)}
                >
                  <Split className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white/80 hover:bg-white/15 hover:text-white"
                title="Imprimer l'étiquette"
                onClick={() => window.open(`${API_URL}/stock/fil-trm/${detail.IDstock_fil}/label`, '_blank')}
              >
                <Printer className="h-4 w-4" />
              </Button>
              {/* Archived lot: the bilan is frozen — reopen it read-only (the
                  same dialog; its band prints the PDF). */}
              {isArchived && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-white/80 hover:bg-white/15 hover:text-white"
                  title="Rapport de freinte"
                  onClick={() => setArchiverOpen(true)}
                >
                  <FileText className="h-4 w-4" />
                </Button>
              )}
              {/* Archiver — last in the row and red: it is the one irreversible
                  action here (light-on-navy red, §27.5bis). */}
              {canMutate && !isArchived && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-red-400 hover:bg-white/15 hover:text-red-300"
                  title="Archiver le lot"
                  onClick={() => setArchiverOpen(true)}
                >
                  <Archive className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 scrollbar-transparent">
        {isLoading || !detail ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
          </div>
        ) : (
          <>
            {/* Stock */}
            <DrawerCard icon={<Package className="h-4 w-4 text-accent" />} title="Stock" highlight={isEditing}>
              <div className="space-y-1.5">
                <KV label="Stock actuel" value={<span className="font-semibold tabular-nums">{formatKg(detail.stock)}</span>} />
                <KV label="Stock initial" value={<span className="tabular-nums">{formatKg(detail.stock_initial)}</span>} />
                {/* Remaining-yarn gauge — same primitive as the ClientsCommandes
                    production gauge. stock can legitimately be negative
                    (fil_incorpore, post-archive production) → clamp to 0.
                    Pointless on an archived lot (stock forced to 0). */}
                {!isArchived && detail.stock_initial != null && detail.stock_initial > 0 && (
                  (() => {
                    const pct = Math.min(100, Math.max(0, ((detail.stock ?? 0) / detail.stock_initial) * 100))
                    return (
                      <div className="flex items-center gap-2 pt-1">
                        <div className="h-1.5 flex-1 rounded-full bg-zinc-200 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-accent transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">
                          {fmtNum(pct, 0)} % restant
                        </span>
                      </div>
                    )
                  })()
                )}
              </div>
            </DrawerCard>

            {/* Client (owner of the yarn — TRM knits à façon) */}
            <DrawerCard icon={<User className="h-4 w-4 text-accent" />} title="Client" highlight={isEditing}>
              {isEditing ? (
                <SearchableCombobox<ClientOption>
                  options={clientsQuery.data ?? []}
                  value={editClient}
                  onChange={(cid) => setEditClient(cid)}
                  getId={(c) => c.IDclient}
                  getPrimary={(c) => c.nom}
                  placeholder="Sélectionner un client"
                />
              ) : (
                <KV label="Propriétaire du fil" value={detail.client_nom ?? '—'} />
              )}
            </DrawerCard>

            {/* Titrage */}
            <DrawerCard icon={<Gauge className="h-4 w-4 text-accent" />} title="Titrage" highlight={isEditing}>
              <div className="space-y-1.5">
                {detail.titrage_ref ? (
                  <KV
                    label="Référence"
                    value={
                      <span className="tabular-nums">
                        {detail.titrage_ref.unite || 'dtex'} {fmtNum(detail.titrage_ref.titrage, 0)} · {detail.titrage_ref.nb_fil} fil{detail.titrage_ref.nb_fil > 1 ? 's' : ''} · {detail.titrage_ref.nb_brin} brin{detail.titrage_ref.nb_brin > 1 ? 's' : ''}
                      </span>
                    }
                  />
                ) : (
                  <KV label="Référence" value="—" />
                )}
                {detail.controles.map((c) => (
                  <KV
                    key={c.IDcontrole_titrage}
                    label={`Contrôlé le ${c.date ? formatHfsqlDate(c.date) : '—'}`}
                    value={
                      <span className="tabular-nums">
                        {fmtNum(c.titrage, c.titrage % 1 === 0 ? 0 : 1)} · {c.nb_fil} fil{c.nb_fil > 1 ? 's' : ''} · {c.nb_brin} brin{c.nb_brin > 1 ? 's' : ''}
                      </span>
                    }
                  />
                ))}
                {!isEditing && !isArchived && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full mt-1 text-muted-foreground hover:text-accent hover:bg-accent/5 border border-dashed border-border/60 hover:border-accent/40"
                    onClick={() => setTitrageOpen(true)}
                  >
                    <Gauge className="h-3.5 w-3.5 mr-1.5" />
                    Contrôler le titrage
                  </Button>
                )}
              </div>
            </DrawerCard>

            {/* Provenance */}
            <DrawerCard icon={<Factory className="h-4 w-4 text-accent" />} title="Provenance" highlight={isEditing}>
              <div className="space-y-1.5">
                <KV label="Fournisseur" value={detail.fournisseur_nom ?? '—'} />
                <KV
                  label="Lot fournisseur"
                  value={
                    isEditing ? (
                      <input
                        type="text"
                        value={editLotFrs}
                        onChange={(e) => setEditLotFrs(e.target.value)}
                        className="h-7 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring text-right"
                      />
                    ) : (
                      detail.lot_frs || '—'
                    )
                  }
                  mono={!isEditing}
                />
                <KV
                  label="Date d'entrée"
                  value={detail.date_entree ? formatHfsqlDate(detail.date_entree) : '—'}
                />
                {detail.IDcommande_fil ? (
                  <KV label="Commande N°" value={String(detail.IDcommande_fil)} mono />
                ) : null}
              </div>
            </DrawerCard>

            {/* Stockage */}
            <DrawerCard icon={<MapPin className="h-4 w-4 text-accent" />} title="Stockage" highlight={isEditing}>
              <div className="space-y-1.5">
                <KV
                  label="Emplacement"
                  value={
                    isEditing ? (
                      <input
                        type="text"
                        value={editEmplacement}
                        onChange={(e) => setEditEmplacement(e.target.value)}
                        className="h-7 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring text-right"
                      />
                    ) : (
                      detail.emplacement || '—'
                    )
                  }
                />
                <KV
                  label="Niveau"
                  value={
                    isEditing ? (
                      <input
                        type="number"
                        min={0}
                        max={3}
                        value={editNiveau}
                        onChange={(e) => setEditNiveau(Math.min(3, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                        className="h-7 w-16 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring text-right"
                      />
                    ) : (
                      <span className="tabular-nums">{detail.niveau ?? '—'}</span>
                    )
                  }
                />
                {detail.magasin_nom && detail.IDMagasin !== 1 ? (
                  <KV label="Magasin" value={detail.magasin_nom} />
                ) : null}
                <KV
                  label="Dernier mouvement"
                  value={detail.dernier_mouvement ? formatHfsqlDate(detail.dernier_mouvement) : '—'}
                />
                <KV
                  label="Dernier pointage"
                  value={
                    isEditing ? (
                      <input
                        type="date"
                        value={editPointage}
                        onChange={(e) => setEditPointage(e.target.value)}
                        className="h-7 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    ) : detail.dernier_pointage ? (
                      formatHfsqlDate(detail.dernier_pointage)
                    ) : (
                      '—'
                    )
                  }
                />
                {age != null && (
                  <KV
                    label="Âge"
                    value={
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        {age} jour{age > 1 ? 's' : ''}
                      </span>
                    }
                  />
                )}
              </div>
            </DrawerCard>

            {/* Notes */}
            <DrawerCard icon={<MessageSquare className="h-4 w-4 text-accent" />} title="Notes" highlight={isEditing}>
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Commentaire</p>
                  {isEditing ? (
                    <textarea
                      value={editCommentaire}
                      onChange={(e) => setEditCommentaire(e.target.value)}
                      rows={3}
                      className="w-full px-2.5 py-1.5 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                    />
                  ) : detail.commentaire?.trim() ? (
                    <p className="text-sm whitespace-pre-wrap">{detail.commentaire.trim()}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">—</p>
                  )}
                </div>
                {/* Observation freinte is written by the Archivage dialog, not
                    here — shown read-only once it exists. */}
                {detail.observation_freinte?.trim() ? (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Observation freinte</p>
                    <p className="text-sm whitespace-pre-wrap">{detail.observation_freinte.trim()}</p>
                  </div>
                ) : null}
              </div>
            </DrawerCard>

            {/* Certificats */}
            {(detail.has_certif_bio || detail.has_certif_recycle) && (
              <DrawerCard icon={<ShieldCheck className="h-4 w-4 text-accent" />} title="Certificats du lot">
                <div className="flex flex-col gap-2">
                  {detail.has_certif_bio && (
                    <a
                      href={`${API_URL}/stock/fil/${detail.IDstock_fil}/certif/bio`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-green-200 bg-green-50 hover:bg-green-100 transition-colors"
                    >
                      <span className="flex items-center gap-2 text-sm font-medium text-green-700">
                        <Leaf className="h-4 w-4" />
                        Certificat bio
                      </span>
                      <Eye className="h-3.5 w-3.5 text-green-600" />
                    </a>
                  )}
                  {detail.has_certif_recycle && (
                    <a
                      href={`${API_URL}/stock/fil/${detail.IDstock_fil}/certif/recycle`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors"
                    >
                      <span className="flex items-center gap-2 text-sm font-medium text-blue-700">
                        <Recycle className="h-4 w-4" />
                        Certificat recyclé
                      </span>
                      <Eye className="h-3.5 w-3.5 text-blue-600" />
                    </a>
                  )}
                </div>
              </DrawerCard>
            )}

          </>
        )}
      </div>
      </div>

      {detail && (
        <>
          <DiviserDialog
            open={diviserOpen}
            onOpenChange={setDiviserOpen}
            detail={detail}
            onDone={(newId) => {
              onMutationSuccess()
              onSelect(newId)
            }}
          />
          <ControleTitrageDialog
            open={titrageOpen}
            onOpenChange={setTitrageOpen}
            detail={detail}
            onDone={onMutationSuccess}
          />
          <ArchiverDialog
            open={archiverOpen}
            onOpenChange={setArchiverOpen}
            detail={detail}
            readOnly={isArchived}
            onDone={onMutationSuccess}
          />
        </>
      )}
    </div>
  )
}

// ── Drawer card primitives ─────────────────────────────

function DrawerCard({
  icon,
  title,
  highlight,
  children,
}: {
  icon: React.ReactNode
  title: string
  highlight?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border/60 bg-card p-3 shadow-sm',
        highlight && 'border-l-4 border-l-accent/70 bg-accent/[0.03]'
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function KV({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('text-sm text-right truncate', mono && 'tabular-nums')}>{value}</span>
    </div>
  )
}

// ── New lot dialog ─────────────────────────────────────

interface NewStockFilDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (newId: number) => void
}

function todayInputDate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Niveau picker options — PopoverSelect treats id 0 as the "none" sentinel, so
// ids are niveau + 1.
const NIVEAU_OPTIONS = [
  { id: 1, primary: '0' },
  { id: 2, primary: '1' },
  { id: 3, primary: '2' },
  { id: 4, primary: '3' },
]

function NewStockFilDialog({ open, onOpenChange, onCreated }: NewStockFilDialogProps) {
  const [IDclient, setIDclient] = useState<number>(0)
  const [IDfournisseur, setIDfournisseur] = useState<number | ''>('')
  const [IDref_fil, setIDrefFil] = useState<number | ''>('')
  const [IDcolori_fil, setIDcolori] = useState<number | ''>('')
  const [lotFrs, setLotFrs] = useState('')
  const [stockInitial, setStockInitial] = useState('')
  const [emplacement, setEmplacement] = useState('')
  const [niveau, setNiveau] = useState(1)
  const [dateEntree, setDateEntree] = useState(todayInputDate())
  const [pointage, setPointage] = useState(todayInputDate())
  const [commentaire, setCommentaire] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setIDclient(0)
      setIDfournisseur('')
      setIDrefFil('')
      setIDcolori('')
      setLotFrs('')
      setStockInitial('')
      setEmplacement('')
      setNiveau(1)
      setDateEntree(todayInputDate())
      setPointage(todayInputDate())
      setCommentaire('')
      setError(null)
    }
  }, [open])

  const clientsQuery = useClientsLookup(open)

  const fournisseursQuery = useQuery<FournisseurOption[]>({
    queryKey: ['fournisseurs', 'options'],
    queryFn: () => apiFetch<FournisseurOption[]>('/fournisseurs'),
    enabled: open,
  })

  const fournisseurDetailQuery = useQuery<{ refsFil: RefFilOption[] }>({
    queryKey: ['fournisseur', 'detail', IDfournisseur],
    queryFn: () => apiFetch<{ refsFil: RefFilOption[] }>(`/fournisseurs/${IDfournisseur}`),
    enabled: open && typeof IDfournisseur === 'number',
  })

  const refs = fournisseurDetailQuery.data?.refsFil ?? []

  const uniqueRefs = useMemo(() => {
    const seen = new Map<number, { IDref_fil: number; reference: string }>()
    for (const r of refs) {
      if (!seen.has(r.IDref_fil)) {
        seen.set(r.IDref_fil, { IDref_fil: r.IDref_fil, reference: r.reference })
      }
    }
    return Array.from(seen.values()).sort((a, b) =>
      a.reference.localeCompare(b.reference, 'fr', { sensitivity: 'base' })
    )
  }, [refs])

  const colorisForRef = useMemo(() => {
    if (typeof IDref_fil !== 'number') return []
    return refs
      .filter((r) => r.IDref_fil === IDref_fil)
      .sort((a, b) =>
        a.colori_reference.localeCompare(b.colori_reference, 'fr', { sensitivity: 'base' })
      )
  }, [refs, IDref_fil])

  useEffect(() => {
    setIDrefFil('')
    setIDcolori('')
  }, [IDfournisseur])

  useEffect(() => {
    setIDcolori('')
  }, [IDref_fil])

  const createMutation = useMutation({
    mutationFn: async () => {
      if (typeof IDref_fil !== 'number' || typeof IDcolori_fil !== 'number') {
        throw new Error('Référence et coloris requis')
      }
      return apiFetch<{ IDstock_fil: number | null; lot: string }>('/stock/fil-trm', {
        method: 'POST',
        body: JSON.stringify({
          IDclient,
          IDfournisseur,
          IDref_fil,
          IDcolori_fil,
          lot_frs: lotFrs,
          stock_initial: parseFloat(stockInitial) || 0,
          emplacement,
          niveau,
          date_entree: inputDateToHfsql(dateEntree),
          dernier_pointage: pointage ? inputDateToHfsql(pointage) : '',
          commentaire,
        }),
      })
    },
    onSuccess: (res) => {
      onOpenChange(false)
      if (res?.IDstock_fil) onCreated(res.IDstock_fil)
    },
    onError: (err: Error) => {
      setError(err.message || 'Erreur lors de la création')
    },
  })

  const canSubmit =
    IDclient > 0 &&
    typeof IDfournisseur === 'number' &&
    typeof IDref_fil === 'number' &&
    typeof IDcolori_fil === 'number' &&
    stockInitial.trim() !== '' &&
    !isNaN(parseFloat(stockInitial)) &&
    parseFloat(stockInitial) > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90dvh] overflow-y-auto" onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle className="font-heading">Nouveau lot de fil</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <div className="col-span-full">
            <label className="text-xs text-muted-foreground mb-1 block">Client *</label>
            <SearchableCombobox<ClientOption>
              options={clientsQuery.data ?? []}
              value={IDclient}
              onChange={(id) => setIDclient(id)}
              getId={(c) => c.IDclient}
              getPrimary={(c) => c.nom}
              placeholder="Choix du client"
            />
          </div>

          <div className="col-span-full">
            <label className="text-xs text-muted-foreground mb-1 block">Fournisseur *</label>
            <SearchableCombobox<FournisseurOption>
              options={fournisseursQuery.data ?? []}
              value={typeof IDfournisseur === 'number' ? IDfournisseur : 0}
              onChange={(id) => setIDfournisseur(id > 0 ? id : '')}
              getId={(f) => f.IDfournisseur}
              getPrimary={(f) => f.nom}
              placeholder="Sélectionner un fournisseur"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Fil *</label>
            <PopoverSelect
              options={uniqueRefs.map((r) => ({ id: r.IDref_fil, primary: r.reference }))}
              value={typeof IDref_fil === 'number' ? IDref_fil : 0}
              onChange={(id) => setIDrefFil(id > 0 ? id : '')}
              disabled={typeof IDfournisseur !== 'number' || fournisseurDetailQuery.isLoading}
              emptyLabel={
                typeof IDfournisseur !== 'number'
                  ? '— Choisir un fournisseur —'
                  : fournisseurDetailQuery.isLoading
                    ? 'Chargement…'
                    : uniqueRefs.length === 0
                      ? 'Aucune référence'
                      : '— Sélectionner —'
              }
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Coloris *</label>
            <PopoverSelect
              options={colorisForRef.map((r) => ({ id: r.IDcolori_fil, primary: r.colori_reference }))}
              value={typeof IDcolori_fil === 'number' ? IDcolori_fil : 0}
              onChange={(id) => setIDcolori(id > 0 ? id : '')}
              disabled={typeof IDref_fil !== 'number'}
              emptyLabel={
                typeof IDref_fil !== 'number'
                  ? '— Choisir un fil —'
                  : colorisForRef.length === 0
                    ? 'Aucun coloris'
                    : '— Sélectionner —'
              }
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Stock initial (kg) *</label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={stockInitial}
              onChange={(e) => setStockInitial(e.target.value)}
              className="w-full h-9 px-2.5 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Lot fournisseur</label>
            <input
              type="text"
              value={lotFrs}
              onChange={(e) => setLotFrs(e.target.value)}
              className="w-full h-9 px-2.5 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Date d'entrée</label>
            <input
              type="date"
              value={dateEntree}
              onChange={(e) => setDateEntree(e.target.value)}
              className="w-full h-9 px-2.5 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Pointage</label>
            <input
              type="date"
              value={pointage}
              onChange={(e) => setPointage(e.target.value)}
              className="w-full h-9 px-2.5 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Emplacement</label>
            <input
              type="text"
              value={emplacement}
              onChange={(e) => setEmplacement(e.target.value)}
              className="w-full h-9 px-2.5 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Niveau</label>
            <PopoverSelect
              options={NIVEAU_OPTIONS}
              value={niveau + 1}
              onChange={(id) => setNiveau(Math.min(3, Math.max(0, id - 1)))}
              hideEmpty
            />
          </div>

          <div className="col-span-full">
            <label className="text-xs text-muted-foreground mb-1 block">Commentaire</label>
            <textarea
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              rows={2}
              className="w-full px-2.5 py-1.5 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          <p className="col-span-full text-xs text-muted-foreground">
            Le N° de lot interne est attribué automatiquement à la création.
          </p>
        </div>

        {error && (
          <div className="mt-3 flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        <DialogFooter className="mt-4 gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createMutation.isPending}>
            Annuler
          </Button>
          <Button onClick={() => createMutation.mutate()} disabled={!canSubmit || createMutation.isPending}>
            {createMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5 mr-1.5" />
            )}
            Créer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Diviser dialog ─────────────────────────────────────
// Legacy FEN_Diviser_Lot: source Stock initial + Stock actuel read-only, the
// operator types the new lot's Stock initial; both source columns lose X.

function DiviserDialog({
  open,
  onOpenChange,
  detail,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  detail: StockDetail
  onDone: (newId: number) => void
}) {
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setAmount('')
      setError(null)
    }
  }, [open])

  const x = parseFloat(amount)
  const srcInitial = detail.stock_initial ?? 0
  const valid = !isNaN(x) && x > 0 && x < srcInitial

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<{ IDstock_fil: number; lot: string }>(`/stock/fil-trm/${detail.IDstock_fil}/diviser`, {
        method: 'POST',
        body: JSON.stringify({ stock_initial: x }),
      }),
    onSuccess: (res) => {
      onOpenChange(false)
      if (res?.IDstock_fil) onDone(res.IDstock_fil)
    },
    onError: (err: Error) => setError(err.message || 'Erreur lors de la division'),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <Split className="h-4 w-4 text-accent" />
            Diviser le lot {detail.lot}
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          {detail.ref_fil ?? '—'} — {detail.colori_reference ?? '—'}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
          <div className="rounded-lg border border-border/60 bg-zinc-100/80 p-3">
            <p className="text-xs font-semibold mb-2">Lot {detail.lot}</p>
            <div className="space-y-1.5">
              <KV label="Stock initial" value={<span className="tabular-nums">{formatKg(srcInitial)}</span>} />
              <KV label="Stock actuel" value={<span className="tabular-nums">{formatKg(detail.stock)}</span>} />
            </div>
          </div>
          <div className="rounded-lg border border-border/60 bg-zinc-100/80 p-3">
            <p className="text-xs font-semibold mb-2">Nouveau lot</p>
            <label className="text-xs text-muted-foreground mb-1 block">Stock initial (kg)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full h-9 px-2.5 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring text-right tabular-nums"
              autoFocus
            />
          </div>
        </div>

        {valid && (
          <p className="text-xs text-muted-foreground mt-2">
            Le lot {detail.lot} passera à {formatKg(srcInitial - x)} initial / {formatKg((detail.stock ?? 0) - x)} actuel.
          </p>
        )}

        {error && (
          <div className="mt-2 flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        <DialogFooter className="mt-4 gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Annuler
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending}>
            {mutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Split className="h-3.5 w-3.5 mr-1.5" />
            )}
            Valider
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Contrôle de titrage dialog ─────────────────────────
// Legacy FEN_Controle_Titrage: the reference block from ref_fil, then the
// measured values — Valider inserts a controle_titrage row (1-N history).

function ControleTitrageDialog({
  open,
  onOpenChange,
  detail,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  detail: StockDetail
  onDone: () => void
}) {
  const [titrage, setTitrage] = useState('')
  const [nbFil, setNbFil] = useState('')
  const [nbBrin, setNbBrin] = useState('')
  const [error, setError] = useState<string | null>(null)

  const ref = detail.titrage_ref

  useEffect(() => {
    if (open) {
      // Pre-fill with the reference values — the operator corrects what differs.
      setTitrage(ref ? String(ref.titrage) : '')
      setNbFil(ref ? String(ref.nb_fil) : '1')
      setNbBrin(ref ? String(ref.nb_brin) : '0')
      setError(null)
    }
  }, [open, ref])

  const t = parseFloat(titrage)
  const valid = !isNaN(t) && t > 0

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch(`/stock/fil-trm/${detail.IDstock_fil}/controle-titrage`, {
        method: 'POST',
        body: JSON.stringify({
          titrage: t,
          nb_fil: parseInt(nbFil, 10) || 0,
          nb_brin: parseInt(nbBrin, 10) || 0,
          IDunite_titrage: 1, // dtex — the unit of the reference block
        }),
      }),
    onSuccess: () => {
      onOpenChange(false)
      onDone()
    },
    onError: (err: Error) => setError(err.message || 'Erreur lors de l’enregistrement'),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <Gauge className="h-4 w-4 text-accent" />
            Contrôle de titrage — Lot {detail.lot}
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          {detail.ref_fil ?? '—'} — {detail.colori_reference ?? '—'}
        </p>

        <div className="rounded-lg border border-border/60 bg-zinc-100/80 p-3 mt-2">
          <p className="text-xs font-semibold mb-1.5">Titrage de référence</p>
          {ref ? (
            <p className="text-sm tabular-nums">
              {ref.unite || 'dtex'} {fmtNum(ref.titrage, 0)} · {ref.nb_fil} fil{ref.nb_fil > 1 ? 's' : ''} · {ref.nb_brin} brin{ref.nb_brin > 1 ? 's' : ''}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground italic">Aucun titrage sur la référence</p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3 mt-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Titrage ({ref?.unite || 'dtex'})</label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={titrage}
              onChange={(e) => setTitrage(e.target.value)}
              className="w-full h-9 px-2.5 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring text-right tabular-nums"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Nombre de fils</label>
            <input
              type="number"
              min="0"
              value={nbFil}
              onChange={(e) => setNbFil(e.target.value)}
              className="w-full h-9 px-2.5 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring text-right tabular-nums"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">de brins</label>
            <input
              type="number"
              min="0"
              value={nbBrin}
              onChange={(e) => setNbBrin(e.target.value)}
              className="w-full h-9 px-2.5 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring text-right tabular-nums"
            />
          </div>
        </div>

        {error && (
          <div className="mt-2 flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        <DialogFooter className="mt-4 gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Annuler
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending}>
            {mutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5 mr-1.5" />
            )}
            Valider
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Archivage dialog ───────────────────────────────────
// Legacy FEN_Archivage: editable Quantité initiale, the OF consumption table,
// the freinte / second-choix stats, the visitage-defects verdict, and the
// observation. Archiver writes stock_initial + observation, forces stock = 0
// and sets terminé = 1. Freinte recomputes live as the quantity is corrected.

function ArchiverDialog({
  open,
  onOpenChange,
  detail,
  readOnly,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  detail: StockDetail
  /** Archived lot: the same bilan, frozen — no inputs, no Archiver. */
  readOnly: boolean
  onDone: () => void
}) {
  const [qteInitiale, setQteInitiale] = useState('')
  const [observation, setObservation] = useState('')
  const [error, setError] = useState<string | null>(null)

  const bilanQuery = useQuery<BilanData>({
    queryKey: ['stock-fil-trm', 'bilan', detail.IDstock_fil],
    queryFn: () => apiFetch<BilanData>(`/stock/fil-trm/${detail.IDstock_fil}/bilan`),
    enabled: open,
  })
  const bilan = bilanQuery.data

  useEffect(() => {
    if (open) {
      setQteInitiale(detail.stock_initial != null ? String(detail.stock_initial) : '')
      setObservation(detail.observation_freinte ?? '')
      setError(null)
    }
  }, [open, detail])

  const qte = parseFloat(qteInitiale)
  const validQte = !isNaN(qte) && qte >= 0

  // Live recomputation off the editable quantity — same formulas as the API.
  const produit = bilan?.produit ?? 0
  const freinteKg = validQte ? qte - produit : null
  const freintePct = validQte && qte > 0 && freinteKg != null ? (freinteKg / qte) * 100 : null
  const secondPct = bilan?.second_choix_pct ?? null

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch(`/stock/fil-trm/${detail.IDstock_fil}/archiver`, {
        method: 'POST',
        body: JSON.stringify({ stock_initial: qte, observation_freinte: observation }),
      }),
    onSuccess: () => {
      onOpenChange(false)
      onDone()
    },
    onError: (err: Error) => setError(err.message || 'Erreur lors de l’archivage'),
  })

  const aucunDefaut = (bilan?.defauts.length ?? 0) === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* A card-like surface opening over the content → the §43 navy/gold band
          is its header (same as the drawer, §27.5bis), the body is a zinc panel
          of white cards and the footer a zinc-200/50 strip — the app's panel
          composition rather than a bare white sheet. p-0 overrides the
          primitive's p-6; the band carries its own close button. */}
      <DialogContent className="max-w-2xl p-0 overflow-hidden max-h-[90dvh] flex flex-col">
        <div className="flex-shrink-0 flex items-center gap-2.5 border-b-2 border-gold bg-primary px-4 py-2.5">
          <div className="h-8 w-8 flex-shrink-0 rounded-lg flex items-center justify-center shadow-sm bg-gold text-gold-foreground">
            <Archive className="h-[18px] w-[18px]" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-heading font-bold tracking-tight truncate text-primary-foreground">
              {readOnly ? 'Bilan de freinte' : 'Archivage'} — Lot {detail.lot ?? '—'}
            </h2>
            <p className="text-xs text-white/70 truncate">
              {detail.ref_fil ?? '—'} • {detail.colori_reference ?? '—'} • {detail.client_nom ?? '—'}
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white/80 hover:bg-white/15 hover:text-white"
              title="Imprimer le rapport de freinte"
              onClick={() =>
                window.open(
                  `${API_URL}/stock/fil-trm/${detail.IDstock_fil}/rapport-freinte${validQte ? `?stock_initial=${qte}` : ''}`,
                  '_blank',
                )
              }
            >
              <Printer className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white/80 hover:bg-white/15 hover:text-white"
              title="Fermer"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto bg-zinc-100/80 p-4 space-y-3 scrollbar-transparent">
        {bilanQuery.isLoading || !bilan ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
          </div>
        ) : (
          <>
            {/* Quantité initiale — the one figure the operator corrects before
                archiving (2 arrivages, retour…); gold edge = "this is written". */}
            <div
              className={cn(
                'rounded-lg border border-border/60 bg-card p-3 shadow-sm',
                !readOnly && 'border-l-4 border-l-accent/70',
              )}
            >
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className="h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0 bg-accent/15 text-accent">
                    <Package className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">Quantité initiale</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {readOnly
                        ? 'Quantité retenue à l’archivage'
                        : `Stock actuel ${formatKg(bilan.stock)} — corrigez le reçu si besoin avant d'archiver`}
                    </p>
                  </div>
                </div>
                {readOnly ? (
                  <span className="text-base font-semibold tabular-nums">{formatKg(bilan.stock_initial)}</span>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={qteInitiale}
                      onChange={(e) => setQteInitiale(e.target.value)}
                      className="h-9 w-32 px-2.5 text-sm font-semibold rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring text-right tabular-nums"
                    />
                    <span className="text-sm text-muted-foreground">kg</span>
                  </div>
                )}
              </div>
            </div>

            {/* Freinte + second choix — the two verdicts, status-colored */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <VerdictTile
                icon={<TrendingDown className="h-4 w-4" />}
                label="Freinte de tricotage"
                value={freintePct != null ? `${fmtNum(freintePct, 2)} %` : '—'}
                detail={freinteKg != null ? `${fmtNum(freinteKg, 2)} kg perdus sur ${fmtNum(qte, 2)} kg` : '—'}
                tone={freinteTone(freintePct)}
              />
              <VerdictTile
                icon={<Layers className="h-4 w-4" />}
                label="Second choix"
                value={secondPct != null ? `${fmtNum(secondPct, 2)} %` : '—'}
                detail={`${fmtNum(bilan.poids_second, 2)} kg sur ${fmtNum(bilan.poids_total, 2)} kg produits`}
                tone={secondChoixTone(secondPct)}
              />
            </div>

            {/* Defects verdict — the legacy dialog's smiley, as a status card */}
            <div
              className={cn(
                'rounded-lg border-l-4 border border-border/60 bg-card p-3 shadow-sm',
                aucunDefaut ? 'border-l-green-500/60' : 'border-l-amber-400/60',
              )}
            >
              {aucunDefaut ? (
                <div className="flex items-center gap-3 py-1">
                  <div className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-green-500/10">
                    <Smile className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-green-600">Aucun défaut</p>
                    <p className="text-xs text-muted-foreground">Rien relevé au visitage des pièces de ce lot</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0 bg-amber-400/10">
                      <Frown className="h-4 w-4 text-amber-600" />
                    </div>
                    <p className="text-sm font-semibold">Défauts relevés au visitage</p>
                    <Badge variant="outline" className="ml-auto text-xs bg-amber-500/15 text-amber-800 border-amber-500/30">
                      {bilan.defauts.reduce((s, d) => s + d.nombre, 0)}
                    </Badge>
                  </div>
                  <div className="max-h-40 overflow-y-auto scrollbar-transparent divide-y divide-border/40">
                    {bilan.defauts.map((d, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 py-1 text-sm">
                        <span className="truncate">{d.label}</span>
                        <span className="rounded-full bg-amber-500/15 px-1.5 py-0 text-[11px] font-medium tabular-nums text-amber-800 flex-shrink-0">
                          ×{d.nombre}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* OF consumption */}
            <DrawerCard icon={<Factory className="h-4 w-4 text-accent" />} title="Consommation par ordre de fabrication">
              {bilan.ofs.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Aucun ordre de fabrication n'a consommé ce lot.</p>
              ) : (
                <div className="rounded-md border border-border/60 overflow-hidden">
                  <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
                    <thead className="bg-zinc-200/60 border-b border-border/60">
                      <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2 text-left font-semibold w-[15%]">OF</th>
                        <th className="px-3 py-2 text-left font-semibold w-[37%]">Référence écru</th>
                        <th className="px-3 py-2 text-right font-semibold w-[16%]">1er choix</th>
                        <th className="px-3 py-2 text-right font-semibold w-[16%]">2nd choix</th>
                        <th className="px-3 py-2 text-right font-semibold w-[16%]">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bilan.ofs.map((o) => (
                        <tr key={o.of} className="border-b border-border/40">
                          <td className="px-3 py-1.5 tabular-nums font-medium">{o.of}</td>
                          <td className="px-3 py-1.5 truncate" title={o.ref_ecru || undefined}>{o.ref_ecru || '—'}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(o.premier_choix, 2)} kg</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{fmtNum(o.second_choix, 2)} kg</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(o.premier_choix + o.second_choix, 2)} kg</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-zinc-100/80">
                      <tr className="font-semibold">
                        <td className="px-3 py-1.5">Somme</td>
                        <td></td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {fmtNum(bilan.ofs.reduce((s, o) => s + o.premier_choix, 0), 2)} kg
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {fmtNum(bilan.ofs.reduce((s, o) => s + o.second_choix, 0), 2)} kg
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(bilan.poids_total, 2)} kg</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </DrawerCard>

            {/* Observation freinte — written with the archive; gold edge while
                editable, plain card once archived */}
            <div
              className={cn(
                'rounded-lg border border-border/60 bg-card p-3 shadow-sm',
                !readOnly && 'border-l-4 border-l-accent/70',
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="h-4 w-4 text-accent" />
                <h3 className="text-sm font-semibold">Observation freinte</h3>
              </div>
              {readOnly ? (
                observation.trim() ? (
                  <p className="text-sm whitespace-pre-wrap">{observation.trim()}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">Aucune observation</p>
                )
              ) : (
                <textarea
                  value={observation}
                  onChange={(e) => setObservation(e.target.value)}
                  rows={2}
                  placeholder="Justification de la freinte (retour client, 2 arrivages, lot mixé…)"
                  className="w-full px-2.5 py-1.5 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              )}
            </div>
          </>
        )}
        </div>

        <div className="flex-shrink-0 flex items-center gap-3 border-t border-border/60 bg-zinc-200/50 px-4 py-3">
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive min-w-0">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">{error}</span>
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            {readOnly ? (
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Fermer
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
                  Annuler
                </Button>
                <Button
                  onClick={() => mutation.mutate()}
                  disabled={!validQte || bilanQuery.isLoading || mutation.isPending}
                >
                  {mutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Archive className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Archiver
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
