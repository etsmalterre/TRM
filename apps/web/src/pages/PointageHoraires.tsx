import { useState, useMemo, useCallback, useEffect, useRef, useDeferredValue, memo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Clock,
  Search,
  Loader2,
  AlertCircle,
  X,
  Plus,
  Pencil,
  Save,
  Trash2,
  CalendarDays,
  Coffee,
  Timer,
  MoonStar,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PopoverSelect, type PopoverSelectOption } from '@/components/ui/popover-select'
import { CardKV, MobileSortRow } from '@/components/stock/StockCardParts'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { UnsavedChangesDialog } from '@/components/shared/UnsavedChangesDialog'
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard'
import { useIsDesktop } from '@/hooks/useIsDesktop'
import { useHasPermission } from '@/contexts/PermissionsContext'
import { cn } from '@/lib/utils'
import {
  COLONNES_HEURE,
  corrigerHoraire,
  creerHoraire,
  fetchEnPoste,
  fetchHoraires,
  fetchSalariesAdmin,
  messageErreur,
  msDe,
  supprimerHoraire,
  type ColonneHeure,
  type Horaire,
  type SaisieHeures,
  type SalarieAdmin,
} from '@/lib/pointage-admin'
import {
  PERIODES,
  bornesPeriode,
  dureeHM,
  heure,
  heureSaisie,
  inputVersJour,
  jourCourt,
  jourDe,
  jourLong,
  jourVersInput,
  type Periode,
} from '@/lib/pointage-heures'
import { DrawerCard, ErreurNote, INPUT_KV, KV, SortHeader, SyncNote, nomComplet, type SortState } from '@/components/pointage/parts'

// Pointage › Horaires — the office's grid of shifts, port of the WinDev Admin
// Pointage's FEN_Accueil (the « En poste » board) + FEN_Horaires (the editable
// grid) + FEN_Nouvel_horaire (plan ~/.claude/plans/admin-pointage.md § 7).
// Table-centric « Tableau » layout (mps_designer §27) with a right drawer.
//
// One row = one `lst_horaire` line: a salarié's shift on its day, six stamps
// (start, two pauses, end). The legacy listed the whole history newest first;
// here the toolbar picks a period (or the open shifts, whatever their day).
// Reading needs view_pointage; « Nouveau », « Modifier » and « Supprimer »
// hang on edit_pointage. A correction is typed as « HH:MM » and PLACED BY THE
// SERVER: an hour not after the start goes to the next day (the legacy
// after-midnight rule) and the stamps must stay in order — the refusal comes
// back as a French sentence shown in the drawer. Every correction also moves
// the lst_pointage twin and the TRS presence journal (decision A, 2026-09-21).

type SortKey = 'jour' | 'salarie' | 'debut' | 'pause1' | 'pause2' | 'fin' | 'pauses' | 'presence' | 'etat'

const COLUMNS: { key: SortKey; label: string; width: string; align?: 'left' | 'right' }[] = [
  { key: 'jour', label: 'Date', width: '12%' },
  { key: 'salarie', label: 'Salarié', width: '20%' },
  { key: 'debut', label: 'Début', width: '9%' },
  { key: 'pause1', label: 'Pause 1', width: '13%' },
  { key: 'pause2', label: 'Pause 2', width: '13%' },
  { key: 'fin', label: 'Fin', width: '9%' },
  { key: 'pauses', label: 'Pauses', width: '8%', align: 'right' },
  { key: 'presence', label: 'Présence', width: '8%', align: 'right' },
  { key: 'etat', label: '', width: '8%' },
]

/** What the table shows — ONE dropdown (Vincent, 2026-09-22): « Maintenant »
 *  (every open shift, whatever its day, the legacy FEN_Accueil board — the
 *  default) or a period of the shift grid. */
type Vue = 'maintenant' | Periode
const VUES: { id: Vue; libelle: string }[] = [{ id: 'maintenant', libelle: 'Maintenant' }, ...PERIODES]
const VUE_OPTIONS: PopoverSelectOption[] = VUES.map((v, i) => ({ id: i + 1, primary: v.libelle }))

