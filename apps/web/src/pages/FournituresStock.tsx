// Fournitures › Stock (LIVA #1263) — the stock of every material that is not
// yarn — aiguilles and platines for now. Replaces the
// stock half of Nicolas's Google sheet « Stock aiguille » (Quantité; the
// orders per year live in the drawer, not in columns). Tableau layout (mps_designer §27 + §40), same
// toolbar / split table / navy drawer as Fils › Stock.
//
// The stock is a ledger of movements per article and constructeur (API
// routes/fournitures-trm.ts, rules in lib/fournitures-trm.ts):
//   entree     an order received — « Entrée de stock » here;
//   sortie     a set change on a métier — written by Atelier › Maintenance,
//              never here, and never deleted one by one;
//   inventaire a count — « Inventaire » here: the user types what they
//              counted, the API writes the correction.
// One table line = a reference × a constructeur (Nicolas, 2026-10-07); the
// drawer is the whole reference. « Non précisé » = the stock not split by constructeur (the sheet had one
// number per reference); a set change takes from it once the constructeur's
// own stock is used up. A negative stock is allowed (a montage is never
// refused) and shown red: it calls for a count.
//
// Writes under edit_fournitures. Reads come from the shared catalogue query
// (lib/fournitures.ts) — the same payload as Références and the Aiguilles tab.

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  ClipboardCheck,
  Factory,
  History,
  Loader2,
  MessageSquare,
  Package,
  PackagePlus,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { CardKV, MobileSortRow } from '@/components/stock/StockCardParts'
import { SmartSearchInput, filterRowsByChips, type SearchChip } from '@/components/stock/SmartSearchInput'
import { EntreeStockDialog, InventaireDialog } from '@/components/fournitures/StockMouvementDialogs'
import { useHasPermission } from '@/contexts/PermissionsContext'
import { apiFetch } from '@/lib/api'
import { formatHfsqlDate } from '@/lib/dates'
import { fmtNum } from '@/lib/format'
import {
  POSITION_LABEL,
  apiErrorMessage,
  etatStock,
  useCatalogue,
  useSetCatalogue,
  type Article,
  type Catalogue,
  type Mouvement,
  type SeauStock,
} from '@/lib/fournitures'
import { cn } from '@/lib/utils'

// ── Rows ───────────────────────────────────────────────

/** One table row = one stock line (article × constructeur), flattened for
 *  sort / search. */
interface Ligne {
  key: string
  id: number
  idConstructeur: number | null
  constructeur: string | null
  type: string
  idType: number
  reference: string
  commentaire: string | null
  position: string | null
  metiers: string
  /** Stock of this constructeur. */
  stock: number
  /** The REFERENCE's state (total vs one montage) — « À commander » is per reference. */
  etat: 'vide' | 'bas' | 'ok'
  dernier: string | null
}

const cleLigne = (idArticle: number, idConstructeur: number | null) => `${idArticle}:${idConstructeur ?? 'np'}`

function toLignes(a: Article): Ligne[] {
  const etat = etatStock(a)
  return a.stockParConstructeur.map((s: SeauStock) => ({
    key: cleLigne(a.id, s.constructeur?.id ?? null),
    id: a.id,
    idConstructeur: s.constructeur?.id ?? null,
    constructeur: s.constructeur?.nom ?? null,
    type: a.type,
    idType: a.idType,
    reference: a.reference,
    commentaire: a.commentaire,
    position: a.position ? POSITION_LABEL[a.position] : null,
    metiers: a.metiers.map((m) => m.emplacement).join(' '),
    stock: s.stock,
    etat,
    dernier: s.dernierMouvement,
  }))
}

/** A line's stock: red below 0 (a count is due), grey at 0. */
function toneLigne(stock: number): string {
  return stock < 0 ? 'text-destructive' : stock === 0 ? 'text-muted-foreground' : ''
}

const STOCK_TONE: Record<Ligne['etat'], string> = {
  vide: 'text-destructive',
  bas: 'text-amber-700',
  ok: '',
}

// ── Sort ───────────────────────────────────────────────

type SortKey = 'type' | 'reference' | 'constructeur' | 'position' | 'metiers' | 'stock' | 'dernier'

