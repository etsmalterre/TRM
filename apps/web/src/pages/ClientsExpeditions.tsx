// Clients › Expéditions (Tricotage Malterre)
//
// Port of the legacy WinDev pair FEN_Expéditions (the list, with its "Voir les
// expéditions facturées" toggle) and FEN_Gestion_expédition (the sheet), in
// Tricotage Malterre mode. Fiche layout (mps_designer §4–§9) with the §31
// in-screen drawer for picking the pieces that go on the avis.
//
// Sister screen: ETM's `ClientsExpeditions.tsx`. NOT shared via the @etm alias —
// `expedition` is partitioned by IDsociete and the two halves ship different
// merchandise, so this screen has its own endpoints (`/expeditions-trm`, see
// ETM/apps/api/src/routes/expeditions-trm.ts). Same reasoning as Tombé Métier ›
// Stock. Deltas against the ETM screen:
//
//  - No Textile/Diverses bucket switch: `expedition_divers` has no IDsociete
//    column, so misc shipments are ETM-only.
//  - The center panel ships PIÈCES (tombé de métier off an ordre de fabrication),
//    not rolls: each carries its métier, its weight, its visitage défauts. No
//    lot, no métrage, no magasin — those columns are empty on every TRM row.
//  - Ref. client and the client itself are read-only here: both live on the
//    commande_client the expedition fulfils, and the legacy sheet's editable
//    combos would mutate the order from the shipment screen.
//  - Once the customer has received a shipment (ETS Malterre's reception takes
//    ownership of the piece), its pieces show up flagged "réceptionnée" and can
//    no longer be pulled off the avis — the API refuses it too.
//  - One printable document (the avis d'expédition), so the header keeps the
//    plain §6.1 print button rather than a §42 doc menu.
//  - The legacy "CSV TAD" export is deliberately not ported.

import { useState, useMemo, useEffect, useCallback, useRef, type ComponentType } from 'react'
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UnsavedChangesDialog } from '@/components/shared/UnsavedChangesDialog'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard'
import {
  Truck,
  Search,
  Loader2,
  AlertCircle,
  MapPin,
  Info,
  Pencil,
  Plus,
  X,
  Save,
  Trash2,
  AtSign,
  Printer,
  Layers,
  Link2,
  Unlink,
  CheckCircle2,
  Clock,
  Gift,
  FileText,
  Lock,
  Receipt,
  Cog,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TmRollIcon } from '@/components/icons/TmRollIcon'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { PopoverSelect, SearchableCombobox } from '@/components/ui/popover-select'
import { MasterDetailLayout } from '@/components/layout/MasterDetailLayout'
import { useAutoSelectFirst } from '@/hooks/useAutoSelectFirst'
import { SendEmailDialog } from '@/components/email/SendEmailDialog'
import { postEmail } from '@/lib/email'
import { cn } from '@/lib/utils'
import { formatHfsqlDate, hfsqlDateToInput, inputDateToHfsql } from '@/lib/dates'
import { fmtNum } from '@/lib/format'
import { apiFetch, API_URL } from '@/lib/api'

// ── Types ──────────────────────────────────────────────

const LIST_PAGE_SIZE = 200

interface ExpeditionListRow {
  id: number
  IDcommande_client: number
  commande_numero: number | null
  IDclient: number
  client_nom: string
  IDadresse: number
  /** Delivery address name — the legacy list's "Livraison" column. */
  livraison_nom: string
  transporteur_nom: string
  date: string | null
  est_facture: number
  donation: number
  nb_pieces: number
  total_poids: number
}

interface AdresseLite {
  IDadresse: number
  nom: string | null
  adresse1: string | null
  adresse2: string | null
  adresse3: string | null
  cp: string | null
  ville: string | null
  pays: string | null
}
interface AdresseLookup extends AdresseLite {
  est_defaut: number
  est_defaut_facturation: number
  est_defaut_livraison: number
}

interface ExpeditionLigne {
  IDligne_commande_client: number
  IDligne_expedition: number
  type: number
  ref_label: string | null
  ref_designation: string | null
  colori_reference: string | null
  quantite: number
  unite: number
  unite_label: string
  dim: 'metrage' | 'poids'
  nb_pieces_exp: number
  poids_exp: number
  nb_pieces_dispo: number
}

interface FactureRef {
  IDfacture: number
  numero: number | null
  date: string | null
  type: number // 1 = Facture, 2 = Avoir
}

interface ExpeditionDetail {
  id: number
  IDcommande_client: number
  commande_numero: number | null
  IDclient: number
  client_nom: string
  ref_client: string
  date: string | null
  IDtransporteur: number
  transporteur_nom: string
  IDadresse: number
  adresse_livraison: AdresseLite | null
  IDcontact: number
  contact_nom: string | null
  donation: number
  affiche_observations: number
  observation_bl: string
  est_facture: number
  factures: FactureRef[]
  locked: boolean
  lignes: ExpeditionLigne[]
}

interface TrmPiece {
  IDstock_ecru: number
  numero: string
  poids: number
  observations: string
  second_choix: number
  /** Legacy-worded défaut labels ("Maille 25 cm", "Trou x1") — the same array
   *  the avis d'expédition PDF prints, so paper and screen never disagree. */
  defauts: string[]
  IDordre_fabrication: number
  machine_nom: string | null
  /** false once the customer's reception has taken the piece over. */
  editable: boolean
}
interface PiecePayload {
  unite_label: string
  target_qty: number
  onExp: TrmPiece[]
  dispo: TrmPiece[]
}

interface TransporteurLite { IDtransporteur: number; nom: string }
interface ContactLite { IDcontact: number; nom: string; mail: string }
interface CommandeLite {
  IDcommande_client: number
  numero: number | null
  date_commande: string | null
  IDclient: number
  client_nom: string
  ref_client: string
}

type SidebarTab = 'info' | 'factures'

// ── Shared styling ─────────────────────────────────────

const inputClass = 'w-full h-8 px-2.5 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring'
const editSectionClass = 'border-l-4 border-l-accent/70 bg-accent/[0.03]'

// ── Main Page ──────────────────────────────────────────

