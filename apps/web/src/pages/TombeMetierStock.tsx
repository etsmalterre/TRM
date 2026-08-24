import { useState, useMemo, useCallback, useEffect, useRef, useDeferredValue, memo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Boxes,
  Search,
  Loader2,
  AlertCircle,
  X,
  ArrowUp,
  ArrowDown,
  Package,
  MessageSquare,
  ShieldAlert,
  Send,
  Factory,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FabricRollIcon } from '@/components/icons/FabricRollIcon'
import { KnitIcon } from '@/components/icons/KnitIcon'
import { cn } from '@/lib/utils'
import { formatHfsqlDate } from '@/lib/dates'
import { fmtNum } from '@/lib/format'
import { apiFetch } from '@/lib/api'
import { PopoverSelect } from '@/components/ui/popover-select'
import { CardKV, MobileSortRow } from '@/components/stock/StockCardParts'

// Tombé Métier › Stock — the écru pieces Tricotage Malterre knitted and still
// physically holds (IDsociete = 2, not yet shipped). Table-centric "Tableau"
// layout (mps_designer §27) with a right slide-in drawer, mirroring ETM's
// screen of the same name; the columns differ because a TRM piece is defined by
// its production origin (OF + métier) where an ETM piece is defined by its
// storage + dyeing state. Read-only: pieces are created and closed by the
// production/visitage flow, never edited from here.

// ── Types ──────────────────────────────────────────────

interface DefautQualite {
  IDdefaut_qualite: number
  description: string | null
  type_defaut: string | null
  taille_cm: number | null
}

interface StockEcruTrmRow {
  IDstock_ecru: number
  IDref_ecru: number | null
  IDcolori_ecru: number | null
  IDordre_fabrication: number | null
  IDpiece_production: number | null
  IDLigne_Commande_TRM: number | null
  IDmachine: number | null
  poids: number | null
  metrage: number | null
  lot: string | null
  numero: string | null
  num_piece_OF: number | null
  observations: string | null
  visiteur: string | null
  second_choix: number | null
  date_saisie: string | null
  ref_ecru: string | null
  coloris_reference: string | null
  machine_nom: string | null
  commande_numero: string | null
  client_nom: string | null
  defauts: string | null
  defects?: DefautQualite[]
}

interface ProductionInfo {
  IDordre_fabrication: number | null
  machine_nom: string | null
  num_piece: number | null
  of_quantite: number | null
  of_nb_pieces: number | null
  of_est_termine: number | null
  date_debut: string | null
  date_fin: string | null
  date_visitage: string | null
}

interface StockEcruTrmDetail extends StockEcruTrmRow {
  production: ProductionInfo
}

// Status filter codes — mapped to the API `statut` query param. Ids are 1-based
// because PopoverSelect treats id 0 as the "none" sentinel (shows emptyLabel).
// TRM has no teinture step: a piece is either still free stock or already
// reserved to a commande client (usually ETM's).
type StatutCode = 1 | 2 | 3
const STATUT_PARAM: Record<StatutCode, string> = { 1: 'disponible', 2: 'affecte', 3: 'tous' }
const STATUT_OPTIONS = [
  { id: 1, primary: 'Disponible' },
  { id: 2, primary: 'Affecté' },
  { id: 3, primary: 'Tous' },
]

// ── API helpers ────────────────────────────────────────

function useStockEcruTrmList(filters: { statut: StatutCode; secondChoix: boolean }) {
  const params = new URLSearchParams()
  params.set('statut', STATUT_PARAM[filters.statut])
  if (filters.secondChoix) params.set('second_choix', '1')
  const qs = params.toString()
  return useQuery<StockEcruTrmRow[]>({
    queryKey: ['stock-ecru-trm', filters],
    queryFn: () => apiFetch<StockEcruTrmRow[]>(`/stock/ecru-trm${qs ? `?${qs}` : ''}`),
  })
}

function useStockEcruTrmDetail(id: number | null) {
  return useQuery<StockEcruTrmDetail>({
    queryKey: ['stock-ecru-trm', 'detail', id],
    queryFn: () => apiFetch<StockEcruTrmDetail>(`/stock/ecru-trm/${id}`),
    enabled: id !== null,
  })
}

