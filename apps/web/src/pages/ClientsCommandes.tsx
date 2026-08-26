// Clients › Commandes (TRM) — port of the legacy WinDev "Tricotage Malterre >
// Commandes" window (FI_Commande_TRMV2).
//
// Layout is the "Fiche" 3-panel master-detail (mps_designer §4): order list on
// the left, the order's lines in the centre, header info on the right. Clicking
// a line opens the contained drawer (§31) that replaces the legacy "Progression"
// panel and carries its four tabs — Affectation, Stock de fil, Ordre de
// fabrication, Expédition.
//
// TRM sells what its own machines knit, so a line is followed through
// PRODUCTION rather than through stock reservation the way the ETM screen's
// lines are. "Produit" is the weight the OFs actually dropped; the gauge and
// the phase pill both read off it.
//
// ── Mirrored orders are read-only ──
// 93 % of TRM orders mirror an ETM sous-traitant order (`is_mirror`); ETM owns
// their header and lines and syncs them down, and there is no reverse sync. On
// those, the screen hides "Modifier" and shows a lock badge pointing at the ETM
// commande instead. Native TRM orders (created here) are fully editable. The
// API enforces the same rule — see commandes-trm.ts § refuseIfMirror.

import { useState, useMemo, useEffect, useCallback, useRef, type ReactNode, type ComponentType } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UnsavedChangesDialog } from '@/components/shared/UnsavedChangesDialog'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard'
import { useAutoSelectFirst } from '@/hooks/useAutoSelectFirst'
import {
  ShoppingCart,
  Search,
  Loader2,
  AlertCircle,
  Info,
  MapPin,
  Pencil,
  Plus,
  X,
  Save,
  Trash2,
  MessageSquare,
  CheckCircle2,
  Clock,
  Package,
  Layers,
  Lock,
  Link2,
  Truck,
  ClipboardList,
  Factory,
  AlertTriangle,
  Printer,
  AtSign,
} from 'lucide-react'
import { TmRollIcon } from '@/components/icons/TmRollIcon'
import { BobineIcon } from '@/components/icons/BobineIcon'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { PopoverSelect, SearchableCombobox } from '@/components/ui/popover-select'
import { MasterDetailLayout } from '@/components/layout/MasterDetailLayout'
import { cn } from '@/lib/utils'
import { formatHfsqlDate, hfsqlDateToInput, inputDateToHfsql } from '@/lib/dates'
import { fmtNum } from '@/lib/format'
import { apiFetch, API_URL } from '@/lib/api'
import { SendEmailDialog } from '@/components/email/SendEmailDialog'
import { CreateOfDialog } from '@/components/of/CreateOfDialog'
import { Checkbox } from '@/components/ui/checkbox'
import { postEmail } from '@/lib/email'
import { useHasPermission } from '@/contexts/PermissionsContext'

// ── Types ──────────────────────────────────────────────

type TrmPhase = 'a_lancer' | 'en_prod' | 'terminee'
type StatusFilter = 'all' | 'open' | 'terminee'

interface CommandeListRow {
  IDcommande_client: number
  IDclient: number
  numero: number | null
  date_commande: string | null
  ref_client: string | null
  est_soldee: number
  is_mirror: boolean
  IDcommande_ETM: number
  client_nom: string
  phase: TrmPhase
  total_eur: number
  total_qte: number
  produit: number
  nb_lignes: number
  earliest_delivery: string | null
}

interface LigneCommande {
  IDligne_commande_client: number
  IDcommande_client: number
  type: number
  IDreference: number
  IDcolori: number
  quantite: number
  unite: number
  unite_label: string
  prix: number
  date_livraison: string | null
  commentaire: string | null
  ref_label: string | null
  ref_designation: string | null
  contexture: string | null
  colori_reference: string | null
  montant: number
  /** TRM's own cost of knitting this weight (PrixDeRevientTRM). */
  cout_revient: number | null
  /** Margin the legacy card prints next to the price, e.g. "37 %". */
  marge_pct: number | null
  nb_pieces: number
  produit: number
  expedie: number
  IDligne_commande_ETM: number
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
  est_defaut?: number
  est_defaut_facturation?: number
  est_defaut_livraison?: number
}

interface CommandeDetail {
  IDcommande_client: number
  IDclient: number
  client_nom: string
  client_fiche: string | null
  numero: number | null
  date_commande: string | null
  ref_client: string | null
  IDadresse_livraison: number
  IDadresse_facturation: number
  IDmode_paiement: number
  IDecheance: number
  commentaire: string | null
  commentaire_interne: string | null
  est_soldee: number
  remise: number
  IDcommande_ETM: number
  is_mirror: boolean
  adresse_livraison: AdresseLite | null
  adresse_facturation: AdresseLite | null
  lignes: LigneCommande[]
  phase: TrmPhase
}

interface ClientLite { IDclient: number; nom: string; IDmode_paiement?: number; IDecheance?: number }
interface ModePaiement { IDmode_paiement: number; libelle: string }
interface Echeance { IDecheance: number; libelle: string }
interface RefEcru { IDref_ecru: number; reference: string; designation: string; prix: number }
interface ColoriEcru { IDcolori_ecru: number; reference: string }

interface DefautQualite {
  IDdefaut_qualite: number
  description: string | null
  type_defaut: string | null
  taille_cm: number | null
}

interface AffectationPiece {
  id: number
  numero: string | null
  lot: string | null
  poids: number
  metrage: number
  second_choix: number
  observations: string | null
  date_saisie: string | null
  num_piece_OF: number
  IDordre_fabrication: number
  expedie: boolean
  defects: DefautQualite[]
}

interface PiecesPayload {
  pieces: AffectationPiece[]
  commande: number
  produit: number
  expedie: number
  disponible_1er_choix: number
}

interface StockFilLot {
  id: number
  /** The (fil, coloris) pair — what maps a ticked lot onto a composition row. */
  IDref_fil: number
  IDcolori_fil: number
  lot: string | null
  reference: string
  coloris: string
  emplacement: string | null
  fournisseur: string
  client: string
  stock: number
  stock_initial: number
  pourcentage: number
}

/** One (fil, coloris) of the reference's composition — every one of them, even
 *  those this client holds no lot of. `lots` cannot express that case, and it
 *  is exactly the one where an OF must not be launchable. */
interface StockFilComposant {
  IDref_fil: number
  IDcolori_fil: number
  pourcentage: number
  ref_label: string
  coloris_label: string
}

interface StockFilPayload {
  lots: StockFilLot[]
  composants: StockFilComposant[]
  potentiel_kg: number
  ecru_ref_label: string
  ecru_coloris_label: string
  /** The order's client. TRM knits à façon — the client supplies the yarn, so
   *  this tab only lists lots THIS client owns, and an empty list has to say
   *  whose yarn is missing rather than read as a broken screen. */
  client_nom: string
}

interface OrdreFabrication {
  id: number
  machine: string
  IDmachine: number
  rouleaux: number
  poids_piece: number
  quantite: number
  realise: number
  progression_pct: number
  finir_fil: number
  est_actif: number
  est_termine: number
  prioritaire: number
  date_creation: string | null
  planning_depart: string | null
  planning_fin: string | null
  observations: string | null
  fils: string[]
}

interface OrdresPayload {
  ordres: OrdreFabrication[]
  compatibles: string[]
  commande: number
}

interface ExpeditionRoll { id: number; numero: string | null; lot: string | null; poids: number; magasin: string }

interface ExpeditionRow {
  id: number
  date: string | null
  est_valide: number
  est_facture: number
  transporteur: string
  adresse: AdresseLite | null
  observation_bl: string | null
  poids: number
  rolls: ExpeditionRoll[]
}

// ── Shared styling ─────────────────────────────────────

const inputClass = 'w-full h-8 px-2.5 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring'
const editSectionClass = 'border-l-4 border-l-accent/70 bg-accent/[0.03]'

// ── Status / phase helpers ─────────────────────────────

const PHASE_META: Record<TrmPhase, { label: string; solid: string; icon: React.ElementType }> = {
  a_lancer: { label: 'À lancer', solid: 'bg-slate-500 border-slate-500', icon: Package },
  en_prod: { label: 'En production', solid: 'bg-primary border-primary', icon: Factory },
  terminee: { label: 'Terminée', solid: 'bg-success border-success', icon: CheckCircle2 },
}

function PhasePill({ phase, className }: { phase: TrmPhase; className?: string }) {
  const meta = PHASE_META[phase] ?? PHASE_META.a_lancer
  const Icon = meta.icon
  return (
    <Badge variant="outline" className={cn('text-[10px] py-0 gap-1 border text-white', meta.solid, className)}>
      <Icon className="h-2.5 w-2.5" />{meta.label}
    </Badge>
  )
}

/** Delivery-urgency flag based on a line's delivery date (mps_designer §30.1). */
function deliveryUrgency(hfsql: string | null, estSoldee: number): 'late' | 'soon' | null {
  if (estSoldee === 1) return null
  if (!hfsql || !/^\d{8}$/.test(hfsql)) return null
  const target = new Date(Number(hfsql.slice(0, 4)), Number(hfsql.slice(4, 6)) - 1, Number(hfsql.slice(6, 8)))
  target.setHours(0, 0, 0, 0)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000)
  if (diffDays <= 0) return 'late'
  if (diffDays <= 3) return 'soon'
  return null
}

function lineCardColors(line: LigneCommande) {
  const target = Number(line.quantite) || 0
  const done = target > 0 && line.produit >= target - 0.001
  if (done) return { border: 'border-l-green-500/60', iconBg: 'bg-green-500/10', iconColor: 'text-green-600' }
  if (line.produit > 0) return { border: 'border-l-amber-400/60', iconBg: 'bg-amber-400/10', iconColor: 'text-amber-600' }
  return { border: 'border-l-border', iconBg: 'bg-muted', iconColor: 'text-muted-foreground' }
}

/** Datetime the pieces table shows in "Date de saisie" — the column is a full
 *  HFSQL DATETIME here, not the 8-char date the rest of the app uses. */
function formatSaisie(raw: string | null): string {
  if (!raw) return '—'
  if (/^\d{8}$/.test(raw)) return formatHfsqlDate(raw)
  const d = new Date(raw.replace(' ', 'T'))
  if (isNaN(d.getTime())) return raw
  return d.toLocaleDateString('fr-FR')
}

// ── Main Page ──────────────────────────────────────────

