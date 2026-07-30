// Clients › Gestion (TRM) — port of the legacy `FI_Gestion_Client_TRM.wdw`.
//
// "Classeur" layout (mps_designer §39): the 3-panel Fiche shell with a
// master-tabbed center panel, because the two center datasets — l'historique
// des commandes et les stocks de fil du client — are large read-only tables
// consulted one at a time.
//
// Sister screen of ETM's `ClientsGestion.tsx`, but deliberately NOT shared via
// the `@etm` alias: the two ledgers show different fields (TRM has RIB /
// domiciliation / transporteur / « Attente paiement facture », ETM has the
// tarifs-références catalog and the marchandise expédiée) and read different
// data (IDsociete = 2 vs 1). The API sides are `clients-trm.ts` / `clients.ts`,
// which do share their plumbing via `lib/clients-common.ts`.
import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users, Search, Loader2, AlertCircle, MapPin, User, Star, Pencil, Plus, X, Save,
  Trash2, FileText, Phone, Mail, Receipt, Briefcase, History, Archive, ArchiveRestore,
  Printer, AtSign, Truck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { PopoverSelect, SearchableCombobox } from '@/components/ui/popover-select'
import { MasterDetailLayout } from '@/components/layout/MasterDetailLayout'
import { UnsavedChangesDialog } from '@/components/shared/UnsavedChangesDialog'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { BobineIcon } from '@/components/icons/BobineIcon'
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard'
import { useAutoSelectFirst } from '@/hooks/useAutoSelectFirst'
import { cn } from '@/lib/utils'
import { formatHfsqlDate } from '@/lib/dates'
import { fmtNum } from '@/lib/format'
import { apiFetch, API_URL } from '@/lib/api'
import { compteError, normalizeCompte } from '@/lib/compte-client'
import { useHasPermission } from '@/contexts/PermissionsContext'

/** POST/PUT helper that surfaces the API's French `message` field — `apiFetch`
 *  only reports the status code, and the compte-client conflicts (409
 *  `compte_duplique`, 400 `compte_invalide`) need to be readable by the user. */
async function apiSend<T = any>(path: string, options: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    const err: Error & { status?: number } = new Error(
      json?.message || json?.error || `Erreur HTTP ${res.status}`,
    )
    err.status = res.status
    throw err
  }
  return json as T
}

// ── Types ──────────────────────────────────────────────

interface ClientListRow {
  IDclient: number
  nom: string | null
  tel: string | null
  archive: number
}

interface Contact {
  IDcontact: number
  nom: string | null
  prenom: string | null
  tel: string | null
  mail: string | null
  est_defaut: boolean
  envoi_bl: boolean
  envoi_facture: boolean
  envoi_commande: boolean
  envoi_soumission: boolean
}

interface Adresse {
  IDadresse: number
  nom: string | null
  adresse1: string | null
  adresse2: string | null
  adresse3: string | null
  cp: string | null
  ville: string | null
  pays: string | null
  est_defaut: boolean
  est_defaut_facturation: boolean
  est_defaut_livraison: boolean
}

interface ClientDetail {
  IDclient: number
  nom: string | null
  tel: string | null
  fax: string | null
  num_tva: string | null
  compte: string | null
  commentaire: string | null
  rib: string | null
  domiciliation: string | null
  pct_remise: number
  IDtva: number
  IDmode_paiement: number
  IDecheance: number
  IDcode_comptable: number
  IDtransporteur: number
  date_creation: string | null
  archive: number
  /** « Attente paiement facture » — the legacy `client.bloqué` flag. */
  bloque: number
  adresses: Adresse[]
  contacts: Contact[]
}

interface LookupLabel { id: number; label: string }

interface Deletability { commandes: number; marchandises: number; deletable: boolean }

// ── API hooks ──────────────────────────────────────────

function useClients() {
  return useQuery<ClientListRow[]>({ queryKey: ['trm-clients'], queryFn: () => apiFetch('/clients-trm') })
}
function useClientDetail(id: number | null) {
  return useQuery<ClientDetail>({ queryKey: ['trm-client', id], queryFn: () => apiFetch(`/clients-trm/${id}`), enabled: id !== null })
}

function useLookup(path: string, key: string, map: (r: any) => LookupLabel) {
  const { data } = useQuery<any[]>({ queryKey: ['trm-client-lookup', key], queryFn: () => apiFetch(`/clients-trm/lookups/${path}`), staleTime: 5 * 60_000 })
  return useMemo(() => (data ?? []).map(map), [data, map])
}

/** Every compte client already in use, so a duplicate is flagged while the user
 *  types rather than only when the write comes back rejected. Not scoped by
 *  société — the compte identifies the company in the shared ledger. */
function useComptesPris() {
  const { data, isLoading } = useQuery<{ comptes: string[] }>({
    queryKey: ['trm-client-comptes'],
    queryFn: () => apiFetch('/clients-trm/comptes'),
    staleTime: 30_000,
  })
  const taken = useMemo(() => new Set(data?.comptes ?? []), [data])
  return { taken, isLoading }
}

// ── Shared styling ─────────────────────────────────────

const inputClass = 'w-full h-8 px-2.5 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring'
const editSectionClass = 'border-l-4 border-l-accent/70 bg-accent/[0.03]'
const thHead = 'bg-zinc-100/80 border-b text-[10px] uppercase tracking-wide text-muted-foreground'