export function ClientsExpeditions() {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [stateFilter, setStateFilter] = useState<'nonfacture' | 'facture'>('nonfacture')
  const [isEditing, setIsEditing] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [autoEditForId, setAutoEditForId] = useState<number | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [emailOpen, setEmailOpen] = useState(false)

  // Piece drawer (page-level so startEdit can close it — mps_designer §31.2).
  const [pieceDrawerLcc, setPieceDrawerLcc] = useState<number | null>(null)

  // Edit-mode header draft.
  const [editDate, setEditDate] = useState('')
  const [editIDTransporteur, setEditIDTransporteur] = useState(0)
  const [editIDAdresse, setEditIDAdresse] = useState(0)
  const [editIDContact, setEditIDContact] = useState(0)
  const [editAfficheObs, setEditAfficheObs] = useState(0)
  const [editObservation, setEditObservation] = useState('')

  const originalDraftRef = useRef<Record<string, string | number> | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 250)
    return () => clearTimeout(t)
  }, [searchQuery])

  // Infinite list: pages of 200, cursor = last row id (API `before`). Search returns a single page.
  const {
    data: rowPages, isLoading, isError, error, isFetching,
    fetchNextPage, hasNextPage, isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['expeditions-trm', stateFilter, debouncedQuery],
    queryFn: ({ pageParam }): Promise<ExpeditionListRow[]> =>
      apiFetch(`/expeditions-trm?state=${stateFilter}&q=${encodeURIComponent(debouncedQuery)}&limit=${LIST_PAGE_SIZE}${pageParam ? `&before=${pageParam}` : ''}`),
    initialPageParam: 0,
    getNextPageParam: (lastPage: ExpeditionListRow[]) =>
      debouncedQuery || lastPage.length < LIST_PAGE_SIZE ? undefined : lastPage[lastPage.length - 1].id,
  })

  const { data: detail, isLoading: detailLoading } = useQuery<ExpeditionDetail>({
    queryKey: ['expedition-trm', selectedId],
    queryFn: () => apiFetch(`/expeditions-trm/${selectedId}`),
    enabled: selectedId !== null,
  })

  // A shipment is editable only while no definitive facture is attached.
  const editable = !!detail && !detail.locked

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['expeditions-trm'] })
    queryClient.invalidateQueries({ queryKey: ['expedition-trm', selectedId] })
  }, [queryClient, selectedId])

  const startEdit = useCallback(() => {
    if (!detail || detail.locked) return
    const snapshot: Record<string, string | number> = {
      date: hfsqlDateToInput(detail.date),
      IDtransporteur: detail.IDtransporteur ?? 0,
      IDadresse: detail.IDadresse ?? 0,
      IDcontact: detail.IDcontact ?? 0,
      afficheObs: detail.affiche_observations ?? 0,
      observation: detail.observation_bl ?? '',
    }
    setEditDate(snapshot.date as string)
    setEditIDTransporteur(snapshot.IDtransporteur as number)
    setEditIDAdresse(snapshot.IDadresse as number)
    setEditIDContact(snapshot.IDcontact as number)
    setEditAfficheObs(snapshot.afficheObs as number)
    setEditObservation(snapshot.observation as string)
    originalDraftRef.current = snapshot
    setPieceDrawerLcc(null) // edit mode hides the piece drawer (mps_designer §31.3)
    setIsEditing(true)
  }, [detail])

  const cancelEdit = useCallback(() => setIsEditing(false), [])

  const isDirty = useMemo(() => {
    if (!isEditing) return false
    const o = originalDraftRef.current
    if (!o) return false
    if (editDate !== o.date) return true
    if (editIDTransporteur !== o.IDtransporteur) return true
    if (editIDAdresse !== o.IDadresse) return true
    if (editIDContact !== o.IDcontact) return true
    if (editAfficheObs !== o.afficheObs) return true
    if (editObservation !== o.observation) return true
    return false
  }, [isEditing, editDate, editIDTransporteur, editIDAdresse, editIDContact, editAfficheObs, editObservation])

  const saveHeaderMut = useMutation({
    mutationFn: () => apiFetch(`/expeditions-trm/${selectedId}`, {
      method: 'PUT',
      body: JSON.stringify({
        date: inputDateToHfsql(editDate),
        IDtransporteur: editIDTransporteur || 0,
        IDadresse: editIDAdresse || 0,
        IDcontact: editIDContact || 0,
        affiche_observations: editAfficheObs ? 1 : 0,
        observation_bl: editObservation,
      }),
    }),
    onSuccess: () => { invalidateAll(); setIsEditing(false) },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/expeditions-trm/${id}`, { method: 'DELETE' }),
    onSuccess: (_data, deletedId) => {
      // Infinite query: the cache entry is { pages, pageParams }, not a flat array.
      const cached = queryClient.getQueryData<{ pages: ExpeditionListRow[][] }>(['expeditions-trm', stateFilter, debouncedQuery])
      const remaining = (cached?.pages ?? []).flat().filter((r) => r.id !== deletedId)
      queryClient.invalidateQueries({ queryKey: ['expeditions-trm'] })
      setIsEditing(false)
      setDeleteConfirmOpen(false)
      setDeleteError(null)
      setSelectedId(remaining.length > 0 ? remaining[0].id : null)
    },
    // The API refuses to delete a shipment the customer already received (it
    // would orphan their reception) — surface that instead of a silent no-op.
    onError: (e: unknown) => setDeleteError(
      (e as { status?: number })?.status === 409
        ? 'Expédition déjà facturée ou réceptionnée par le client — suppression impossible.'
        : 'La suppression a échoué.',
    ),
  })

  useEffect(() => {
    if (autoEditForId !== null && detail?.id === autoEditForId && !detail.locked) {
      startEdit()
      setAutoEditForId(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEditForId, detail])

  const guard = useUnsavedGuard({
    isDirty,
    save: async () => { await saveHeaderMut.mutateAsync() },
    onDiscard: () => { setIsEditing(false) },
  })

  const handleSelect = useCallback((id: number) => {
    guard.guardAction(() => { setIsEditing(false); setPieceDrawerLcc(null); setSelectedId(id) })
  }, [guard])

  const handleStateFilterChange = useCallback((s: 'nonfacture' | 'facture') => {
    guard.guardAction(() => { setIsEditing(false); setStateFilter(s); setSelectedId(null) })
  }, [guard])

  const list = useMemo(() => (rowPages?.pages ?? []).flat(), [rowPages])

  useAutoSelectFirst({
    rows: list,
    selectedId,
    getId: (r) => r.id,
    select: setSelectedId,
    suspended: isEditing || isFetching,
  })

  return (
    <>
      <MasterDetailLayout
        list={
          <ExpeditionListPanel
            rows={list}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            selectedId={selectedId}
            onSelect={handleSelect}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            stateFilter={stateFilter}
            onStateFilterChange={handleStateFilterChange}
            onNew={() => setCreateOpen(true)}
            isEditing={isEditing}
            hasMore={!!hasNextPage}
            onLoadMore={() => fetchNextPage()}
            isLoadingMore={isFetchingNextPage}
          />
        }
        detailHeader={
          <DetailHeader
            expedition={detail ?? null}
            isLoading={detailLoading && selectedId !== null}
            isEditing={isEditing}
            editable={editable}
            onStartEdit={startEdit}
            onCancelEdit={cancelEdit}
            onSave={() => saveHeaderMut.mutate()}
            isSaving={saveHeaderMut.isPending}
            onDelete={() => { setDeleteError(null); setDeleteConfirmOpen(true) }}
            onPrintClick={() => {
              if (selectedId !== null) window.open(`${API_URL}/expeditions-trm/${selectedId}/pdf`, '_blank')
            }}
            onEmailClick={() => setEmailOpen(true)}
          />
        }
        detail={
          <DetailMain
            expedition={detail ?? null}
            isLoading={detailLoading && selectedId !== null}
            hasSelection={selectedId !== null}
            isEditing={isEditing}
            editable={editable}
            pieceDrawerLcc={pieceDrawerLcc}
            onOpenPieceDrawer={setPieceDrawerLcc}
            onMutationSuccess={invalidateAll}
          />
        }
        sidebar={selectedId !== null ? (
          <DetailSidebar
            expedition={detail ?? null}
            isLoading={detailLoading}
            isEditing={isEditing}
            editDate={editDate} onEditDateChange={setEditDate}
            editIDTransporteur={editIDTransporteur} onEditIDTransporteurChange={setEditIDTransporteur}
            editIDAdresse={editIDAdresse} onEditIDAdresseChange={setEditIDAdresse}
            editIDContact={editIDContact} onEditIDContactChange={setEditIDContact}
            editAfficheObs={editAfficheObs} onEditAfficheObsChange={setEditAfficheObs}
            editObservation={editObservation} onEditObservationChange={setEditObservation}
          />
        ) : null}
        sidebarTitle="Informations"
        hasSelection={selectedId !== null}
        onBack={() => guard.guardAction(() => { setIsEditing(false); setPieceDrawerLcc(null); setSelectedId(null) })}
      />

      <UnsavedChangesDialog open={guard.showDialog} onAction={guard.handleAction} isSaving={guard.isSaving} />

      <CreateExpeditionDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(newId) => {
          setCreateOpen(false)
          queryClient.invalidateQueries({ queryKey: ['expeditions-trm'] })
          setSelectedId(newId)
          setAutoEditForId(newId)
        }}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Supprimer l'expédition"
        description={
          deleteError
            ?? "Cette expédition et ses lignes seront supprimées. Les pièces expédiées retourneront en stock. Cette action est irréversible."
        }
        confirmLabel="Supprimer"
        isPending={deleteMut.isPending}
        onCancel={() => { setDeleteConfirmOpen(false); setDeleteError(null) }}
        onConfirm={() => { if (selectedId !== null) deleteMut.mutate(selectedId) }}
      />

      {/* Email: the avis d'expédition PDF is attached. Unlike ETM there are no
          optional documents — TRM's visitage findings ride in the avis itself
          (its Défauts column), so there is no separate rapport de contrôle. */}
      {selectedId !== null && (
        <SendEmailDialog
          open={emailOpen}
          onClose={() => setEmailOpen(false)}
          contextLabel={detail?.client_nom ?? undefined}
          queryKey={['expedition-trm-email-defaults', selectedId]}
          loadDefaults={() => apiFetch(`/expeditions-trm/${selectedId}/email-defaults`)}
          pdfUrl={`${API_URL}/expeditions-trm/${selectedId}/pdf`}
          pdfAttachmentLabel={`BL-TRM-${selectedId}.pdf`}
          onSend={(p) => postEmail(`${API_URL}/expeditions-trm/${selectedId}/email`, p, { includeAttachPdf: true })}
        />
      )}
    </>
  )
}

// ── Left Panel: List ───────────────────────────────────

function ExpeditionListPanel({
  rows, isLoading, isError, error,
  selectedId, onSelect,
  searchQuery, onSearchChange,
  stateFilter, onStateFilterChange,
  onNew, isEditing,
  hasMore, onLoadMore, isLoadingMore,
}: {
  rows: ExpeditionListRow[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  selectedId: number | null
  onSelect: (id: number) => void
  searchQuery: string
  onSearchChange: (q: string) => void
  stateFilter: 'nonfacture' | 'facture'
  onStateFilterChange: (s: 'nonfacture' | 'facture') => void
  onNew: () => void
  isEditing: boolean
  hasMore: boolean
  onLoadMore: () => void
  isLoadingMore: boolean
}) {
  return (
    <div className="flex flex-col h-full rounded-lg border shadow-sm bg-zinc-100/80">
      <div className="p-3 border-b rounded-t-lg bg-zinc-200/50 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Rechercher (n°, client, livraison...)"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            autoComplete="off"
            className="w-full h-9 pl-9 pr-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {/* The legacy list's "Voir les expéditions facturées" toggle. */}
        <div className="flex gap-1 p-1 rounded-lg border border-border bg-background shadow-sm">
          {([
            { key: 'nonfacture', label: 'Non facturées' },
            { key: 'facture', label: 'Facturées' },
          ] as const).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => onStateFilterChange(opt.key)}
              className={cn(
                'flex-1 px-3 py-2 text-sm rounded-md transition-colors font-semibold',
                stateFilter === opt.key ? 'bg-accent text-accent-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent/10',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-2 scrollbar-transparent">
        {isLoading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-8 text-destructive">
            <AlertCircle className="h-6 w-6 mb-2" />
            <p className="text-sm">{error?.message || 'Erreur'}</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Truck className="h-12 w-12 mb-3 opacity-50" />
            <p className="text-sm">Aucune expédition</p>
          </div>
        ) : (<>
        {rows.map((row) => {
          const isSelected = selectedId === row.id
          const facturee = row.est_facture === 1
          // "Livraison" only earns a line when it differs from the client name —
          // the usual case (shipping to ETS Malterre) has them identical.
          const showLivraison = !!row.livraison_nom && row.livraison_nom !== row.client_nom
          return (
            <div
              key={row.id}
              onClick={() => onSelect(row.id)}
              className={cn(
                'p-3 border rounded-lg cursor-pointer transition-all bg-white',
                isSelected ? 'border-accent ring-1 ring-accent' : 'border-border hover:border-accent/50',
              )}
            >
              <div className="flex items-center gap-2">
                <Truck className={cn('h-4 w-4 flex-shrink-0', facturee ? 'text-green-600' : 'text-muted-foreground')} />
                <span className="font-medium text-sm">N° {row.id}</span>
                {!!row.donation && <Gift className="h-3 w-3 text-accent" />}
                <StatePill facturee={facturee} className="ml-auto" />
              </div>
              <p className="text-xs text-muted-foreground mt-1 truncate">{row.client_nom || '—'}</p>
              {showLivraison && (
                <p className="text-[11px] text-muted-foreground/80 mt-0.5 truncate flex items-center gap-1">
                  <MapPin className="h-2.5 w-2.5 flex-shrink-0" />{row.livraison_nom}
                </p>
              )}
              <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                {row.date && <span>{formatHfsqlDate(row.date)}</span>}
                {row.commande_numero != null && <span>· Cmd {row.commande_numero}</span>}
                <span className="ml-auto text-muted-foreground/80 tabular-nums">
                  {row.nb_pieces} pce{row.nb_pieces > 1 ? 's' : ''} · {fmtNum(row.total_poids, 0)} kg
                </span>
              </div>
            </div>
          )
        })}
        {hasMore && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="w-full text-muted-foreground hover:text-foreground"
          >
            {isLoadingMore
              ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              : <Plus className="h-3.5 w-3.5 mr-1.5" />}
            Charger plus
          </Button>
        )}
        </>)}
      </div>

      <div className="p-3 border-t text-xs text-muted-foreground flex items-center justify-between rounded-b-lg bg-zinc-200/50">
        <span>{rows.length} expédition{rows.length !== 1 ? 's' : ''}{hasMore ? '+' : ''}</span>
        {!isEditing && (
          <Button size="sm" variant="ghost" onClick={onNew} className="text-accent hover:text-accent hover:bg-accent/10">
            <Plus className="h-3.5 w-3.5 mr-1" />Nouveau
          </Button>
        )}
      </div>
    </div>
  )
}

function StatePill({ facturee, className }: { facturee: boolean; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn('text-[10px] py-0 gap-1 border text-white', facturee ? 'bg-success border-success' : 'bg-primary border-primary', className)}
    >
      {facturee ? <Receipt className="h-2.5 w-2.5" /> : <Clock className="h-2.5 w-2.5" />}
      {facturee ? 'Facturée' : 'Non facturée'}
    </Badge>
  )
}

// ── Center: Detail Header ──────────────────────────────

function DetailHeader({
  expedition, isLoading, isEditing, editable,
  onStartEdit, onCancelEdit, onSave, isSaving,
  onDelete, onPrintClick, onEmailClick,
}: {
  expedition: ExpeditionDetail | null
  isLoading: boolean
  isEditing: boolean
  editable: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSave: () => void
  isSaving: boolean
  onDelete: () => void
  onPrintClick: () => void
  onEmailClick: () => void
}) {
  if (!expedition && !isLoading) return null
  const locked = expedition?.locked === true
  return (
    <div className="flex-shrink-0 pt-0.5">
      <div className="flex items-center gap-3">
        <div className={cn('h-11 w-11 rounded-lg flex items-center justify-center', isEditing ? 'bg-accent/15' : 'icon-box-gold')}>
          <Truck className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          {isLoading ? (
            <div className="h-8 w-48 bg-muted animate-pulse rounded" />
          ) : (
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-heading font-bold tracking-tight truncate">
                Expédition N° {expedition?.id}
                <span className="text-muted-foreground font-normal"> · {expedition?.client_nom || '—'}</span>
              </h1>
              <div className="flex items-center gap-2 flex-shrink-0">
                {locked ? (
                  <Badge variant="secondary" className="text-xs gap-1"><Lock className="h-3 w-3" />Facturée</Badge>
                ) : (
                  <Badge className="bg-amber-400/15 text-amber-700 border border-amber-500/30 text-xs gap-1"><Clock className="h-3 w-3" />Non facturée</Badge>
                )}
                {!!expedition?.donation && <Badge variant="secondary" className="text-xs gap-1"><Gift className="h-3 w-3" />Donation</Badge>}
                {expedition?.date && <Badge variant="secondary" className="text-xs">{formatHfsqlDate(expedition.date)}</Badge>}
                {isEditing && (
                  <Badge className="bg-accent text-accent-foreground gap-1 shadow-sm"><Pencil className="h-3 w-3" />Mode edition</Badge>
                )}
              </div>
            </div>
          )}
        </div>
        {!isLoading && expedition && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {isEditing ? (
              <>
                <Button variant="outline" size="icon" className="h-9 w-9 text-destructive hover:text-destructive" title="Supprimer" onClick={onDelete}>
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={onCancelEdit}>
                  <X className="h-3.5 w-3.5 mr-1.5" />Annuler
                </Button>
                <Button size="sm" onClick={onSave} disabled={isSaving}>
                  <Save className="h-3.5 w-3.5 mr-1.5" />{isSaving ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="icon" className="h-9 w-9" title="Imprimer l'avis d'expédition" onClick={onPrintClick}>
                  <Printer className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-9 w-9" title="Envoyer un email" onClick={onEmailClick}>
                  <AtSign className="h-4 w-4" />
                </Button>
                {editable && (
                  <Button variant="gold" size="sm" onClick={onStartEdit}>
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />Modifier
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </div>
      <div className={cn('h-1 w-24 mt-3 rounded-full', isEditing ? 'bg-accent' : 'bg-gradient-to-r from-accent via-accent to-accent/30')} />
    </div>
  )
}

// ── Center: Detail Main ────────────────────────────────

function DetailMain({
  expedition, isLoading, hasSelection, isEditing, editable,
  pieceDrawerLcc, onOpenPieceDrawer, onMutationSuccess,
}: {
  expedition: ExpeditionDetail | null
  isLoading: boolean
  hasSelection: boolean
  isEditing: boolean
  editable: boolean
  pieceDrawerLcc: number | null
  onOpenPieceDrawer: (lcc: number | null) => void
  onMutationSuccess: () => void
}) {
  if (!hasSelection) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="icon-box-gold h-16 w-16 mx-auto"><Truck className="h-8 w-8" /></div>
        <p className="text-muted-foreground text-sm">Sélectionnez une expédition dans la liste</p>
      </div>
    </div>
  )
  if (isLoading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>
  if (!expedition) return null

  return (
    <LignesSection
      expedition={expedition}
      isEditing={isEditing}
      editable={editable}
      pieceDrawerLcc={pieceDrawerLcc}
      onOpenPieceDrawer={onOpenPieceDrawer}
      onMutationSuccess={onMutationSuccess}
    />
  )
}

// ── Commande lines + piece drawer (mps_designer §31) ──

function LignesSection({
  expedition, isEditing, editable, pieceDrawerLcc, onOpenPieceDrawer, onMutationSuccess,
}: {
  expedition: ExpeditionDetail
  isEditing: boolean
  editable: boolean
  pieceDrawerLcc: number | null
  onOpenPieceDrawer: (lcc: number | null) => void
  onMutationSuccess: () => void
}) {
  const lignes = expedition.lignes
  const drawerOpen = pieceDrawerLcc !== null && !isEditing
  const drawerLigne = drawerOpen ? lignes.find((l) => l.IDligne_commande_client === pieceDrawerLcc) ?? null : null

  // Legacy parity: an expedition only "owns" the commande lines that have a
  // ligne_expedition row on it (a big order ships line-by-line across many
  // avis). The remaining lines are candidates for piece picking, shown only
  // while the expedition owns nothing yet (they're the entry point for the
  // first pieces), or when the drawer is open on one (it drops back to
  // candidate after its last piece is unassigned).
  const onExpLines = lignes.filter((l) => l.IDligne_expedition > 0)
  const candidates = editable ? lignes.filter((l) => l.IDligne_expedition === 0) : []
  const visibleCandidates = onExpLines.length === 0
    ? candidates
    : candidates.filter((l) => drawerOpen && l.IDligne_commande_client === pieceDrawerLcc)

  const totalPieces = onExpLines.reduce((s, l) => s + l.nb_pieces_exp, 0)
  const totalPoids = onExpLines.reduce((s, l) => s + l.poids_exp, 0)

  const renderLine = (l: ExpeditionLigne) => (
    <LineCard
      key={l.IDligne_commande_client}
      line={l}
      isDrawerOpen={pieceDrawerLcc === l.IDligne_commande_client}
      // Open to pick pieces when editable; when locked, still open to VIEW them.
      clickable={!isEditing && (editable || l.nb_pieces_exp > 0)}
      onClick={() => onOpenPieceDrawer(pieceDrawerLcc === l.IDligne_commande_client ? null : l.IDligne_commande_client)}
    />
  )

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className={cn('overflow-auto space-y-2 p-1 scrollbar-transparent', drawerOpen ? 'flex-shrink-0 max-h-[40%]' : 'flex-1 min-h-0')}>
        {onExpLines.length === 0 && visibleCandidates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Layers className="h-12 w-12 mb-3 opacity-40" />
            <p className="text-sm">Aucune ligne sur l'expédition</p>
          </div>
        ) : (
          <>
            {onExpLines.map(renderLine)}
            {visibleCandidates.map(renderLine)}
          </>
        )}
      </div>

      {drawerOpen && drawerLigne && (
        <div className="flex-1 min-h-0 flex flex-col mt-3 rounded-lg border border-border/60 overflow-hidden bg-zinc-100/80 animate-in slide-in-from-bottom-4 fade-in-0 duration-200">
          <PieceDrawer
            expeditionId={expedition.id}
            ligne={drawerLigne}
            editable={editable}
            onClose={() => onOpenPieceDrawer(null)}
            onSuccess={onMutationSuccess}
          />
        </div>
      )}

      {onExpLines.length > 0 && (
        <div className="flex-shrink-0 mt-3 pt-3 border-t border-border/60">
          <div className="flex flex-col items-end gap-1 text-sm tabular-nums">
            <div className="flex items-center gap-6">
              <span className="text-muted-foreground text-xs uppercase tracking-wide">Pièces expédiées</span>
              <span className="w-32 text-right font-medium">{totalPieces}</span>
            </div>
            <div className="flex items-center gap-6">
              <span className="text-muted-foreground text-xs uppercase tracking-wide">Poids total</span>
              <span className="w-32 text-right">{fmtNum(totalPoids, 1)} kg</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function LineCard({
  line, isDrawerOpen, clickable, onClick,
}: {
  line: ExpeditionLigne
  isDrawerOpen: boolean
  clickable: boolean
  onClick: () => void
}) {
  const hasPieces = line.nb_pieces_exp > 0
  const border = hasPieces ? 'border-l-amber-400/60' : 'border-l-border'
  const iconBg = hasPieces ? 'bg-amber-400/10' : 'bg-muted'
  const iconColor = hasPieces ? 'text-amber-600' : 'text-muted-foreground'
  return (
    <div
      className={cn(
        'group rounded-lg border-l-4 border border-border/60 bg-zinc-100/80 p-3',
        border,
        clickable && 'cursor-pointer hover:bg-zinc-100 hover:border-accent/40 transition-colors',
        isDrawerOpen && 'ring-1 ring-accent bg-accent/[0.06] border-accent/50',
      )}
      onClick={clickable ? onClick : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn('h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0', iconBg)}>
            <TmRollIcon className={cn('h-5 w-5', iconColor)} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{line.ref_label || '—'}</p>
            {line.colori_reference && <p className="text-[11px] text-muted-foreground truncate">{line.colori_reference}</p>}
          </div>
        </div>
        {/* Ordered quantity — the target the picked pieces work towards. */}
        <span className="text-[11px] text-muted-foreground tabular-nums flex-shrink-0">
          Commandé {fmtNum(line.quantite, 1)} {line.unite_label}
        </span>
      </div>
      <div className="flex items-center gap-3 mt-2 ml-9 text-[11px] text-muted-foreground tabular-nums">
        <span className="font-medium text-foreground">{line.nb_pieces_exp} pièce{line.nb_pieces_exp > 1 ? 's' : ''}</span>
        {line.poids_exp > 0 && <span>· {fmtNum(line.poids_exp, 1)} kg</span>}
        <span className="ml-auto text-muted-foreground/70">{line.nb_pieces_dispo} dispo.</span>
      </div>
    </div>
  )
}

// ── Piece drawer (assign/unassign tombé de métier to the avis) ──

function PieceDrawer({
  expeditionId, ligne, editable, onClose, onSuccess,
}: {
  expeditionId: number
  ligne: ExpeditionLigne
  editable: boolean
  onClose: () => void
  onSuccess: () => void
}) {
  const queryClient = useQueryClient()
  const queryKey = ['expedition-trm-pieces', expeditionId, ligne.IDligne_commande_client]
  const base = `/expeditions-trm/${expeditionId}/lignes/${ligne.IDligne_commande_client}/pieces`

  const { data, isLoading, isError } = useQuery<PiecePayload>({
    queryKey,
    queryFn: () => apiFetch(base),
  })

  // Mutations return the full refreshed payload (mps_designer §31.6) — no
  // refetch round-trip, no flicker as pieces move between the two lists.
  const linkMut = useMutation({
    mutationFn: (stockId: number) => apiFetch(`${base}/${stockId}`, { method: 'PUT' }),
    onSuccess: (payload: PiecePayload) => { queryClient.setQueryData(queryKey, payload); onSuccess() },
  })
  const unlinkMut = useMutation({
    mutationFn: (stockId: number) => apiFetch(`${base}/${stockId}`, { method: 'DELETE' }),
    onSuccess: (payload: PiecePayload) => { queryClient.setQueryData(queryKey, payload); onSuccess() },
  })

  const onExp = data?.onExp ?? []
  const dispo = data?.dispo ?? []
  const shippedPoids = onExp.reduce((s, p) => s + p.poids, 0)

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-zinc-100/80">
      <div className="flex-shrink-0 px-3 py-1.5 border-b bg-zinc-200/50 flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground truncate">
          {ligne.ref_label || 'Pièces'}{ligne.colori_reference ? ` · ${ligne.colori_reference}` : ''}
          {onExp.length > 0 && (
            <span className="ml-2 font-normal tabular-nums">
              {fmtNum(shippedPoids, 1)} / {fmtNum(ligne.quantite, 1)} {ligne.unite_label}
            </span>
          )}
        </span>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7" title="Fermer">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4 scrollbar-transparent">
        {isLoading && <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />)}</div>}
        {isError && (
          <div className="flex flex-col items-center justify-center py-6 text-destructive">
            <AlertCircle className="h-6 w-6 mb-2" /><p className="text-sm">Erreur de chargement</p>
          </div>
        )}
        {!isLoading && !isError && onExp.length === 0 && dispo.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <TmRollIcon className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm font-medium">Aucune pièce</p>
            <p className="text-xs mt-1 text-center">Aucune pièce de tombé métier n'est affectée à cette ligne de commande.</p>
          </div>
        )}

        {onExp.length > 0 && (
          <section>
            <h3 className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">Sur l'expédition ({onExp.length})</h3>
            <div className="space-y-1.5">
              {onExp.map((piece) => (
                <PieceRow key={piece.IDstock_ecru} piece={piece} action="unlink" disabled={!editable}
                  onAction={() => unlinkMut.mutate(piece.IDstock_ecru)}
                  isBusy={unlinkMut.isPending && unlinkMut.variables === piece.IDstock_ecru} />
              ))}
            </div>
          </section>
        )}

        {/* "Disponibles" only matters while the shipment can still be edited. */}
        {editable && dispo.length > 0 && (
          <section>
            <h3 className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">Disponibles ({dispo.length})</h3>
            <div className="space-y-1.5">
              {dispo.map((piece) => (
                <PieceRow key={piece.IDstock_ecru} piece={piece} action="link" disabled={!editable}
                  onAction={() => linkMut.mutate(piece.IDstock_ecru)}
                  isBusy={linkMut.isPending && linkMut.variables === piece.IDstock_ecru} />
              ))}
            </div>
          </section>
        )}

        {!isLoading && !isError && editable && onExp.length > 0 && dispo.length === 0 && (
          <p className="text-xs text-muted-foreground italic text-center">Aucune pièce supplémentaire disponible.</p>
        )}
      </div>
    </div>
  )
}

function PieceRow({
  piece, action, onAction, isBusy, disabled,
}: {
  piece: TrmPiece
  action: 'link' | 'unlink'
  onAction: () => void
  isBusy: boolean
  disabled: boolean
}) {
  // A piece the customer has already received can never be pulled back off the
  // avis (the API refuses it too) — say so instead of showing a dead button.
  const handedOver = action === 'unlink' && !piece.editable
  return (
    <div className="rounded-lg border border-border/60 bg-card shadow-sm p-3 flex items-center gap-3">
      <div className="h-10 w-10 rounded-md flex items-center justify-center flex-shrink-0 bg-zinc-100">
        <TmRollIcon className="h-7 w-7 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold truncate">{piece.numero || `Pièce ${piece.IDstock_ecru}`}</span>
          {!!piece.second_choix && <Badge variant="secondary" className="text-[10px] py-0 px-1.5">2nd choix</Badge>}
          {handedOver && (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 gap-1">
              <Lock className="h-2.5 w-2.5" />Réceptionnée
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground tabular-nums">
          <span className="font-medium text-foreground">{fmtNum(piece.poids, 1)} kg</span>
          {piece.machine_nom && (
            <span className="flex items-center gap-0.5"><Cog className="h-2.5 w-2.5" />{piece.machine_nom}</span>
          )}
          {piece.IDordre_fabrication > 0 && <span>· OF {piece.IDordre_fabrication}</span>}
        </div>
        {piece.defauts.length > 0 && (
          <p className="mt-1 text-[11px] text-amber-700 flex items-start gap-1">
            <AlertTriangle className="h-2.5 w-2.5 mt-[3px] flex-shrink-0" />
            <span className="truncate">{piece.defauts.join(' · ')}</span>
          </p>
        )}
        {piece.observations && (
          <p className="mt-0.5 text-[11px] text-muted-foreground truncate">{piece.observations}</p>
        )}
      </div>
      {!disabled && !handedOver && (
        <Button size="sm" variant={action === 'link' ? 'default' : 'outline'} onClick={onAction} disabled={isBusy} className="flex-shrink-0">
          {isBusy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            : action === 'link' ? <Link2 className="h-3.5 w-3.5 mr-1.5" /> : <Unlink className="h-3.5 w-3.5 mr-1.5" />}
          {action === 'link' ? 'Ajouter' : 'Retirer'}
        </Button>
      )}
    </div>
  )
}

// ── Right: Sidebar ─────────────────────────────────────

function DetailSidebar({
  expedition, isLoading, isEditing,
  editDate, onEditDateChange,
  editIDTransporteur, onEditIDTransporteurChange,
  editIDAdresse, onEditIDAdresseChange,
  editIDContact, onEditIDContactChange,
  editAfficheObs, onEditAfficheObsChange,
  editObservation, onEditObservationChange,
}: {
  expedition: ExpeditionDetail | null
  isLoading: boolean
  isEditing: boolean
  editDate: string; onEditDateChange: (v: string) => void
  editIDTransporteur: number; onEditIDTransporteurChange: (v: number) => void
  editIDAdresse: number; onEditIDAdresseChange: (v: number) => void
  editIDContact: number; onEditIDContactChange: (v: number) => void
  editAfficheObs: number; onEditAfficheObsChange: (v: number) => void
  editObservation: string; onEditObservationChange: (v: string) => void
}) {
  const [activeTab, setActiveTab] = useState<SidebarTab>('info')
  // Lookups (loaded only in edit mode).
  const { data: transporteurs } = useQuery<TransporteurLite[]>({
    queryKey: ['exp-trm-transporteurs'], queryFn: () => apiFetch('/expeditions-trm/lookups/transporteurs'), enabled: isEditing,
  })
  const clientId = expedition?.IDclient ?? 0
  const { data: adresses } = useQuery<AdresseLookup[]>({
    queryKey: ['exp-trm-adresses', clientId], queryFn: () => apiFetch(`/expeditions-trm/lookups/adresses?client=${clientId}`), enabled: isEditing && clientId > 0,
  })
  const { data: contacts } = useQuery<ContactLite[]>({
    queryKey: ['exp-trm-contacts', clientId], queryFn: () => apiFetch(`/expeditions-trm/lookups/contacts?client=${clientId}`), enabled: isEditing && clientId > 0,
  })

  if (isLoading) return (
    <div className="w-96 flex-shrink-0 flex flex-col gap-3 min-h-0">
      <div className="flex-1 bg-muted/30 rounded-xl border p-4 space-y-4">
        {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}
      </div>
    </div>
  )
  if (!expedition) return null

  const tabs: { key: SidebarTab; label: string; icon: ComponentType<{ className?: string }> }[] = [
    { key: 'info', label: 'Info', icon: Info },
    { key: 'factures', label: 'Factures', icon: Receipt },
  ]

  return (
    <div className="w-96 flex-shrink-0 flex flex-col gap-3 min-h-0">
      <div className="flex-1 min-h-0 rounded-xl border flex flex-col overflow-hidden bg-zinc-100/80">
        <div className="flex border-b p-1 gap-1 rounded-t-xl bg-zinc-200/50">
          {tabs.map((t) => {
            const TabIcon = t.icon
            const active = activeTab === t.key
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTab(t.key)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-sm font-medium rounded-md transition-colors',
                  active ? 'bg-accent text-accent-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent/10',
                )}
              >
                <TabIcon className="h-3.5 w-3.5" />{t.label}
              </button>
            )
          })}
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-transparent">
          {activeTab === 'info' ? (
            <InfoTab
              expedition={expedition} isEditing={isEditing}
              transporteurs={transporteurs ?? []} adresses={adresses ?? []} contacts={contacts ?? []}
              editDate={editDate} onEditDateChange={onEditDateChange}
              editIDTransporteur={editIDTransporteur} onEditIDTransporteurChange={onEditIDTransporteurChange}
              editIDAdresse={editIDAdresse} onEditIDAdresseChange={onEditIDAdresseChange}
              editIDContact={editIDContact} onEditIDContactChange={onEditIDContactChange}
              editAfficheObs={editAfficheObs} onEditAfficheObsChange={onEditAfficheObsChange}
              editObservation={editObservation} onEditObservationChange={onEditObservationChange}
            />
          ) : (
            <FacturesTab factures={expedition.factures} />
          )}
        </div>
      </div>
    </div>
  )
}

function FacturesTab({ factures }: { factures: FactureRef[] }) {
  if (factures.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Receipt className="h-10 w-10 mb-2 opacity-40" />
        <p className="text-sm">Aucune facture rattachée</p>
        <p className="text-xs mt-1 text-center">L'expédition reste modifiable tant qu'aucune facture définitive n'y est rattachée.</p>
      </div>
    )
  }
  return (
    <>
      {factures.map((f) => (
        <div key={f.IDfacture} className="p-3 rounded-lg border bg-card shadow-sm">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0 bg-green-500/10">
              <Receipt className="h-3.5 w-3.5 text-green-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">
                {f.type === 2 ? 'Avoir' : 'Facture'} N° {f.numero ?? f.IDfacture}
              </p>
              {f.date && <p className="text-[11px] text-muted-foreground">{formatHfsqlDate(f.date)}</p>}
            </div>
            <Badge variant="secondary" className="text-[10px] py-0 gap-1 flex-shrink-0">
              <Lock className="h-2.5 w-2.5" />Définitive
            </Badge>
          </div>
        </div>
      ))}
    </>
  )
}

function InfoTab({
  expedition, isEditing, transporteurs, adresses, contacts,
  editDate, onEditDateChange,
  editIDTransporteur, onEditIDTransporteurChange,
  editIDAdresse, onEditIDAdresseChange,
  editIDContact, onEditIDContactChange,
  editAfficheObs, onEditAfficheObsChange,
  editObservation, onEditObservationChange,
}: {
  expedition: ExpeditionDetail
  isEditing: boolean
  transporteurs: TransporteurLite[]
  adresses: AdresseLookup[]
  contacts: ContactLite[]
  editDate: string; onEditDateChange: (v: string) => void
  editIDTransporteur: number; onEditIDTransporteurChange: (v: number) => void
  editIDAdresse: number; onEditIDAdresseChange: (v: number) => void
  editIDContact: number; onEditIDContactChange: (v: number) => void
  editAfficheObs: number; onEditAfficheObsChange: (v: number) => void
  editObservation: string; onEditObservationChange: (v: string) => void
}) {
  return (
    <div className="space-y-3">
      <div className={cn('p-3 rounded-lg border bg-card shadow-sm space-y-2', isEditing && editSectionClass)}>
        {/* Client, commande and réf. client all belong to the commande_client
            this avis fulfils — read-only here so the shipment screen can't
            rewrite the order (the legacy sheet's editable combos did). */}
        <KV label="Client" value={expedition.client_nom || '—'} />
        <KV label="Commande" value={expedition.commande_numero != null ? `N° ${expedition.commande_numero}` : '—'} />
        <KV label="Réf. client" value={expedition.ref_client || '—'} />
        <KV label="Date" value={isEditing ? (
          <input type="date" value={editDate} onChange={(e) => onEditDateChange(e.target.value)}
            className="h-7 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring text-right" />
        ) : (expedition.date ? formatHfsqlDate(expedition.date) : '—')} />
        <KV label="Transporteur" value={isEditing ? (
          <PopoverSelect size="sm" options={transporteurs.map((t) => ({ id: t.IDtransporteur, primary: t.nom }))}
            value={editIDTransporteur} onChange={onEditIDTransporteurChange} emptyLabel="—" />
        ) : (expedition.transporteur_nom || '—')} />
        <KV label="Contact" value={isEditing ? (
          <PopoverSelect size="sm" options={contacts.map((c) => ({ id: c.IDcontact, primary: c.nom, secondary: c.mail || undefined }))}
            value={editIDContact} onChange={onEditIDContactChange} emptyLabel="—" />
        ) : (expedition.contact_nom || '—')} />
        {/* Legacy "Afficher les observations" checkbox — drives the
            Observations column on the printed avis. */}
        <KV label="Observations sur le BL" value={isEditing ? (
          <ToggleSwitch value={editAfficheObs === 1} onChange={(v) => onEditAfficheObsChange(v ? 1 : 0)} />
        ) : (expedition.affiche_observations ? 'Oui' : 'Non')} />
        <KV label="Donation" value={expedition.donation ? 'Oui' : 'Non'} />
      </div>

      <AdresseCard
        adresse={expedition.adresse_livraison}
        isEditing={isEditing}
        options={adresses}
        selectedId={editIDAdresse}
        onSelect={onEditIDAdresseChange}
      />

      <div className={cn('p-3 rounded-lg border bg-card shadow-sm', isEditing && editSectionClass)}>
        <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mb-2"><FileText className="h-3.5 w-3.5" />Observations (BL)</p>
        {isEditing ? (
          <textarea value={editObservation} onChange={(e) => onEditObservationChange(e.target.value)} rows={3}
            placeholder="Observations imprimées sur l'avis d'expédition…"
            className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y" />
        ) : (
          expedition.observation_bl?.trim()
            ? <p className="text-sm text-muted-foreground whitespace-pre-line">{expedition.observation_bl}</p>
            : <p className="text-sm text-muted-foreground italic">Aucune observation</p>
        )}
      </div>
    </div>
  )
}

// ── Address card + picker ──────────────────────────────

function AdresseCard({
  adresse, isEditing, options, selectedId, onSelect,
}: {
  adresse: AdresseLite | null
  isEditing: boolean
  options: AdresseLookup[]
  selectedId: number
  onSelect: (id: number) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const displayAdresse: AdresseLite | null = isEditing ? (options.find((o) => o.IDadresse === selectedId) ?? adresse) : adresse
  return (
    <div className={cn('p-3 rounded-lg border bg-card shadow-sm', isEditing && editSectionClass)}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />Adresse de livraison</p>
        {isEditing && (
          <Button variant="outline" size="sm" className="h-6 px-2 text-[11px] gap-1" onClick={() => setPickerOpen(true)}>
            <Search className="h-3 w-3" />Choisir
          </Button>
        )}
      </div>
      {displayAdresse ? (
        <div className="text-xs text-muted-foreground space-y-0.5">
          {displayAdresse.nom && <p className="font-medium text-foreground">{displayAdresse.nom}</p>}
          {displayAdresse.adresse1 && <p>{displayAdresse.adresse1}</p>}
          {displayAdresse.adresse2 && <p>{displayAdresse.adresse2}</p>}
          {displayAdresse.adresse3 && <p>{displayAdresse.adresse3}</p>}
          {(displayAdresse.cp || displayAdresse.ville) && <p>{[displayAdresse.cp, displayAdresse.ville].filter(Boolean).join(' ')}</p>}
          {displayAdresse.pays && <p>{displayAdresse.pays}</p>}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic">Aucune adresse</p>
      )}
      <AdressePickerDialog open={pickerOpen} onClose={() => setPickerOpen(false)}
        options={options} selectedId={selectedId} onSelect={(id) => { onSelect(id); setPickerOpen(false) }} />
    </div>
  )
}

function AdressePickerDialog({
  open, onClose, options, selectedId, onSelect,
}: {
  open: boolean
  onClose: () => void
  options: AdresseLookup[]
  selectedId: number
  onSelect: (id: number) => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg space-y-4" onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><MapPin className="h-5 w-5 text-accent" />Choisir une adresse de livraison</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto space-y-2 px-1">
          {options.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <MapPin className="h-10 w-10 mb-2 opacity-40" /><p className="text-sm">Aucune adresse disponible</p>
            </div>
          ) : options.map((a) => {
            const isSelected = a.IDadresse === selectedId
            return (
              <button
                key={a.IDadresse}
                type="button"
                onClick={() => onSelect(a.IDadresse)}
                className={cn('w-full text-left p-3 rounded-lg border transition-all',
                  isSelected ? 'border-accent bg-accent/5 ring-1 ring-accent' : 'border-border bg-card hover:border-accent/50 hover:bg-accent/[0.02]')}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm truncate">{a.nom || `Adresse #${a.IDadresse}`}</p>
                      {!!a.est_defaut_livraison && <Badge variant="outline" className="text-[10px] py-0">Livraison</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                      {a.adresse1 && <p className="truncate">{a.adresse1}</p>}
                      {(a.cp || a.ville) && <p>{[a.cp, a.ville].filter(Boolean).join(' ')}</p>}
                      {a.pays && <p>{a.pays}</p>}
                    </div>
                  </div>
                  {isSelected && <CheckCircle2 className="h-4 w-4 text-accent flex-shrink-0 mt-0.5" />}
                </div>
              </button>
            )
          })}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Annuler</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Create dialog ──────────────────────────────────────