// ── Helpers ────────────────────────────────────────────

function formatKg(v: number | null): string {
  if (v == null) return '—'
  return `${v.toFixed(1)} kg`
}

function formatMeters(v: number | null): string {
  if (v == null) return '—'
  return `${v.toFixed(1)} m`
}

/** piece_production timestamps are full datetimes ("2026-06-13 03:13:29.440"),
 *  not the 8-char HFSQL dates formatHfsqlDate handles — show the hour too, it's
 *  what tells a night shift from a morning one. */
function formatDateTime(raw: string | null): string {
  if (!raw) return '—'
  const d = new Date(raw.replace(' ', 'T'))
  if (isNaN(d.getTime())) return '—'
  return `${d.toLocaleDateString('fr-FR')} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
}

// ── Sort handling ──────────────────────────────────────

type SortKey =
  | 'ref_ecru'
  | 'coloris_reference'
  | 'numero'
  | 'poids'
  | 'machine_nom'
  | 'commande_numero'
  | 'client_nom'
  | 'date_saisie'
  | 'second_choix'
  | 'visiteur'
  | 'observations'
  | 'defauts'

interface SortState {
  key: SortKey
  dir: 'asc' | 'desc'
}

const COLUMNS: { key: SortKey; label: string; width: string; align?: 'left' | 'right' }[] = [
  // No OF column: the roll's numero is "<OF>/<pièce>", so the OF id is already
  // the numero's prefix (and the drawer's Production card names it in full).
  { key: 'ref_ecru', label: 'Référence', width: '7%' },
  { key: 'coloris_reference', label: 'Coloris', width: '7%' },
  { key: 'numero', label: 'Numéro', width: '9%' },
  { key: 'poids', label: 'Poids', width: '5%', align: 'right' },
  { key: 'machine_nom', label: 'Métier', width: '6%' },
  { key: 'commande_numero', label: 'N° Cmd', width: '5%' },
  { key: 'client_nom', label: 'Client', width: '11%' },
  { key: 'date_saisie', label: 'Date saisie', width: '7%' },
  { key: 'second_choix', label: '2ᵉ', width: '3%' },
  { key: 'visiteur', label: 'Visiteur', width: '9%' },
  { key: 'observations', label: 'Observations', width: '17%' },
  { key: 'defauts', label: 'Défauts', width: '14%' },
]

const ROW_COLLATOR = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' })

function compareRows(a: StockEcruTrmRow, b: StockEcruTrmRow, key: SortKey): number {
  const va = a[key]
  const vb = b[key]
  if (va == null && vb == null) return 0
  if (va == null) return 1
  if (vb == null) return -1
  if (typeof va === 'number' && typeof vb === 'number') return va - vb
  return ROW_COLLATOR.compare(String(va), String(vb))
}

// ── Main Page ──────────────────────────────────────────

export function TombeMetierStock() {
  const [searchQuery, setSearchQuery] = useState('')
  const [statut, setStatut] = useState<StatutCode>(1)
  const [secondChoix, setSecondChoix] = useState(false)
  const [sort, setSort] = useState<SortState>({ key: 'date_saisie', dir: 'desc' })
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const { data: rows, isLoading, isError, error } = useStockEcruTrmList({ statut, secondChoix })

  const deferredSearch = useDeferredValue(searchQuery)

  const filteredSorted = useMemo(() => {
    let out = rows ?? []
    const terms = deferredSearch.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length > 0) {
      out = out.filter((r) => {
        const haystacks = [
          r.ref_ecru,
          r.coloris_reference,
          r.numero,
          r.machine_nom,
          r.commande_numero,
          r.client_nom,
          r.visiteur,
          r.observations,
          r.defauts,
          r.IDordre_fabrication ? String(r.IDordre_fabrication) : null,
        ]
          .filter((f): f is string => !!f)
          .map((f) => f.toLowerCase())
        return terms.every((t) => haystacks.some((h) => h.includes(t)))
      })
    }
    out = [...out].sort((a, b) => {
      const cmp = compareRows(a, b, sort.key)
      return sort.dir === 'asc' ? cmp : -cmp
    })
    return out
  }, [rows, deferredSearch, sort])

  const handleSort = useCallback((key: SortKey) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }, [])

  const handleClose = useCallback(() => setSelectedId(null), [])

  const handleRowClick = useCallback((rowId: number) => {
    setSelectedId((prev) => (prev === rowId ? null : rowId))
  }, [])

  // Totalizer over the currently-visible (filtered) rows.
  const rollCount = filteredSorted.length
  const totalPoids = filteredSorted.reduce((sum, r) => sum + (r.poids ?? 0), 0)

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      {/* Toolbar — search takes row 1 on its own below sm; the statut select and
          the 2ᵉ choix checkbox are forced onto a full-width row of their own
          (§40.5 wrapper rule). At sm+ display:contents dissolves the wrapper and
          both children rejoin the toolbar flex. */}
      <div className="flex-shrink-0 flex flex-wrap items-center gap-3">
        <div className="relative order-1 flex-1 min-w-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher (réf, coloris, numéro, OF, métier, client, visiteur, observations…)"
            className="h-9 w-full pl-8 pr-3 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="order-2 w-full flex items-center gap-3 sm:contents">
          <div className="w-40 flex-shrink-0 sm:order-2">
            <PopoverSelect
              options={STATUT_OPTIONS}
              value={statut}
              onChange={(v) => setStatut(v as StatutCode)}
              hideEmpty
            />
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer select-none flex-shrink-0 sm:order-3">
            <input
              type="checkbox"
              checked={secondChoix}
              onChange={(e) => setSecondChoix(e.target.checked)}
              className="h-4 w-4 rounded border-input text-accent focus:ring-2 focus:ring-ring cursor-pointer"
            />
            <span>2ᵉ choix</span>
          </label>
        </div>
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
            <p className="text-sm">Aucune pièce en stock</p>
          </div>
        ) : (
          <>
            {/* Desktop table (md+) — split header/body sharing one colgroup */}
            <div className="hidden md:flex md:flex-col flex-1 min-h-0">
              {/* Header table (non-scrolling) */}
              <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  {COLUMNS.map((c) => (
                    <col key={c.key} style={{ width: c.width }} />
                  ))}
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
                  </tr>
                </thead>
              </table>

              {/* Body table (scrolling) */}
              <div className="flex-1 min-h-0 overflow-auto scrollbar-transparent">
                <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
                  <colgroup>
                    {COLUMNS.map((c) => (
                      <col key={c.key} style={{ width: c.width }} />
                    ))}
                  </colgroup>
                  <tbody>
                    {filteredSorted.map((r) => (
                      <StockRow
                        key={r.IDstock_ecru}
                        row={r}
                        selected={r.IDstock_ecru === selectedId}
                        onRowClick={handleRowClick}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile card list (< md) — same rows, selection and sort state as
                the table; only the row markup is rendered twice. */}
            <div className="md:hidden flex-1 min-h-0 flex flex-col">
              <MobileSortRow columns={COLUMNS} sort={sort} onSortChange={setSort} />
              <div className="flex-1 min-h-0 overflow-y-auto scrollbar-transparent p-2 space-y-2 bg-zinc-100/80">
                {filteredSorted.map((r) => (
                  <StockEcruTrmCard
                    key={r.IDstock_ecru}
                    row={r}
                    selected={r.IDstock_ecru === selectedId}
                    onRowClick={handleRowClick}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Totalizer — standalone summary bar, detached from the table. Below sm
          the "Poids total" label disappears (the kg unit is self-explanatory)
          and the value shrinks one step so the bar stays on ONE line (§40.5bis). */}
      {!isLoading && !isError && filteredSorted.length > 0 && (
        <div className="flex-shrink-0 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-zinc-100/80 shadow-sm px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Package className="h-4 w-4 text-accent" />
            <span className="font-semibold">{rollCount}</span>
            <span className="text-muted-foreground">pièce{rollCount > 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-baseline gap-1.5 sm:gap-2">
            <span className="hidden sm:inline text-xs uppercase tracking-wide text-muted-foreground whitespace-nowrap">
              Poids total
            </span>
            <span className="text-sm sm:text-base font-bold tabular-nums whitespace-nowrap">
              {fmtNum(totalPoids, 1)} kg
            </span>
          </div>
        </div>
      )}

      <StockEcruTrmDrawer id={selectedId} onClose={handleClose} />
    </div>
  )
}

// ── Table row (memoized) ──────────────────────────────

const StockRow = memo(function StockRow({
  row,
  selected,
  onRowClick,
}: {
  row: StockEcruTrmRow
  selected: boolean
  onRowClick: (id: number) => void
}) {
  return (
    <tr
      data-stock-row
      onClick={() => onRowClick(row.IDstock_ecru)}
      className={cn(
        'border-b border-border/40 cursor-pointer transition-colors',
        selected ? 'bg-accent/10' : 'hover:bg-accent/5',
      )}
    >
      <td className="px-2 py-2 font-medium truncate">{row.ref_ecru ?? '—'}</td>
      <td className="px-2 py-2 truncate">{row.coloris_reference ?? '—'}</td>
      <td className="px-2 py-2 tabular-nums truncate text-muted-foreground">{row.numero ?? '—'}</td>
      <td className="px-2 py-2 text-right tabular-nums font-medium">{formatKg(row.poids)}</td>
      <td className="px-2 py-2 truncate">{row.machine_nom ?? '—'}</td>
      <td className="px-2 py-2 tabular-nums truncate text-muted-foreground">{row.commande_numero ?? '—'}</td>
      <td className="px-2 py-2 truncate">{row.client_nom ?? '—'}</td>
      <td className="px-2 py-2 tabular-nums text-muted-foreground">
        {row.date_saisie ? formatHfsqlDate(row.date_saisie) : '—'}
      </td>
      <td className="px-2 py-2">
        {/* Second choix = amber warning per the §7 status system (red is
            reserved for destructive/errors — the défauts column). */}
        {!!row.second_choix && (
          <Badge variant="outline" className="text-[10px] py-0 bg-amber-500/15 text-amber-800 border-amber-500/30">2ᵉ</Badge>
        )}
      </td>
      <td className="px-2 py-2 truncate text-muted-foreground" title={row.visiteur ?? undefined}>
        {row.visiteur?.trim() || '—'}
      </td>
      <td className="px-2 py-2 text-muted-foreground truncate" title={row.observations ?? undefined}>
        {row.observations?.trim() || ''}
      </td>
      <td className="px-2 py-2 text-muted-foreground truncate" title={row.defauts ?? undefined}>
        {row.defauts?.trim() ? <span className="text-red-700">{row.defauts.trim()}</span> : ''}
      </td>
    </tr>
  )
})

// ── Mobile card (below md) ─────────────────────────────

const StockEcruTrmCard = memo(function StockEcruTrmCard({
  row,
  selected,
  onRowClick,
}: {
  row: StockEcruTrmRow
  selected: boolean
  onRowClick: (id: number) => void
}) {
  return (
    <div
      data-stock-row
      onClick={() => onRowClick(row.IDstock_ecru)}
      className={cn(
        'rounded-lg border p-3 cursor-pointer transition-colors shadow-sm',
        selected ? 'bg-accent/10 border-accent ring-1 ring-accent' : 'bg-white border-border/60 hover:border-accent/40',
      )}
    >
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium truncate flex-1 min-w-0">{row.ref_ecru ?? '—'}</p>
        <div className="flex items-center gap-1 flex-shrink-0">
          {!!row.second_choix && (
            <Badge variant="outline" className="text-[10px] py-0 bg-amber-500/15 text-amber-800 border-amber-500/30">2ᵉ choix</Badge>
          )}
          {!!row.IDLigne_Commande_TRM && (
            <Badge className="bg-sky-100 text-sky-700 border-sky-200 gap-1 text-[10px] py-0">
              <Send className="h-2.5 w-2.5" />
              Affecté
            </Badge>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-0.5 truncate">{row.coloris_reference ?? '—'}</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2">
        <CardKV label="Numéro" value={row.numero ?? '—'} mono />
        <CardKV label="Poids" value={formatKg(row.poids)} mono strong />
        <CardKV label="Métier" value={row.machine_nom ?? '—'} />
        <CardKV label="N° Cmd" value={row.commande_numero ?? '—'} mono />
        <CardKV label="Client" value={row.client_nom ?? '—'} />
      </div>
      {!!row.defauts?.trim() && (
        <p className="text-[11px] text-red-700 mt-2 truncate" title={row.defauts.trim()}>
          {row.defauts.trim()}
        </p>
      )}
      {!!(row.date_saisie || row.observations?.trim()) && (
        <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-border/40 text-[11px] text-muted-foreground">
          <span className="truncate italic">{row.observations?.trim() ?? ''}</span>
          <span className="flex-shrink-0 tabular-nums">
            {row.date_saisie ? formatHfsqlDate(row.date_saisie) : ''}
          </span>
        </div>
      )}
    </div>
  )
})

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
        active && 'text-accent',
      )}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </span>
    </th>
  )
}

// ── Side drawer ────────────────────────────────────────

function StockEcruTrmDrawer({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { data: detail, isLoading } = useStockEcruTrmDetail(id)
  const drawerRef = useRef<HTMLDivElement>(null)
  const [searchParams] = useSearchParams()
  const embed = searchParams.get('embed') === 'true'

  useEffect(() => {
    if (id === null) return
    function handleMouseDown(e: MouseEvent) {
      const target = e.target as Node | null
      if (!target) return
      if (drawerRef.current?.contains(target)) return
      // Table rows and mobile cards both carry data-stock-row — they switch
      // the selection themselves.
      if ((target as Element).closest?.('[data-stock-row]')) return
      onClose()
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [id, onClose])

  const open = id !== null
  const prod = detail?.production

  return (
    <div
      ref={drawerRef}
      className={cn(
        'fixed right-0 bottom-0 w-full max-w-[440px] bg-white border-l border-border/60 shadow-xl z-30 transition-transform duration-300 flex flex-col',
        embed ? 'top-0' : 'top-14',
        open ? 'translate-x-0' : 'translate-x-full',
      )}
    >
      <div className="flex-1 min-h-0 flex flex-col bg-zinc-100/80">
        {/* Header band — the widget treatment (mps_designer §27.5bis / §43):
            navy surface, flat gold tile, white title, gold hairline under. */}
        <div className="flex-shrink-0 flex items-center gap-2.5 border-b-2 border-gold bg-primary px-4 py-2.5">
          <div className="h-8 w-8 flex-shrink-0 rounded-lg flex items-center justify-center shadow-sm bg-gold text-gold-foreground">
            <FabricRollIcon className="h-[18px] w-[18px]" />
          </div>
          <div className="min-w-0 flex-1">
            {isLoading || !detail ? (
              <div className="h-5 w-40 bg-white/20 animate-pulse rounded" />
            ) : (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-heading font-bold tracking-tight truncate text-primary-foreground">
                    {detail.ref_ecru ?? '—'}
                  </h2>
                  {!!detail.second_choix && (
                    <Badge variant="outline" className="bg-amber-500/20 text-amber-200 border-amber-400/40 gap-1 text-[10px] py-0">2ᵉ choix</Badge>
                  )}
                  {!!detail.IDLigne_Commande_TRM && (
                    <Badge className="bg-sky-100 text-sky-700 border-sky-200 gap-1 text-[10px] py-0">
                      <Send className="h-2.5 w-2.5" />
                      Affecté
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-white/70 truncate">
                  {detail.coloris_reference ?? '—'}
                  {detail.numero ? ` · N° ${detail.numero}` : ''}
                </p>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Mobile-only close — at full drawer width there is no "outside" left to tap */}
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
              <DrawerCard icon={<Package className="h-4 w-4 text-accent" />} title="Stock">
                <div className="space-y-1.5">
                  <KV
                    label="Poids"
                    value={<span className="font-semibold tabular-nums">{formatKg(detail.poids)}</span>}
                  />
                  {Number(detail.metrage) > 0 && (
                    <KV label="Métrage" value={<span className="tabular-nums">{formatMeters(detail.metrage)}</span>} />
                  )}
                  <KV
                    label="Date saisie"
                    value={detail.date_saisie ? formatHfsqlDate(detail.date_saisie) : '—'}
                  />
                </div>
              </DrawerCard>

              {/* Qualité */}
              <DrawerCard icon={<ShieldAlert className="h-4 w-4 text-accent" />} title="Qualité">
                <div className="space-y-2">
                  <KV
                    label="2ᵉ choix"
                    value={
                      detail.second_choix ? (
                        <span className="text-amber-700 font-medium">Oui</span>
                      ) : (
                        <span className="text-muted-foreground">Non</span>
                      )
                    }
                  />
                  <KV label="Visiteur" value={detail.visiteur?.trim() || '—'} />
                  <KV label="Visitage" value={prod?.date_visitage ? formatDateTime(prod.date_visitage) : '—'} />
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Défauts</p>
                    {detail.defects && detail.defects.length > 0 ? (
                      <ul className="space-y-0.5">
                        {detail.defects.map((d) => (
                          <li key={d.IDdefaut_qualite} className="text-sm text-red-700 flex items-start gap-1.5">
                            <span className="mt-1 h-1 w-1 rounded-full bg-red-500 flex-shrink-0" />
                            <span>
                              {[
                                d.type_defaut?.trim(),
                                d.taille_cm && Number(d.taille_cm) > 0 ? `${Number(d.taille_cm)} cm` : '',
                              ]
                                .filter(Boolean)
                                .join(' ') || d.description?.trim() || 'Défaut'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">Aucun défaut</p>
                    )}
                  </div>
                </div>
              </DrawerCard>

              {/* Production — the TRM equivalent of ETM's Provenance card: here
                  the piece was knitted in-house, so its origin is an OF on a
                  métier rather than a tricoteur's sst commande. */}
              <DrawerCard icon={<Factory className="h-4 w-4 text-accent" />} title="Production">
                <div className="space-y-2.5">
                  {!!prod?.IDordre_fabrication && (
                    <ProvenanceRow
                      icon={<KnitIcon className="h-3.5 w-3.5 text-accent" />}
                      title={`OF N° ${prod.IDordre_fabrication}`}
                      detail={[
                        prod.machine_nom ? `Métier ${prod.machine_nom}` : null,
                        prod.of_nb_pieces ? `${prod.of_nb_pieces} pièces` : null,
                        prod.of_est_termine ? 'Terminé' : 'En cours',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    />
                  )}
                  <div className="space-y-1.5 pt-1.5 border-t border-border/40">
                    <KV
                      label="N° pièce"
                      value={prod?.num_piece ? <span className="tabular-nums">{prod.num_piece}</span> : '—'}
                    />
                    <KV label="Début" value={formatDateTime(prod?.date_debut ?? null)} />
                    <KV label="Fin" value={formatDateTime(prod?.date_fin ?? null)} />
                  </div>
                </div>
              </DrawerCard>

              {/* Réservation client */}
              <DrawerCard icon={<Send className="h-4 w-4 text-accent" />} title="Réservation client">
                <div className="space-y-1.5">
                  <KV
                    label="N° commande"
                    value={
                      detail.commande_numero ? (
                        <span className="tabular-nums">{detail.commande_numero}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )
                    }
                  />
                  <KV label="Client" value={detail.client_nom ?? <span className="text-muted-foreground">—</span>} />
                </div>
              </DrawerCard>

              {/* Notes */}
              <DrawerCard icon={<MessageSquare className="h-4 w-4 text-accent" />} title="Notes">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Observations</p>
                  {detail.observations?.trim() ? (
                    <p className="text-sm whitespace-pre-wrap">{detail.observations.trim()}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">—</p>
                  )}
                </div>
              </DrawerCard>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Drawer card primitives ─────────────────────────────

function DrawerCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card p-3 shadow-sm">
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

// One production origin: a leading icon, a primary label and a muted detail
// line. Mirrors the same component in ETM's TombeMetierStock / FinisStock.
function ProvenanceRow({
  icon,
  title,
  detail,
}: {
  icon: React.ReactNode
  title: string
  detail: string
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="flex-shrink-0 mt-0.5">{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{title}</p>
        {!!detail && <p className="text-[11px] text-muted-foreground truncate">{detail}</p>}
      </div>
    </div>
  )
}