function SectionSpinner() { return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-accent" /></div> }
function SectionEmpty({ text }: { text: string }) { return <p className="text-sm text-muted-foreground italic py-2">{text}</p> }

const UNITE_LABEL: Record<number, string> = { 1: 'Kg', 3: 'Ml', 4: 'unité', 5: 'm²' }

// ── Edit draft ─────────────────────────────────────────

interface Draft {
  nom: string
  tel: string
  fax: string
  num_tva: string
  compte: string
  commentaire: string
  rib: string
  domiciliation: string
  pct_remise: string
  IDtva: number
  IDmode_paiement: number
  IDecheance: number
  IDcode_comptable: number
  IDtransporteur: number
  bloque: boolean
}

function draftFromDetail(d: ClientDetail): Draft {
  return {
    nom: d.nom ?? '',
    tel: d.tel ?? '',
    fax: d.fax ?? '',
    num_tva: d.num_tva ?? '',
    compte: d.compte ?? '',
    commentaire: d.commentaire ?? '',
    rib: d.rib ?? '',
    domiciliation: d.domiciliation ?? '',
    pct_remise: d.pct_remise ? String(d.pct_remise) : '',
    IDtva: d.IDtva ?? 0,
    IDmode_paiement: d.IDmode_paiement ?? 0,
    IDecheance: d.IDecheance ?? 0,
    IDcode_comptable: d.IDcode_comptable ?? 0,
    IDtransporteur: d.IDtransporteur ?? 0,
    bloque: !!d.bloque,
  }
}

function draftToBody(d: Draft) {
  return {
    nom: d.nom.trim() || 'Client',
    tel: d.tel,
    fax: d.fax,
    num_tva: d.num_tva,
    compte: d.compte,
    commentaire: d.commentaire,
    rib: d.rib,
    domiciliation: d.domiciliation,
    pct_remise: Number(d.pct_remise.replace(',', '.')) || 0,
    IDtva: d.IDtva,
    IDmode_paiement: d.IDmode_paiement,
    IDecheance: d.IDecheance,
    IDcode_comptable: d.IDcode_comptable,
    IDtransporteur: d.IDtransporteur,
    bloque: d.bloque,
  }
}

// ── Main Page ──────────────────────────────────────────

type ArchiveFilter = 'encours' | 'archive' | 'tous'

export function ClientsGestion() {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>('encours')
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [subFormsDirty, setSubFormsDirty] = useState(false)
  const [autoEditForId, setAutoEditForId] = useState<number | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  // Non-null while a save is refused because the compte client is empty or
  // malformed — holds the French explanation shown in the blocking alert.
  const [saveBlockedReason, setSaveBlockedReason] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  // §18 A-bis placeholders — the legacy fiche prints nothing, so the canonical
  // §6.1 Print / Email buttons open the "En developpement" dialog for now.
  const [placeholder, setPlaceholder] = useState<'print' | 'email' | null>(null)

  const originalDraftRef = useRef<Draft | null>(null)

  const { data: clients, isLoading, isError, error } = useClients()
  const { data: detail, isLoading: detailLoading } = useClientDetail(selectedId)

  const canDelete = useHasPermission('delete_client')
  const canEditInfo = useHasPermission('edit_client_info')
  const canCrudContacts = useHasPermission('crud_client_contacts')
  const canCrudAdresses = useHasPermission('crud_client_adresses')

  // Deletability is fetched as soon as edit mode opens so the header can show
  // the right icon upfront (bin = deletable, archive = has commandes /
  // marchandise). Same query key as the confirm dialog, which reads it from cache.
  const { data: deletability } = useQuery<Deletability>({
    queryKey: ['trm-client-deletability', selectedId],
    queryFn: () => apiFetch(`/clients-trm/${selectedId}/deletability`),
    enabled: canDelete && isEditing && selectedId !== null,
  })

  // Lookups (shared across edit + view-mode label resolution)
  const modesPaiement = useLookup('modes-paiement', 'modes-paiement', (r) => ({ id: r.IDmode_paiement, label: r.libelle }))
  const echeances = useLookup('echeances', 'echeances', (r) => ({ id: r.IDecheance, label: r.libelle }))
  const tvas = useLookup('tva', 'tva', (r) => ({ id: r.IDtva, label: r.libelle }))
  const codesComptables = useLookup('codes-comptables', 'codes-comptables', (r) => ({ id: r.IDcode_comptable, label: r.libelle }))
  const transporteurs = useLookup('transporteurs', 'transporteurs', (r) => ({ id: r.IDtransporteur, label: r.nom }))
  const { taken: comptesPris } = useComptesPris()

  const filtered = useMemo(() => {
    if (!clients) return []
    const q = searchQuery.trim().toLowerCase()
    return clients.filter((c) => {
      if (archiveFilter === 'encours' && c.archive) return false
      if (archiveFilter === 'archive' && !c.archive) return false
      if (q && !(c.nom ?? '').toLowerCase().includes(q)) return false
      return true
    })
  }, [clients, searchQuery, archiveFilter])

  // Keep selection valid against the (search/filter-narrowed) list.
  useAutoSelectFirst({
    rows: filtered,
    selectedId,
    getId: (c) => c.IDclient,
    select: setSelectedId,
    suspended: isEditing || autoEditForId !== null,
  })

  const startEdit = useCallback(() => {
    if (!detail) return
    const snap = draftFromDetail(detail)
    setDraft(snap)
    originalDraftRef.current = snap
    setIsEditing(true)
    // Rows predating the mandatory compte have an empty one, and a handful of
    // legacy rows hold a malformed value. Either way, pull a suggestion straight
    // away so the user is handed a fix instead of just being stopped by a
    // validation error on a field they never touched. The snapshot is updated
    // too, so the pre-fill alone doesn't make the form look dirty.
    const nom = (detail.nom ?? '').trim()
    if (canEditInfo && nom && compteError(detail.compte) !== null) {
      apiFetch<{ compte: string }>(`/clients-trm/compte-suggestion?nom=${encodeURIComponent(nom)}&exclude=${detail.IDclient}`)
        .then(({ compte }) => {
          setDraft((d) => (d && compteError(d.compte) !== null ? { ...d, compte } : d))
          if (originalDraftRef.current && compteError(originalDraftRef.current.compte) !== null) {
            originalDraftRef.current = { ...originalDraftRef.current, compte }
          }
        })
        .catch(() => { /* the user can still type one — validation will ask */ })
    }
  }, [detail, canEditInfo])

  const cancelEdit = useCallback(() => {
    setIsEditing(false)
    setDraft(null)
    setSaveError(null)
  }, [])

  const isDirty = useMemo(() => {
    if (!isEditing || !draft) return false
    if (subFormsDirty) return true
    return JSON.stringify(draft) !== JSON.stringify(originalDraftRef.current)
  }, [isEditing, draft, subFormsDirty])

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['trm-clients'] })
    queryClient.invalidateQueries({ queryKey: ['trm-client', selectedId] })
    queryClient.invalidateQueries({ queryKey: ['trm-client-comptes'] })
  }, [queryClient, selectedId])

  const saveMutation = useMutation({
    mutationFn: () => apiSend(`/clients-trm/${selectedId}`, { method: 'PUT', body: JSON.stringify(draftToBody(draft!)) }),
    onSuccess: () => { invalidateAll(); setIsEditing(false); setDraft(null); setSaveError(null) },
    onError: (e: Error) => setSaveError(e.message),
  })

  // The compte client is mandatory, format-checked (411 + 3 alphanumerics) and
  // unique. Only the Info scope writes it, so a user without that permission is
  // never held responsible for a field they cannot edit.
  const compteIssue = useMemo(
    () => (isEditing && canEditInfo && draft
      ? compteError(draft.compte, { taken: comptesPris, ownCompte: detail?.compte })
      : null),
    [isEditing, canEditInfo, draft, comptesPris, detail?.compte],
  )

  const attemptSave = useCallback(() => {
    if (compteIssue) { setSaveBlockedReason(compteIssue); return }
    saveMutation.mutate()
  }, [compteIssue, saveMutation])

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/clients-trm/${id}`, { method: 'DELETE' }),
    onSuccess: (_data, deletedId) => {
      const cached = queryClient.getQueryData<ClientListRow[]>(['trm-clients']) ?? []
      const remaining = cached.filter((c) => c.IDclient !== deletedId)
      queryClient.invalidateQueries({ queryKey: ['trm-clients'] })
      setIsEditing(false)
      setDraft(null)
      setDeleteConfirm(false)
      setSelectedId(remaining.length > 0 ? remaining[0].IDclient : null)
    },
  })

  // Archive keeps the row (it just moves to the « Archivés » filter) — the
  // keep-selection-valid hook re-targets the list if it drops out of view.
  const archiveMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/clients-trm/${id}/archive`, { method: 'POST' }),
    onSuccess: () => {
      invalidateAll()
      setIsEditing(false)
      setDraft(null)
      setDeleteConfirm(false)
    },
  })

  const unarchiveMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/clients-trm/${id}/unarchive`, { method: 'POST' }),
    onSuccess: invalidateAll,
  })

  // Auto-enter edit mode once the freshly-created client's detail loads.
  useEffect(() => {
    if (autoEditForId !== null && detail?.IDclient === autoEditForId) {
      startEdit()
      setAutoEditForId(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEditForId, detail])

  const guard = useUnsavedGuard({
    isDirty,
    save: async () => { await saveMutation.mutateAsync() },
    onDiscard: () => { setIsEditing(false); setDraft(null); setSaveError(null) },
    // Leaving edit mode with an invalid compte would let the client be saved
    // (via the guard's « Enregistrer ») without one. Block the exit and explain
    // instead; « Annuler » is still a way out, it just discards.
    shouldBlockExit: compteIssue !== null,
    onExitBlocked: () => setSaveBlockedReason(compteIssue),
  })

  const handleSelect = useCallback((id: number) => {
    guard.guardAction(() => { setIsEditing(false); setDraft(null); setSelectedId(id) })
  }, [guard])

  const patch = useCallback((p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d)), [])

  return (
    <>
      <MasterDetailLayout
        list={<ClientList clients={filtered} total={clients?.length ?? 0} isLoading={isLoading} isError={isError} error={error as Error | null}
          selectedId={selectedId} onSelect={handleSelect} searchQuery={searchQuery} onSearchChange={setSearchQuery}
          archiveFilter={archiveFilter} onArchiveFilterChange={setArchiveFilter}
          onNew={() => setCreateOpen(true)} isEditing={isEditing} />}
        detailHeader={<DetailHeader client={detail ?? null} isLoading={detailLoading && selectedId !== null}
          isEditing={isEditing} draft={draft} onPatch={patch}
          onStartEdit={startEdit} onCancelEdit={cancelEdit} onSave={attemptSave} isSaving={saveMutation.isPending}
          canDelete={canDelete} deletable={deletability?.deletable}
          onDelete={() => setDeleteConfirm(true)}
          onUnarchive={() => { if (selectedId !== null) unarchiveMutation.mutate(selectedId) }}
          isUnarchiving={unarchiveMutation.isPending}
          onPrint={() => setPlaceholder('print')} onEmail={() => setPlaceholder('email')} />}
        detail={<DetailMain client={detail ?? null} isLoading={detailLoading && selectedId !== null}
          hasSelection={selectedId !== null} />}
        sidebar={selectedId !== null ? <DetailSidebar client={detail ?? null} isLoading={detailLoading}
          isEditing={isEditing} clientId={selectedId} onMutationSuccess={invalidateAll}
          onSubFormsDirtyChange={setSubFormsDirty} draft={draft} onPatch={patch}
          canEditInfo={canEditInfo} canCrudContacts={canCrudContacts} canCrudAdresses={canCrudAdresses}
          modesPaiement={modesPaiement} echeances={echeances}
          tvas={tvas} codesComptables={codesComptables} transporteurs={transporteurs} /> : null}
        sidebarTitle="Contacts & Adresses" hasSelection={selectedId !== null}
        onBack={() => guard.guardAction(() => { setIsEditing(false); setDraft(null); setSelectedId(null) })}
      />
      <UnsavedChangesDialog open={guard.showDialog} onAction={guard.handleAction} isSaving={guard.isSaving} />
      <CreateClientDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(newId) => {
          setCreateOpen(false)
          queryClient.invalidateQueries({ queryKey: ['trm-clients'] })
          queryClient.invalidateQueries({ queryKey: ['trm-client-comptes'] })
          setArchiveFilter('encours')
          setSelectedId(newId)
          setAutoEditForId(newId)
        }}
      />
      <PlaceholderDialog mode={placeholder} onClose={() => setPlaceholder(null)} />
      <AlertDialog open={saveBlockedReason !== null} onOpenChange={(o) => { if (!o) setSaveBlockedReason(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Compte client requis
            </AlertDialogTitle>
            <AlertDialogDescription>
              {saveBlockedReason} Il figure dans l'onglet Info, rubrique Facturation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2 mt-4">
            <Button onClick={() => setSaveBlockedReason(null)}>OK</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={saveError !== null} onOpenChange={(o) => { if (!o) setSaveError(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Enregistrement impossible
            </AlertDialogTitle>
            <AlertDialogDescription>{saveError}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2 mt-4">
            <Button onClick={() => setSaveError(null)}>OK</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <DeleteOrArchiveDialog
        open={deleteConfirm}
        clientId={selectedId}
        isDeleting={deleteMutation.isPending}
        isArchiving={archiveMutation.isPending}
        onCancel={() => setDeleteConfirm(false)}
        onDelete={() => { if (selectedId !== null) deleteMutation.mutate(selectedId) }}
        onArchive={() => { if (selectedId !== null) archiveMutation.mutate(selectedId) }}
      />
    </>
  )
}

// ── §18 A-bis placeholder (Imprimer / Envoyer un email) ──

function PlaceholderDialog({ mode, onClose }: { mode: 'print' | 'email' | null; onClose: () => void }) {
  const isEmail = mode === 'email'
  return (
    <Dialog open={mode !== null} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEmail ? <AtSign className="h-5 w-5 text-accent" /> : <Printer className="h-5 w-5 text-accent" />}
            {isEmail ? 'Envoyer un email' : 'Imprimer'}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          {isEmail ? <Mail className="h-12 w-12 mb-3 opacity-40" /> : <Printer className="h-12 w-12 mb-3 opacity-40" />}
          <p className="text-sm font-medium">En developpement</p>
          <p className="text-xs mt-1">Cette fonctionnalite sera disponible prochainement.</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Delete-or-archive confirm flow ─────────────────────
// A client with commandes or marchandise can never be hard-deleted. The header
// button already shows the matching icon (bin vs archive box) from the shared
// deletability query, so this dialog goes straight to the right confirm. The API
// enforces the same rule server-side (409 client_has_activity).

function DeleteOrArchiveDialog({ open, clientId, isDeleting, isArchiving, onCancel, onDelete, onArchive }: {
  open: boolean; clientId: number | null; isDeleting: boolean; isArchiving: boolean
  onCancel: () => void; onDelete: () => void; onArchive: () => void
}) {
  // Same query key as the page-level fetch — resolved from cache instantly.
  const { data } = useQuery<Deletability>({
    queryKey: ['trm-client-deletability', clientId],
    queryFn: () => apiFetch(`/clients-trm/${clientId}/deletability`),
    enabled: open && clientId !== null,
  })
  const checking = !data
  const deletable = data?.deletable ?? false
  const archiveMode = !checking && !deletable

  return (
    <ConfirmDialog
      open={open}
      title={archiveMode ? 'Archiver le client' : 'Supprimer le client'}
      description={archiveMode
        ? 'Le client n’apparaîtra plus dans la liste « En cours ». Vous pourrez le désarchiver à tout moment.'
        : 'Cette action supprimera le client, ses contacts et ses adresses. Elle est irréversible.'}
      variant={archiveMode ? 'default' : 'destructive'}
      confirmLabel={archiveMode ? 'Archiver' : 'Supprimer'}
      isPending={checking || isDeleting || isArchiving}
      onCancel={onCancel}
      onConfirm={() => { if (checking) return; if (deletable) onDelete(); else onArchive() }}
    />
  )
}

// ── Left Panel: List ───────────────────────────────────

const ARCHIVE_FILTERS: { key: ArchiveFilter; label: string }[] = [
  { key: 'encours', label: 'En cours' },
  { key: 'archive', label: 'Archivés' },
  { key: 'tous', label: 'Tous' },
]

function ClientList({ clients, total, isLoading, isError, error, selectedId, onSelect, searchQuery, onSearchChange, archiveFilter, onArchiveFilterChange, onNew, isEditing }: {
  clients: ClientListRow[]; total: number; isLoading: boolean; isError: boolean; error: Error | null
  selectedId: number | null; onSelect: (id: number) => void; searchQuery: string; onSearchChange: (q: string) => void
  archiveFilter: ArchiveFilter; onArchiveFilterChange: (f: ArchiveFilter) => void
  onNew: () => void; isEditing: boolean
}) {
  return (
    <div className="flex flex-col h-full rounded-lg border shadow-sm bg-zinc-100/80">
      <div className="p-3 border-b rounded-t-lg bg-zinc-200/50 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input type="text" placeholder="Rechercher..." value={searchQuery} onChange={(e) => onSearchChange(e.target.value)}
            autoComplete="off" className="w-full h-9 pl-9 pr-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="flex flex-wrap gap-1">
          {ARCHIVE_FILTERS.map((opt) => (
            <button key={opt.key} type="button" onClick={() => onArchiveFilterChange(opt.key)}
              className={cn('px-2 py-1 text-xs rounded-md transition-colors flex-grow basis-[calc(33.333%-0.25rem)]',
                archiveFilter === opt.key ? 'bg-accent text-accent-foreground shadow-sm font-medium' : 'text-muted-foreground hover:bg-accent/10')}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-auto p-3 space-y-2 scrollbar-transparent">
        {isLoading ? <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>
        : isError ? <div className="flex flex-col items-center justify-center py-8 text-destructive"><AlertCircle className="h-6 w-6 mb-2" /><p className="text-sm">{error?.message || 'Erreur'}</p></div>
        : clients.length === 0 ? <div className="flex flex-col items-center justify-center py-8 text-muted-foreground"><Users className="h-12 w-12 mb-3 opacity-50" /><p className="text-sm">Aucun client</p></div>
        : clients.map((c) => (
          <div key={c.IDclient} onClick={() => onSelect(c.IDclient)}
            className={cn('p-3 border rounded-lg cursor-pointer transition-all',
              selectedId === c.IDclient ? 'border-accent bg-white ring-1 ring-accent' : 'border-border bg-white hover:border-accent/50')}>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <p className="font-medium text-sm truncate flex-1">{c.nom || '—'}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="p-3 border-t text-xs text-muted-foreground flex items-center justify-between rounded-b-lg bg-zinc-200/50">
        <span>{clients.length} / {total} client{total !== 1 ? 's' : ''}</span>
        {!isEditing && (
          <Button size="sm" variant="ghost" onClick={onNew} className="text-accent hover:text-accent hover:bg-accent/10">
            <Plus className="h-3.5 w-3.5 mr-1" />Nouveau
          </Button>
        )}
      </div>
    </div>
  )
}

// ── "Nouveau client" dialog ────────────────────────────
//
// Asks for the identity fields up front instead of dropping a "Nouveau client"
// placeholder row. Knowing the name before the INSERT is also what lets the
// compte client be derived from it.

function CreateClientDialog({ open, onClose, onCreated }: {
  open: boolean
  onClose: () => void
  onCreated: (id: number) => void
}) {
  const [nom, setNom] = useState('')
  const [compte, setCompte] = useState('')
  /** True once the user edits the compte by hand — stops the name-driven
   *  suggestion from overwriting their choice on the next keystroke. */
  const [compteTouched, setCompteTouched] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { taken, isLoading: takenLoading } = useComptesPris()

  useEffect(() => {
    if (!open) return
    setNom('')
    setCompte(''); setCompteTouched(false); setError(null)
  }, [open])

  // Debounced suggestion: the code is derived from the name, so it follows
  // whatever the user types until they take the field over.
  const trimmedNom = nom.trim()
  useEffect(() => {
    if (!open || compteTouched || !trimmedNom) {
      if (!trimmedNom && !compteTouched) setCompte('')
      return
    }
    let cancelled = false
    setSuggesting(true)
    const t = setTimeout(() => {
      apiFetch<{ compte: string }>(`/clients-trm/compte-suggestion?nom=${encodeURIComponent(trimmedNom)}`)
        .then(({ compte: c }) => { if (!cancelled) setCompte(c) })
        .catch(() => { /* the field stays editable; validation will ask */ })
        .finally(() => { if (!cancelled) setSuggesting(false) })
    }, 350)
    return () => { cancelled = true; clearTimeout(t); setSuggesting(false) }
  }, [open, trimmedNom, compteTouched])

  const compteIssue = compteError(compte, { taken })
  const canSubmit = trimmedNom.length > 0 && compteIssue === null && !suggesting && !takenLoading

  const createMut = useMutation({
    mutationFn: () => apiSend<{ IDclient: number }>('/clients-trm', {
      method: 'POST',
      body: JSON.stringify({
        nom: trimmedNom,
        compte: normalizeCompte(compte),
      }),
    }),
    onSuccess: (data) => onCreated(data.IDclient),
    onError: (e: Error) => setError(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto" onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-accent" />
            Nouveau client
          </DialogTitle>
        </DialogHeader>
        <div className="mt-4 space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Nom <span className="text-destructive">*</span></label>
            <input value={nom} onChange={(e) => setNom(e.target.value)} autoFocus autoComplete="off"
              placeholder="Raison sociale du client"
              className="w-full h-9 px-2.5 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              Compte client <span className="text-destructive">*</span>
              {suggesting && <Loader2 className="h-3 w-3 animate-spin text-accent" />}
            </label>
            <input value={compte}
              onChange={(e) => { setCompteTouched(true); setCompte(normalizeCompte(e.target.value)) }}
              autoComplete="off" spellCheck={false} maxLength={12}
              className={cn(
                'w-full h-9 px-2.5 text-sm font-mono tracking-wider rounded-md border bg-white focus:outline-none focus:ring-2 focus:ring-ring',
                compte && compteIssue ? 'border-destructive' : 'border-input',
              )} />
            <p className={cn('text-[11px]', compte && compteIssue ? 'text-destructive' : 'text-muted-foreground')}>
              {compte && compteIssue
                ? compteIssue
                : 'Proposé d’après le nom — 411 suivi de 3 lettres ou chiffres, unique par client.'}
            </p>
          </div>
          {error && (
            <p className="text-xs text-destructive flex items-start gap-1.5 mt-3">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-px" />{error}
            </p>
          )}
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={createMut.isPending}>Annuler</Button>
          <Button onClick={() => { setError(null); createMut.mutate() }} disabled={!canSubmit || createMut.isPending}>
            {createMut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
            Créer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Center: Detail Header ──────────────────────────────

function DetailHeader({ client, isLoading, isEditing, draft, onPatch, onStartEdit, onCancelEdit, onSave, isSaving, canDelete, deletable, onDelete, onUnarchive, isUnarchiving, onPrint, onEmail }: {
  client: ClientDetail | null; isLoading: boolean; isEditing: boolean; draft: Draft | null; onPatch: (p: Partial<Draft>) => void
  onStartEdit: () => void; onCancelEdit: () => void; onSave: () => void; isSaving: boolean
  canDelete: boolean; deletable: boolean | undefined
  onDelete: () => void; onUnarchive: () => void; isUnarchiving: boolean; onPrint: () => void; onEmail: () => void
}) {
  if (!client && !isLoading) return null
  return (
    <div className="flex-shrink-0 pt-0.5">
      <div className="flex items-center gap-3">
        <div className={cn('h-11 w-11 rounded-lg flex items-center justify-center', isEditing ? 'bg-accent/15' : 'icon-box-gold')}>
          <Users className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          {isLoading ? <div className="h-8 w-48 bg-muted animate-pulse rounded" />
          : isEditing ? (
            <div className="flex items-center gap-3">
              <input value={draft?.nom ?? ''} onChange={(e) => onPatch({ nom: e.target.value })} autoFocus
                className="flex-1 text-xl font-heading font-bold h-10 px-3 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
              <Badge className="bg-accent text-accent-foreground flex-shrink-0 gap-1 shadow-sm"><Pencil className="h-3 w-3" />Mode edition</Badge>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-heading font-bold tracking-tight truncate">{client?.nom || '—'}</h1>
              {(!!client?.archive || !!client?.bloque) && (
                <div className="flex gap-1.5 mt-1 flex-wrap">
                  {!!client?.archive && <Badge variant="outline" className="text-xs">Archivé</Badge>}
                  {/* Explicit amber utilities, not the `.badge-warning` component
                      class: it lives in @layer components, so the Badge's own
                      `bg-primary` utility wins and the pill renders navy. */}
                  {!!client?.bloque && (
                    <Badge variant="outline" className="text-xs bg-amber-500/15 text-amber-800 border-amber-500/30">
                      Attente paiement facture
                    </Badge>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        {!isLoading && client && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {isEditing ? (
              <>
                {/* Delete/archive is an edit-mode-only, permission-gated action.
                    The icon reflects what will actually happen: bin when the
                    client is deletable, archive box when it has commandes /
                    marchandise (deletion impossible → archive instead). */}
                {canDelete && (client?.archive ? (
                  <Button variant="outline" size="icon" className="h-9 w-9" title="Désarchiver" onClick={onUnarchive} disabled={isUnarchiving}>
                    {isUnarchiving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArchiveRestore className="h-4 w-4" />}
                  </Button>
                ) : deletable === false ? (
                  <Button variant="outline" size="icon" className="h-9 w-9" title="Archiver" onClick={onDelete}>
                    <Archive className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button variant="outline" size="icon" className="h-9 w-9 text-destructive hover:text-destructive" title="Supprimer" onClick={onDelete} disabled={deletable === undefined}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ))}
                <Button variant="outline" size="sm" onClick={onCancelEdit}><X className="h-3.5 w-3.5 mr-1.5" />Annuler</Button>
                <Button size="sm" onClick={onSave} disabled={isSaving}>
                  <Save className="h-3.5 w-3.5 mr-1.5" />{isSaving ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="icon" className="h-9 w-9" title="Imprimer" onClick={onPrint}><Printer className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" className="h-9 w-9" title="Envoyer un email" onClick={onEmail}><AtSign className="h-4 w-4" /></Button>
                <Button variant="gold" size="sm" onClick={onStartEdit}><Pencil className="h-3.5 w-3.5 mr-1.5" />Modifier</Button>
              </>
            )}
          </div>
        )}
      </div>
      <div className={cn('h-1 w-24 mt-3 rounded-full', isEditing ? 'bg-accent' : 'bg-gradient-to-r from-accent via-accent to-accent/30')} />
    </div>
  )
}

// ── Field primitives ───────────────────────────────────

function TogglePill({ label, checked, disabled, onChange }: {
  label: string; checked: boolean; disabled: boolean; onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-border/60 bg-white shadow-sm">
      <span className={cn('text-xs font-medium', disabled && 'text-muted-foreground')}>{label}</span>
      {/* The hover tint is gated on !disabled: a read-only pill that still
          lights up on hover reads as clickable and silently swallows the click. */}
      <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        className={cn('relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          checked ? 'bg-accent shadow-inner' : 'bg-zinc-300',
          !disabled && !checked && 'hover:bg-zinc-400/80')}>
        <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ease-out',
          checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
      </button>
    </div>
  )
}

// ── Center: Detail Main (master-tabbed history views) ──
// "Classeur" layout (mps_designer §39): master tabs switch the center panel
// between datasets so the active view gets the full panel height.

const MAIN_TABS = [
  { key: 'historique', label: 'Historique des commandes', icon: History },
  { key: 'stock-fil', label: 'Stocks de fil', icon: BobineIcon },
] as const
type MainTab = (typeof MAIN_TABS)[number]['key']

function DetailMain({ client, isLoading, hasSelection }: {
  client: ClientDetail | null; isLoading: boolean; hasSelection: boolean
}) {
  const [activeTab, setActiveTab] = useState<MainTab>('historique')
  // Land on the historique (the client's main dataset) whenever the selection changes.
  useEffect(() => { setActiveTab('historique') }, [client?.IDclient])

  if (!hasSelection) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="icon-box-gold h-16 w-16 mx-auto"><Users className="h-8 w-8" /></div>
        <p className="text-muted-foreground text-sm">Sélectionnez un client dans la liste</p>
      </div>
    </div>
  )
  if (isLoading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>
  if (!client) return null

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Master tabs — header-submenu style pills on the natural background */}
      <div className="flex-shrink-0 flex items-center gap-1 border-b border-border/60 pb-2">
        {MAIN_TABS.map((t) => {
          const Icon = t.icon
          const active = activeTab === t.key
          return (
            <button key={t.key} type="button" onClick={() => setActiveTab(t.key)}
              className={cn('flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap',
                active ? 'bg-accent text-accent-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent/10 hover:text-accent')}>
              <Icon className="h-3.5 w-3.5" />{t.label}
            </button>
          )
        })}
      </div>
      {/* Flex column, not a scroll container: each tab pins its own toolbar and
          scrolls its table internally. px-1/pb-1 keep focus rings clear of the clip. */}
      <div className="flex-1 min-h-0 flex flex-col pt-3 px-1 pb-1">
        {activeTab === 'historique' && <HistoriqueTab clientId={client.IDclient} />}
        {activeTab === 'stock-fil' && <StockFilTab clientId={client.IDclient} />}
      </div>
    </div>
  )
}

// ── Shared form components (contacts/adresses) ─────────

function LabeledInput({ label, value, onChange, autoFocus }: { label: string; value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus}
        autoComplete="off" data-form-type="other" data-lpignore="true" className={inputClass} />
    </div>
  )
}

function InlineForm({ title, children, onSave, onCancel, isSaving }: { title: string; children: React.ReactNode; onSave: () => void; onCancel: () => void; isSaving: boolean }) {
  return (
    <div className="rounded-lg border border-accent/25 bg-accent/[0.03] p-4 space-y-3">
      <p className="text-xs font-semibold text-accent uppercase tracking-wide">{title}</p>
      {children}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onCancel}>Annuler</Button>
        <Button size="sm" onClick={onSave} disabled={isSaving}>{isSaving ? 'Enregistrement...' : 'Enregistrer'}</Button>
      </div>
    </div>
  )
}

// ── Right Panel: Sidebar with Tabs ─────────────────────
// Info / Contacts / Adresses — the exact three tabs of the legacy window.

type SidebarTab = 'info' | 'contacts' | 'adresses'

function DetailSidebar({ client, isLoading, isEditing, clientId, onMutationSuccess, onSubFormsDirtyChange, draft, onPatch,
  canEditInfo, canCrudContacts, canCrudAdresses,
  modesPaiement, echeances, tvas, codesComptables, transporteurs }: {
  client: ClientDetail | null; isLoading: boolean; isEditing: boolean; clientId: number; onMutationSuccess: () => void
  onSubFormsDirtyChange: (dirty: boolean) => void
  draft: Draft | null; onPatch: (p: Partial<Draft>) => void
  canEditInfo: boolean; canCrudContacts: boolean; canCrudAdresses: boolean
  modesPaiement: LookupLabel[]; echeances: LookupLabel[]
  tvas: LookupLabel[]; codesComptables: LookupLabel[]; transporteurs: LookupLabel[]
}) {
  const [activeTab, setActiveTab] = useState<SidebarTab>('info')
  if (isLoading) return (
    <div className="w-[26rem] flex-shrink-0 bg-muted/30 rounded-xl border p-4 space-y-4">
      <div className="flex gap-2"><div className="h-8 flex-1 bg-muted animate-pulse rounded-md" /><div className="h-8 flex-1 bg-muted animate-pulse rounded-md" /></div>
      {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}
    </div>
  )
  if (!client) return null

  const tabs: { key: SidebarTab; label: string; icon: React.ElementType }[] = [
    { key: 'info', label: 'Info', icon: Briefcase },
    { key: 'contacts', label: 'Contacts', icon: User },
    { key: 'adresses', label: 'Adresses', icon: MapPin },
  ]

  return (
    <div className="w-[26rem] flex-shrink-0 rounded-xl border flex flex-col overflow-hidden bg-zinc-100/80">
      <div className="flex border-b p-1 gap-1 rounded-t-xl bg-zinc-200/50">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={cn('flex-1 min-w-0 flex items-center justify-center gap-1 px-1.5 py-2 text-xs font-medium rounded-md transition-colors',
                activeTab === tab.key ? 'bg-accent text-accent-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent/10')}>
              <Icon className="h-3.5 w-3.5 flex-shrink-0" /><span className="truncate">{tab.label}</span>
            </button>
          )
        })}
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-transparent">
        {/* Each tab gets its own permission scope — without it, edit mode renders
            that tab exactly like view mode (mirrored server-side in clients-trm.ts). */}
        {activeTab === 'info' && <InfoTab client={client} isEditing={isEditing && canEditInfo} draft={draft} onPatch={onPatch}
          modesPaiement={modesPaiement} echeances={echeances}
          tvas={tvas} codesComptables={codesComptables} transporteurs={transporteurs} />}
        {activeTab === 'contacts' && <ContactsTab contacts={client.contacts} isEditing={isEditing && canCrudContacts} clientId={clientId} onMutationSuccess={onMutationSuccess} onDirtyChange={onSubFormsDirtyChange} />}
        {activeTab === 'adresses' && <AdressesTab adresses={client.adresses} isEditing={isEditing && canCrudAdresses} clientId={clientId} onMutationSuccess={onMutationSuccess} onDirtyChange={onSubFormsDirtyChange} />}
      </div>
    </div>
  )
}

// ── Sidebar Tab: Info (général · facturation · autre · commentaire) ──

function InfoCard({ icon, title, isEditing, children }: { icon: React.ReactNode; title: string; isEditing: boolean; children: React.ReactNode }) {
  return (
    <div className={cn('p-3 rounded-lg border bg-card shadow-sm', isEditing && editSectionClass)}>
      <div className="flex items-center gap-2 mb-2">{icon}<h3 className="text-sm font-semibold">{title}</h3></div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function KVRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 min-h-[1.75rem]">
      <span className="text-xs text-muted-foreground flex-shrink-0">{label}</span>
      <div className="min-w-0 text-sm text-right">{children}</div>
    </div>
  )
}

function KVText({ label, value, edit, onChange, type = 'text', invalid, mono, maxLength }: {
  label: string; value: string; edit: boolean; onChange: (v: string) => void; type?: string
  /** Red border while the value fails validation (compte client). */
  invalid?: boolean; mono?: boolean; maxLength?: number
}) {
  return (
    <KVRow label={label}>
      {edit ? (
        // w-[220px] matches PopoverSelect / SearchableCombobox size="sm"
        // (mps_designer §11bis) so text inputs and dropdowns share one KV column.
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} maxLength={maxLength}
          autoComplete="off" data-form-type="other" data-lpignore="true"
          className={cn('h-7 w-[220px] px-2 text-sm text-right rounded-md border bg-white focus:outline-none focus:ring-2 focus:ring-ring',
            invalid ? 'border-destructive' : 'border-input',
            mono && 'font-mono tracking-wider')} />
      ) : (
        <span className="block truncate">{value?.trim() ? value : <span className="text-muted-foreground">—</span>}</span>
      )}
    </KVRow>
  )
}

function KVSelect({ label, value, edit, options, onChange, searchable }: {
  label: string; value: number; edit: boolean; options: LookupLabel[]; onChange: (id: number) => void; searchable?: boolean
}) {
  const current = options.find((o) => o.id === value)
  return (
    <KVRow label={label}>
      {edit ? (
        searchable ? (
          <SearchableCombobox options={options} value={value} onChange={onChange} getId={(o) => o.id} getPrimary={(o) => o.label} placeholder={`Rechercher ${label.toLowerCase()}`} size="sm" />
        ) : (
          <PopoverSelect options={options.map((o) => ({ id: o.id, primary: o.label }))} value={value} onChange={onChange} emptyLabel="— Aucun —" size="sm" />
        )
      ) : (
        <span className="block truncate">{current ? current.label : <span className="text-muted-foreground">—</span>}</span>
      )}
    </KVRow>
  )
}

function InfoTab({ client, isEditing, draft, onPatch, modesPaiement, echeances, tvas, codesComptables, transporteurs }: {
  client: ClientDetail; isEditing: boolean
  draft: Draft | null; onPatch: (p: Partial<Draft>) => void
  modesPaiement: LookupLabel[]; echeances: LookupLabel[]
  tvas: LookupLabel[]; codesComptables: LookupLabel[]; transporteurs: LookupLabel[]
}) {
  const ed = isEditing && draft !== null
  // Same query key as the page, so React Query dedupes this to zero extra
  // requests rather than threading the set down through DetailSidebar.
  const { taken: comptesPris } = useComptesPris()
  const compteIssue = ed ? compteError(draft!.compte, { taken: comptesPris, ownCompte: client.compte }) : null
  // tel / fax are still carried by the draft (so a save round-trips the stored
  // values untouched) — the legacy fiche doesn't surface them here.
  const v = {
    num_tva: ed ? draft!.num_tva : client.num_tva ?? '',
    compte: ed ? draft!.compte : client.compte ?? '',
    commentaire: ed ? draft!.commentaire : client.commentaire ?? '',
    rib: ed ? draft!.rib : client.rib ?? '',
    domiciliation: ed ? draft!.domiciliation : client.domiciliation ?? '',
    pct_remise: ed ? draft!.pct_remise : (client.pct_remise ? String(client.pct_remise) : ''),
    IDtva: ed ? draft!.IDtva : client.IDtva,
    IDmode_paiement: ed ? draft!.IDmode_paiement : client.IDmode_paiement,
    IDecheance: ed ? draft!.IDecheance : client.IDecheance,
    IDcode_comptable: ed ? draft!.IDcode_comptable : client.IDcode_comptable,
    IDtransporteur: ed ? draft!.IDtransporteur : client.IDtransporteur,
    bloque: ed ? draft!.bloque : !!client.bloque,
  }
  return (
    <>
      {/* No « Général » card: the legacy TRM fiche has no secteur, no activité
          and no « client interne » — those belong to the ETM fiche only, and the
          API deliberately never names their columns on a TRM save. */}
      {/* Field order mirrors the legacy Facturation block. */}
      <InfoCard icon={<Receipt className="h-4 w-4 text-accent" />} title="Facturation" isEditing={ed}>
        <TogglePill label="Attente paiement facture" checked={v.bloque} disabled={!ed} onChange={(x) => onPatch({ bloque: x })} />
        <KVSelect label="Mode de paiement" value={v.IDmode_paiement} edit={ed} options={modesPaiement} onChange={(id) => onPatch({ IDmode_paiement: id })} />
        <KVSelect label="TVA" value={v.IDtva} edit={ed} options={tvas} onChange={(id) => onPatch({ IDtva: id })} />
        <KVText label="N° TVA" value={v.num_tva} edit={ed} onChange={(x) => onPatch({ num_tva: x })} />
        <KVText label="RIB" value={v.rib} edit={ed} maxLength={30} onChange={(x) => onPatch({ rib: x })} />
        <KVText label="Domiciliation" value={v.domiciliation} edit={ed} maxLength={50} onChange={(x) => onPatch({ domiciliation: x })} />
        <KVSelect label="Échéance" value={v.IDecheance} edit={ed} options={echeances} onChange={(id) => onPatch({ IDecheance: id })} />
        {/* Compte client is mandatory and format-checked (411 + 3 alphanumerics).
            It is generated at creation; here it stays editable but a save is
            refused while it is empty or malformed. */}
        <KVText label="N° compte client" value={v.compte} edit={ed} mono maxLength={12}
          invalid={ed && compteIssue !== null}
          onChange={(x) => onPatch({ compte: normalizeCompte(x) })} />
        {ed && compteIssue !== null && (
          <p className="text-[11px] text-destructive text-right">{compteIssue}</p>
        )}
        <KVSelect label="Code comptable" value={v.IDcode_comptable} edit={ed} options={codesComptables} onChange={(id) => onPatch({ IDcode_comptable: id })} searchable />
        <KVText label="Remise (%)" value={v.pct_remise} edit={ed} type="number" onChange={(x) => onPatch({ pct_remise: x })} />
      </InfoCard>

      <InfoCard icon={<Truck className="h-4 w-4 text-accent" />} title="Autre" isEditing={ed}>
        <KVSelect label="Transporteur" value={v.IDtransporteur} edit={ed} options={transporteurs} onChange={(id) => onPatch({ IDtransporteur: id })} searchable />
      </InfoCard>

      <InfoCard icon={<FileText className="h-4 w-4 text-accent" />} title="Commentaire" isEditing={ed}>
        {ed ? (
          <textarea value={v.commentaire} onChange={(e) => onPatch({ commentaire: e.target.value })} rows={4}
            className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y" />
        ) : v.commentaire?.trim() ? (
          <p className="text-sm text-muted-foreground whitespace-pre-line">{v.commentaire}</p>
        ) : <p className="text-sm text-muted-foreground italic">Aucun commentaire</p>}
      </InfoCard>
    </>
  )
}

// ── Sidebar Tab: Contacts ──────────────────────────────

const ENVOI_FLAGS = [
  { key: 'envoi_commande' as const, label: 'Commande' },
  { key: 'envoi_bl' as const, label: 'BL' },
  { key: 'envoi_facture' as const, label: 'Facture' },
  { key: 'envoi_soumission' as const, label: 'Soumission' },
]

// Hue-per-document category chips (mps_designer §36 style): one stable colour
// per doc type so a contact's send-flags read at a glance.
const ENVOI_CHIP_CLASS: Record<(typeof ENVOI_FLAGS)[number]['key'], string> = {
  envoi_commande: 'bg-sky-500/10 text-sky-700 border-sky-500/25',
  envoi_bl: 'bg-teal-500/10 text-teal-700 border-teal-500/25',
  envoi_facture: 'bg-orange-500/10 text-orange-700 border-orange-500/25',
  envoi_soumission: 'bg-amber-500/15 text-amber-800 border-amber-500/30',
}
const chipClass = 'inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium border'

// Gold "Principal(e)" star badge + gold avatar tint.
const principalBadgeClass = 'text-[10px] py-0 flex-shrink-0 bg-accent/10 text-amber-700 border-accent/30'
const goldAvatarClass = 'bg-gradient-to-br from-gold/30 to-gold/10 text-amber-700'

function contactInitials(prenom: string | null, nom: string | null): string {
  return [prenom, nom].map((s) => (s ?? '').trim().charAt(0).toUpperCase()).filter(Boolean).join('')
}

function ContactsTab({ contacts, isEditing, clientId, onMutationSuccess, onDirtyChange }: {
  contacts: Contact[]; isEditing: boolean; clientId: number; onMutationSuccess: () => void; onDirtyChange: (dirty: boolean) => void
}) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState({ nom: '', prenom: '', tel: '', mail: '', envoi_bl: false, envoi_facture: false, envoi_commande: false, envoi_soumission: false })
  const [showForm, setShowForm] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const onDirtyChangeRef = useRef(onDirtyChange)
  useEffect(() => { onDirtyChangeRef.current = onDirtyChange })
  useEffect(() => { onDirtyChangeRef.current(showForm || editingId !== null) }, [showForm, editingId])
  useEffect(() => () => { onDirtyChangeRef.current(false) }, [])

  const createMut = useMutation({ mutationFn: () => apiFetch(`/clients-trm/${clientId}/contacts`, { method: 'POST', body: JSON.stringify(form) }), onSuccess: () => { onMutationSuccess(); resetForm() } })
  const updateMut = useMutation({ mutationFn: (cid: number) => apiFetch(`/clients-trm/${clientId}/contacts/${cid}`, { method: 'PUT', body: JSON.stringify(form) }), onSuccess: () => { onMutationSuccess(); setEditingId(null) } })
  const deleteMut = useMutation({ mutationFn: (cid: number) => apiFetch(`/clients-trm/${clientId}/contacts/${cid}`, { method: 'DELETE' }), onSuccess: () => { onMutationSuccess(); setDeleteId(null) } })

  const resetForm = () => { setForm({ nom: '', prenom: '', tel: '', mail: '', envoi_bl: false, envoi_facture: false, envoi_commande: false, envoi_soumission: false }); setShowForm(false) }
  const startEditContact = (c: Contact) => {
    setEditingId(c.IDcontact)
    setForm({ nom: c.nom ?? '', prenom: c.prenom ?? '', tel: c.tel ?? '', mail: c.mail ?? '', envoi_bl: !!c.envoi_bl, envoi_facture: !!c.envoi_facture, envoi_commande: !!c.envoi_commande, envoi_soumission: !!c.envoi_soumission })
  }

  const contactForm = (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <LabeledInput label="Prénom" value={form.prenom} onChange={(v) => setForm({ ...form, prenom: v })} autoFocus />
        <LabeledInput label="Nom" value={form.nom} onChange={(v) => setForm({ ...form, nom: v })} />
      </div>
      <LabeledInput label="Téléphone" value={form.tel} onChange={(v) => setForm({ ...form, tel: v })} />
      <LabeledInput label="Email" value={form.mail} onChange={(v) => setForm({ ...form, mail: v })} />
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Documents envoyés</label>
        <div className="flex flex-wrap gap-1.5">
          {ENVOI_FLAGS.map((f) => (
            <button key={f.key} type="button" onClick={() => setForm({ ...form, [f.key]: !form[f.key] })}
              className={cn('px-2 py-1 text-xs rounded-md border transition-colors',
                form[f.key] ? 'bg-accent text-accent-foreground border-accent shadow-sm font-medium' : 'text-muted-foreground border-input hover:bg-accent/10')}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
    </>
  )

  return (
    <>
      {contacts.length === 0 && !showForm && editingId === null && (
        <p className="text-sm text-muted-foreground italic">Aucun contact</p>
      )}
      {contacts.map((c) => (
        editingId === c.IDcontact ? (
          <InlineForm key={c.IDcontact} title="Modifier le contact" isSaving={updateMut.isPending}
            onCancel={() => setEditingId(null)} onSave={() => updateMut.mutate(c.IDcontact)}>
            {contactForm}
          </InlineForm>
        ) : (
          <div key={c.IDcontact}
            onClick={isEditing ? () => startEditContact(c) : undefined}
            className={cn('group p-3 rounded-lg border bg-card shadow-sm transition-colors',
              isEditing && 'cursor-pointer hover:border-accent/40', isEditing && editSectionClass)}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 min-w-0">
                <div className={cn('h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0 text-[11px] font-semibold', goldAvatarClass)}>
                  {contactInitials(c.prenom, c.nom) || <User className="h-3.5 w-3.5" />}
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-sm flex items-center gap-2 min-w-0">
                    <span className="truncate">{[c.prenom, c.nom].filter((s) => (s ?? '').trim()).join(' ') || '—'}</span>
                    {!!c.est_defaut && (
                      <Badge variant="outline" className={principalBadgeClass}><Star className="h-2.5 w-2.5 mr-0.5" />Principal</Badge>
                    )}
                  </div>
                  {!!c.tel?.trim() && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1"><Phone className="h-3 w-3" />{c.tel}</div>
                  )}
                  {!!c.mail?.trim() && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5"><Mail className="h-3 w-3 flex-shrink-0" /><span className="truncate">{c.mail}</span></div>
                  )}
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {ENVOI_FLAGS.filter((f) => !!c[f.key]).map((f) => (
                      <span key={f.key} className={cn(chipClass, ENVOI_CHIP_CLASS[f.key])}>{f.label}</span>
                    ))}
                  </div>
                </div>
              </div>
              {isEditing && (
                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                  onClick={(e) => { e.stopPropagation(); setDeleteId(c.IDcontact) }} title="Supprimer">
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        )
      ))}
      {showForm && (
        <InlineForm title="Nouveau contact" isSaving={createMut.isPending} onCancel={resetForm} onSave={() => createMut.mutate()}>
          {contactForm}
        </InlineForm>
      )}
      {isEditing && !showForm && editingId === null && (
        <Button variant="ghost" size="sm" className="w-full text-muted-foreground hover:text-foreground" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-1.5" />Ajouter un contact
        </Button>
      )}
      <ConfirmDialog
        open={deleteId !== null}
        title="Supprimer le contact"
        description="Ce contact sera définitivement supprimé de la fiche client."
        variant="destructive"
        confirmLabel="Supprimer"
        isPending={deleteMut.isPending}
        onCancel={() => setDeleteId(null)}
        onConfirm={() => { if (deleteId !== null) deleteMut.mutate(deleteId) }}
      />
    </>
  )
}

// ── Sidebar Tab: Adresses ──────────────────────────────

function AdressesTab({ adresses, isEditing, clientId, onMutationSuccess, onDirtyChange }: {
  adresses: Adresse[]; isEditing: boolean; clientId: number; onMutationSuccess: () => void; onDirtyChange: (dirty: boolean) => void
}) {
  const emptyForm = { nom: '', adresse1: '', adresse2: '', adresse3: '', cp: '', ville: '', pays: '', est_defaut_facturation: false, est_defaut_livraison: false }
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [showForm, setShowForm] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const onDirtyChangeRef = useRef(onDirtyChange)
  useEffect(() => { onDirtyChangeRef.current = onDirtyChange })
  useEffect(() => { onDirtyChangeRef.current(showForm || editingId !== null) }, [showForm, editingId])
  useEffect(() => () => { onDirtyChangeRef.current(false) }, [])

  const createMut = useMutation({ mutationFn: () => apiFetch(`/clients-trm/${clientId}/adresses`, { method: 'POST', body: JSON.stringify(form) }), onSuccess: () => { onMutationSuccess(); setForm(emptyForm); setShowForm(false) } })
  const updateMut = useMutation({ mutationFn: (aid: number) => apiFetch(`/clients-trm/${clientId}/adresses/${aid}`, { method: 'PUT', body: JSON.stringify(form) }), onSuccess: () => { onMutationSuccess(); setEditingId(null) } })
  const deleteMut = useMutation({ mutationFn: (aid: number) => apiFetch(`/clients-trm/${clientId}/adresses/${aid}`, { method: 'DELETE' }), onSuccess: () => { onMutationSuccess(); setDeleteId(null) } })

  const startEditAdresse = (a: Adresse) => {
    setEditingId(a.IDadresse)
    setForm({
      nom: a.nom ?? '', adresse1: a.adresse1 ?? '', adresse2: a.adresse2 ?? '', adresse3: a.adresse3 ?? '',
      cp: a.cp ?? '', ville: a.ville ?? '', pays: a.pays ?? '',
      est_defaut_facturation: !!a.est_defaut_facturation, est_defaut_livraison: !!a.est_defaut_livraison,
    })
  }

  const adresseForm = (
    <>
      <LabeledInput label="Nom" value={form.nom} onChange={(v) => setForm({ ...form, nom: v })} autoFocus />
      <LabeledInput label="Adresse" value={form.adresse1} onChange={(v) => setForm({ ...form, adresse1: v })} />
      <LabeledInput label="Complément" value={form.adresse2} onChange={(v) => setForm({ ...form, adresse2: v })} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <LabeledInput label="Code postal" value={form.cp} onChange={(v) => setForm({ ...form, cp: v })} />
        <LabeledInput label="Ville" value={form.ville} onChange={(v) => setForm({ ...form, ville: v })} />
      </div>
      <LabeledInput label="Pays" value={form.pays} onChange={(v) => setForm({ ...form, pays: v })} />
      <div className="flex flex-wrap gap-1.5">
        {([['est_defaut_facturation', 'Facturation'], ['est_defaut_livraison', 'Livraison']] as const).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setForm({ ...form, [key]: !form[key] })}
            className={cn('px-2 py-1 text-xs rounded-md border transition-colors',
              form[key] ? 'bg-accent text-accent-foreground border-accent shadow-sm font-medium' : 'text-muted-foreground border-input hover:bg-accent/10')}>
            Par défaut · {label}
          </button>
        ))}
      </div>
    </>
  )

  return (
    <>
      {adresses.length === 0 && !showForm && editingId === null && (
        <p className="text-sm text-muted-foreground italic">Aucune adresse</p>
      )}
      {adresses.map((a) => (
        editingId === a.IDadresse ? (
          <InlineForm key={a.IDadresse} title="Modifier l'adresse" isSaving={updateMut.isPending}
            onCancel={() => setEditingId(null)} onSave={() => updateMut.mutate(a.IDadresse)}>
            {adresseForm}
          </InlineForm>
        ) : (
          <div key={a.IDadresse}
            onClick={isEditing ? () => startEditAdresse(a) : undefined}
            className={cn('group p-3 rounded-lg border bg-card shadow-sm transition-colors',
              isEditing && 'cursor-pointer hover:border-accent/40', isEditing && editSectionClass)}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 min-w-0">
                <div className={cn('h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0', goldAvatarClass)}>
                  <MapPin className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{a.nom || '—'}</p>
                  <p className="text-xs text-muted-foreground">{[a.adresse1, a.adresse2, a.adresse3].filter((s) => (s ?? '').trim()).join(', ') || '—'}</p>
                  <p className="text-xs text-muted-foreground">{[a.cp, a.ville, a.pays].filter((s) => (s ?? '').trim()).join(' ')}</p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {!!a.est_defaut_facturation && <span className={cn(chipClass, ENVOI_CHIP_CLASS.envoi_facture)}>Facturation</span>}
                    {!!a.est_defaut_livraison && <span className={cn(chipClass, ENVOI_CHIP_CLASS.envoi_bl)}>Livraison</span>}
                  </div>
                </div>
              </div>
              {isEditing && (
                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                  onClick={(e) => { e.stopPropagation(); setDeleteId(a.IDadresse) }} title="Supprimer">
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        )
      ))}
      {showForm && (
        <InlineForm title="Nouvelle adresse" isSaving={createMut.isPending} onCancel={() => { setForm(emptyForm); setShowForm(false) }} onSave={() => createMut.mutate()}>
          {adresseForm}
        </InlineForm>
      )}
      {isEditing && !showForm && editingId === null && (
        <Button variant="ghost" size="sm" className="w-full text-muted-foreground hover:text-foreground" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-1.5" />Ajouter une adresse
        </Button>
      )}
      <ConfirmDialog
        open={deleteId !== null}
        title="Supprimer l'adresse"
        description="Cette adresse sera définitivement supprimée de la fiche client."
        variant="destructive"
        confirmLabel="Supprimer"
        isPending={deleteMut.isPending}
        onCancel={() => setDeleteId(null)}
        onConfirm={() => { if (deleteId !== null) deleteMut.mutate(deleteId) }}
      />
    </>
  )
}

// ── Center tab: Historique des commandes ───────────────

interface HistLigne {
  IDligne: number; IDcommande_client: number; numero: number; date_commande: string | null
  type_kind: number; ref: string; coloris: string; quantite: number; unite: number; prix: number
  /** Reserved for the legacy « Marge Brute » column — always null for now. */
  marge_brute: number | null
}

function HistoriqueTab({ clientId }: { clientId: number }) {
  const { data, isLoading } = useQuery<{ lignes: HistLigne[]; capped: boolean }>({
    queryKey: ['trm-client-historique', clientId],
    queryFn: () => apiFetch(`/clients-trm/${clientId}/historique`),
  })
  const lignes = data?.lignes ?? []
  return (
    <>
      {isLoading ? <SectionSpinner /> : lignes.length === 0 ? <SectionEmpty text="Aucune commande" /> : (
        <>
          <div className="min-h-0 overflow-auto rounded-lg border border-border/60 bg-card shadow-sm scrollbar-transparent">
            <table className="w-full text-xs">
              <thead className={cn(thHead, 'sticky top-0 z-10 bg-zinc-100')}><tr>
                <th className="px-2 py-1.5 text-left font-semibold">Date</th>
                <th className="px-2 py-1.5 text-left font-semibold">N°</th>
                <th className="px-2 py-1.5 text-left font-semibold">Réf. interne</th>
                <th className="px-2 py-1.5 text-left font-semibold">Coloris</th>
                <th className="px-2 py-1.5 text-right font-semibold">Quantité</th>
                <th className="px-2 py-1.5 text-right font-semibold">Prix unitaire</th>
                <th className="px-2 py-1.5 text-right font-semibold">Marge brute</th>
              </tr></thead>
              <tbody>
                {lignes.map((l) => (
                  <tr key={l.IDligne} className="border-b border-border/40 last:border-b-0 hover:bg-accent/5">
                    <td className="px-2 py-1.5 whitespace-nowrap">{l.date_commande && /\d{8}/.test(l.date_commande) ? formatHfsqlDate(l.date_commande) : '—'}</td>
                    <td className="px-2 py-1.5 tabular-nums">{l.numero || '—'}</td>
                    <td className="px-2 py-1.5 truncate max-w-[160px]" title={l.ref}>{l.ref || '—'}</td>
                    <td className="px-2 py-1.5 truncate max-w-[160px]" title={l.coloris}>{l.coloris || '—'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtNum(l.quantite)} {UNITE_LABEL[l.unite] ?? ''}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{l.prix ? `${fmtNum(l.prix, 2)} €` : '—'}</td>
                    {/* Marge brute: kept as a column (legacy parity) but not yet
                        computed — the formula lives in the compressed .wdw. */}
                    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap text-muted-foreground"
                      title="Calcul de la marge brute à implémenter">
                      {l.marge_brute === null ? '—' : `${fmtNum(l.marge_brute, 2)} %`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data?.capped && <p className="flex-shrink-0 text-[11px] text-muted-foreground italic mt-2">120 commandes les plus récentes affichées.</p>}
        </>
      )}
    </>
  )
}

// ── Center tab: Stocks de fil ──────────────────────────
// TRM knits à façon: the yarn lots belong to the customer (stock_fil.IDclient).
//
// The legacy panel offers En Cours / En Attente / Historique. Only two of those
// are reproducible from the schema — `terminé` is the single state flag on
// stock_fil — so « En Attente » is deliberately absent rather than guessed.
// See the API comment in ETM's routes/clients-trm.ts for the full evidence.

interface StockFilLot {
  IDstock_fil: number
  lot: string | null
  date_entree: string | null
  ref_fil: string
  coloris: string
  stock: number
  stock_initial: number
  emplacement: string | null
  termine: number
}

const STOCK_FILTERS = [
  { key: 'encours', label: 'En cours' },
  { key: 'historique', label: 'Historique' },
  { key: 'tous', label: 'Tous' },
] as const
type StockFilter = (typeof STOCK_FILTERS)[number]['key']

function StockFilTab({ clientId }: { clientId: number }) {
  const [etat, setEtat] = useState<StockFilter>('encours')
  useEffect(() => { setEtat('encours') }, [clientId])

  const { data, isLoading } = useQuery<{ lots: StockFilLot[]; capped: boolean; total: number }>({
    queryKey: ['trm-client-stock-fil', clientId, etat],
    queryFn: () => apiFetch(`/clients-trm/${clientId}/stock-fil?etat=${etat}`),
  })
  const lots = data?.lots ?? []

  return (
    <>
      {/* In-tab filter row — same gold-pill segmented control as the left list (§5). */}
      <div className="flex-shrink-0 flex flex-wrap items-center gap-1 mb-2">
        {STOCK_FILTERS.map((opt) => (
          <button key={opt.key} type="button" onClick={() => setEtat(opt.key)}
            className={cn('px-2 py-1 text-xs rounded-md transition-colors',
              etat === opt.key ? 'bg-accent text-accent-foreground shadow-sm font-medium' : 'text-muted-foreground hover:bg-accent/10')}>
            {opt.label}
          </button>
        ))}
        {!isLoading && (
          <span className="ml-auto text-[11px] text-muted-foreground">
            {data?.total ?? 0} lot{(data?.total ?? 0) > 1 ? 's' : ''}
          </span>
        )}
      </div>
      {isLoading ? <SectionSpinner /> : lots.length === 0 ? <SectionEmpty text="Aucun lot de fil" /> : (
        <>
          <div className="min-h-0 overflow-auto rounded-lg border border-border/60 bg-card shadow-sm scrollbar-transparent">
            <table className="w-full text-xs">
              <thead className={cn(thHead, 'sticky top-0 z-10 bg-zinc-100')}><tr>
                <th className="px-2 py-1.5 text-left font-semibold">Lot N°</th>
                <th className="px-2 py-1.5 text-left font-semibold">Date entrée</th>
                <th className="px-2 py-1.5 text-left font-semibold">Référence</th>
                <th className="px-2 py-1.5 text-left font-semibold">Coloris</th>
                <th className="px-2 py-1.5 text-left font-semibold">Emplacement</th>
                <th className="px-2 py-1.5 text-right font-semibold">Stock</th>
                <th className="px-2 py-1.5 text-right font-semibold">Stock initial</th>
              </tr></thead>
              <tbody>
                {lots.map((l) => (
                  <tr key={l.IDstock_fil} className="border-b border-border/40 last:border-b-0 hover:bg-accent/5">
                    <td className="px-2 py-1.5 whitespace-nowrap tabular-nums">
                      {l.lot || '—'}
                      {!!l.termine && <Badge variant="outline" className="ml-1 text-[9px] py-0 px-1" title="Lot terminé">T</Badge>}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{l.date_entree && /\d{8}/.test(l.date_entree) ? formatHfsqlDate(l.date_entree) : '—'}</td>
                    <td className="px-2 py-1.5 truncate max-w-[190px]" title={l.ref_fil}>{l.ref_fil || '—'}</td>
                    <td className="px-2 py-1.5 truncate max-w-[130px]" title={l.coloris}>{l.coloris || '—'}</td>
                    <td className="px-2 py-1.5 truncate max-w-[110px]" title={l.emplacement ?? ''}>{l.emplacement?.trim() || '—'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap font-semibold">{fmtNum(l.stock, 2)} kg</td>
                    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtNum(l.stock_initial, 2)} kg</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data?.capped && <p className="flex-shrink-0 text-[11px] text-muted-foreground italic mt-2">400 lots les plus récents affichés.</p>}
        </>
      )}
    </>
  )
}