function CreateExpeditionDialog({
  open, onClose, onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (newId: number) => void
}) {
  const [commandeId, setCommandeId] = useState(0)
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [error, setError] = useState<string | null>(null)

  const { data: commandes } = useQuery<CommandeLite[]>({
    queryKey: ['exp-trm-create-commandes'], queryFn: () => apiFetch('/expeditions-trm/lookups/commandes'), enabled: open,
  })

  useEffect(() => {
    if (open) { setCommandeId(0); setDate(new Date().toISOString().slice(0, 10)); setError(null) }
  }, [open])

  const createMut = useMutation({
    mutationFn: () => apiFetch('/expeditions-trm', {
      method: 'POST',
      body: JSON.stringify({ IDcommande_client: commandeId, date: inputDateToHfsql(date) }),
    }),
    onSuccess: (data: { id: number }) => onCreated(data.id),
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Erreur'),
  })

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md" onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Truck className="h-5 w-5 text-accent" />Nouvelle expédition</DialogTitle>
        </DialogHeader>
        <div className="mt-4 space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Commande</label>
            <SearchableCombobox<CommandeLite>
              options={commandes ?? []}
              value={commandeId}
              onChange={setCommandeId}
              getId={(c) => c.IDcommande_client}
              getPrimary={(c) => `N° ${c.numero ?? c.IDcommande_client} · ${c.client_nom}`}
              getSecondary={(c) => [c.ref_client, c.date_commande ? formatHfsqlDate(c.date_commande) : ''].filter(Boolean).join(' · ') || undefined}
              placeholder="Choisir une commande"
            />
            <p className="text-[11px] text-muted-foreground">Le transporteur et l'adresse de livraison seront pré-remplis.</p>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cn(inputClass, 'h-9')} />
          </div>

          {error && (
            <div className="flex items-start gap-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" /><span>{error}</span>
            </div>
          )}
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={() => createMut.mutate()} disabled={commandeId <= 0 || createMut.isPending}>
            {createMut.isPending ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Création...</> : <><Save className="h-3.5 w-3.5 mr-1.5" />Créer</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Shared bits ────────────────────────────────────────

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-right truncate">{value}</span>
    </div>
  )
}

function ToggleSwitch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={cn(
        'relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        value ? 'bg-accent shadow-inner' : 'bg-zinc-300 hover:bg-zinc-400/80',
      )}
    >
      <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ease-out', value ? 'translate-x-[18px]' : 'translate-x-0.5')} />
    </button>
  )
}