interface SortState {
  key: SortKey
  dir: 'asc' | 'desc'
}

const COLUMNS: { key: SortKey; label: string; width: string; align?: 'left' | 'right' }[] = [
  { key: 'type', label: 'Type', width: '9%' },
  { key: 'reference', label: 'Référence', width: '25%' },
  { key: 'constructeur', label: 'Constructeur', width: '14%' },
  { key: 'position', label: 'Position', width: '9%' },
  { key: 'metiers', label: 'Métiers', width: '20%' },
  { key: 'stock', label: 'Stock', width: '10%', align: 'right' },
  { key: 'dernier', label: 'Dernier mouv.', width: '13%' },
]

function compareRows(a: Ligne, b: Ligne, key: SortKey): number {
  const va = a[key]
  const vb = b[key]
  if ((va == null || va === '') && (vb == null || vb === '')) return 0
  if (va == null || va === '') return 1
  if (vb == null || vb === '') return -1
  if (typeof va === 'number' && typeof vb === 'number') return va - vb
  return String(va).localeCompare(String(vb), 'fr', { numeric: true, sensitivity: 'base' })
}

// ── Field-scoped search chips (§27.2bis) ───────────────

const SEARCH_FIELDS = [
  { key: 'reference', label: 'Référence' },
  { key: 'constructeur', label: 'Constructeur' },
  { key: 'metiers', label: 'Métier' },
  { key: 'commentaire', label: 'Note' },
] as const
type SearchFieldKey = (typeof SEARCH_FIELDS)[number]['key']

function rowHaystacks(r: Ligne): string[] {
  return [r.reference, r.constructeur ?? 'non précisé', r.metiers, r.commentaire, r.type]
    .filter((f): f is string => !!f)
    .map((f) => f.toLowerCase())
}

function fmtDateShort(hf: string | null): string {
  if (!hf || hf.length !== 8) return '—'
  return `${hf.slice(6, 8)}/${hf.slice(4, 6)}/${hf.slice(2, 4)}`
}

// ── Main page ──────────────────────────────────────────