export function ClientsCommandes() {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open')
  // Amber counter pill: narrow to the orders no OF has been created for yet.
  const [amberOnly, setAmberOnly] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  // TRM permission gate: create / edit / delete of native orders and their
  // lines ("Nouvelle", "Modifier", "Supprimer"). The API enforces it too
  // (403 edit_commandes_client); view-mode workflows (état, progression,
  // documents) stay open. Admins bypass via /permissions-trm/me.
  const canEditCommandes = useHasPermission('edit_commandes_client')
  const [progressionLineId, setProgressionLineId] = useState<number | null>(null)
  const [autoEditForId, setAutoEditForId] = useState<number | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [writeError, setWriteError] = useState<string | null>(null)
  const [emailOpen, setEmailOpen] = useState(false)

  // Edit-mode header draft.
  const [editDateCommande, setEditDateCommande] = useState('')
  const [editRefClient, setEditRefClient] = useState('')
  const [editCommentaire, setEditCommentaire] = useState('')
  const [editCommentaireInterne, setEditCommentaireInterne] = useState('')
  const [editIDModePaiement, setEditIDModePaiement] = useState(0)
  const [editIDEcheance, setEditIDEcheance] = useState(0)
  const [editRemise, setEditRemise] = useState('')
  const [editIDAdresseFacturation, setEditIDAdresseFacturation] = useState(0)
  const [editIDAdresseLivraison, setEditIDAdresseLivraison] = useState(0)

  const originalDraftRef = useRef<Record<string, string | number> | null>(null)
  const [linesDirty, setLinesDirty] = useState(false)

  // Debounce search (server-side).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 250)
    return () => clearTimeout(t)
  }, [searchQuery])

  const { data: commandes, isLoading, isError, error, isFetching } = useQuery<CommandeListRow[]>({
    queryKey: ['commandes-trm', statusFilter, debouncedQuery],
    queryFn: () => apiFetch(`/commandes-trm?status=${statusFilter}&q=${encodeURIComponent(debouncedQuery)}&limit=200`),
  })

  const { data: detail, isLoading: detailLoading } = useQuery<CommandeDetail>({
    queryKey: ['commande-trm', selectedId],
    queryFn: () => apiFetch(`/commandes-trm/${selectedId}`),
    enabled: selectedId !== null,
  })

  useEffect(() => { setProgressionLineId(null) }, [selectedId])

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['commandes-trm'] })
    queryClient.invalidateQueries({ queryKey: ['commande-trm', selectedId] })
    queryClient.invalidateQueries({ queryKey: ['commande-trm-pieces'] })
    queryClient.invalidateQueries({ queryKey: ['commande-trm-stock-fil'] })
    queryClient.invalidateQueries({ queryKey: ['commande-trm-ordres'] })
    queryClient.invalidateQueries({ queryKey: ['commande-trm-expeditions'] })
  }, [queryClient, selectedId])

  const startEdit = useCallback(() => {
    if (!detail) return
    const snapshot = {
      dateCommande: hfsqlDateToInput(detail.date_commande),
      refClient: detail.ref_client?.trim() ?? '',
      commentaire: detail.commentaire?.trim() ?? '',
      commentaireInterne: detail.commentaire_interne?.trim() ?? '',
      IDmodePaiement: detail.IDmode_paiement ?? 0,
      IDecheance: detail.IDecheance ?? 0,
      remise: detail.remise ? String(detail.remise) : '',
      IDadresseFact: detail.IDadresse_facturation ?? 0,
      IDadresseLiv: detail.IDadresse_livraison ?? 0,
    }
    setEditDateCommande(snapshot.dateCommande)
    setEditRefClient(snapshot.refClient)
    setEditCommentaire(snapshot.commentaire)
    setEditCommentaireInterne(snapshot.commentaireInterne)
    setEditIDModePaiement(snapshot.IDmodePaiement)
    setEditIDEcheance(snapshot.IDecheance)
    setEditRemise(snapshot.remise)
    setEditIDAdresseFacturation(snapshot.IDadresseFact)
    setEditIDAdresseLivraison(snapshot.IDadresseLiv)
    originalDraftRef.current = snapshot
    setProgressionLineId(null)
    setIsEditing(true)
  }, [detail])

  const cancelEdit = useCallback(() => setIsEditing(false), [])

  const isDirty = useMemo(() => {
    if (!isEditing) return false
    const o = originalDraftRef.current
    if (!o) return false
    if (editDateCommande !== o.dateCommande) return true
    if (editRefClient !== o.refClient) return true
    if (editCommentaire !== o.commentaire) return true
    if (editCommentaireInterne !== o.commentaireInterne) return true
    if (editIDModePaiement !== o.IDmodePaiement) return true
    if (editIDEcheance !== o.IDecheance) return true
    if (editRemise !== o.remise) return true
    if (editIDAdresseFacturation !== o.IDadresseFact) return true
    if (editIDAdresseLivraison !== o.IDadresseLiv) return true
    if (linesDirty) return true
    return false
  }, [isEditing, editDateCommande, editRefClient, editCommentaire, editCommentaireInterne,
    editIDModePaiement, editIDEcheance, editRemise, editIDAdresseFacturation, editIDAdresseLivraison, linesDirty])

  const saveHeaderMut = useMutation({
    mutationFn: () => apiFetch(`/commandes-trm/${selectedId}`, {
      method: 'PUT',
      body: JSON.stringify({
        date_commande: inputDateToHfsql(editDateCommande),
        ref_client: editRefClient,
        commentaire: editCommentaire,
        commentaire_interne: editCommentaireInterne,
        IDmode_paiement: editIDModePaiement || 0,
        IDecheance: editIDEcheance || 0,
        remise: Number(editRemise) || 0,
        IDadresse_facturation: editIDAdresseFacturation || 0,
        IDadresse_livraison: editIDAdresseLivraison || 0,
      }),
    }),
    onSuccess: () => { invalidateAll(); setIsEditing(false) },
    onError: () => setWriteError("Enregistrement refusé — cette commande est peut-être pilotée par ETM."),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/commandes-trm/${id}`, { method: 'DELETE' }),
    onSuccess: (_data, deletedId) => {
      // Read the cache BEFORE invalidating so the next selection is the row
      // that takes the deleted one's place (mps_designer §25.2).
      const cached = queryClient.getQueryData<CommandeListRow[]>(['commandes-trm', statusFilter, debouncedQuery]) ?? []
      const remaining = cached.filter((c) => c.IDcommande_client !== deletedId)
      queryClient.invalidateQueries({ queryKey: ['commandes-trm'] })
      setIsEditing(false)
      setDeleteConfirmOpen(false)
      setSelectedId(remaining.length > 0 ? remaining[0].IDcommande_client : null)
    },
    onError: () => {
      setDeleteConfirmOpen(false)
      setWriteError('Suppression impossible : la production a déjà été lancée ou la commande est pilotée par ETM.')
    },
  })

  useEffect(() => {
    if (autoEditForId !== null && detail?.IDcommande_client === autoEditForId) {
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

  const toggleEtatMut = useMutation({
    mutationFn: (newEtat: number) => apiFetch(`/commandes-trm/${selectedId}/etat`, {
      method: 'PUT',
      body: JSON.stringify({ est_soldee: newEtat }),
    }),
    onSuccess: invalidateAll,
    onError: () => setWriteError("Changement d'état refusé — cette commande est pilotée par ETM."),
  })

  const handleSelect = useCallback((id: number) => {
    guard.guardAction(() => { setIsEditing(false); setSelectedId(id) })
  }, [guard])

  const handleStatusFilterChange = useCallback((s: StatusFilter) => {
    guard.guardAction(() => { setIsEditing(false); setStatusFilter(s); setSelectedId(null) })
  }, [guard])

  const rows = commandes ?? []

  // "À lancer" counter pill (mps_designer §41): open orders with no OF yet.
  // Hidden at 0, so an armed-but-empty filter can never strand the user.
  const amberCount = rows.reduce((n, r) => n + (r.phase === 'a_lancer' ? 1 : 0), 0)
  const amberActive = amberOnly && amberCount > 0
  const visibleRows = amberActive ? rows.filter((r) => r.phase === 'a_lancer') : rows

  useAutoSelectFirst({
    rows: visibleRows,
    selectedId,
    getId: (c) => c.IDcommande_client,
    select: setSelectedId,
    // Server-filtered list → also suspend while refetching, or creating an
    // order would lose its freshly-set selection to the stale array.
    suspended: isEditing || isFetching || autoEditForId !== null,
  })

  return (
    <>
      <MasterDetailLayout
        list={
          <CommandeList
            rows={visibleRows}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            selectedId={selectedId}
            onSelect={handleSelect}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={handleStatusFilterChange}
            amberCount={amberCount}
            amberOn={amberActive}
            onToggleAmber={() => setAmberOnly((v) => !v)}
            onNew={() => setCreateOpen(true)}
            isEditing={isEditing}
            canEdit={canEditCommandes}
          />
        }
        detailHeader={
          <DetailHeader
            commande={detail ?? null}
            isLoading={detailLoading && selectedId !== null}
            isEditing={isEditing}
            canEdit={canEditCommandes}
            onStartEdit={startEdit}
            onCancelEdit={cancelEdit}
            onSave={() => saveHeaderMut.mutate()}
            isSaving={saveHeaderMut.isPending}
            onDelete={() => setDeleteConfirmOpen(true)}
            onPrint={() => { if (selectedId !== null) window.open(`${API_URL}/commandes-trm/${selectedId}/pdf`, '_blank') }}
            onEmail={() => setEmailOpen(true)}
          />
        }
        detail={
          <DetailMain
            commande={detail ?? null}
            isLoading={detailLoading && selectedId !== null}
            hasSelection={selectedId !== null}
            isEditing={isEditing}
            onMutationSuccess={invalidateAll}
            onLinesDirtyChange={setLinesDirty}
            progressionLineId={progressionLineId}
            onOpenProgression={setProgressionLineId}
          />
        }
        sidebar={selectedId !== null ? (
          <DetailSidebar
            commande={detail ?? null}
            isLoading={detailLoading}
            isEditing={isEditing}
            editDateCommande={editDateCommande} onEditDateCommandeChange={setEditDateCommande}
            editRefClient={editRefClient} onEditRefClientChange={setEditRefClient}
            editCommentaire={editCommentaire} onEditCommentaireChange={setEditCommentaire}
            editCommentaireInterne={editCommentaireInterne} onEditCommentaireInterneChange={setEditCommentaireInterne}
            editIDModePaiement={editIDModePaiement} onEditIDModePaiementChange={setEditIDModePaiement}
            editIDEcheance={editIDEcheance} onEditIDEcheanceChange={setEditIDEcheance}
            editRemise={editRemise} onEditRemiseChange={setEditRemise}
            editIDAdresseFacturation={editIDAdresseFacturation} onEditIDAdresseFacturationChange={setEditIDAdresseFacturation}
            editIDAdresseLivraison={editIDAdresseLivraison} onEditIDAdresseLivraisonChange={setEditIDAdresseLivraison}
            onToggleEtat={() => toggleEtatMut.mutate(detail?.est_soldee === 1 ? 0 : 1)}
            isTogglingEtat={toggleEtatMut.isPending}
          />
        ) : null}
        sidebarTitle="Informations"
        hasSelection={selectedId !== null}
        onBack={() => guard.guardAction(() => { setIsEditing(false); setSelectedId(null) })}
      />

      <UnsavedChangesDialog open={guard.showDialog} onAction={guard.handleAction} isSaving={guard.isSaving} />

      <CreateCommandeDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(newId) => {
          setCreateOpen(false)
          queryClient.invalidateQueries({ queryKey: ['commandes-trm'] })
          setSelectedId(newId)
          setAutoEditForId(newId)
        }}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Supprimer la commande"
        description="Cette action supprimera la commande et ses lignes. Elle est irréversible et n'est possible que si aucun ordre de fabrication ni expédition n'existe."
        confirmLabel="Supprimer"
        isPending={deleteMut.isPending}
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={() => {
          // Reset edit mode BEFORE mutating so the unsaved guard doesn't fire
          // on the follow-up selection change (mps_designer §28.5).
          if (selectedId !== null) { setIsEditing(false); deleteMut.mutate(selectedId) }
        }}
      />

      <ConfirmDialog
        open={writeError !== null}
        variant="default"
        title="Action impossible"
        description={writeError ?? ''}
        confirmLabel="Fermer"
        onCancel={() => setWriteError(null)}
        onConfirm={() => setWriteError(null)}
      />

      {/* Confirmation de commande — the PDF is the attachment AND the preview
          pane. No CGV rides along, unlike ETM's confirmation: those are ETS
          Malterre's terms, and TRM has none of its own to attach. */}
      {selectedId !== null && (
        <SendEmailDialog
          open={emailOpen}
          onClose={() => setEmailOpen(false)}
          contextLabel={detail?.client_nom ?? undefined}
          queryKey={['trm-commande-email-defaults', selectedId]}
          loadDefaults={() => apiFetch(`/commandes-trm/${selectedId}/email-defaults`)}
          pdfUrl={`${API_URL}/commandes-trm/${selectedId}/pdf`}
          pdfAttachmentLabel={`confirmation-commande-${detail?.numero ?? selectedId}.pdf`}
          onSend={(p) => postEmail(`${API_URL}/commandes-trm/${selectedId}/email`, p, { includeAttachPdf: true })}
        />
      )}
    </>
  )
}

// ── Left Panel: List ───────────────────────────────────

function CommandeList({
  rows, isLoading, isError, error,
  selectedId, onSelect,
  searchQuery, onSearchChange,
  statusFilter, onStatusFilterChange,
  amberCount, amberOn, onToggleAmber,
  onNew, isEditing, canEdit,
}: {
  rows: CommandeListRow[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  selectedId: number | null
  onSelect: (id: number) => void
  searchQuery: string
  onSearchChange: (q: string) => void
  statusFilter: StatusFilter
  onStatusFilterChange: (s: StatusFilter) => void
  amberCount: number
  amberOn: boolean
  onToggleAmber: () => void
  onNew: () => void
  isEditing: boolean
  canEdit: boolean
}) {
  return (
    <div className="flex flex-col h-full rounded-lg border shadow-sm bg-zinc-100/80">
      <div className="p-3 border-b rounded-t-lg bg-zinc-200/50 space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Rechercher (n°, client, réf...)"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              autoComplete="off"
              className="w-full h-9 pl-9 pr-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          {amberCount > 0 && (
            <button
              type="button"
              onClick={onToggleAmber}
              aria-pressed={amberOn}
              title="Commandes sans ordre de fabrication"
              className={cn(
                'h-7 min-w-[1.75rem] px-1.5 inline-flex items-center justify-center rounded-md text-xs font-semibold tabular-nums border transition-colors flex-shrink-0',
                amberOn
                  ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                  : 'bg-amber-500/10 text-amber-800 border-amber-500/30 hover:bg-amber-500/20',
              )}
            >
              {amberCount}
            </button>
          )}
        </div>
        <div className="flex gap-1">
          {([
            { key: 'open', label: 'En cours' },
            { key: 'terminee', label: 'Soldées' },
            { key: 'all', label: 'Toutes' },
          ] as const).map((opt) => (
            <button
              key={opt.key}
              onClick={() => onStatusFilterChange(opt.key)}
              className={cn(
                'flex-1 px-2 py-1 text-xs rounded-md transition-colors',
                statusFilter === opt.key
                  ? 'bg-accent text-accent-foreground shadow-sm font-medium'
                  : 'text-muted-foreground hover:bg-accent/10',
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
            <ShoppingCart className="h-12 w-12 mb-3 opacity-50" />
            <p className="text-sm">Aucune commande</p>
          </div>
        ) : rows.map((row) => {
          const isSelected = selectedId === row.IDcommande_client
          const isAmber = row.phase === 'a_lancer'
          const selectedRingClass = isAmber
            ? 'border-amber-500 ring-1 ring-amber-500'
            : 'border-zinc-400 ring-1 ring-zinc-400'
          const hoverClass = isAmber
            ? 'border-border hover:border-amber-500/50'
            : 'border-border hover:border-zinc-400/60'
          return (
            <div
              key={row.IDcommande_client}
              onClick={() => onSelect(row.IDcommande_client)}
              className={cn(
                'p-3 border rounded-lg cursor-pointer transition-all bg-white',
                isSelected ? selectedRingClass : hoverClass,
                isAmber && 'shadow-[inset_4px_0_0_0_rgb(245_158_11)]',
              )}
            >
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="font-medium text-sm">N° {row.numero ?? row.IDcommande_client}</span>
                {row.is_mirror && (
                  <Lock className="h-3 w-3 text-muted-foreground/70 flex-shrink-0" aria-label="Pilotée par ETM" />
                )}
                <PhasePill phase={row.phase} className="ml-auto" />
              </div>
              <p className="text-xs text-muted-foreground mt-1 truncate">{row.client_nom || '—'}</p>
              {!!row.ref_client && (
                <p className="text-[11px] text-muted-foreground/80 mt-0.5 truncate italic">{row.ref_client}</p>
              )}
              <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                {row.date_commande && <span>{formatHfsqlDate(row.date_commande)}</span>}
                <span className="ml-auto text-muted-foreground/70 tabular-nums">
                  {fmtNum(row.produit)} / {fmtNum(row.total_qte)} Kgs
                </span>
                {row.total_eur > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-accent/10 font-medium text-foreground tabular-nums">
                    {fmtNum(row.total_eur)} €
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="p-3 border-t text-xs text-muted-foreground flex items-center justify-between rounded-b-lg bg-zinc-200/50">
        <span>{rows.length} commande{rows.length !== 1 ? 's' : ''}</span>
        {!isEditing && canEdit && (
          <Button size="sm" variant="ghost" onClick={onNew} className="text-accent hover:text-accent hover:bg-accent/10">
            <Plus className="h-3.5 w-3.5 mr-1" />Nouvelle
          </Button>
        )}
      </div>
    </div>
  )
}

// ── Center: Detail Header ──────────────────────────────

function DetailHeader({
  commande, isLoading, isEditing, canEdit,
  onStartEdit, onCancelEdit, onSave, isSaving, onDelete,
  onPrint, onEmail,
}: {
  commande: CommandeDetail | null
  isLoading: boolean
  isEditing: boolean
  canEdit: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSave: () => void
  isSaving: boolean
  onDelete: () => void
  onPrint: () => void
  onEmail: () => void
}) {
  if (!commande && !isLoading) return null
  const isMirror = commande?.is_mirror === true
  return (
    <div className="flex-shrink-0 pt-0.5">
      <div className="flex items-center gap-3">
        <div className={cn('h-11 w-11 rounded-lg flex items-center justify-center', isEditing ? 'bg-accent/15' : 'icon-box-gold')}>
          <ShoppingCart className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          {isLoading ? (
            <div className="h-8 w-48 bg-muted animate-pulse rounded" />
          ) : (
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-heading font-bold tracking-tight truncate">
                N° {commande?.numero ?? commande?.IDcommande_client}
                <span className="text-muted-foreground font-normal"> · {commande?.client_nom || '—'}</span>
              </h1>
              <div className="flex items-center gap-2 flex-shrink-0">
                {commande?.date_commande && (
                  <Badge variant="secondary" className="text-xs">{formatHfsqlDate(commande.date_commande)}</Badge>
                )}
                {isMirror && (
                  <Badge
                    variant="outline"
                    className="text-xs gap-1"
                    title={`Miroir de la commande sous-traitant ETM n° ${commande?.IDcommande_ETM}`}
                  >
                    <Lock className="h-3 w-3" />Pilotée par ETM
                  </Badge>
                )}
                {isEditing && (
                  <Badge className="bg-accent text-accent-foreground gap-1 shadow-sm">
                    <Pencil className="h-3 w-3" />Mode edition
                  </Badge>
                )}
              </div>
            </div>
          )}
        </div>
        {!isLoading && commande && (
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
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  {isSaving ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
              </>
            ) : (
              <>
                {/* Confirmation de commande — printable and sendable on every
                    order, mirrored ones included: it reads the commande, it
                    never writes it (see the API's PDF section). */}
                <Button variant="outline" size="icon" className="h-9 w-9" title="Imprimer la confirmation de commande" onClick={onPrint}>
                  <Printer className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-9 w-9" title="Envoyer la confirmation par email" onClick={onEmail}>
                  <AtSign className="h-4 w-4" />
                </Button>
                {!isMirror && canEdit && (
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
  commande, isLoading, hasSelection, isEditing, onMutationSuccess, onLinesDirtyChange,
  progressionLineId, onOpenProgression,
}: {
  commande: CommandeDetail | null
  isLoading: boolean
  hasSelection: boolean
  isEditing: boolean
  onMutationSuccess: () => void
  onLinesDirtyChange: (dirty: boolean) => void
  progressionLineId: number | null
  onOpenProgression: (lineId: number | null) => void
}) {
  if (!hasSelection) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="icon-box-gold h-16 w-16 mx-auto"><ShoppingCart className="h-8 w-8" /></div>
        <p className="text-muted-foreground text-sm">Sélectionnez une commande dans la liste</p>
      </div>
    </div>
  )
  if (isLoading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>
  if (!commande) return null

  return (
    <LignesSection
      commande={commande}
      isEditing={isEditing}
      onMutationSuccess={onMutationSuccess}
      onLinesDirtyChange={onLinesDirtyChange}
      progressionLineId={progressionLineId}
      onOpenProgression={onOpenProgression}
    />
  )
}

// ── Center: Lignes Section ─────────────────────────────

function LignesSection({
  commande, isEditing, onMutationSuccess, onLinesDirtyChange, progressionLineId, onOpenProgression,
}: {
  commande: CommandeDetail
  isEditing: boolean
  onMutationSuccess: () => void
  onLinesDirtyChange: (dirty: boolean) => void
  progressionLineId: number | null
  onOpenProgression: (lineId: number | null) => void
}) {
  const [lineDialogOpen, setLineDialogOpen] = useState(false)
  const [editingLine, setEditingLine] = useState<LigneCommande | null>(null)
  const [deleteLineConfirmId, setDeleteLineConfirmId] = useState<number | null>(null)
  const [lineError, setLineError] = useState<string | null>(null)

  // Lines are locked on a closed order AND on every mirror (ETM owns those).
  const linesLocked = commande.est_soldee === 1 || commande.is_mirror

  useEffect(() => {
    if (!isEditing || linesLocked) { setLineDialogOpen(false); setEditingLine(null) }
  }, [isEditing, linesLocked])

  // Surface sub-form dirty state to the page-level guard (mps_designer §28.3.a).
  const onLinesDirtyChangeRef = useRef(onLinesDirtyChange)
  useEffect(() => { onLinesDirtyChangeRef.current = onLinesDirtyChange })
  useEffect(() => { onLinesDirtyChangeRef.current(lineDialogOpen) }, [lineDialogOpen])
  useEffect(() => () => { onLinesDirtyChangeRef.current(false) }, [])

  const deleteLineMut = useMutation({
    mutationFn: (lineId: number) => apiFetch(`/commandes-trm/lignes/${lineId}`, { method: 'DELETE' }),
    onSuccess: () => { setDeleteLineConfirmId(null); onMutationSuccess() },
    onError: () => {
      setDeleteLineConfirmId(null)
      setLineError('Cette ligne ne peut pas être supprimée : un ordre de fabrication existe déjà.')
    },
  })

  const startAddLine = () => { setEditingLine(null); setLineDialogOpen(true) }
  const startEditLine = (l: LigneCommande) => { setEditingLine(l); setLineDialogOpen(true) }

  const drawerOpen = progressionLineId !== null && !isEditing
  const drawerLigne = drawerOpen
    ? commande.lignes.find((l) => l.IDligne_commande_client === progressionLineId) ?? null
    : null

  // When a line's drawer opens, collapse the list to that line's height and
  // slide it to the top so the drawer claims all the space below it. Closing
  // restores the full list. Same mechanic as ETM's affectation drawer (§31.1).
  const listScrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const container = listScrollRef.current
    if (!container) return
    if (progressionLineId !== null && !isEditing) {
      const raf = requestAnimationFrame(() => {
        const el = container.querySelector(`[data-line-id="${progressionLineId}"]`) as HTMLElement | null
        if (!el) return
        const cs = getComputedStyle(container)
        const padTop = parseFloat(cs.paddingTop) || 0
        const padBottom = parseFloat(cs.paddingBottom) || 0
        // Collapse instantly (no height transition) so the scroll below is
        // measured against the final geometry, not a mid-animation height.
        container.style.maxHeight = `${el.offsetHeight + padTop + padBottom}px`
        const target = container.scrollTop + (el.getBoundingClientRect().top - container.getBoundingClientRect().top) - padTop
        container.scrollTo({ top: target, behavior: 'smooth' })
      })
      return () => cancelAnimationFrame(raf)
    }
    container.style.maxHeight = ''
    container.scrollTo({ top: 0, behavior: 'smooth' })
  }, [progressionLineId, isEditing])

  const totalEur = commande.lignes.reduce((s, l) => s + (Number(l.montant) || 0), 0)

  return (
    <>
      <div className="flex-1 min-h-0 flex flex-col">
        <div ref={listScrollRef} className={cn('overflow-auto space-y-2 p-1 scrollbar-transparent', drawerOpen ? 'flex-shrink-0' : 'flex-1 min-h-0')}>
          {commande.lignes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Layers className="h-12 w-12 mb-3 opacity-40" />
              <p className="text-sm">Aucune ligne</p>
              {isEditing && !linesLocked && (
                <Button variant="outline" size="sm" className="mt-3" onClick={startAddLine}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" />Ajouter une ligne
                </Button>
              )}
            </div>
          ) : (
            commande.lignes.map((l) => (
              <LineCard
                key={l.IDligne_commande_client}
                line={l}
                estSoldee={commande.est_soldee}
                isEditing={isEditing}
                linesLocked={linesLocked}
                isDrawerOpen={progressionLineId === l.IDligne_commande_client}
                onEdit={() => startEditLine(l)}
                onDelete={() => setDeleteLineConfirmId(l.IDligne_commande_client)}
                onOpenProgression={onOpenProgression}
              />
            ))
          )}

          {isEditing && !linesLocked && commande.lignes.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={startAddLine}
              className="w-full text-muted-foreground hover:text-accent hover:bg-accent/5 border border-dashed border-border/60 hover:border-accent/40"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />Ajouter une ligne
            </Button>
          )}
        </div>

        {drawerOpen && drawerLigne && (
          <div className="flex-1 min-h-0 flex flex-col mt-3 rounded-lg border border-border/60 overflow-hidden bg-zinc-50/80 animate-in slide-in-from-bottom-4 fade-in-0 duration-200">
            <ProgressionDrawer
              key={drawerLigne.IDligne_commande_client}
              commandeId={commande.IDcommande_client}
              ligne={drawerLigne}
              onClose={() => onOpenProgression(null)}
            />
          </div>
        )}

        {commande.lignes.length > 0 && (
          <div className="flex-shrink-0 mt-3 pt-3 border-t border-border/60 flex items-center justify-between text-sm font-medium">
            <span className="text-muted-foreground text-xs uppercase tracking-wide">
              Total · {commande.lignes.length} ligne{commande.lignes.length > 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-4 tabular-nums">
              <span className="text-accent text-base">{fmtNum(totalEur, 2)} €</span>
            </div>
          </div>
        )}
      </div>

      <LineFormDialog
        open={lineDialogOpen}
        commandeId={commande.IDcommande_client}
        line={editingLine}
        onClose={() => { setLineDialogOpen(false); setEditingLine(null) }}
        onSuccess={() => { setLineDialogOpen(false); setEditingLine(null); onMutationSuccess() }}
      />

      <ConfirmDialog
        open={deleteLineConfirmId !== null}
        title="Supprimer la ligne"
        description="Cette ligne sera supprimée et les pièces qui lui sont rattachées seront libérées."
        confirmLabel="Supprimer"
        isPending={deleteLineMut.isPending}
        onCancel={() => setDeleteLineConfirmId(null)}
        onConfirm={() => { if (deleteLineConfirmId !== null) deleteLineMut.mutate(deleteLineConfirmId) }}
      />

      <ConfirmDialog
        open={lineError !== null}
        variant="default"
        title="Action impossible"
        description={lineError ?? ''}
        confirmLabel="Fermer"
        onCancel={() => setLineError(null)}
        onConfirm={() => setLineError(null)}
      />
    </>
  )
}

function LineStat({ label, value, className, valueClass }: {
  label: string
  value: string
  className?: string
  valueClass?: string
}) {
  return (
    <div className={className}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</p>
      <p className={cn('text-xs font-semibold tabular-nums', valueClass)}>{value}</p>
    </div>
  )
}

function LineCard({
  line, estSoldee, isEditing, linesLocked, isDrawerOpen, onEdit, onDelete, onOpenProgression,
}: {
  line: LigneCommande
  estSoldee: number
  isEditing: boolean
  linesLocked: boolean
  isDrawerOpen: boolean
  onEdit: () => void
  onDelete: () => void
  onOpenProgression: (lineId: number | null) => void
}) {
  const { border, iconBg, iconColor } = lineCardColors(line)
  const clickable = !isEditing
  const target = Number(line.quantite) || 0
  const pct = target > 0 ? Math.min(100, (line.produit / target) * 100) : 0

  return (
    <div
      data-line-id={line.IDligne_commande_client}
      className={cn(
        'group rounded-lg border-l-4 border border-border/60 bg-zinc-100/80 p-3',
        border,
        clickable && 'cursor-pointer hover:bg-zinc-100 hover:border-accent/40 transition-colors',
        isDrawerOpen && 'ring-1 ring-accent bg-accent/[0.06] border-accent/50',
      )}
      onClick={clickable ? () => onOpenProgression(isDrawerOpen ? null : line.IDligne_commande_client) : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn('h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0', iconBg)}>
            <TmRollIcon className={cn('h-3.5 w-3.5', iconColor)} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">
              {line.ref_label || '—'}
              {line.colori_reference ? <span className="text-muted-foreground"> / {line.colori_reference}</span> : null}
            </p>
            {/* Contexture + designation — the legacy card's second line. */}
            {(line.contexture || line.ref_designation) && (
              <p className="text-[11px] text-muted-foreground truncate">
                {[line.contexture, line.ref_designation].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isEditing && !linesLocked && (
            <div className="flex gap-0.5">
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); onEdit() }}>
                <Pencil className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); onDelete() }}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Stat row — same vocabulary as the legacy line band (Prix / marge,
          Commandé, Produit, Expédié), delivery date pinned right. */}
      <div className="mt-2 ml-9 flex flex-wrap items-end gap-x-6 gap-y-1.5">
        <LineStat label="Commandé" value={`${fmtNum(line.quantite, 1)} ${line.unite_label}`} />
        <LineStat
          label="Produit"
          value={`${fmtNum(line.produit, 1)} ${line.unite_label}`}
          valueClass={target > 0 && line.produit >= target - 0.001 ? 'text-green-600' : undefined}
        />
        <LineStat
          label="Expédié"
          value={`${fmtNum(line.expedie, 1)} ${line.unite_label}`}
          valueClass={target > 0 && line.expedie >= target - 0.001 ? 'text-green-600' : undefined}
        />
        {line.prix > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Prix u.</p>
            <p className="text-xs font-semibold tabular-nums flex items-center gap-1.5">
              {fmtNum(line.prix, 2)} €
              {line.marge_pct !== null && (
                <span
                  title={line.cout_revient !== null ? `Prix de revient TRM : ${fmtNum(line.cout_revient, 2)} €/kg` : undefined}
                  className={cn(
                    'px-1 rounded text-[10px] font-medium',
                    line.marge_pct >= 25 ? 'bg-green-500/10 text-green-700'
                      : line.marge_pct >= 10 ? 'bg-amber-500/15 text-amber-800'
                        : 'bg-destructive/10 text-destructive',
                  )}
                >
                  {line.marge_pct} %
                </span>
              )}
            </p>
          </div>
        )}
        {line.montant > 0 && <LineStat label="Montant" value={`${fmtNum(line.montant, 2)} €`} />}
        {line.date_livraison && (() => {
          const u = deliveryUrgency(line.date_livraison, estSoldee)
          return (
            <LineStat
              label="Livraison"
              value={formatHfsqlDate(line.date_livraison)}
              className="ml-auto text-right"
              valueClass={u === 'late' ? 'text-red-600' : u === 'soon' ? 'text-amber-600' : undefined}
            />
          )
        })()}
      </div>

      {!!line.commentaire?.trim() && (
        <div className="flex items-start gap-1.5 mt-2 ml-9">
          <MessageSquare className="h-3 w-3 text-muted-foreground/50 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted-foreground italic">{line.commentaire.trim()}</p>
        </div>
      )}

      {/* Production gauge — what the machines dropped vs what was ordered. */}
      <div className="mt-2 ml-9 flex items-center gap-2">
        <div className="h-1.5 flex-1 rounded-full bg-zinc-200 overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', pct >= 99.9 ? 'bg-green-500' : 'bg-accent')}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">
          Produit {fmtNum(line.produit, 1)} / {fmtNum(line.quantite, 1)} {line.unite_label}
          {line.nb_pieces > 0 ? ` · ${line.nb_pieces} pièce${line.nb_pieces > 1 ? 's' : ''}` : ''}
        </span>
      </div>
    </div>
  )
}

// ── Progression drawer (the legacy bottom panel) ────────

type ProgressionTab = 'affectation' | 'fil' | 'of' | 'expedition'

/** Compact table shared by the four tabs. Generic over the row shape; the
 *  columns describe their own rendering + alignment. Mirrors ETM's SupplyTable
 *  so both apps' sub-tables read identically. */
function PanelTable<T extends { id: number }>({
  loading, rows, columns, emptyLabel, emptyIcon: EmptyIcon, onRowClick, selectedId, rowClassName,
  selectedIds,
}: {
  loading: boolean
  rows: T[]
  columns: { key: string; label: string; align: 'left' | 'right'; render: (r: T) => ReactNode }[]
  emptyLabel: string
  emptyIcon: ComponentType<{ className?: string }>
  /** The event is forwarded so callers can read `shiftKey` (mps_designer §44). */
  onRowClick?: (r: T, e: React.MouseEvent) => void
  selectedId?: number | null
  /** Multi-select variant: highlights every ticked row and turns off text
   *  selection so Shift+click extends the range instead of painting it. */
  selectedIds?: Set<number>
  rowClassName?: (r: T) => string | undefined
}) {
  if (loading) {
    return <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted animate-pulse rounded-md" />)}</div>
  }
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <EmptyIcon className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm font-medium">{emptyLabel}</p>
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-border/60 bg-card shadow-sm overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-zinc-200/60 border-b border-border/60">
          <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {columns.map((c) => (
              <th key={c.key} className={cn('px-2.5 py-2 font-semibold whitespace-nowrap', c.align === 'right' ? 'text-right' : 'text-left')}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              onClick={onRowClick ? (e) => onRowClick(r, e) : undefined}
              className={cn(
                'border-b border-border/40 last:border-0',
                onRowClick ? 'cursor-pointer hover:bg-accent/10' : 'hover:bg-accent/5',
                selectedIds && 'select-none',
                (selectedId === r.id || selectedIds?.has(r.id)) && 'bg-accent/10',
                rowClassName?.(r),
              )}
            >
              {columns.map((c) => (
                <td key={c.key} className={cn('px-2.5 py-2 whitespace-nowrap', c.align === 'right' ? 'text-right tabular-nums' : 'text-left')}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ProgressionDrawer({
  commandeId, ligne, onClose,
}: {
  commandeId: number
  ligne: LigneCommande
  onClose: () => void
}) {
  const [tab, setTab] = useState<ProgressionTab>('affectation')
  const lineId = ligne.IDligne_commande_client
  const queryClient = useQueryClient()

  // Stock de fil → "Créer un OF": the user ticks the lots to knit from, and
  // the creation dialog opens with the line imposed and those lots assigned to
  // the composition rows they can feed. Port of the legacy tab's button.
  const [selectedLots, setSelectedLots] = useState<Set<number>>(new Set())
  const lastLotIdRef = useRef<number | null>(null)
  const [createOfOpen, setCreateOfOpen] = useState(false)
  const [createdOfId, setCreatedOfId] = useState<number | null>(null)

  const { data: pieces, isLoading: piecesLoading } = useQuery<PiecesPayload>({
    queryKey: ['commande-trm-pieces', commandeId, lineId],
    queryFn: () => apiFetch(`/commandes-trm/${commandeId}/lignes/${lineId}/pieces`),
    enabled: tab === 'affectation',
  })
  const { data: stockFil, isLoading: filLoading } = useQuery<StockFilPayload>({
    queryKey: ['commande-trm-stock-fil', commandeId, lineId],
    queryFn: () => apiFetch(`/commandes-trm/${commandeId}/lignes/${lineId}/stock-fil`),
    enabled: tab === 'fil',
  })
  const { data: ordres, isLoading: ofLoading } = useQuery<OrdresPayload>({
    queryKey: ['commande-trm-ordres', commandeId, lineId],
    queryFn: () => apiFetch(`/commandes-trm/${commandeId}/lignes/${lineId}/ordres-fabrication`),
    enabled: tab === 'of',
  })
  const { data: expeditions, isLoading: expLoading } = useQuery<{ expeditions: ExpeditionRow[] }>({
    queryKey: ['commande-trm-expeditions', commandeId],
    queryFn: () => apiFetch(`/commandes-trm/${commandeId}/expeditions`),
    enabled: tab === 'expedition',
  })

  // §44 range selection over the rendered lot order. Plain click toggles and
  // re-anchors; Shift+click applies the inclusive range, adding or removing
  // depending on the clicked row's state.
  const lotRows = stockFil?.lots ?? []

  // « Créer un OF » requires a ticked lot for EVERY yarn of the composition,
  // not just one tick: a run missing one of its yarns cannot be knitted, and
  // the dialog would otherwise open with a component that has no lot behind it
  // (user decision, 2026-08-26). A composant with no lot at all in this
  // client's stock can never be covered — which is the honest answer, and the
  // footer names it rather than leaving the button mysteriously absent.
  const composants = stockFil?.composants ?? []
  const composantsManquants = useMemo(() => {
    if (composants.length === 0) return []
    const couverts = new Set(
      lotRows.filter((l) => selectedLots.has(l.id)).map((l) => `${l.IDref_fil}:${l.IDcolori_fil}`),
    )
    return composants.filter((c) => !couverts.has(`${c.IDref_fil}:${c.IDcolori_fil}`))
  }, [composants, lotRows, selectedLots])
  const toggleLot = useCallback((id: number, shiftKey: boolean) => {
    const ids = lotRows.map((l) => l.id)
    const anchor = lastLotIdRef.current
    if (shiftKey && anchor !== null && anchor !== id) {
      const a = ids.indexOf(anchor)
      const b = ids.indexOf(id)
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a]
        setSelectedLots((prev) => {
          const next = new Set(prev)
          const deselect = prev.has(id)
          for (let i = lo; i <= hi; i++) {
            if (deselect) next.delete(ids[i]); else next.add(ids[i])
          }
          return next
        })
        return
      }
    }
    setSelectedLots((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
    lastLotIdRef.current = id
  }, [lotRows])

  const clearLots = useCallback(() => {
    setSelectedLots(new Set())
    lastLotIdRef.current = null
  }, [])

  const tabs: { key: ProgressionTab; label: string; icon: React.ElementType }[] = [
    { key: 'affectation', label: 'Affectation', icon: Link2 },
    { key: 'fil', label: 'Stock de fil', icon: BobineIcon },
    { key: 'of', label: 'Ordre de fabrication', icon: Factory },
    { key: 'expedition', label: 'Expédition', icon: Truck },
  ]

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-zinc-100/80">
      {/* Tab strip + the legacy "Progression" readout + close (mps_designer §31.4) */}
      <div className="flex-shrink-0 flex items-center border-b bg-zinc-200/50 p-1 gap-1">
        {tabs.map((t) => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer',
                active ? 'bg-accent text-accent-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent/10',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{t.label}</span>
            </button>
          )
        })}
        <div className="ml-auto flex items-center gap-2 pr-1">
          <span className="text-xs font-semibold tabular-nums text-muted-foreground">
            {fmtNum(ligne.produit, 1)} / {fmtNum(ligne.quantite, 1)} Kgs
          </span>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7" title="Fermer">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {tab === 'affectation' && (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 overflow-y-auto p-3 scrollbar-transparent">
            <h3 className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">
              Stock affecté à la commande
            </h3>
            <PanelTable<AffectationPiece>
              loading={piecesLoading}
              rows={pieces?.pieces ?? []}
              emptyLabel="Aucune pièce produite"
              emptyIcon={Package}
              rowClassName={(p) => (p.expedie ? 'text-muted-foreground' : undefined)}
              columns={[
                { key: 'num', label: 'Pièce N°', align: 'left', render: (p) => <span className="font-medium tabular-nums">{p.numero || `#${p.id}`}</span> },
                { key: 'poids', label: 'Poids', align: 'right', render: (p) => `${fmtNum(p.poids, 1)} Kg` },
                {
                  key: 'choix', label: '2nd choix', align: 'left',
                  render: (p) => p.second_choix > 0
                    ? <Badge variant="destructive" className="text-[10px] py-0">2nd choix</Badge>
                    : <span className="text-muted-foreground/50">—</span>,
                },
                { key: 'date', label: 'Date de saisie', align: 'left', render: (p) => formatSaisie(p.date_saisie) },
                {
                  key: 'obs', label: 'Observations', align: 'left',
                  render: (p) => p.observations
                    ? <span className="italic" title={p.observations}>{p.observations}</span>
                    : <span className="text-muted-foreground/50">—</span>,
                },
                {
                  key: 'def', label: 'Défauts', align: 'left',
                  render: (p) => p.defects.length === 0
                    ? <span className="text-muted-foreground/50">—</span>
                    : (
                      <span className="inline-flex items-center gap-1 text-destructive" title={p.defects.map((d) => d.description ?? d.type_defaut ?? '').filter(Boolean).join(' · ')}>
                        <AlertTriangle className="h-3 w-3" />
                        {p.defects.length}
                      </span>
                    ),
                },
                {
                  key: 'exp', label: 'Expédiée', align: 'left',
                  render: (p) => p.expedie
                    ? <Badge variant="outline" className="text-[10px] py-0 gap-1 border bg-success border-success text-white"><Truck className="h-2.5 w-2.5" />Oui</Badge>
                    : <span className="text-muted-foreground/50">—</span>,
                },
              ]}
            />
          </div>
          {/* Legacy footer: total + "Stock disponible 1er choix". */}
          <div className="flex-shrink-0 px-3 py-2 border-t bg-zinc-200/50 flex items-center gap-4 text-[11px] text-muted-foreground tabular-nums">
            <span>{pieces?.pieces.length ?? 0} pièce{(pieces?.pieces.length ?? 0) > 1 ? 's' : ''}</span>
            <span>Produit <span className="font-semibold text-foreground">{fmtNum(pieces?.produit ?? 0, 1)} Kgs</span></span>
            <span>Expédié <span className="font-semibold text-foreground">{fmtNum(pieces?.expedie ?? 0, 1)} Kgs</span></span>
            <span className="ml-auto">
              Stock disponible 1er choix{' '}
              <span className="font-semibold text-accent">{fmtNum(pieces?.disponible_1er_choix ?? 0, 1)} Kgs</span>
            </span>
          </div>
        </div>
      )}

      {tab === 'fil' && (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 overflow-y-auto p-3 scrollbar-transparent">
            <h3 className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">
              Fils en stock{stockFil?.client_nom ? <span className="normal-case font-normal"> · {stockFil.client_nom}</span> : null}
            </h3>
            <PanelTable<StockFilLot>
              loading={filLoading}
              rows={lotRows}
              // TRM knits à façon: only this client's yarn can run this order,
              // so "aucun lot" almost always means "aucun lot DE CE CLIENT" —
              // the same yarn may well sit in the warehouse under another
              // owner. Naming the client is what keeps the empty tab readable
              // instead of looking broken.
              emptyLabel={
                stockFil?.client_nom
                  ? `Aucun lot de fil de ${stockFil.client_nom} pour cette composition`
                  : 'Aucun lot de fil en stock'
              }
              emptyIcon={BobineIcon}
              onRowClick={(l, e) => toggleLot(l.id, e.shiftKey)}
              selectedIds={selectedLots}
              columns={[
                {
                  key: 'sel', label: '', align: 'left',
                  render: (l) => (
                    <Checkbox
                      checked={selectedLots.has(l.id)}
                      onClick={(e) => { e.stopPropagation(); toggleLot(l.id, (e as React.MouseEvent).shiftKey) }}
                      title="Sélectionner ce lot (MAJ + clic pour une plage)"
                    />
                  ),
                },
                { key: 'lot', label: 'Lot', align: 'left', render: (l) => <span className="font-medium tabular-nums">{l.lot || '—'}</span> },
                { key: 'ref', label: 'Référence', align: 'left', render: (l) => l.reference },
                { key: 'col', label: 'Coloris', align: 'left', render: (l) => l.coloris || '—' },
                { key: 'pct', label: '%', align: 'right', render: (l) => (l.pourcentage > 0 ? `${fmtNum(l.pourcentage)} %` : '—') },
                { key: 'emp', label: 'Emplacement', align: 'left', render: (l) => l.emplacement || '—' },
                { key: 'frs', label: 'Fournisseur', align: 'left', render: (l) => l.fournisseur || '—' },
                { key: 'cli', label: 'Client', align: 'left', render: (l) => l.client || '—' },
                { key: 'stk', label: 'Stock', align: 'right', render: (l) => <span className="font-semibold">{fmtNum(l.stock, 1)} Kgs</span> },
                { key: 'ini', label: 'Stock initial', align: 'right', render: (l) => `${fmtNum(l.stock_initial, 1)} Kgs` },
              ]}
            />
          </div>
          <div className="flex-shrink-0 px-3 py-2 border-t bg-zinc-200/50 flex items-center gap-3 text-[11px] text-muted-foreground">
            <span>
              Potentiel de{' '}
              <span className="font-semibold text-foreground tabular-nums">{fmtNum(stockFil?.potentiel_kg ?? 0, 0)} Kgs</span>
              {stockFil?.ecru_ref_label ? (
                <> de {stockFil.ecru_ref_label}{stockFil.ecru_coloris_label ? ` - ${stockFil.ecru_coloris_label}` : ''}</>
              ) : null}
            </span>
            {/* The legacy's bottom-right "Créer OF" — it only appears once lots
                are ticked, which is what tells the user the tick meant
                something. Cleared selection = no button. It also waits for the
                composition to be COVERED: with one yarn of two ticked the OF
                is not knittable, so the footer says which yarn is still
                missing instead of offering a button that would open a broken
                dialog. */}
            {selectedLots.size > 0 && (
              <div className="ml-auto flex items-center gap-2 min-w-0">
                <span className="tabular-nums">
                  {selectedLots.size} lot{selectedLots.size > 1 ? 's' : ''} sélectionné{selectedLots.size > 1 ? 's' : ''}
                </span>
                <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={clearLots}>
                  Aucun
                </Button>
                {composantsManquants.length === 0 ? (
                  <Button size="sm" className="h-7 text-[11px]" onClick={() => setCreateOfOpen(true)}>
                    <Factory className="h-3.5 w-3.5 mr-1.5" />Créer un OF
                  </Button>
                ) : (
                  <span className="truncate text-amber-700" title={composantsManquants.map((c) => `${c.ref_label}${c.coloris_label ? ` ${c.coloris_label}` : ''} (${fmtNum(c.pourcentage)} %)`).join(' · ')}>
                    Il manque un lot pour {composantsManquants.map((c) => c.ref_label).join(', ')}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'of' && (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 overflow-y-auto p-3 scrollbar-transparent">
            <h3 className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">
              Ordres de fabrication
            </h3>
            <PanelTable<OrdreFabrication>
              loading={ofLoading}
              rows={ordres?.ordres ?? []}
              emptyLabel="Aucun ordre de fabrication"
              emptyIcon={Factory}
              columns={[
                { key: 'no', label: 'OF N°', align: 'left', render: (o) => <span className="font-medium tabular-nums">{o.id}</span> },
                { key: 'mach', label: 'Machine', align: 'left', render: (o) => o.machine || '—' },
                { key: 'rou', label: 'Rouleaux', align: 'right', render: (o) => fmtNum(o.rouleaux) },
                { key: 'qte', label: 'Quantité', align: 'right', render: (o) => `${fmtNum(o.quantite, 1)} Kgs` },
                {
                  key: 'fin', label: 'Finir le fil', align: 'left',
                  render: (o) => (o.finir_fil ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <span className="text-muted-foreground/50">—</span>),
                },
                { key: 'fils', label: 'Fils', align: 'left', render: (o) => (o.fils.length > 0 ? o.fils.join(', ') : '—') },
                { key: 'rea', label: 'Réalisé', align: 'right', render: (o) => `${fmtNum(o.realise, 1)} Kgs` },
                {
                  key: 'prog', label: 'Progression', align: 'left',
                  render: (o) => (
                    <div className="flex items-center gap-2 min-w-[140px]">
                      <div className="h-1.5 flex-1 rounded-full bg-zinc-200 overflow-hidden">
                        <div
                          className={cn('h-full rounded-full', o.progression_pct >= 99.9 ? 'bg-green-500' : 'bg-accent')}
                          style={{ width: `${Math.min(100, o.progression_pct)}%` }}
                        />
                      </div>
                      <span className="tabular-nums text-[11px]">{fmtNum(o.progression_pct, 1)} %</span>
                    </div>
                  ),
                },
                {
                  key: 'etat', label: 'État', align: 'left',
                  render: (o) => o.est_termine
                    ? <Badge variant="outline" className="text-[10px] py-0 gap-1 border bg-success border-success text-white"><CheckCircle2 className="h-2.5 w-2.5" />Terminé</Badge>
                    : o.est_actif
                      ? <Badge variant="outline" className="text-[10px] py-0 gap-1 border bg-primary border-primary text-white"><Factory className="h-2.5 w-2.5" />En cours</Badge>
                      : <Badge variant="secondary" className="text-[10px] py-0">En attente</Badge>,
                },
              ]}
            />
          </div>
          <div className="flex-shrink-0 px-3 py-2 border-t bg-zinc-200/50 text-[11px] text-muted-foreground">
            {(ordres?.compatibles.length ?? 0) > 0
              ? <>Compatible sur : <span className="font-semibold text-foreground">{ordres?.compatibles.join(', ')}</span></>
              : <>Aucune fiche machine pour cette référence</>}
          </div>
        </div>
      )}

      {tab === 'expedition' && (
        <ExpeditionTab loading={expLoading} expeditions={expeditions?.expeditions ?? []} />
      )}

      <CreateOfDialog
        open={createOfOpen}
        onClose={() => setCreateOfOpen(false)}
        presetLigneId={lineId}
        presetLotIds={Array.from(selectedLots)}
        onCreated={(id) => {
          setCreateOfOpen(false)
          clearLots()
          setCreatedOfId(id)
          // The new OF changes this line's coverage and shows up in its tab.
          queryClient.invalidateQueries({ queryKey: ['commande-trm-ordres'] })
          queryClient.invalidateQueries({ queryKey: ['commande-trm', commandeId] })
          queryClient.invalidateQueries({ queryKey: ['commandes-trm'] })
          setTab('of')
        }}
      />

      <ConfirmDialog
        open={createdOfId !== null}
        variant="default"
        title="Ordre de fabrication créé"
        description={`L'OF n° ${createdOfId ?? ''} a été créé en attente, en fin de file du métier. Activez-le depuis Production › Gestion des OF.`}
        confirmLabel="Fermer"
        onCancel={() => setCreatedOfId(null)}
        onConfirm={() => setCreatedOfId(null)}
      />
    </div>
  )
}

/** Expédition tab — the legacy two-table split: shipments on the left, the
 *  pieces of the selected shipment in the middle, its info panel on the right.
 *  Scoped to the whole commande, like the legacy window. */
function ExpeditionTab({ loading, expeditions }: { loading: boolean; expeditions: ExpeditionRow[] }) {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const selected = expeditions.find((e) => e.id === selectedId) ?? expeditions[0] ?? null

  // Keep the selection valid when the payload changes.
  useEffect(() => {
    if (expeditions.length === 0) { setSelectedId(null); return }
    if (selectedId === null || !expeditions.some((e) => e.id === selectedId)) {
      setSelectedId(expeditions[0].id)
    }
  }, [expeditions, selectedId])

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-transparent">
        {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted animate-pulse rounded-md" />)}
      </div>
    )
  }
  if (expeditions.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
        <Truck className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm font-medium">Aucune expédition</p>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 flex gap-3 p-3 overflow-hidden">
      <div className="w-64 flex-shrink-0 overflow-y-auto scrollbar-transparent">
        <h3 className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">
          Expéditions
        </h3>
        <PanelTable<ExpeditionRow>
          loading={false}
          rows={expeditions}
          emptyLabel="Aucune expédition"
          emptyIcon={Truck}
          onRowClick={(e) => setSelectedId(e.id)}
          selectedId={selected?.id ?? null}
          columns={[
            { key: 'no', label: 'N°', align: 'left', render: (e) => <span className="font-medium tabular-nums">{e.id}</span> },
            { key: 'date', label: 'Date', align: 'left', render: (e) => (e.date ? formatHfsqlDate(e.date) : '—') },
            { key: 'poids', label: 'Expédié', align: 'right', render: (e) => `${fmtNum(e.poids, 1)} Kg` },
          ]}
        />
      </div>

      <div className="flex-1 min-w-0 overflow-y-auto scrollbar-transparent">
        <h3 className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">
          Pièces expédiées{selected ? ` — expédition ${selected.id}` : ''}
        </h3>
        <PanelTable<ExpeditionRoll>
          loading={false}
          rows={selected?.rolls ?? []}
          emptyLabel="Aucune pièce"
          emptyIcon={Package}
          columns={[
            { key: 'num', label: 'Numéro', align: 'left', render: (r) => <span className="font-medium tabular-nums">{r.numero || `#${r.id}`}</span> },
            { key: 'lot', label: 'Lot', align: 'left', render: (r) => r.lot || '—' },
            { key: 'poids', label: 'Poids', align: 'right', render: (r) => `${fmtNum(r.poids, 1)} Kg` },
            { key: 'mag', label: 'Magasin', align: 'left', render: (r) => r.magasin },
          ]}
        />
      </div>

      {selected && (
        <div className="w-64 flex-shrink-0 overflow-y-auto scrollbar-transparent space-y-2">
          <h3 className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">
            Informations
          </h3>
          <div className="p-3 rounded-lg border bg-card shadow-sm space-y-2">
            <KV label="Date" value={selected.date ? formatHfsqlDate(selected.date) : '—'} />
            <KV label="Transporteur" value={selected.transporteur || '—'} />
            <KV label="Poids" value={`${fmtNum(selected.poids, 1)} Kg`} />
            <KV label="Validée" value={selected.est_valide ? 'Oui' : 'Non'} />
            <KV label="Facturée" value={selected.est_facture ? 'Oui' : 'Non'} />
          </div>
          {selected.adresse && (
            <div className="p-3 rounded-lg border bg-card shadow-sm">
              <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />Adresse de livraison
              </p>
              <AdresseLines adresse={selected.adresse} />
            </div>
          )}
          {!!selected.observation_bl?.trim() && (
            <div className="p-3 rounded-lg border bg-card shadow-sm">
              <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5" />Observations BL
              </p>
              <p className="text-sm text-muted-foreground whitespace-pre-line">{selected.observation_bl.trim()}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Line create/edit dialog ────────────────────────────

const emptyLineForm = {
  IDreference: 0,
  IDcolori: 0,
  quantite: '',
  prix: '',
  date_livraison: '',
  commentaire: '',
}

function LineFormDialog({
  open, commandeId, line, onClose, onSuccess,
}: {
  open: boolean
  commandeId: number
  line: LigneCommande | null
  onClose: () => void
  onSuccess: () => void
}) {
  const [form, setForm] = useState(emptyLineForm)

  useEffect(() => {
    if (!open) return
    setForm(line ? {
      IDreference: line.IDreference,
      IDcolori: line.IDcolori,
      quantite: line.quantite ? String(line.quantite) : '',
      // `prix` is a 4-byte real in HFSQL, so a price saved as 2,88 reads back
      // 2.880000114440918 and the field showed all 16 digits. Round the float
      // noise away at 4 decimals — enough to keep a genuine 4-decimal price
      // (the ETM-mirrored lines carry them) while collapsing the artefact.
      prix: line.prix ? String(Math.round(line.prix * 1e4) / 1e4) : '',
      date_livraison: hfsqlDateToInput(line.date_livraison),
      commentaire: line.commentaire ?? '',
    } : emptyLineForm)
  }, [open, line])

  const { data: refs } = useQuery<RefEcru[]>({
    queryKey: ['trm-refs-ecru'],
    queryFn: () => apiFetch('/commandes-trm/lookups/refs-ecru'),
    enabled: open,
  })
  const { data: coloris } = useQuery<ColoriEcru[]>({
    queryKey: ['trm-colori-ecru', form.IDreference],
    queryFn: () => apiFetch(`/commandes-trm/lookups/colori-ecru?ref_ecru=${form.IDreference}`),
    enabled: open && form.IDreference > 0,
  })

  // Suggested price — max(prix de revient, ref_ecru.prix) / 0.7: the base is a
  // floor on the *cost*, so the higher of the two assiettes carries TRM's 30 %
  // margin. NOT the rule the ETM bridge uses for its mirrored lines (there the
  // base is a floor on the price and wins flat) — see the endpoint's comment.
  // Advisory only: the field stays editable and is never overwritten once the
  // user has typed a price.
  const qteNum = Number(form.quantite) || 0
  const { data: priceHint } = useQuery<{
    priceable: boolean; prix: number; cout: number; base: number; retenu: 'revient' | 'base'
  }>({
    queryKey: ['trm-line-price', form.IDreference, qteNum],
    queryFn: () => apiFetch(`/commandes-trm/lookups/line-price?ref=${form.IDreference}&quantite=${qteNum}`),
    enabled: open && form.IDreference > 0 && qteNum > 0,
  })

  const saveMut = useMutation({
    mutationFn: () => {
      const body = JSON.stringify({
        IDreference: form.IDreference,
        IDcolori: form.IDcolori,
        quantite: Number(form.quantite) || 0,
        prix: Number(form.prix) || 0,
        date_livraison: form.date_livraison ? inputDateToHfsql(form.date_livraison) : '',
        commentaire: form.commentaire,
      })
      return line
        ? apiFetch(`/commandes-trm/lignes/${line.IDligne_commande_client}`, { method: 'PUT', body })
        : apiFetch(`/commandes-trm/${commandeId}/lignes`, { method: 'POST', body })
    },
    onSuccess,
  })

  const canSave = form.IDreference > 0 && (Number(form.quantite) || 0) > 0

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg" onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TmRollIcon className="h-5 w-5 text-accent" />
            {line ? 'Modifier la ligne' : 'Ajouter une ligne'}
          </DialogTitle>
        </DialogHeader>
        <div className="mt-4 space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Référence tombé métier</label>
            <SearchableCombobox<RefEcru>
              options={refs ?? []}
              value={form.IDreference}
              onChange={(id) => setForm((f) => ({ ...f, IDreference: id, IDcolori: 0 }))}
              getId={(r) => r.IDref_ecru}
              getPrimary={(r) => r.reference}
              getSecondary={(r) => r.designation}
              placeholder="Choisir une référence"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Coloris</label>
            <PopoverSelect
              options={(coloris ?? []).map((c) => ({ id: c.IDcolori_ecru, primary: c.reference }))}
              value={form.IDcolori}
              onChange={(id) => setForm((f) => ({ ...f, IDcolori: id }))}
              emptyLabel="—"
              disabled={form.IDreference <= 0}
              disabledTitle="Choisissez d'abord une référence"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Quantité (Kgs)</label>
              <input
                type="number" step="0.01" value={form.quantite}
                onChange={(e) => setForm((f) => ({ ...f, quantite: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Prix (€/Kg)</label>
              <input
                type="number" step="0.01" value={form.prix}
                onChange={(e) => setForm((f) => ({ ...f, prix: e.target.value }))}
                className={inputClass}
              />
            </div>
          </div>
          {/* Where the suggested price comes from. A small read-only panel and
              not a sentence: it is a two-assiette comparison plus a rate, and
              the prose version ("Prix de revient 2,02 € + 30 % de marge — base
              fiche 2,01 €, plus basse") made the reader work out which number
              won. Rows are never colour-coded as an alarm — neither assiette is
              a problem; the gold dot only marks the one carrying the margin.
              The legacy window proposes the bare base (ref_ecru.prix), so
              without this the two apps quote different numbers with no
              explanation. */}
          {!!priceHint?.priceable && (
            <div className="rounded-md border border-border/60 bg-zinc-100/70 px-3 py-2.5 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Tarif suggéré
                  </p>
                  <p className="text-base font-semibold leading-tight tabular-nums">
                    {fmtNum(priceHint.prix, 2)}{' '}
                    <span className="text-xs font-normal text-muted-foreground">€/Kg</span>
                  </p>
                </div>
                <Button
                  type="button" variant="outline" size="sm"
                  className="h-7 shrink-0 px-2.5 text-[11px]"
                  onClick={() => setForm((f) => ({ ...f, prix: String(priceHint.prix) }))}
                >
                  Appliquer
                </Button>
              </div>
              <div className="space-y-1 border-t border-border/60 pt-2">
                {([
                  // Wording is the user's (2026-08-26). The `key`s stay as they
                  // are — they match the API's `retenu` discriminant.
                  { key: 'revient', label: 'Prix calculé', value: priceHint.cout },
                  { key: 'base', label: 'Prix de base', value: priceHint.base },
                ] as const).map((row) => {
                  const retenu = priceHint.retenu === row.key
                  return (
                    <div
                      key={row.key}
                      className={cn(
                        'flex items-center gap-2 text-[11px]',
                        retenu ? 'text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', retenu ? 'bg-gold' : 'bg-border')} />
                      <span className={cn('flex-1 truncate', retenu && 'font-medium')}>{row.label}</span>
                      {row.value > 0
                        ? <span className="tabular-nums">{fmtNum(row.value, 2)} €</span>
                        : <span className="italic">aucune donnée machine</span>}
                      {retenu && (
                        <span className="rounded bg-gold/20 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-gold-foreground">
                          Retenu
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
              <p className="text-[10px] leading-snug text-muted-foreground">
                La plus haute des deux assiettes porte les 30 % de marge.
              </p>
            </div>
          )}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Date de livraison</label>
            <input
              type="date" value={form.date_livraison}
              onChange={(e) => setForm((f) => ({ ...f, date_livraison: e.target.value }))}
              className={cn(inputClass, 'h-9')}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Commentaire</label>
            {/* bg-white, not the design-system default bg-background: on a white
                dialog that warm off-white reads grey next to the other fields,
                which all use inputClass (bg-white). */}
            <textarea
              rows={2} value={form.commentaire}
              onChange={(e) => setForm((f) => ({ ...f, commentaire: e.target.value }))}
              className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
            />
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={() => saveMut.mutate()} disabled={!canSave || saveMut.isPending}>
            {saveMut.isPending
              ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Enregistrement...</>
              : <><Save className="h-3.5 w-3.5 mr-1.5" />Enregistrer</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Right Panel: Sidebar with Tabs ─────────────────────

type SidebarTab = 'info' | 'adresses'

function DetailSidebar({
  commande, isLoading, isEditing,
  editDateCommande, onEditDateCommandeChange,
  editRefClient, onEditRefClientChange,
  editCommentaire, onEditCommentaireChange,
  editCommentaireInterne, onEditCommentaireInterneChange,
  editIDModePaiement, onEditIDModePaiementChange,
  editIDEcheance, onEditIDEcheanceChange,
  editRemise, onEditRemiseChange,
  editIDAdresseFacturation, onEditIDAdresseFacturationChange,
  editIDAdresseLivraison, onEditIDAdresseLivraisonChange,
  onToggleEtat, isTogglingEtat,
}: {
  commande: CommandeDetail | null
  isLoading: boolean
  isEditing: boolean
  editDateCommande: string; onEditDateCommandeChange: (v: string) => void
  editRefClient: string; onEditRefClientChange: (v: string) => void
  editCommentaire: string; onEditCommentaireChange: (v: string) => void
  editCommentaireInterne: string; onEditCommentaireInterneChange: (v: string) => void
  editIDModePaiement: number; onEditIDModePaiementChange: (v: number) => void
  editIDEcheance: number; onEditIDEcheanceChange: (v: number) => void
  editRemise: string; onEditRemiseChange: (v: string) => void
  editIDAdresseFacturation: number; onEditIDAdresseFacturationChange: (v: number) => void
  editIDAdresseLivraison: number; onEditIDAdresseLivraisonChange: (v: number) => void
  onToggleEtat: () => void
  isTogglingEtat: boolean
}) {
  const [activeTab, setActiveTab] = useState<SidebarTab>('info')

  // Loaded unconditionally: view mode needs them to resolve the labels, and
  // gating on isEditing left the panel showing "—" until the editor opened.
  const { data: modesPaiement } = useQuery<ModePaiement[]>({
    queryKey: ['trm-modes-paiement'],
    queryFn: () => apiFetch('/commandes-trm/lookups/modes-paiement'),
  })
  const { data: echeances } = useQuery<Echeance[]>({
    queryKey: ['trm-echeances'],
    queryFn: () => apiFetch('/commandes-trm/lookups/echeances'),
  })
  const { data: adresses } = useQuery<AdresseLookup[]>({
    queryKey: ['trm-adresses', commande?.IDclient],
    queryFn: () => apiFetch(`/commandes-trm/lookups/adresses?client=${commande?.IDclient}`),
    enabled: isEditing && !!commande?.IDclient,
  })

  if (isLoading) return (
    <div className="w-96 flex-shrink-0 bg-muted/30 rounded-xl border p-4 space-y-4">
      <div className="flex gap-2">{[1, 2].map((i) => <div key={i} className="h-8 flex-1 bg-muted animate-pulse rounded-md" />)}</div>
      {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}
    </div>
  )
  if (!commande) return null

  const tabs: { key: SidebarTab; label: string; icon: React.ElementType }[] = [
    { key: 'info', label: 'Info', icon: Info },
    { key: 'adresses', label: 'Adresses', icon: MapPin },
  ]

  return (
    <div className="w-96 flex-shrink-0 flex flex-col gap-3 min-h-0">
      <div className="flex-1 min-h-0 rounded-xl border flex flex-col overflow-hidden bg-zinc-100/80">
        <div className="flex border-b p-1 gap-1 rounded-t-xl bg-zinc-200/50">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-sm font-medium rounded-md transition-colors',
                  activeTab === tab.key ? 'bg-accent text-accent-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent/10',
                )}
              >
                <Icon className="h-3.5 w-3.5" />{tab.label}
              </button>
            )
          })}
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-transparent">
          {activeTab === 'info' && (
            <InfoTab
              commande={commande} isEditing={isEditing}
              modesPaiement={modesPaiement ?? []} echeances={echeances ?? []}
              editDateCommande={editDateCommande} onEditDateCommandeChange={onEditDateCommandeChange}
              editRefClient={editRefClient} onEditRefClientChange={onEditRefClientChange}
              editCommentaire={editCommentaire} onEditCommentaireChange={onEditCommentaireChange}
              editCommentaireInterne={editCommentaireInterne} onEditCommentaireInterneChange={onEditCommentaireInterneChange}
              editIDModePaiement={editIDModePaiement} onEditIDModePaiementChange={onEditIDModePaiementChange}
              editIDEcheance={editIDEcheance} onEditIDEcheanceChange={onEditIDEcheanceChange}
              editRemise={editRemise} onEditRemiseChange={onEditRemiseChange}
            />
          )}
          {activeTab === 'adresses' && (
            <AdressesTab
              commande={commande} isEditing={isEditing} adresses={adresses ?? []}
              editIDAdresseFacturation={editIDAdresseFacturation} onEditIDAdresseFacturationChange={onEditIDAdresseFacturationChange}
              editIDAdresseLivraison={editIDAdresseLivraison} onEditIDAdresseLivraisonChange={onEditIDAdresseLivraisonChange}
            />
          )}
        </div>
      </div>
      <StatusFooter
        etat={commande.est_soldee}
        onToggle={onToggleEtat}
        isToggling={isTogglingEtat}
        // Mirrors are closed/reopened from ETM — never from here.
        disabled={isEditing || commande.is_mirror}
        disabledReason={commande.is_mirror ? "L'état est piloté par ETM" : undefined}
      />
    </div>
  )
}

function StatusFooter({ etat, onToggle, isToggling, disabled, disabledReason }: {
  etat: number
  onToggle: () => void
  isToggling: boolean
  disabled: boolean
  disabledReason?: string
}) {
  const isTerminee = etat === 1
  const Icon = isTerminee ? CheckCircle2 : Clock
  const label = isTerminee ? 'Soldée' : 'En cours'
  const actionLabel = isTerminee ? 'Rouvrir' : 'Solder'
  const ActionIcon = isTerminee ? Clock : CheckCircle2
  return (
    <div className={cn('flex-shrink-0 rounded-xl border shadow-sm overflow-hidden flex items-stretch h-11', isTerminee ? 'bg-success border-success' : 'bg-primary border-primary')}>
      <div className="flex items-center gap-2 px-3 flex-1 text-white min-w-0">
        <Icon className="h-4 w-4 flex-shrink-0" />
        <span className="text-sm font-bold uppercase tracking-wide truncate">{label}</span>
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled || isToggling}
        title={disabledReason ?? (isTerminee ? 'Marquer en cours' : 'Marquer soldée')}
        className="px-3.5 bg-white/15 hover:bg-white/25 active:bg-white/30 disabled:bg-white/5 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-semibold border-l border-white/25 flex items-center gap-1.5 transition-colors"
      >
        <ActionIcon className="h-3.5 w-3.5" />{actionLabel}
      </button>
    </div>
  )
}

// ── Sidebar Tab: Info ──────────────────────────────────

function InfoTab({
  commande, isEditing, modesPaiement, echeances,
  editDateCommande, onEditDateCommandeChange,
  editRefClient, onEditRefClientChange,
  editCommentaire, onEditCommentaireChange,
  editCommentaireInterne, onEditCommentaireInterneChange,
  editIDModePaiement, onEditIDModePaiementChange,
  editIDEcheance, onEditIDEcheanceChange,
  editRemise, onEditRemiseChange,
}: {
  commande: CommandeDetail
  isEditing: boolean
  modesPaiement: ModePaiement[]
  echeances: Echeance[]
  editDateCommande: string; onEditDateCommandeChange: (v: string) => void
  editRefClient: string; onEditRefClientChange: (v: string) => void
  editCommentaire: string; onEditCommentaireChange: (v: string) => void
  editCommentaireInterne: string; onEditCommentaireInterneChange: (v: string) => void
  editIDModePaiement: number; onEditIDModePaiementChange: (v: number) => void
  editIDEcheance: number; onEditIDEcheanceChange: (v: number) => void
  editRemise: string; onEditRemiseChange: (v: string) => void
}) {
  const modeLabel = modesPaiement.find((m) => m.IDmode_paiement === commande.IDmode_paiement)?.libelle
  const echeanceLabel = echeances.find((e) => e.IDecheance === commande.IDecheance)?.libelle
  const smallInput = 'h-7 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring text-right w-[120px]'

  const totalKg = commande.lignes.reduce((s, l) => s + (Number(l.quantite) || 0), 0)
  const produitKg = commande.lignes.reduce((s, l) => s + (Number(l.produit) || 0), 0)

  return (
    <div className="space-y-3">
      {commande.is_mirror && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-border/60 bg-zinc-200/40 text-[11px] text-muted-foreground">
          <Lock className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <span>
            Commande pilotée par ETM (commande sous-traitant n° {commande.IDcommande_ETM}).
            Elle est en lecture seule ici — modifiez-la depuis ETM.
          </span>
        </div>
      )}

      <div className={cn('p-3 rounded-lg border bg-card shadow-sm space-y-2', isEditing && editSectionClass)}>
        <KV label="Client" value={commande.client_nom || '—'} />
        <KV label="Date commande" value={isEditing ? (
          <input type="date" value={editDateCommande} onChange={(e) => onEditDateCommandeChange(e.target.value)}
            className="h-7 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring text-right" />
        ) : (commande.date_commande ? formatHfsqlDate(commande.date_commande) : '—')} />
        {/* Réf. client carries long free text ("commande 8974, 128") — in edit
            mode the input flexes to all the width left of the label. */}
        {isEditing ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground flex-shrink-0">Réf. client</span>
            <input type="text" value={editRefClient} onChange={(e) => onEditRefClientChange(e.target.value)}
              className="flex-1 min-w-0 h-7 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring text-right" />
          </div>
        ) : (
          <KV label="Réf. client" value={commande.ref_client || '—'} />
        )}
        <KV label="Mode paiement" value={isEditing ? (
          <PopoverSelect size="sm" options={modesPaiement.map((m) => ({ id: m.IDmode_paiement, primary: m.libelle }))}
            value={editIDModePaiement} onChange={onEditIDModePaiementChange} emptyLabel="—" />
        ) : (modeLabel || '—')} />
        <KV label="Échéance" value={isEditing ? (
          <PopoverSelect size="sm" options={echeances.map((e) => ({ id: e.IDecheance, primary: e.libelle }))}
            value={editIDEcheance} onChange={onEditIDEcheanceChange} emptyLabel="—" />
        ) : (echeanceLabel || '—')} />
        <KV label="Remise (%)" value={isEditing ? (
          <input type="number" value={editRemise} onChange={(e) => onEditRemiseChange(e.target.value)} className={smallInput} />
        ) : (commande.remise ? fmtNum(commande.remise, 1) : '—')} />
      </div>

      {commande.lignes.length > 0 && (
        <div className="p-3 rounded-lg border bg-card shadow-sm">
          <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
            <ClipboardList className="h-3.5 w-3.5" />Production
          </p>
          <div className="space-y-1.5">
            <KV label="Commandé" value={<span className="tabular-nums">{fmtNum(totalKg, 1)} Kgs</span>} />
            <KV label="Produit" value={<span className="tabular-nums font-semibold text-accent">{fmtNum(produitKg, 1)} Kgs</span>} />
          </div>
        </div>
      )}

      <div className={cn('p-3 rounded-lg border bg-card shadow-sm', isEditing && editSectionClass)}>
        <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
          <MessageSquare className="h-3.5 w-3.5" />Commentaire sur le bon de commande
        </p>
        {isEditing ? (
          <textarea value={editCommentaire} onChange={(e) => onEditCommentaireChange(e.target.value)} rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y" />
        ) : commande.commentaire?.trim() ? (
          <p className="text-sm text-muted-foreground whitespace-pre-line">{commande.commentaire.trim()}</p>
        ) : (
          <p className="text-sm text-muted-foreground italic">Aucun commentaire</p>
        )}
      </div>

      <div className={cn('p-3 rounded-lg border bg-card shadow-sm', isEditing && editSectionClass)}>
        <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
          <MessageSquare className="h-3.5 w-3.5" />Journal
        </p>
        {isEditing ? (
          <textarea value={editCommentaireInterne} onChange={(e) => onEditCommentaireInterneChange(e.target.value)} rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y" />
        ) : commande.commentaire_interne?.trim() ? (
          <p className="text-sm text-muted-foreground whitespace-pre-line">{commande.commentaire_interne.trim()}</p>
        ) : (
          <p className="text-sm text-muted-foreground italic">Journal vide</p>
        )}
      </div>

      {/* Fiche client — client.commentaire, read-only here; edited from Clients › Gestion. */}
      {!!commande.client_fiche && (
        <div className="p-3 rounded-lg border bg-card shadow-sm">
          <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
            <ClipboardList className="h-3.5 w-3.5" />Fiche client
          </p>
          <p className="text-sm text-muted-foreground whitespace-pre-line">{commande.client_fiche}</p>
        </div>
      )}
    </div>
  )
}

// ── Sidebar Tab: Adresses ──────────────────────────────

function AdresseLines({ adresse }: { adresse: AdresseLite }) {
  return (
    <div className="text-xs text-muted-foreground space-y-0.5">
      {adresse.nom && <p className="font-medium text-foreground">{adresse.nom}</p>}
      {adresse.adresse1 && <p>{adresse.adresse1}</p>}
      {adresse.adresse2 && <p>{adresse.adresse2}</p>}
      {adresse.adresse3 && <p>{adresse.adresse3}</p>}
      {(adresse.cp || adresse.ville) && <p>{[adresse.cp, adresse.ville].filter(Boolean).join(' ')}</p>}
      {adresse.pays && <p>{adresse.pays}</p>}
    </div>
  )
}

function AdressesTab({
  commande, isEditing, adresses,
  editIDAdresseFacturation, onEditIDAdresseFacturationChange,
  editIDAdresseLivraison, onEditIDAdresseLivraisonChange,
}: {
  commande: CommandeDetail
  isEditing: boolean
  adresses: AdresseLookup[]
  editIDAdresseFacturation: number; onEditIDAdresseFacturationChange: (v: number) => void
  editIDAdresseLivraison: number; onEditIDAdresseLivraisonChange: (v: number) => void
}) {
  return (
    <div className="space-y-3">
      <AdresseCard label="Facturation" adresse={commande.adresse_facturation} isEditing={isEditing}
        options={adresses} selectedId={editIDAdresseFacturation} onSelect={onEditIDAdresseFacturationChange} />
      <AdresseCard label="Livraison" adresse={commande.adresse_livraison} isEditing={isEditing}
        options={adresses} selectedId={editIDAdresseLivraison} onSelect={onEditIDAdresseLivraisonChange} />
    </div>
  )
}

function AdresseCard({
  label, adresse, isEditing, options, selectedId, onSelect,
}: {
  label: string
  adresse: AdresseLite | null
  isEditing: boolean
  options: AdresseLookup[]
  selectedId: number
  onSelect: (id: number) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const displayAdresse: AdresseLite | null = isEditing
    ? (options.find((o) => o.IDadresse === selectedId) ?? adresse)
    : adresse
  return (
    <div className={cn('p-3 rounded-lg border bg-card shadow-sm', isEditing && editSectionClass)}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{label}</p>
        {isEditing && (
          <Button variant="outline" size="sm" className="h-6 px-2 text-[11px] gap-1" onClick={() => setPickerOpen(true)}>
            <Search className="h-3 w-3" />Choisir
          </Button>
        )}
      </div>
      {displayAdresse ? (
        <AdresseLines adresse={displayAdresse} />
      ) : (
        <p className="text-sm text-muted-foreground italic">Aucune adresse</p>
      )}
      <AdressePickerDialog open={pickerOpen} onClose={() => setPickerOpen(false)} label={label}
        options={options} selectedId={selectedId} onSelect={(id) => { onSelect(id); setPickerOpen(false) }} />
    </div>
  )
}

function AdressePickerDialog({
  open, onClose, label, options, selectedId, onSelect,
}: {
  open: boolean
  onClose: () => void
  label: string
  options: AdresseLookup[]
  selectedId: number
  onSelect: (id: number) => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg space-y-4" onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-accent" />Choisir une adresse de {label.toLowerCase()}
          </DialogTitle>
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
                      {!!a.est_defaut_facturation && <Badge variant="outline" className="text-[10px] py-0">Facturation</Badge>}
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

// ── Create Dialog ──────────────────────────────────────

function adresseOption(a: AdresseLookup) {
  return {
    id: a.IDadresse,
    primary: a.nom || `Adresse #${a.IDadresse}`,
    description: [a.adresse1, [a.cp, a.ville].filter(Boolean).join(' '), a.pays].filter(Boolean).join('\n'),
  }
}

function CreateCommandeDialog({ open, onClose, onCreated }: {
  open: boolean
  onClose: () => void
  onCreated: (newId: number) => void
}) {
  const [clientId, setClientId] = useState(0)
  const [dateCommande, setDateCommande] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [refClient, setRefClient] = useState('')
  const [modePaiementId, setModePaiementId] = useState(0)
  const [echeanceId, setEcheanceId] = useState(0)
  const [adresseFactId, setAdresseFactId] = useState(0)
  const [adresseLivId, setAdresseLivId] = useState(0)

  const { data: clients } = useQuery<ClientLite[]>({
    queryKey: ['trm-clients'], queryFn: () => apiFetch('/commandes-trm/lookups/clients'), enabled: open,
  })
  const { data: modesPaiement } = useQuery<ModePaiement[]>({
    queryKey: ['trm-modes-paiement'], queryFn: () => apiFetch('/commandes-trm/lookups/modes-paiement'), enabled: open,
  })
  const { data: echeances } = useQuery<Echeance[]>({
    queryKey: ['trm-echeances'], queryFn: () => apiFetch('/commandes-trm/lookups/echeances'), enabled: open,
  })
  const { data: adresses } = useQuery<AdresseLookup[]>({
    queryKey: ['trm-create-adresses', clientId],
    queryFn: () => apiFetch(`/commandes-trm/lookups/adresses?client=${clientId}`),
    enabled: open && clientId > 0,
  })

  useEffect(() => {
    if (!adresses) return
    const defaultFact = adresses.find((a) => a.est_defaut_facturation) ?? adresses.find((a) => a.est_defaut) ?? adresses[0]
    const defaultLiv = adresses.find((a) => a.est_defaut_livraison) ?? adresses.find((a) => a.est_defaut) ?? adresses[0]
    setAdresseFactId(defaultFact?.IDadresse ?? 0)
    setAdresseLivId(defaultLiv?.IDadresse ?? 0)
  }, [adresses])

  // Prefill payment fields from the selected client's sheet.
  useEffect(() => {
    if (clientId <= 0 || !clients) return
    const c = clients.find((x) => x.IDclient === clientId)
    if (!c) return
    setModePaiementId(c.IDmode_paiement ?? 0)
    setEcheanceId(c.IDecheance ?? 0)
  }, [clientId, clients])

  useEffect(() => {
    if (!open) {
      setClientId(0); setDateCommande(new Date().toISOString().slice(0, 10)); setRefClient('')
      setModePaiementId(0); setEcheanceId(0); setAdresseFactId(0); setAdresseLivId(0)
    }
  }, [open])

  const createMut = useMutation({
    mutationFn: () => apiFetch('/commandes-trm', {
      method: 'POST',
      body: JSON.stringify({
        IDclient: clientId,
        date_commande: inputDateToHfsql(dateCommande),
        ref_client: refClient,
        IDmode_paiement: modePaiementId || 0,
        IDecheance: echeanceId || 0,
        IDadresse_facturation: adresseFactId || 0,
        IDadresse_livraison: adresseLivId || 0,
      }),
    }),
    onSuccess: (data: { IDcommande_client: number }) => onCreated(data.IDcommande_client),
  })

  const canSave = clientId > 0 && dateCommande.length > 0

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md" onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShoppingCart className="h-5 w-5 text-accent" />Nouvelle commande</DialogTitle>
        </DialogHeader>
        <div className="mt-4 space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Client</label>
            <SearchableCombobox<ClientLite>
              options={clients ?? []}
              value={clientId}
              onChange={setClientId}
              getId={(c) => c.IDclient}
              getPrimary={(c) => c.nom}
              placeholder="Choisir un client"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Date commande</label>
              <input type="date" value={dateCommande} onChange={(e) => setDateCommande(e.target.value)} className={cn(inputClass, 'h-9')} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Réf. client</label>
              <input type="text" value={refClient} onChange={(e) => setRefClient(e.target.value)} autoComplete="off" className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Mode paiement</label>
              <PopoverSelect options={(modesPaiement ?? []).map((m) => ({ id: m.IDmode_paiement, primary: m.libelle }))} value={modePaiementId} onChange={setModePaiementId} emptyLabel="—" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Échéance</label>
              <PopoverSelect options={(echeances ?? []).map((e) => ({ id: e.IDecheance, primary: e.libelle }))} value={echeanceId} onChange={setEcheanceId} emptyLabel="—" />
            </div>
          </div>
          {clientId > 0 && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Adr. facturation</label>
                <PopoverSelect options={(adresses ?? []).map(adresseOption)} value={adresseFactId} onChange={setAdresseFactId} emptyLabel="—" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Adr. livraison</label>
                <PopoverSelect options={(adresses ?? []).map(adresseOption)} value={adresseLivId} onChange={setAdresseLivId} emptyLabel="—" />
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={() => createMut.mutate()} disabled={!canSave || createMut.isPending}>
            {createMut.isPending
              ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Création...</>
              : <><Save className="h-3.5 w-3.5 mr-1.5" />Créer</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Shared components ──────────────────────────────────

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-right truncate">{value}</span>
    </div>
  )
}