const n = (v: number | null) => v ?? -1
function compareRows(a: Horaire, b: Horaire, key: SortKey): number {
  switch (key) {
    case 'jour':
      return a.jour.localeCompare(b.jour) || n(a.debutMs) - n(b.debutMs)
    case 'salarie':
      return nomComplet(a.salarie).localeCompare(nomComplet(b.salarie), 'fr') || n(a.debutMs) - n(b.debutMs)
    case 'debut':
      return n(a.debutMs) - n(b.debutMs)
    case 'pause1':
      return n(a.debutPause1Ms) - n(b.debutPause1Ms)
    case 'pause2':
      return n(a.debutPause2Ms) - n(b.debutPause2Ms)
    case 'fin':
      return n(a.finMs) - n(b.finMs)
    case 'pauses':
      return a.pausesMin - b.pausesMin
    case 'presence':
      return n(a.presenceMin) - n(b.presenceMin)
    case 'etat':
      return rangEtat(a) - rangEtat(b)
  }
}

const QK = ['pointage-admin'] as const

export function PointageHoraires() {
  const [searchQuery, setSearchQuery] = useState('')
  const [vue, setVue] = useState<Vue>('maintenant')
  const aujourdhui = useMemo(() => jourDe(Date.now()), [])
  const [perso, setPerso] = useState(() => bornesPeriode('semaine', aujourdhui))
  const [sort, setSort] = useState<SortState<SortKey>>({ key: 'jour', dir: 'desc' })
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const isDesktop = useIsDesktop()
  const canEdit = useHasPermission('edit_pointage')

  const maintenant = vue === 'maintenant'
  const bornes = vue === 'maintenant' ? null : vue === 'perso' ? perso : bornesPeriode(vue, aujourdhui)

  const { data: salaries } = useQuery({ queryKey: [...QK, 'salaries'], queryFn: fetchSalariesAdmin })
  const horaires = useQuery({
    queryKey: [...QK, 'horaires', bornes?.du, bornes?.au],
    queryFn: () => fetchHoraires(bornes!.du, bornes!.au, 0),
    enabled: bornes !== null,
  })
  const enPoste = useQuery({
    queryKey: [...QK, 'en-poste'],
    queryFn: fetchEnPoste,
    enabled: maintenant,
    refetchInterval: maintenant ? 60_000 : false,
  })
  const source = maintenant ? enPoste : horaires
  // No salarié dropdown (Vincent, 2026-09-22): the search bar is the filter —
  // seven people, three letters find one, former ones included.
  const rows = useMemo(() => source.data?.lignes ?? [], [source.data])

  const deferredSearch = useDeferredValue(searchQuery)
  const filteredSorted = useMemo(() => {
    let out = rows
    const terms = deferredSearch.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length > 0) {
      out = out.filter((r) => {
        const hay = `${r.salarie.nom} ${r.salarie.prenom}`.toLowerCase()
        return terms.every((t) => hay.includes(t))
      })
    }
    return [...out].sort((a, b) => {
      const cmp = compareRows(a, b, sort.key)
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [rows, deferredSearch, sort])

  const handleSort = useCallback((key: SortKey) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }, [])

  // Drawer dirty tracking (§28.3.c): the drawer owns its draft, the page guard
  // saves or discards it before a row switch, a dismissal or a route change.
  const [drawerDirty, setDrawerDirty] = useState(false)
  const drawerSaveRef = useRef<() => Promise<void>>(async () => {})
  const drawerDiscardRef = useRef<() => void>(() => {})
  const guard = useUnsavedGuard({
    isDirty: drawerDirty,
    save: async () => { await drawerSaveRef.current() },
    onDiscard: () => drawerDiscardRef.current(),
  })
  const handleClose = useCallback(() => guard.guardAction(() => setSelectedId(null)), [guard.guardAction])
  const handleRowClick = useCallback(
    (id: number) => guard.guardAction(() => setSelectedId((prev) => (prev === id ? null : id))),
    [guard.guardAction],
  )

  const selected = useMemo(() => filteredSorted.find((r) => r.id === selectedId) ?? rows.find((r) => r.id === selectedId) ?? null, [filteredSorted, rows, selectedId])

  /** A shift created outside the shown view would vanish: move the view to its day. */
  const handleCreated = useCallback((h: Horaire) => {
    const visible = bornes === null ? h.ouverte : h.jour >= bornes.du && h.jour <= bornes.au
    if (!visible) {
      setVue('perso')
      setPerso({ du: h.jour, au: h.jour })
    }
    setSelectedId(h.id)
  }, [bornes])

  const isLoading = source.isLoading || (!maintenant && horaires.isFetching && !horaires.data)
  const isError = source.isError
  const error = source.error

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      {/* Toolbar — search on row 1 with Nouveau; the display, period and
          salarié controls take a full-width row below sm (§40.5 wrapper). */}
      <div className="flex-shrink-0 flex flex-wrap items-center gap-3">
        <div className="relative order-1 flex-1 min-w-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher un salarié (nom, prénom)…"
            className="h-9 w-full pl-8 pr-3 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="order-3 w-full flex flex-wrap items-center gap-3 sm:contents">
          <div className="w-44 flex-shrink-0 sm:order-2">
            <PopoverSelect
              options={VUE_OPTIONS}
              value={VUES.findIndex((v) => v.id === vue) + 1}
              onChange={(v) => {
                const next = VUES[v - 1]?.id ?? 'maintenant'
                // « Personnaliser » starts from the period on screen, or this week
                if (next === 'perso') setPerso(bornes ?? bornesPeriode('semaine', aujourdhui))
                setVue(next)
              }}
              hideEmpty
            />
          </div>
          {vue === 'perso' && (
                <div className="flex items-center gap-1.5 flex-shrink-0 sm:order-4">
                  <input
                    type="date"
                    value={jourVersInput(perso.du)}
                    onChange={(e) => e.target.value && setPerso((p) => ({ ...p, du: inputVersJour(e.target.value) }))}
                    className="h-9 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <span className="text-xs text-muted-foreground">au</span>
                  <input
                    type="date"
                    value={jourVersInput(perso.au)}
                    onChange={(e) => e.target.value && setPerso((p) => ({ ...p, au: inputVersJour(e.target.value) }))}
                    className="h-9 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
          )}
        </div>

        {canEdit && (
          <Button size="sm" onClick={() => setCreateOpen(true)} className="order-2 sm:order-6 flex-shrink-0" title="Nouvel horaire">
            <Plus className="h-3.5 w-3.5 sm:mr-1" />
            <span className="hidden sm:inline">Nouvel horaire</span>
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
            <p className="text-sm">{(error as { status?: number })?.status === 403 ? 'Accès restreint : le droit « Consulter le pointage » est nécessaire.' : (error as Error)?.message || 'Erreur de chargement'}</p>
          </div>
        ) : filteredSorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <Clock className="h-12 w-12 opacity-30" />
            <p className="text-sm">{maintenant ? 'Personne en poste' : 'Aucun poste sur cette période'}</p>
          </div>
        ) : (
          <>
            {isDesktop && (
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
                        <HoraireRow key={r.id} row={r} selected={r.id === selectedId} onRowClick={handleRowClick} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {!isDesktop && (
              <div className="md:hidden flex-1 min-h-0 flex flex-col">
                <MobileSortRow columns={COLUMNS.filter((c) => c.label)} sort={sort} onSortChange={setSort} />
                <div className="flex-1 min-h-0 overflow-y-auto scrollbar-transparent p-2 space-y-2 bg-zinc-100/80">
                  {filteredSorted.map((r) => (
                    <HoraireCard key={r.id} row={r} selected={r.id === selectedId} onRowClick={handleRowClick} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Totalizer over the visible rows */}
      {!isLoading && !isError && filteredSorted.length > 0 && (
        <Totaux rows={filteredSorted} />
      )}

      <HoraireDrawer
        row={selected}
        canEdit={canEdit}
        onClose={handleClose}
        onDirtyChange={setDrawerDirty}
        saveRef={drawerSaveRef}
        discardRef={drawerDiscardRef}
      />

      <NouvelHoraireDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        salaries={(salaries ?? []).filter((s) => !s.supprime)}
        aujourdhui={aujourdhui}
        onCreated={handleCreated}
      />

      <UnsavedChangesDialog open={guard.showDialog} onAction={guard.handleAction} isSaving={guard.isSaving} />
    </div>
  )
}

// ── Cells ──────────────────────────────────────────────

/** A pause as a pill (Vincent, 2026-09-22 — more readable than two times in
 *  muted text): zinc when finished, amber while running (« 10:00 – … », the
 *  tablet's colour for « En pause »), a muted dash when not taken. */
function PausePill({ debutMs, finMs, posteFerme }: { debutMs: number | null; finMs: number | null; posteFerme: boolean }) {
  if (debutMs == null) return <span className="text-muted-foreground">—</span>
  const sansFin = finMs == null
  // A pause with no end on a CLOSED shift is not « in progress », it is a hole
  // in the data (the API now refuses to write one; old rows may carry it).
  const anomalie = sansFin && posteFerme
  return (
    <span
      title={anomalie ? 'Pause sans fin enregistrée alors que le poste est fermé' : undefined}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs tabular-nums whitespace-nowrap',
        anomalie
          ? 'bg-red-500/10 text-red-800 border-red-500/30'
          : sansFin
            ? 'bg-amber-500/15 text-amber-800 border-amber-500/30'
            : 'bg-zinc-100 text-zinc-700 border-zinc-300/70',
      )}
    >
      {heure(debutMs)}
      <span className={anomalie ? 'text-red-800/60' : sansFin ? 'text-amber-800/60' : 'text-zinc-400'}>–</span>
      {anomalie ? '?' : sansFin ? '…' : heure(finMs)}
    </span>
  )
}

/** `surNavy`: inside the drawer's navy band the pastel chip loses its text —
 *  the §27.5bis neutral white chip carries the words there, the colour is on
 *  the row anyway. */
type Etat = 'non_ferme' | 'en_pause' | 'en_poste' | null

/** The state of an open shift, the tablet's words: on a break when a pause has
 *  started and not ended; forgotten (> 14 h) wins over both. */
function etatDe(row: Horaire): Etat {
  if (row.nonFermee) return 'non_ferme'
  if (!row.ouverte) return null
  const enPause = (row.debutPause1Ms != null && row.finPause1Ms == null) || (row.debutPause2Ms != null && row.finPause2Ms == null)
  return enPause ? 'en_pause' : 'en_poste'
}
const RANG_ETAT: Record<NonNullable<Etat>, number> = { en_poste: 1, en_pause: 2, non_ferme: 3 }
const rangEtat = (row: Horaire) => { const e = etatDe(row); return e ? RANG_ETAT[e] : 0 }

const ETAT_LIBELLE: Record<NonNullable<Etat>, string> = { non_ferme: 'Non fermé', en_pause: 'En pause', en_poste: 'En poste' }
const ETAT_CLAIR: Record<NonNullable<Etat>, string> = {
  non_ferme: 'bg-red-500/15 text-red-800 border-red-500/30',
  en_pause: 'bg-amber-500/15 text-amber-800 border-amber-500/30',
  en_poste: 'bg-emerald-500/15 text-emerald-800 border-emerald-500/30',
}
const ETAT_NAVY: Record<NonNullable<Etat>, string> = {
  non_ferme: 'border-red-300/60 bg-red-500/40 text-white',
  en_pause: 'border-amber-300/60 bg-amber-500/40 text-white',
  en_poste: 'border-white/25 bg-white/15 text-white',
}

function EtatBadge({ row, surNavy }: { row: Horaire; surNavy?: boolean }) {
  const etat = etatDe(row)
  if (!etat) return null
  if (surNavy) {
    return (
      <span className={cn('rounded-full border px-1.5 py-0 text-[10px] font-medium whitespace-nowrap', ETAT_NAVY[etat])}>
        {ETAT_LIBELLE[etat]}
      </span>
    )
  }
  return (
    <Badge variant="outline" className={cn('text-[10px] py-0', ETAT_CLAIR[etat])}>
      {ETAT_LIBELLE[etat]}
    </Badge>
  )
}

const HoraireRow = memo(function HoraireRow({ row, selected, onRowClick }: { row: Horaire; selected: boolean; onRowClick: (id: number) => void }) {
  return (
    <tr
      data-stock-row
      onClick={() => onRowClick(row.id)}
      className={cn('border-b border-border/40 cursor-pointer transition-colors', selected ? 'bg-accent/10' : 'hover:bg-accent/5')}
    >
      <td className="px-2 py-2 tabular-nums truncate">{jourCourt(row.jour)}</td>
      <td className={cn('px-2 py-2 font-medium truncate', row.salarie.supprime && 'text-muted-foreground line-through')} title={nomComplet(row.salarie)}>
        {nomComplet(row.salarie)}
      </td>
      <td className="px-2 py-2 tabular-nums">{heure(row.debutMs)}</td>
      <td className="px-2 py-1.5 truncate"><PausePill debutMs={row.debutPause1Ms} finMs={row.finPause1Ms} posteFerme={!row.ouverte} /></td>
      <td className="px-2 py-1.5 truncate"><PausePill debutMs={row.debutPause2Ms} finMs={row.finPause2Ms} posteFerme={!row.ouverte} /></td>
      <td className="px-2 py-2 tabular-nums">{heure(row.finMs)}</td>
      <td className="px-2 py-2 tabular-nums text-right text-muted-foreground">{row.pausesMin > 0 ? `${row.pausesMin} min` : '—'}</td>
      <td className="px-2 py-2 tabular-nums text-right font-medium">{dureeHM(row.presenceMin)}</td>
      <td className="px-2 py-2">
        <EtatBadge row={row} />
      </td>
    </tr>
  )
})

const HoraireCard = memo(function HoraireCard({ row, selected, onRowClick }: { row: Horaire; selected: boolean; onRowClick: (id: number) => void }) {
  return (
    <div
      data-stock-row
      onClick={() => onRowClick(row.id)}
      className={cn(
        'rounded-lg border p-3 cursor-pointer transition-colors shadow-sm',
        selected ? 'bg-accent/10 border-accent ring-1 ring-accent' : 'bg-white border-border/60 hover:border-accent/40',
      )}
    >
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium truncate flex-1 min-w-0">{nomComplet(row.salarie)}</p>
        <EtatBadge row={row} />
      </div>
      <p className="text-xs text-muted-foreground mt-0.5">{jourLong(row.jour)}</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2">
        <CardKV label="Début" value={heure(row.debutMs)} mono strong />
        <CardKV label="Fin" value={heure(row.finMs)} mono strong />
        <CardKV label="Pause 1" value={<PausePill debutMs={row.debutPause1Ms} finMs={row.finPause1Ms} posteFerme={!row.ouverte} />} />
        <CardKV label="Pause 2" value={<PausePill debutMs={row.debutPause2Ms} finMs={row.finPause2Ms} posteFerme={!row.ouverte} />} />
        <CardKV label="Pauses" value={row.pausesMin > 0 ? `${row.pausesMin} min` : '—'} mono />
        <CardKV label="Présence" value={dureeHM(row.presenceMin)} mono />
      </div>
    </div>
  )
})

function Totaux({ rows }: { rows: Horaire[] }) {
  const fermes = rows.filter((r) => r.presenceMin != null)
  const presence = fermes.reduce((s, r) => s + (r.presenceMin ?? 0), 0)
  const pauses = fermes.reduce((s, r) => s + r.pausesMin, 0)
  const ouverts = rows.length - fermes.length
  return (
    <div className="flex-shrink-0 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-zinc-100/80 shadow-sm px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Clock className="h-4 w-4 text-accent" />
        <span className="font-semibold">{rows.length}</span>
        <span className="text-muted-foreground">poste{rows.length > 1 ? 's' : ''}</span>
        {ouverts > 0 && <span className="text-muted-foreground">· {ouverts} en cours</span>}
      </div>
      <div className="flex items-baseline gap-3 sm:gap-5">
        <div className="flex items-baseline gap-1.5">
          <span className="hidden sm:inline text-xs uppercase tracking-wide text-muted-foreground whitespace-nowrap">Présence</span>
          <span className="text-sm sm:text-base font-bold tabular-nums whitespace-nowrap">{dureeHM(presence)}</span>
        </div>
        <div className="flex items-baseline gap-1.5 border-l border-border/60 pl-3 sm:pl-5">
          <span className="hidden sm:inline text-xs uppercase tracking-wide text-muted-foreground whitespace-nowrap">Hors pauses</span>
          <span className="text-sm sm:text-base font-bold tabular-nums whitespace-nowrap">{dureeHM(presence - pauses)}</span>
        </div>
      </div>
    </div>
  )
}

// ── Drawer ─────────────────────────────────────────────

const LIBELLE_COLONNE: Record<ColonneHeure, string> = {
  debut: 'Début',
  debut_pause1: 'Début pause 1',
  fin_pause1: 'Fin pause 1',
  debut_pause2: 'Début pause 2',
  fin_pause2: 'Fin pause 2',
  fin: 'Fin',
}

type Draft = Record<ColonneHeure, string>
const draftDe = (h: Horaire): Draft =>
  Object.fromEntries(COLONNES_HEURE.map((c) => [c, heureSaisie(msDe(h, c))])) as Draft

/** Only the hours that changed; '' → null (cleared). */
function diffDraft(draft: Draft, original: Draft): SaisieHeures {
  const out: SaisieHeures = {}
  for (const c of COLONNES_HEURE) if (draft[c] !== original[c]) out[c] = draft[c] === '' ? null : draft[c]
  return out
}

interface DrawerProps {
  row: Horaire | null
  canEdit: boolean
  onClose: () => void
  onDirtyChange: (dirty: boolean) => void
  saveRef: React.MutableRefObject<() => Promise<void>>
  discardRef: React.MutableRefObject<() => void>
}

function HoraireDrawer({ row, canEdit, onClose, onDirtyChange, saveRef, discardRef }: DrawerProps) {
  const queryClient = useQueryClient()
  const drawerRef = useRef<HTMLDivElement>(null)
  const [searchParams] = useSearchParams()
  const embed = searchParams.get('embed') === 'true'
  const id = row?.id ?? null

  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const originalRef = useRef<Draft | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [dernierSync, setDernierSync] = useState<Horaire['sync']>(undefined)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => { setIsEditing(false); setErreur(null); setDernierSync(undefined) }, [id])

  const startEdit = useCallback(() => {
    if (!row) return
    const d = draftDe(row)
    originalRef.current = d
    setDraft(d)
    setErreur(null)
    setIsEditing(true)
  }, [row])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!row || !draft || !originalRef.current) return
      const heures = diffDraft(draft, originalRef.current)
      if (heures.debut === null) throw Object.assign(new Error('début vide'), { body: { message: 'Vous ne pouvez pas mettre l’heure de début à vide.' } })
      if (Object.keys(heures).length === 0) return undefined
      return corrigerHoraire(row.id, heures)
    },
    onSuccess: (h) => {
      queryClient.invalidateQueries({ queryKey: QK })
      setDernierSync(h?.sync)
      setErreur(null)
      setIsEditing(false)
    },
    onError: (e) => setErreur(messageErreur(e)),
  })

  const deleteMutation = useMutation({
    mutationFn: () => supprimerHoraire(row!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK })
      setConfirmOpen(false)
      onClose()
    },
    onError: (e) => { setConfirmOpen(false); setErreur(messageErreur(e)) },
  })

  const isDirty = useMemo(() => {
    if (!isEditing || !draft || !originalRef.current) return false
    return COLONNES_HEURE.some((c) => draft[c] !== originalRef.current![c])
  }, [isEditing, draft])

  useEffect(() => { onDirtyChange(isDirty) }, [isDirty, onDirtyChange])
  useEffect(() => () => { onDirtyChange(false) }, [onDirtyChange])
  useEffect(() => { saveRef.current = async () => { await saveMutation.mutateAsync() } })
  useEffect(() => { discardRef.current = () => setIsEditing(false) })

  useEffect(() => {
    if (id === null) return
    function handleMouseDown(e: MouseEvent) {
      const target = e.target as Node | null
      if (!target) return
      if (drawerRef.current?.contains(target)) return
      if ((target as Element).closest?.('[data-stock-row]')) return
      // dialogs (confirm, unsaved) render in a portal outside the drawer
      if ((target as Element).closest?.('[role="dialog"], [role="alertdialog"]')) return
      onClose()
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [id, onClose])

  const open = row !== null
  const travailMin = row?.presenceMin != null ? row.presenceMin - row.pausesMin : null

  return (
    <>
      <div
        ref={drawerRef}
        className={cn(
          'fixed right-0 bottom-0 w-full max-w-[440px] bg-white border-l border-border/60 shadow-xl z-30 transition-transform duration-300 flex flex-col',
          embed ? 'top-0' : 'top-14',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <div className="flex-1 min-h-0 flex flex-col bg-zinc-100/80">
          {/* Header band (§27.5bis) */}
          <div className="flex-shrink-0 flex items-center gap-2.5 border-b-2 border-gold bg-primary px-4 py-2.5">
            <div className={cn('h-8 w-8 flex-shrink-0 rounded-lg flex items-center justify-center shadow-sm transition-colors', isEditing ? 'bg-white text-primary' : 'bg-gold text-gold-foreground')}>
              <Clock className="h-[18px] w-[18px]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-heading font-bold tracking-tight truncate text-primary-foreground">{row ? nomComplet(row.salarie) : ''}</h2>
                {row && !isEditing && <EtatBadge row={row} surNavy />}
              </div>
              <p className="text-xs text-white/70 truncate">{row ? jourLong(row.jour) : ''}</p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {canEdit && row && (isEditing ? (
                <>
                  <Button variant="ghost" size="sm" className="px-2 text-white/80 hover:bg-white/15 hover:text-white" onClick={() => setIsEditing(false)} title="Annuler">
                    <X className="h-3.5 w-3.5 sm:mr-1.5" />
                    <span className="hidden sm:inline">Annuler</span>
                  </Button>
                  <Button variant="gold" size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !isDirty} title="Enregistrer">
                    {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 sm:mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 sm:mr-1.5" />}
                    <span className="hidden sm:inline">Enregistrer</span>
                  </Button>
                </>
              ) : (
                <Button variant="gold" size="sm" onClick={startEdit} title="Modifier">
                  <Pencil className="h-3.5 w-3.5 sm:mr-1.5" />
                  <span className="hidden sm:inline">Modifier</span>
                </Button>
              ))}
              <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0 md:hidden text-white/80 hover:bg-white/15 hover:text-white" onClick={onClose} title="Fermer">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 scrollbar-transparent">
            {row && (
              <>
                <ErreurNote message={erreur} />
                <SyncNote sync={dernierSync} />

                <DrawerCard icon={<Timer className="h-4 w-4 text-accent" />} title="Heures" highlight={isEditing}>
                  <div className="space-y-1.5">
                    {COLONNES_HEURE.map((c) => (
                      <KV
                        key={c}
                        label={LIBELLE_COLONNE[c]}
                        mono
                        value={
                          isEditing && draft ? (
                            <input
                              type="time"
                              value={draft[c]}
                              onChange={(e) => setDraft((d) => (d ? { ...d, [c]: e.target.value } : d))}
                              className={cn(INPUT_KV, 'w-28')}
                              required={c === 'debut'}
                            />
                          ) : (
                            heure(msDe(row, c))
                          )
                        }
                      />
                    ))}
                  </div>
                  {isEditing && (
                    <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
                      <MoonStar className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                      Une heure qui n’est pas après le début compte pour le lendemain (poste de nuit). Vider une case efface le pointage ; vider la fin rouvre le poste.
                    </p>
                  )}
                </DrawerCard>

                <DrawerCard icon={<Coffee className="h-4 w-4 text-accent" />} title="Bilan" highlight={isEditing}>
                  <div className="space-y-1.5">
                    <KV label="Pauses terminées" value={row.pausesMin > 0 ? `${row.pausesMin} min` : '—'} mono />
                    <KV label="Présence (fin − début)" value={dureeHM(row.presenceMin)} mono />
                    <KV label="Hors pauses" value={dureeHM(travailMin)} mono />
                  </div>
                </DrawerCard>

                {row.nonFermee && !isEditing && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-900">
                    Ce poste est ouvert depuis plus de 14 h : la pointeuse ne le continue plus. {canEdit ? 'Modifiez-le pour saisir l’heure de fin.' : ''}
                  </div>
                )}

                {canEdit && !isEditing && (
                  <div className="pt-1">
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setConfirmOpen(true)}>
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      Supprimer le poste
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Supprimer le poste"
        description={row ? `Le poste de ${nomComplet(row.salarie)} du ${jourLong(row.jour)} sera retiré du pointage. Il reste dans la base, marqué supprimé.` : undefined}
        isPending={deleteMutation.isPending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => { setIsEditing(false); deleteMutation.mutate() }}
      />
    </>
  )
}

// ── Create dialog (§18.A) ──────────────────────────────

const HEURES_VIDES: Draft = { debut: '', debut_pause1: '', fin_pause1: '', debut_pause2: '', fin_pause2: '', fin: '' }

function NouvelHoraireDialog({
  open,
  onOpenChange,
  salaries,
  aujourdhui,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  salaries: SalarieAdmin[]
  aujourdhui: string
  onCreated: (h: Horaire) => void
}) {
  const queryClient = useQueryClient()
  const [idSalarie, setIdSalarie] = useState(0)
  const [jour, setJour] = useState(aujourdhui)
  const [heures, setHeures] = useState<Draft>(HEURES_VIDES)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    if (open) { setIdSalarie(0); setJour(aujourdhui); setHeures(HEURES_VIDES); setErreur(null) }
  }, [open, aujourdhui])

  const options = useMemo<PopoverSelectOption[]>(() => salaries.map((s) => ({ id: s.id, primary: nomComplet(s) })), [salaries])

  const mutation = useMutation({
    mutationFn: () => {
      const saisie: SaisieHeures = {}
      for (const c of COLONNES_HEURE) if (heures[c]) saisie[c] = heures[c]
      return creerHoraire({ idSalarie, jour, heures: saisie })
    },
    onSuccess: (h) => {
      queryClient.invalidateQueries({ queryKey: QK })
      onOpenChange(false)
      onCreated(h)
    },
    onError: (e) => setErreur(messageErreur(e)),
  })

  const submit = () => {
    if (idSalarie <= 0) { setErreur('Vous devez choisir un salarié.'); return }
    if (!jour) { setErreur('La date est obligatoire.'); return }
    if (!heures.debut) { setErreur('Vous ne pouvez pas mettre l’heure de début à vide.'); return }
    setErreur(null)
    mutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto" onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-accent" />
            Nouvel horaire
          </DialogTitle>
        </DialogHeader>
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-full">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Salarié</label>
              <PopoverSelect options={options} value={idSalarie} onChange={setIdSalarie} emptyLabel="Choisir un salarié…" />
            </div>
            <div className="col-span-full">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Date du poste</label>
              <input
                type="date"
                value={jourVersInput(jour)}
                onChange={(e) => setJour(inputVersJour(e.target.value))}
                className="h-9 w-full px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {COLONNES_HEURE.map((c) => (
              <div key={c}>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  {LIBELLE_COLONNE[c]}
                  {c === 'debut' && <span className="text-destructive"> *</span>}
                </label>
                <input
                  type="time"
                  value={heures[c]}
                  onChange={(e) => setHeures((h) => ({ ...h, [c]: e.target.value }))}
                  className="h-9 w-full px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring tabular-nums"
                />
              </div>
            ))}
          </div>
          <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <MoonStar className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            Une heure qui n’est pas après le début compte pour le lendemain : pour un poste de nuit, saisissez la date du soir.
          </p>
        </div>
        {erreur && (
          <div className="mt-3 flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{erreur}</span>
          </div>
        )}
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
            Ajouter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