export function FournituresStock() {
  const canEdit = useHasPermission('edit_fournitures')
  const setCatalogue = useSetCatalogue()
  const { data: catalogue, isLoading, isError, error } = useCatalogue()

  const [searchQuery, setSearchQuery] = useState('')
  const [searchChips, setSearchChips] = useState<SearchChip<SearchFieldKey>[]>([])
  const [typeFilter, setTypeFilter] = useState<number | null>(null)
  const [aCommander, setACommander] = useState(false)
  const [sort, setSort] = useState<SortState>({ key: 'reference', dir: 'asc' })
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  // Dialogs live here (not in the drawer) so the toolbar and the drawer share
  // them; `entreeArticle` null = pick the article in the dialog.
  const [entreeOpen, setEntreeOpen] = useState(false)
  const [entreeArticle, setEntreeArticle] = useState<number | null>(null)
  const [entreeConstructeur, setEntreeConstructeur] = useState<number | null>(null)
  const [inventaireOpen, setInventaireOpen] = useState(false)

  const deferredSearch = useDeferredValue(searchQuery)

  const lignes = useMemo(() => (catalogue?.articles ?? []).flatMap(toLignes), [catalogue])
  const articles = useMemo(() => catalogue?.articles ?? [], [catalogue])

  const types = catalogue?.types ?? []
  const countByType = useMemo(() => {
    const out = new Map<number, number>()
    for (const a of articles) out.set(a.idType, (out.get(a.idType) ?? 0) + 1)
    return out
  }, [articles])

  // Counted in REFERENCES: « à commander » is a reference's state, whatever
  // the number of constructeur lines it shows.
  const aCommanderCount = useMemo(
    () => articles.filter((a) => etatStock(a) !== 'ok' && (typeFilter === null || a.idType === typeFilter)).length,
    [articles, typeFilter],
  )
  // §41.4: an armed pill must not survive its bucket emptying.
  const aCommanderActive = aCommander && aCommanderCount > 0

  const filteredSorted = useMemo(() => {
    let out = lignes
    if (typeFilter !== null) out = out.filter((l) => l.idType === typeFilter)
    if (aCommanderActive) out = out.filter((l) => l.etat !== 'ok')
    out = filterRowsByChips(out, searchChips, rowHaystacks)
    const terms = deferredSearch.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length > 0) {
      out = out.filter((r) => {
        const hay = rowHaystacks(r)
        return terms.every((t) => hay.some((h) => h.includes(t)))
      })
    }
    return [...out].sort((a, b) => {
      const cmp = compareRows(a, b, sort.key)
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [lignes, typeFilter, aCommanderActive, searchChips, deferredSearch, sort])

  const handleSort = useCallback((key: SortKey) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }, [])

  const handleRowClick = useCallback((key: string) => {
    setSelectedKey((prev) => (prev === key ? null : key))
  }, [])
  const handleClose = useCallback(() => setSelectedKey(null), [])

  const selectedLigne = useMemo(() => lignes.find((l) => l.key === selectedKey) ?? null, [lignes, selectedKey])
  const selected = useMemo(
    () => (selectedLigne ? (articles.find((a) => a.id === selectedLigne.id) ?? null) : null),
    [articles, selectedLigne],
  )

  const openEntree = (articleId: number | null, idConstructeur: number | null = null) => {
    setEntreeArticle(articleId)
    setEntreeConstructeur(idConstructeur)
    setEntreeOpen(true)
  }
  const nbReferences = useMemo(() => new Set(filteredSorted.map((l) => l.id)).size, [filteredSorted])
  const nbACommander = useMemo(
    () => new Set(filteredSorted.filter((l) => l.etat !== 'ok').map((l) => l.id)).size,
    [filteredSorted],
  )

  const filterBtn = (active: boolean) =>
    cn(
      'px-2.5 py-1 text-xs rounded-md transition-colors whitespace-nowrap',
      active ? 'bg-accent text-accent-foreground shadow-sm font-medium' : 'text-muted-foreground hover:bg-accent/10',
    )

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      {/* Toolbar — search + « à commander » pill, then the type filter; the
          action stays top-right at every width (§40.5). */}
      <div className="flex-shrink-0 flex flex-wrap items-center gap-3">
        <SmartSearchInput<SearchFieldKey>
          className="order-1 flex-1 min-w-0"
          value={searchQuery}
          onValueChange={setSearchQuery}
          chips={searchChips}
          onChipsChange={setSearchChips}
          fields={SEARCH_FIELDS}
          placeholder="Rechercher (référence, métier, note…)"
        />

        <div className="order-3 w-full flex flex-wrap items-center gap-3 sm:contents">
          {types.length > 1 && (
            <div className="flex flex-wrap gap-1 sm:order-2">
              <button type="button" className={filterBtn(typeFilter === null)} onClick={() => setTypeFilter(null)}>
                Tous <span className="tabular-nums opacity-70">{articles.length}</span>
              </button>
              {types.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={filterBtn(typeFilter === t.id)}
                  onClick={() => setTypeFilter(t.id)}
                >
                  {t.nom}s <span className="tabular-nums opacity-70">{countByType.get(t.id) ?? 0}</span>
                </button>
              ))}
            </div>
          )}
          {aCommanderCount > 0 && (
            <button
              type="button"
              onClick={() => setACommander((v) => !v)}
              aria-pressed={aCommanderActive}
              title="Stock vide, négatif ou sous la quantité d'un montage"
              className={cn(
                'h-7 px-2 inline-flex items-center gap-1.5 rounded-md text-xs font-semibold border transition-colors flex-shrink-0 sm:order-2',
                aCommanderActive
                  ? 'bg-red-500 text-white border-red-500 shadow-sm'
                  : 'bg-red-500/10 text-red-700 border-red-500/30 hover:bg-red-500/20',
              )}
            >
              À commander <span className="tabular-nums">{aCommanderCount}</span>
            </button>
          )}
        </div>

        {canEdit && (
          <Button
            size="sm"
            onClick={() => openEntree(null)}
            className="flex-shrink-0 order-2 sm:order-3"
            title="Entrée de stock"
          >
            <Plus className="h-3.5 w-3.5 sm:mr-1" />
            <span className="hidden sm:inline">Entrée de stock</span>
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
            <Package className="h-12 w-12 opacity-30" />
            <p className="text-sm">Aucune référence</p>
          </div>
        ) : (
          <>
            {/* Desktop table (md+) — split header/body sharing one colgroup */}
            <div className="hidden md:flex md:flex-col flex-1 min-h-0">
              <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  {COLUMNS.map((c) => (
                    <col key={c.key} style={{ width: c.width }} />
                  ))}
                </colgroup>
                <thead className="bg-zinc-200/60 border-b border-border/60">
                  <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                    {COLUMNS.map((c) => (
                      <SortHeader key={c.key} label={c.label} sortKey={c.key} sort={sort} onSort={handleSort} align={c.align} />
                    ))}
                  </tr>
                </thead>
              </table>

              <div className="flex-1 min-h-0 overflow-auto scrollbar-transparent">
                <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
                  <colgroup>
                    {COLUMNS.map((c) => (
                      <col key={c.key} style={{ width: c.width }} />
                    ))}
                  </colgroup>
                  <tbody>
                    {filteredSorted.map((r) => (
                      <StockRow key={r.key} row={r} selected={r.key === selectedKey} onRowClick={handleRowClick} />
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
                  <StockCard key={r.key} row={r} selected={r.key === selectedKey} onRowClick={handleRowClick} />
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Totalizer — counts only: needles and platines do not add up. */}
      {!isLoading && !isError && filteredSorted.length > 0 && (
        <div className="flex-shrink-0 flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-zinc-100/80 shadow-sm px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm">
            <Package className="h-4 w-4 text-accent" />
            <span className="font-semibold">{nbReferences}</span>
            <span className="text-muted-foreground">référence{nbReferences > 1 ? 's' : ''}</span>
            {filteredSorted.length !== nbReferences && (
              <span className="text-muted-foreground">· {filteredSorted.length} lignes</span>
            )}
          </div>
          <div className="flex items-baseline gap-2 text-sm">
            <span className="hidden sm:inline text-xs uppercase tracking-wide text-muted-foreground">À commander</span>
            <span className={cn('font-bold tabular-nums', aCommanderCount > 0 && 'text-destructive')}>
              {nbACommander}
            </span>
          </div>
        </div>
      )}

      <StockDrawer
        article={selected}
        idConstructeur={selectedLigne?.idConstructeur ?? null}
        open={selectedKey !== null}
        canEdit={canEdit}
        dialogOpen={entreeOpen || inventaireOpen}
        onClose={handleClose}
        onEntree={() => selected && openEntree(selected.id, selectedLigne?.idConstructeur ?? null)}
        onInventaire={() => setInventaireOpen(true)}
        onCatalogue={setCatalogue}
      />

      <EntreeStockDialog
        open={entreeOpen}
        onOpenChange={setEntreeOpen}
        catalogue={catalogue}
        articleId={entreeArticle}
        idConstructeur={entreeConstructeur}
        onDone={(res, idArticle, idConstructeur) => {
          setCatalogue(res)
          // Open the line just stocked, so the entry is seen.
          setSelectedKey(cleLigne(idArticle, idConstructeur))
        }}
      />

      <InventaireDialog
        open={inventaireOpen}
        onOpenChange={setInventaireOpen}
        catalogue={catalogue}
        article={selected}
        idConstructeur={selectedLigne?.idConstructeur ?? null}
        onDone={setCatalogue}
      />
    </div>
  )
}

// ── Sort header cell ───────────────────────────────────

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = 'left',
}: {
  label: string
  sortKey: SortKey
  sort: SortState
  onSort: (k: SortKey) => void
  align?: 'left' | 'right'
}) {
  const active = sort.key === sortKey
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={cn(
        'px-3 py-2.5 font-semibold cursor-pointer select-none whitespace-nowrap',
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

// ── Table row ──────────────────────────────────────────

function StockRow({ row: r, selected, onRowClick }: { row: Ligne; selected: boolean; onRowClick: (key: string) => void }) {
  return (
    <tr
      data-stock-row
      onClick={() => onRowClick(r.key)}
      className={cn('border-b border-border/40 cursor-pointer transition-colors', selected ? 'bg-accent/10' : 'hover:bg-accent/5')}
    >
      <td className="px-3 py-1.5 truncate text-muted-foreground">{r.type}</td>
      <td className="px-3 py-1.5 min-w-0">
        <p className="font-medium truncate tabular-nums" title={r.reference}>
          {r.reference}
        </p>
        {r.commentaire && (
          <p className="text-[11px] text-amber-700 truncate" title={r.commentaire}>
            {r.commentaire}
          </p>
        )}
      </td>
      <td className="px-3 py-1.5 truncate">
        {r.constructeur ?? <span className="italic text-muted-foreground">Non précisé</span>}
      </td>
      <td className="px-3 py-1.5 truncate">{r.position ?? '—'}</td>
      <td className="px-3 py-1.5 truncate text-muted-foreground" title={r.metiers || undefined}>
        {r.metiers || '—'}
      </td>
      <td className={cn('px-3 py-1.5 text-right tabular-nums font-semibold whitespace-nowrap', toneLigne(r.stock))}>
        {fmtNum(r.stock)}
      </td>
      <td className="px-3 py-1.5 tabular-nums text-muted-foreground whitespace-nowrap truncate">{fmtDateShort(r.dernier)}</td>
    </tr>
  )
}

// ── Mobile card ────────────────────────────────────────

function StockCard({ row, selected, onRowClick }: { row: Ligne; selected: boolean; onRowClick: (key: string) => void }) {
  return (
    <div
      data-stock-row
      onClick={() => onRowClick(row.key)}
      className={cn(
        'rounded-lg border p-3 cursor-pointer transition-colors shadow-sm',
        selected ? 'bg-accent/10 border-accent ring-1 ring-accent' : 'bg-white border-border/60 hover:border-accent/40',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium truncate tabular-nums">{row.reference}</p>
        <span className={cn('text-sm font-semibold tabular-nums flex-shrink-0', toneLigne(row.stock))}>{fmtNum(row.stock)}</span>
      </div>
      <p className="text-xs text-muted-foreground mt-0.5 truncate">
        {[row.constructeur ?? 'Non précisé', row.type, row.position].filter(Boolean).join(' · ')}
      </p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2">
        <CardKV label="Métiers" value={row.metiers || '—'} />
        <CardKV label="Dernier mouv." value={fmtDateShort(row.dernier)} mono />
      </div>
      {row.commentaire && <p className="text-[11px] text-amber-700 mt-2 truncate">{row.commentaire}</p>}
    </div>
  )
}

// ── Side drawer ────────────────────────────────────────

function StockDrawer({
  article,
  idConstructeur,
  open,
  canEdit,
  dialogOpen,
  onClose,
  onEntree,
  onInventaire,
  onCatalogue,
}: {
  article: Article | null
  /** The constructeur of the line clicked — highlighted in the Stock card. */
  idConstructeur: number | null
  open: boolean
  canEdit: boolean
  /** A stock dialog is up: it renders in a portal, so outside-click must wait. */
  dialogOpen: boolean
  onClose: () => void
  onEntree: () => void
  onInventaire: () => void
  onCatalogue: (cat: Partial<Catalogue> | undefined) => void
}) {
  const drawerRef = useRef<HTMLDivElement>(null)
  const [searchParams] = useSearchParams()
  const embed = searchParams.get('embed') === 'true'
  const [aSupprimer, setASupprimer] = useState<Mouvement | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const articleId = article?.id ?? null
  const mouvementsQuery = useQuery<{ mouvements: Mouvement[] }>({
    queryKey: ['fournitures-trm-mouvements', articleId],
    queryFn: () => apiFetch(`/fournitures-trm/articles/${articleId}/mouvements`),
    enabled: articleId !== null,
  })

  useEffect(() => {
    setASupprimer(null)
    setDeleteError(null)
  }, [articleId])

  useEffect(() => {
    if (!open || dialogOpen || aSupprimer) return
    function handleMouseDown(e: MouseEvent) {
      const target = e.target as Node | null
      if (!target) return
      if (drawerRef.current?.contains(target)) return
      if ((target as Element).closest?.('[data-stock-row]')) return
      onClose()
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [open, dialogOpen, aSupprimer, onClose])

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch<Partial<Catalogue>>(`/fournitures-trm/mouvements/${id}`, { method: 'DELETE' }),
    onSuccess: (res) => {
      setASupprimer(null)
      onCatalogue(res)
    },
    onError: (e) => setDeleteError(apiErrorMessage(e, 'La suppression a échoué. Réessayez.')),
  })

  const annees = useMemo(() => {
    const entries = Object.entries(article?.commandesParAnnee ?? {}).sort(([a], [b]) => b.localeCompare(a))
    const max = Math.max(1, ...entries.map(([, q]) => q))
    return { entries, max }
  }, [article])

  const etat = article ? etatStock(article) : 'ok'
  const subtitle = article
    ? [article.type, article.position ? POSITION_LABEL[article.position] : null, article.metiers.map((m) => m.emplacement).join(' ') || null]
        .filter(Boolean)
        .join(' · ')
    : ''

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
        {/* Header band — widget treatment (mps_designer §27.5bis / §43) */}
        <div className="flex-shrink-0 flex items-center gap-2.5 border-b-2 border-gold bg-primary px-4 py-2.5">
          <div className="h-8 w-8 flex-shrink-0 rounded-lg flex items-center justify-center shadow-sm bg-gold text-gold-foreground">
            <Package className="h-[18px] w-[18px]" />
          </div>
          <div className="min-w-0 flex-1">
            {!article ? (
              <div className="h-5 w-40 bg-white/20 animate-pulse rounded" />
            ) : (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-heading font-bold tracking-tight truncate text-primary-foreground tabular-nums">
                    {article.reference}
                  </h2>
                  {etat !== 'ok' && (
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-0 text-[10px] font-medium border',
                        etat === 'vide' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-amber-100 text-amber-800 border-amber-200',
                      )}
                    >
                      {etat === 'vide' ? 'Stock épuisé' : 'Stock bas'}
                    </span>
                  )}
                </div>
                <p className="text-xs text-white/70 truncate">{subtitle}</p>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {article && canEdit && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-white/80 hover:bg-white/15 hover:text-white"
                  title="Entrée de stock"
                  onClick={onEntree}
                >
                  <PackagePlus className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-white/80 hover:bg-white/15 hover:text-white"
                  title="Inventaire"
                  onClick={onInventaire}
                >
                  <ClipboardCheck className="h-4 w-4" />
                </Button>
              </>
            )}
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

        {article && (
          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 scrollbar-transparent">
            {/* Stock by constructeur */}
            <DrawerCard icon={<Package className="h-4 w-4 text-accent" />} title="Stock">
              <div className="space-y-1">
                <KV
                  label="Total"
                  value={<span className={cn('font-semibold', STOCK_TONE[etat])}>{fmtNum(article.stock)}</span>}
                  mono
                />
                {article.stockParConstructeur.length > 0 && (
                  <div className="pt-1.5 mt-1.5 border-t border-border/50 space-y-1">
                    {article.stockParConstructeur.map((s) => {
                      const courant = (s.constructeur?.id ?? null) === idConstructeur
                      return (
                        <div
                          key={s.constructeur?.id ?? 'np'}
                          className={cn('-mx-1.5 px-1.5 rounded', courant && 'bg-accent/15')}
                        >
                          <KV
                            label={s.constructeur?.nom ?? 'Non précisé'}
                            value={<span className={cn(s.stock < 0 && 'text-destructive font-medium')}>{fmtNum(s.stock)}</span>}
                            mono
                          />
                        </div>
                      )
                    })}
                  </div>
                )}
                {article.stock < 0 && (
                  <p className="text-[11px] text-destructive pt-1">
                    Stock négatif : les montages ont dépassé le stock enregistré — un inventaire le corrige.
                  </p>
                )}
              </div>
            </DrawerCard>

            {/* Métiers — the quantity a montage takes, what is mounted */}
            {article.metiers.length > 0 && (
              <DrawerCard icon={<Factory className="h-4 w-4 text-accent" />} title="Métiers">
                <div className="space-y-1">
                  {article.metiers.map((m) => (
                    <KV
                      key={m.id}
                      label={m.emplacement}
                      value={
                        <span className="text-xs">
                          {m.monte?.nom ?? <span className="italic text-muted-foreground">constructeur ?</span>}
                          <span className="text-muted-foreground">
                            {' · '}
                            {m.quantite != null ? `${fmtNum(m.quantite)} / montage` : 'quantité non saisie'}
                          </span>
                        </span>
                      }
                    />
                  ))}
                </div>
              </DrawerCard>
            )}

            {/* Orders per year */}
            <DrawerCard icon={<BarChart3 className="h-4 w-4 text-accent" />} title="Commandes par année">
              {annees.entries.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Aucune entrée enregistrée.</p>
              ) : (
                <div className="space-y-1.5">
                  {annees.entries.map(([annee, q]) => (
                    <div key={annee} className="grid grid-cols-[3rem_minmax(0,1fr)_4rem] items-center gap-2">
                      <span className="text-xs text-muted-foreground tabular-nums">{annee}</span>
                      <div className="h-2 rounded-full bg-zinc-200/80 overflow-hidden">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${(q / annees.max) * 100}%` }} />
                      </div>
                      <span className="text-sm text-right tabular-nums">{fmtNum(q)}</span>
                    </div>
                  ))}
                </div>
              )}
            </DrawerCard>

            {article.commentaire && (
              <DrawerCard icon={<MessageSquare className="h-4 w-4 text-accent" />} title="Note">
                <p className="text-sm text-amber-800 whitespace-pre-line">{article.commentaire}</p>
              </DrawerCard>
            )}

            {/* Movements */}
            <DrawerCard icon={<History className="h-4 w-4 text-accent" />} title="Mouvements">
              {mouvementsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Chargement…
                </p>
              ) : mouvementsQuery.isError ? (
                <p className="text-sm text-destructive">Impossible de charger les mouvements.</p>
              ) : (mouvementsQuery.data?.mouvements.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground italic">Aucun mouvement.</p>
              ) : (
                <div className="divide-y divide-border/50 -mx-1">
                  {mouvementsQuery.data!.mouvements.map((m) => (
                    <MouvementRow
                      key={m.id}
                      m={m}
                      onDelete={canEdit && m.type !== 'sortie' ? () => setASupprimer(m) : undefined}
                    />
                  ))}
                </div>
              )}
            </DrawerCard>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={aSupprimer !== null}
        title="Supprimer le mouvement"
        description={
          aSupprimer
            ? `Supprimer ${aSupprimer.type === 'entree' ? "l'entrée" : "l'inventaire"} du ${
                aSupprimer.date ? formatHfsqlDate(aSupprimer.date) : '—'
              } (${aSupprimer.quantite > 0 ? '+' : ''}${fmtNum(aSupprimer.quantite)}) ? Le stock est recalculé sans lui.`
            : undefined
        }
        confirmLabel="Supprimer"
        isPending={deleteMut.isPending}
        error={deleteError}
        onCancel={() => {
          setASupprimer(null)
          setDeleteError(null)
        }}
        onConfirm={() => {
          if (aSupprimer) {
            setDeleteError(null)
            deleteMut.mutate(aSupprimer.id)
          }
        }}
      />
    </div>
  )
}

function MouvementRow({ m, onDelete }: { m: Mouvement; onDelete?: () => void }) {
  const qui = m.type === 'sortie' ? (m.metier ? `Métier ${m.metier}` : null) : m.fournisseur
  return (
    <div className="group px-1 py-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm">
          <span className="font-medium">{m.libelle}</span>
          {m.constructeur && <span className="text-muted-foreground"> · {m.constructeur}</span>}
        </span>
        <span className="flex items-center gap-1 flex-shrink-0">
          <span
            className={cn(
              'text-sm tabular-nums font-semibold',
              m.quantite > 0 ? 'text-green-700' : m.quantite < 0 ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {m.quantite > 0 ? '+' : ''}
            {fmtNum(m.quantite)}
          </span>
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
              title="Supprimer ce mouvement"
              onClick={onDelete}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {[m.date ? formatHfsqlDate(m.date) : null, qui, m.saisiPar ? `saisi par ${m.saisiPar}` : null]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {m.commentaire && <p className="text-[11px] text-muted-foreground italic">{m.commentaire}</p>}
    </div>
  )
}

// ── Drawer card primitives (same as Fils › Stock) ──────

function DrawerCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
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
