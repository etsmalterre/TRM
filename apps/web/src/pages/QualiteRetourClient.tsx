// Qualité › Retour client — the complaint Ets Malterre sends back to the
// atelier, and what the atelier answers (legacy FI_Retour_ClientTRM.wdw).
//
// Classeur layout (mps_designer §39) — the mirror of ETM's Qualité › Dossiers,
// because it is literally the other end of the same conversation: ETM raises a
// dossier_qualite and sends its FNC, and that arrives here as a retour_client.
// The résolution and réponse typed on this screen are republished onto ETM's
// dossier, which is where its own screen reads them back.
//
// Center master tabs:
//   • Retour       — the complaint itself: who, which défaut, the two
//                    observations, the affectation, and the atelier's answer.
//                    Opens with an « Origine » card when the retour came from a
//                    FNC (91 of 91 live rows did): ETM's dossier number, its
//                    send date, the end client who actually complained, and a
//                    link to the FNC itself.
//   • Traçabilité  — the roll(s) the reference resolves to, with, per roll, the
//                    production timeline, the visitage findings, and the two
//                    documents that surround it (the order ETM placed with TRM
//                    and the avis d'expédition it left on).
// Right sidebar: Journal / Documents / Info — the legacy's ONG_Detail, same
// three tabs. Status footer pill (§29.3) is the binary `archivé` flag.
//
// Left-list urgency (§41): a retour only goes red/amber when the ETM dossier it
// came from carries an échéance, which is null on nearly every recent one — the
// §30 "missing date = late" rule would paint the whole list red.
//   red   = échéance atteinte ou dépassée
//   amber = échéance dans les 3 jours
// The échéance is read-only here: it lives on ETM's dossier and belongs to ETM.
//
// Two columns the legacy carries and this screen deliberately does NOT surface:
// `impact_prime` (0 on every row, and the WinDev window has no input for it —
// it only appears on the printed sheet) and `defaut` (a text copy of the label,
// empty on 90 of 91 rows; the live label comes from IDdefaut_textile).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ComponentType } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  AtSign,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  Factory,
  FileText,
  FileWarning,
  History,
  Info,
  Link2,
  Loader2,
  MessageSquare,
  Package,
  Pencil,
  Plus,
  Printer,
  Save,
  Search,
  Send,
  Tag,
  Trash2,
  Truck,
  Undo2,
  User,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PopoverSelect, SearchableCombobox } from '@/components/ui/popover-select'
import { MasterDetailLayout } from '@/components/layout/MasterDetailLayout'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { UnsavedChangesDialog } from '@/components/shared/UnsavedChangesDialog'
import { BonnetierAvatar, EventTimeline, fmtEventDateTime } from '@/components/shared/PieceEvents'
import { SendEmailDialog } from '@/components/email/SendEmailDialog'
import { useAutoSelectFirst } from '@/hooks/useAutoSelectFirst'
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard'
import { useHasPermission } from '@/contexts/PermissionsContext'
import { apiFetch, API_URL } from '@/lib/api'
import { postEmail } from '@/lib/email'
import { formatHfsqlDate, hfsqlDateToInput, inputDateToHfsql } from '@/lib/dates'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────

interface ListRow {
  IDretour_client: number
  client_nom: string
  defaut_label: string
  date: string | null
  archive: 0 | 1
  type_reference: string
  reference: string
  IDdossier_qualite: number
  echeance: string | null
  has_reponse: 0 | 1
}

interface FncOrigin {
  IDdossier_qualite: number
  envoi_fnc: string | null
  echeance: string | null
  message_fnc: string
  termine: 0 | 1
  /** ETM's own end client — the one who actually complained. */
  client_etm: string
}

interface RetourDetail {
  IDretour_client: number
  IDclient: number
  client_nom: string
  IDdefaut_textile: number
  defaut_nom: string
  defaut_categorie: string
  date: string | null
  message_client: string
  message_resp_atelier: string
  reponse: string
  type_reference: string
  reference: string
  impact_prime: number
  archive: 0 | 1
  journal: string
  IDresolution_qualite: number
  resolution_libelle: string
  IDbonnetier: number
  bonnetier_nom: string
  IDmachine: number
  machine_nom: string
  fnc: FncOrigin | null
}

interface Lookups {
  clients: { IDclient: number; nom: string }[]
  defauts: { IDdefaut_textile: number; nom: string; categorie: string }[]
  resolutions: { IDresolution_qualite: number; libelle: string }[]
  bonnetiers: { IDbonnetier: number; nom: string }[]
  machines: { IDmachine: number; nom: string }[]
}

interface TracaEvent {
  IDevenement_piece: number
  date: string | null
  evenement: string
  observation: string
  IDbonnetier: number
  bonnetier: string
}

interface TracaDefaut {
  IDdefaut_qualite: number
  date: string | null
  type_defaut: string
  taille_cm: number
  nombre: number
  description: string
  IDSpotteur: number
  spotteur: string
  role: string
}

interface TracaPiece {
  IDstock_ecru: number
  numero: string
  poids: number
  date_saisie: string | null
  second_choix: 0 | 1
  IDordre_fabrication: number
  metier: string
  events: TracaEvent[]
  defauts: TracaDefaut[]
}

interface TracaDoc {
  kind: 'commande_sst' | 'bon_livraison'
  id: number
  label: string
  sous_titre: string
  date: string | null
}

interface Tracabilite {
  kind: 'piece' | 'lot_fini' | 'none'
  resolved: boolean
  titre: string | null
  sous_titre: string | null
  pieces: TracaPiece[]
  documents: TracaDoc[]
}

interface DocRow {
  IDdoc_qualite: number
  nom: string
}

type StatusFilter = 'en_cours' | 'termine' | 'tous'
type MainTab = 'retour' | 'tracabilite'
type SidebarTab = 'journal' | 'documents' | 'info'
type DocKind = 'fiche' | 'fnc'

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'en_cours', label: 'En cours' },
  { key: 'termine', label: 'Terminé' },
  { key: 'tous', label: 'Tous' },
]

const MAIN_TABS: { key: MainTab; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { key: 'retour', label: 'Retour', icon: Undo2 },
  { key: 'tracabilite', label: 'Traçabilité', icon: Link2 },
]

const SIDEBAR_TABS: { key: SidebarTab; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { key: 'journal', label: 'Journal', icon: History },
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'info', label: 'Info', icon: Info },
]

// Affectation — Type_Reference is a string discriminator over the free-text
// `reference`. PopoverSelect is id-keyed, so map through small ids.
// ⚠️ '2' means a LOT FINI here. On ETM's dossier_qualite the same code means a
// lot de fil — same discriminator, different table.
const AFFECTATION_OPTIONS = [
  { id: 1, type: '', primary: 'Aucune' },
  { id: 2, type: '1', primary: 'Numéro de pièce', secondary: 'rouleau écru' },
  { id: 3, type: '2', primary: 'Numéro de lot', secondary: 'lot fini' },
]
const affectationIdOf = (type: string) => AFFECTATION_OPTIONS.find((o) => o.type === type)?.id ?? 1
const affectationTypeOf = (id: number) => AFFECTATION_OPTIONS.find((o) => o.id === id)?.type ?? ''
const affectationLabelOf = (type: string) =>
  AFFECTATION_OPTIONS.find((o) => o.type === type)?.primary ?? 'Aucune'

const inputClass =
  'w-full h-9 px-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring'
const textareaClass =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y'
const editSectionClass = 'border-l-4 border-l-accent/70 bg-accent/[0.03]'

/** Urgency from the ETM dossier's échéance. Unlike §30, a *missing* échéance is
 *  NOT urgent: it is null on nearly every dossier, so the whole list would go
 *  red. Only an open retour can be urgent — a closed one is done with. */
function echeanceUrgency(echeance: string | null, archive: 0 | 1): 'late' | 'soon' | null {
  if (archive === 1) return null
  if (!echeance || !/^\d{8}$/.test(echeance)) return null
  const target = new Date(
    Number(echeance.slice(0, 4)),
    Number(echeance.slice(4, 6)) - 1,
    Number(echeance.slice(6, 8)),
  )
  target.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000)
  if (diffDays <= 0) return 'late'
  if (diffDays <= 3) return 'soon'
  return null
}

/** « Maille 100 » / « Trou x2 » — the same pair the avis d'expédition prints.
 *  ⚠️ taille_cm is NOT centimetres (25 = « Moins de 50 cm »): the units are
 *  per-vocabulary and unrecoverable, so it is never rendered with a unit. */
function defautLabel(d: TracaDefaut): string {
  const type = d.type_defaut.trim()
  if (d.taille_cm > 0) return `${type} ${fmtNum(d.taille_cm)}`.trim()
  if (d.nombre > 0) return `${type} ×${fmtNum(d.nombre)}`.trim()
  return type || d.description || 'Défaut'
}

// ── Edit state ───────────────────────────────────────────

interface EditState {
  IDclient: number
  IDdefaut_textile: number
  date: string
  message_client: string
  message_resp_atelier: string
  reponse: string
  journal: string
  type_reference: string
  reference: string
  IDresolution_qualite: number
  IDbonnetier: number
  IDmachine: number
}

function snapshotEdit(d: RetourDetail): EditState {
  return {
    IDclient: d.IDclient,
    IDdefaut_textile: d.IDdefaut_textile,
    date: hfsqlDateToInput(d.date),
    message_client: d.message_client,
    message_resp_atelier: d.message_resp_atelier,
    reponse: d.reponse,
    journal: d.journal,
    type_reference: d.type_reference,
    reference: d.reference,
    IDresolution_qualite: d.IDresolution_qualite,
    IDbonnetier: d.IDbonnetier,
    IDmachine: d.IDmachine,
  }
}

// ── Page ─────────────────────────────────────────────────

export function QualiteRetourClient() {
  const queryClient = useQueryClient()
  const canManage = useHasPermission('edit_retour_client')

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('en_cours')
  const [searchQuery, setSearchQuery] = useState('')
  const [urgencyFilter, setUrgencyFilter] = useState<'late' | 'soon' | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [edit, setEdit] = useState<EditState | null>(null)
  const originalRef = useRef<EditState | null>(null)
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('journal')
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)

  // ── Queries ────────────────────────────────────────────
  const { data: lookups } = useQuery({
    queryKey: ['retours-client-trm-lookups'],
    queryFn: () => apiFetch<Lookups>('/retours-client-trm/lookups'),
    staleTime: 5 * 60_000,
  })

  const { data: rows, isLoading, isError } = useQuery({
    queryKey: ['retours-client-trm', statusFilter],
    queryFn: () => apiFetch<ListRow[]>(`/retours-client-trm?statut=${statusFilter}`),
  })

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['retour-client-trm', selectedId],
    queryFn: () => apiFetch<RetourDetail>(`/retours-client-trm/${selectedId}`),
    enabled: selectedId !== null,
  })

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['retours-client-trm'] })
    queryClient.invalidateQueries({ queryKey: ['retour-client-trm', selectedId] })
    queryClient.invalidateQueries({ queryKey: ['retour-client-trm-traca', selectedId] })
  }, [queryClient, selectedId])

  // ── Edit lifecycle ─────────────────────────────────────
  const startEdit = useCallback(() => {
    if (!detail) return
    const snap = snapshotEdit(detail)
    setEdit(snap)
    originalRef.current = snap
    setIsEditing(true)
  }, [detail])

  const cancelEdit = useCallback(() => {
    setIsEditing(false)
    setEdit(null)
    originalRef.current = null
  }, [])

  const isDirty = useMemo(() => {
    if (!isEditing || !edit || !originalRef.current) return false
    return JSON.stringify(edit) !== JSON.stringify(originalRef.current)
  }, [isEditing, edit])

  const setField = useCallback(<K extends keyof EditState>(key: K, value: EditState[K]) => {
    setEdit((prev) => (prev ? { ...prev, [key]: value } : prev))
  }, [])

  // ── Mutations ──────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: () => {
      if (!edit) throw new Error('no edit state')
      return apiFetch(`/retours-client-trm/${selectedId}`, {
        method: 'PUT',
        body: JSON.stringify({
          IDclient: edit.IDclient,
          IDdefaut_textile: edit.IDdefaut_textile,
          date: inputDateToHfsql(edit.date),
          message_client: edit.message_client,
          message_resp_atelier: edit.message_resp_atelier,
          reponse: edit.reponse,
          journal: edit.journal,
          type_reference: edit.type_reference,
          reference: edit.reference,
          IDresolution_qualite: edit.IDresolution_qualite,
          IDbonnetier: edit.IDbonnetier,
          IDmachine: edit.IDmachine,
        }),
      })
    },
    onSuccess: () => {
      invalidateAll()
      cancelEdit()
    },
  })

  const archiveMut = useMutation({
    mutationFn: (archive: 0 | 1) =>
      apiFetch(`/retours-client-trm/${selectedId}/archive`, {
        method: 'PUT',
        body: JSON.stringify({ archive }),
      }),
    onSuccess: () => invalidateAll(),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/retours-client-trm/${id}`, { method: 'DELETE' }),
    onSuccess: (_data, deletedId) => {
      // Read the cache BEFORE invalidating so the next selection is known (§25.2).
      const cached = queryClient.getQueryData<ListRow[]>(['retours-client-trm', statusFilter]) ?? []
      const remaining = cached.filter((r) => r.IDretour_client !== deletedId)
      queryClient.invalidateQueries({ queryKey: ['retours-client-trm'] })
      setDeleteOpen(false)
      setSelectedId(remaining.length > 0 ? remaining[0].IDretour_client : null)
    },
  })

  // ── Guard (§28) ────────────────────────────────────────
  const guard = useUnsavedGuard({
    isDirty,
    save: async () => {
      await saveMut.mutateAsync()
    },
    onDiscard: cancelEdit,
  })

  const handleSelect = useCallback(
    (id: number) => {
      guard.guardAction(() => {
        cancelEdit()
        setSelectedId(id)
      })
    },
    [guard, cancelEdit],
  )

  const handleBack = useCallback(() => {
    guard.guardAction(() => {
      cancelEdit()
      setSelectedId(null)
    })
  }, [guard, cancelEdit])

  const handleStatusFilter = useCallback(
    (f: StatusFilter) => {
      guard.guardAction(() => {
        cancelEdit()
        setStatusFilter(f)
        setSelectedId(null)
      })
    },
    [guard, cancelEdit],
  )

  // ── Filtering + auto-select ────────────────────────────
  const urgencyCounts = useMemo(() => {
    let late = 0
    let soon = 0
    for (const r of rows ?? []) {
      const u = echeanceUrgency(r.echeance, r.archive)
      if (u === 'late') late++
      else if (u === 'soon') soon++
    }
    return { late, soon }
  }, [rows])

  // The pill hides at count 0 — drop an armed filter whose bucket emptied so
  // the list can't get stuck showing nothing (§41.4).
  const activeUrgency = urgencyFilter && urgencyCounts[urgencyFilter] > 0 ? urgencyFilter : null

  const filtered = useMemo(() => {
    let list = rows ?? []
    if (activeUrgency) {
      list = list.filter((r) => echeanceUrgency(r.echeance, r.archive) === activeUrgency)
    }
    const q = searchQuery.trim().toLowerCase()
    if (!q) return list
    return list.filter((r) =>
      [String(r.IDretour_client), r.client_nom, r.defaut_label, r.reference]
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [rows, searchQuery, activeUrgency])

  useAutoSelectFirst({
    rows: filtered,
    selectedId,
    getId: (r: ListRow) => r.IDretour_client,
    select: setSelectedId,
  })

  const printDoc = useCallback(
    (kind: DocKind) => {
      if (selectedId === null) return
      const url =
        kind === 'fiche'
          ? `${API_URL}/retours-client-trm/${selectedId}/pdf`
          : `${API_URL}/dossiers-qualite/${detail?.fnc?.IDdossier_qualite}/fnc/pdf`
      window.open(url, '_blank')
    },
    [selectedId, detail],
  )

  return (
    <>
      <MasterDetailLayout
        hasSelection={selectedId !== null}
        onBack={handleBack}
        sidebarTitle="Suivi"
        list={
          <RetourList
            rows={filtered}
            totalCount={rows?.length ?? 0}
            isLoading={isLoading}
            isError={isError}
            selectedId={selectedId}
            onSelect={handleSelect}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={handleStatusFilter}
            urgencyCounts={urgencyCounts}
            activeUrgency={activeUrgency}
            onUrgencyToggle={(u) => setUrgencyFilter((prev) => (prev === u ? null : u))}
            isEditing={isEditing}
            canManage={canManage}
            onCreate={() => setCreateOpen(true)}
          />
        }
        detailHeader={
          detail ? (
            <RetourHeader
              detail={detail}
              isEditing={isEditing}
              saving={saveMut.isPending}
              canManage={canManage}
              onStartEdit={startEdit}
              onCancelEdit={cancelEdit}
              onSave={() => saveMut.mutate()}
              onPrintDoc={printDoc}
              onEmail={() => setEmailOpen(true)}
              onDelete={() => setDeleteOpen(true)}
            />
          ) : detailLoading ? (
            <div className="flex items-center justify-center h-24">
              <Loader2 className="h-6 w-6 animate-spin text-accent" />
            </div>
          ) : null
        }
        detail={
          detail ? (
            <DetailMain detail={detail} lookups={lookups} isEditing={isEditing} edit={edit} onField={setField} />
          ) : selectedId === null && !isLoading ? (
            <EmptyDetailState />
          ) : null
        }
        sidebar={
          detail ? (
            <RetourSidebar
              detail={detail}
              lookups={lookups}
              isEditing={isEditing}
              edit={edit}
              onField={setField}
              activeTab={sidebarTab}
              onTabChange={setSidebarTab}
              canManage={canManage}
              onToggleArchive={() => archiveMut.mutate(detail.archive === 1 ? 0 : 1)}
              isToggling={archiveMut.isPending}
            />
          ) : null
        }
      />

      <UnsavedChangesDialog open={guard.showDialog} onAction={guard.handleAction} isSaving={guard.isSaving} />

      <CreateRetourDialog
        open={createOpen}
        lookups={lookups}
        onClose={() => setCreateOpen(false)}
        onCreated={(newId) => {
          setCreateOpen(false)
          queryClient.invalidateQueries({ queryKey: ['retours-client-trm'] })
          // A native retour is born « en cours » — follow it there so the new
          // row is visible however the list was filtered.
          setStatusFilter('en_cours')
          setSelectedId(newId)
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="Supprimer le retour client"
        description={
          detail
            ? `Le retour client N° ${detail.IDretour_client} (${detail.client_nom || 'sans client'}) sera supprimé définitivement.${
                detail.fnc ? ` La fiche de non-conformité N° ${detail.fnc.IDdossier_qualite} d'Ets Malterre, elle, est conservée.` : ''
              }`
            : undefined
        }
        isPending={deleteMut.isPending}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => {
          if (selectedId !== null) {
            setIsEditing(false)
            deleteMut.mutate(selectedId)
          }
        }}
      />

      {selectedId !== null && (
        <SendEmailDialog
          open={emailOpen}
          onClose={() => setEmailOpen(false)}
          contextLabel={detail?.client_nom ?? undefined}
          queryKey={['retour-client-trm-email-defaults', selectedId]}
          loadDefaults={() => apiFetch(`/retours-client-trm/${selectedId}/email-defaults`)}
          pdfUrl={`${API_URL}/retours-client-trm/${selectedId}/pdf`}
          pdfAttachmentLabel={`retour-client-${selectedId}.pdf`}
          onSend={(p) =>
            postEmail(`${API_URL}/retours-client-trm/${selectedId}/email`, p, { includeAttachPdf: true })
          }
        />
      )}
    </>
  )
}

// ── Left panel ───────────────────────────────────────────

function RetourList({
  rows,
  totalCount,
  isLoading,
  isError,
  selectedId,
  onSelect,
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  urgencyCounts,
  activeUrgency,
  onUrgencyToggle,
  isEditing,
  canManage,
  onCreate,
}: {
  rows: ListRow[]
  totalCount: number
  isLoading: boolean
  isError: boolean
  selectedId: number | null
  onSelect: (id: number) => void
  searchQuery: string
  onSearchChange: (q: string) => void
  statusFilter: StatusFilter
  onStatusFilterChange: (f: StatusFilter) => void
  urgencyCounts: { late: number; soon: number }
  activeUrgency: 'late' | 'soon' | null
  onUrgencyToggle: (u: 'late' | 'soon') => void
  isEditing: boolean
  canManage: boolean
  onCreate: () => void
}) {
  return (
    <div className="flex flex-col h-full rounded-lg border shadow-sm bg-zinc-100/80">
      <div className="p-3 border-b rounded-t-lg bg-zinc-200/50 space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Rechercher un retour…"
              autoComplete="off"
              className="w-full h-9 pl-9 pr-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          {urgencyCounts.late > 0 && (
            <UrgencyPill
              count={urgencyCounts.late}
              tone="late"
              active={activeUrgency === 'late'}
              onToggle={() => onUrgencyToggle('late')}
            />
          )}
          {urgencyCounts.soon > 0 && (
            <UrgencyPill
              count={urgencyCounts.soon}
              tone="soon"
              active={activeUrgency === 'soon'}
              onToggle={() => onUrgencyToggle('soon')}
            />
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => onStatusFilterChange(opt.key)}
              className={cn(
                'px-2 py-1 text-xs rounded-md transition-colors flex-grow basis-[calc(33.333%-0.25rem)]',
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

      <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-transparent">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-32 text-destructive">
            <AlertCircle className="h-6 w-6 mb-2" />
            <p className="text-sm">Erreur de chargement</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <Undo2 className="h-12 w-12 opacity-50 mb-2" />
            <p className="text-sm">Aucun retour client</p>
          </div>
        ) : (
          rows.map((r) => {
            const isSelected = selectedId === r.IDretour_client
            const urgency = echeanceUrgency(r.echeance, r.archive)
            const selectedRingClass =
              urgency === 'late'
                ? 'border-red-500 ring-1 ring-red-500'
                : urgency === 'soon'
                  ? 'border-amber-500 ring-1 ring-amber-500'
                  : 'border-accent ring-1 ring-accent'
            return (
              <div
                key={r.IDretour_client}
                onClick={() => onSelect(r.IDretour_client)}
                className={cn(
                  'p-3 border rounded-lg cursor-pointer transition-all bg-white',
                  isSelected ? selectedRingClass : 'border-border hover:border-accent/50',
                  urgency === 'late' && 'shadow-[inset_4px_0_0_0_rgb(239_68_68)]',
                  urgency === 'soon' && 'shadow-[inset_4px_0_0_0_rgb(245_158_11)]',
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-semibold tabular-nums text-muted-foreground flex-shrink-0">
                    N° {r.IDretour_client}
                  </span>
                  <span className="font-medium text-sm truncate">{r.client_nom || '—'}</span>
                  {r.archive === 1 && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600 ml-auto flex-shrink-0" />
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-xs text-muted-foreground truncate">{r.defaut_label || '—'}</p>
                  <span className="text-[11px] text-muted-foreground ml-auto flex-shrink-0 tabular-nums">
                    {r.date ? formatHfsqlDate(r.date) : ''}
                  </span>
                </div>
                {!!r.reference && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-muted-foreground">
                    <Package className="h-3 w-3 opacity-60" />
                    <span className="truncate">{r.reference}</span>
                    {/* Only meaningful while the retour is still open — every
                        closed one has an answer, so the badge would be noise. */}
                    {r.has_reponse === 1 && r.archive === 0 && (
                      <Badge variant="secondary" className="text-[10px] py-0 ml-auto">
                        Répondu
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      <div className="p-3 border-t text-xs text-muted-foreground flex items-center justify-between rounded-b-lg bg-zinc-200/50">
        <span>
          {totalCount} dossier{totalCount > 1 ? 's' : ''}
        </span>
        {!isEditing && canManage && (
          <Button
            size="sm"
            variant="ghost"
            className="text-accent hover:text-accent hover:bg-accent/10"
            onClick={onCreate}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Nouveau
          </Button>
        )}
      </div>
    </div>
  )
}

function UrgencyPill({
  count,
  tone,
  active,
  onToggle,
}: {
  count: number
  tone: 'late' | 'soon'
  active: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      title={tone === 'late' ? 'Échéance dépassée' : 'Échéance dans 3 jours'}
      className={cn(
        'h-7 min-w-[1.75rem] px-1.5 inline-flex items-center justify-center rounded-md text-xs font-semibold tabular-nums border transition-colors flex-shrink-0',
        tone === 'late'
          ? active
            ? 'bg-red-500 text-white border-red-500 shadow-sm'
            : 'bg-red-500/10 text-red-800 border-red-500/30 hover:bg-red-500/20'
          : active
            ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
            : 'bg-amber-500/10 text-amber-800 border-amber-500/30 hover:bg-amber-500/20',
      )}
    >
      {count}
    </button>
  )
}

// ── Detail header (§6) ───────────────────────────────────

function RetourHeader({
  detail,
  isEditing,
  saving,
  canManage,
  onStartEdit,
  onCancelEdit,
  onSave,
  onPrintDoc,
  onEmail,
  onDelete,
}: {
  detail: RetourDetail
  isEditing: boolean
  saving: boolean
  canManage: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSave: () => void
  onPrintDoc: (kind: DocKind) => void
  onEmail: () => void
  onDelete: () => void
}) {
  // Two documents when the retour came from a FNC — the atelier sheet and the
  // FNC Ets Malterre issued — so Print opens the §42 menu rather than acting.
  const printItems: { key: DocKind; label: string; icon: ComponentType<{ className?: string }> }[] = [
    { key: 'fiche', label: 'Fiche retour client', icon: FileText },
    ...(detail.fnc
      ? [{ key: 'fnc' as DocKind, label: `FNC Ets Malterre N° ${detail.fnc.IDdossier_qualite}`, icon: Send }]
      : []),
  ]

  return (
    <div className="flex-shrink-0 pt-0.5">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'h-11 w-11 rounded-lg flex items-center justify-center flex-shrink-0',
            isEditing ? 'bg-accent/15' : 'icon-box-gold',
          )}
        >
          <Undo2 className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-heading font-bold tracking-tight truncate">
              N° {detail.IDretour_client}
              {detail.client_nom ? ` · ${detail.client_nom}` : ''}
            </h1>
            {isEditing && (
              <Badge className="bg-accent text-accent-foreground flex-shrink-0 gap-1 shadow-sm">
                <Pencil className="h-3 w-3" />
                Mode édition
              </Badge>
            )}
          </div>
          <div className="flex gap-1.5 mt-1 flex-wrap">
            {!!detail.defaut_nom && (
              <Badge variant="secondary" className="text-xs">
                {detail.defaut_nom}
                {detail.defaut_categorie ? ` · ${detail.defaut_categorie}` : ''}
              </Badge>
            )}
            {!!detail.date && (
              <Badge variant="outline" className="text-xs gap-1">
                <Calendar className="h-2.5 w-2.5" />
                {formatHfsqlDate(detail.date)}
              </Badge>
            )}
            {!!detail.reference && (
              <Badge variant="outline" className="text-xs gap-1">
                <Package className="h-2.5 w-2.5" />
                {detail.reference}
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {isEditing ? (
            <>
              <Button variant="outline" size="sm" onClick={onCancelEdit} disabled={saving}>
                <X className="h-3.5 w-3.5 mr-1.5" />
                Annuler
              </Button>
              <Button size="sm" onClick={onSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                )}
                Enregistrer
              </Button>
            </>
          ) : (
            <>
              {canManage && (
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 text-destructive hover:text-destructive"
                  title="Supprimer"
                  onClick={onDelete}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              {printItems.length > 1 ? (
                <DocMenuButton icon={Printer} title="Imprimer" items={printItems} onSelect={onPrintDoc} />
              ) : (
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  title="Imprimer la fiche"
                  onClick={() => onPrintDoc('fiche')}
                >
                  <Printer className="h-4 w-4" />
                </Button>
              )}
              <Button variant="outline" size="icon" className="h-9 w-9" title="Envoyer un email" onClick={onEmail}>
                <AtSign className="h-4 w-4" />
              </Button>
              {canManage && (
                <Button variant="gold" size="sm" onClick={onStartEdit}>
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Modifier
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <div
        className={cn(
          'h-1 w-24 mt-3 rounded-full',
          isEditing ? 'bg-accent' : 'bg-gradient-to-r from-accent via-accent to-accent/30',
        )}
      />
    </div>
  )
}

/** §42 — icon button opening a small popover menu, one row per document. */
function DocMenuButton({
  icon: TriggerIcon,
  title,
  items,
  onSelect,
}: {
  icon: ComponentType<{ className?: string }>
  title: string
  items: { key: DocKind; label: string; icon: ComponentType<{ className?: string }> }[]
  onSelect: (key: DocKind) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  return (
    <div ref={rootRef} className="relative">
      <Button variant="outline" size="icon" className="h-9 w-9" title={title} onClick={() => setMenuOpen((v) => !v)}>
        <TriggerIcon className="h-4 w-4" />
      </Button>
      {menuOpen && (
        <div className="absolute top-full right-0 mt-1 w-64 rounded-lg border bg-white shadow-lg overflow-hidden z-50">
          {items.map((item) => {
            const ItemIcon = item.icon
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  onSelect(item.key)
                  setMenuOpen(false)
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors hover:bg-zinc-100"
              >
                <ItemIcon className="h-4 w-4 text-muted-foreground" />
                {item.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function EmptyDetailState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
      <div className="icon-box-gold h-16 w-16 rounded-xl flex items-center justify-center mb-3">
        <Undo2 className="h-7 w-7" />
      </div>
      <p className="text-sm">Sélectionnez un retour pour voir son détail</p>
    </div>
  )
}

// ── Center panel (§39) ───────────────────────────────────

function DetailMain({
  detail,
  lookups,
  isEditing,
  edit,
  onField,
}: {
  detail: RetourDetail
  lookups: Lookups | undefined
  isEditing: boolean
  edit: EditState | null
  onField: <K extends keyof EditState>(key: K, value: EditState[K]) => void
}) {
  const [activeTab, setActiveTab] = useState<MainTab>('retour')
  // Land on the complaint itself whenever the selection changes.
  useEffect(() => {
    setActiveTab('retour')
  }, [detail.IDretour_client])
  // Traçabilité is read-only; editing the affectation there would be invisible.
  useEffect(() => {
    if (isEditing) setActiveTab('retour')
  }, [isEditing])

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-shrink-0 flex items-center gap-1 border-b border-border/60 pb-2">
        {MAIN_TABS.map((t) => {
          const Icon = t.icon
          const active = activeTab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap',
                active
                  ? 'bg-accent text-accent-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-accent/10 hover:text-accent',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          )
        })}
      </div>
      <div className="flex-1 min-h-0 overflow-auto space-y-3 pt-3 px-1 pb-1 scrollbar-transparent">
        {activeTab === 'retour' && (
          <RetourTab detail={detail} lookups={lookups} isEditing={isEditing} edit={edit} onField={onField} />
        )}
        {activeTab === 'tracabilite' && <TracabiliteTab detail={detail} />}
      </div>
    </div>
  )
}

function SectionCard({
  icon: Icon,
  title,
  isEditing,
  action,
  children,
}: {
  icon: ComponentType<{ className?: string }>
  title: string
  isEditing?: boolean
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className={cn('p-4 rounded-lg border bg-card shadow-sm', isEditing && editSectionClass)}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wide">
          <Icon className="h-3.5 w-3.5" />
          {title}
        </p>
        {action}
      </div>
      {children}
    </div>
  )
}

interface IdOption {
  id: number
  primary: string
  secondary?: string
}

/** `SearchableCombobox` is generic over any row shape; every combo on this
 *  screen already speaks `{ id, primary, secondary }`, so bind the accessors
 *  once instead of six times. */
function IdCombobox({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: IdOption[]
  value: number
  onChange: (id: number) => void
  placeholder: string
}) {
  return (
    <SearchableCombobox<IdOption>
      options={options}
      value={value}
      onChange={onChange}
      getId={(o) => o.id}
      getPrimary={(o) => o.primary}
      getSecondary={(o) => o.secondary}
      placeholder={placeholder}
    />
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}

function ReadText({ value, empty }: { value: string; empty: string }) {
  return value.trim() ? (
    <p className="text-sm whitespace-pre-line">{value.trim()}</p>
  ) : (
    <p className="text-sm text-muted-foreground italic">{empty}</p>
  )
}

// ── Tab 1 — Retour ───────────────────────────────────────

function RetourTab({
  detail,
  lookups,
  isEditing,
  edit,
  onField,
}: {
  detail: RetourDetail
  lookups: Lookups | undefined
  isEditing: boolean
  edit: EditState | null
  onField: <K extends keyof EditState>(key: K, value: EditState[K]) => void
}) {
  const clientOptions = useMemo(
    () => (lookups?.clients ?? []).map((c) => ({ id: c.IDclient, primary: c.nom })),
    [lookups],
  )
  const defautOptions = useMemo(
    () => (lookups?.defauts ?? []).map((d) => ({ id: d.IDdefaut_textile, primary: d.nom, secondary: d.categorie })),
    [lookups],
  )
  const resolutionOptions = useMemo(
    () => (lookups?.resolutions ?? []).map((r) => ({ id: r.IDresolution_qualite, primary: r.libelle })),
    [lookups],
  )

  return (
    <>
      {/* Origine — where this came from. Present on every live row: a retour
          client IS an ETM fiche de non-conformité, seen from the workshop. */}
      {!!detail.fnc && (
        <div className="p-4 rounded-lg border border-accent/30 bg-accent/[0.04] shadow-sm">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wide">
              <Send className="h-3.5 w-3.5" />
              Origine — fiche de non-conformité
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-7"
              onClick={() =>
                window.open(`${API_URL}/dossiers-qualite/${detail.fnc?.IDdossier_qualite}/fnc/pdf`, '_blank')
              }
            >
              <FileText className="h-3.5 w-3.5 mr-1.5" />
              Ouvrir la FNC
            </Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Dossier Ets Malterre">
              <p className="text-sm font-semibold tabular-nums">N° {detail.fnc.IDdossier_qualite}</p>
            </Field>
            <Field label="Envoyée le">
              <p className="text-sm tabular-nums">
                {detail.fnc.envoi_fnc ? formatHfsqlDate(detail.fnc.envoi_fnc) : '—'}
              </p>
            </Field>
            {/* Read-only on purpose: the échéance lives on ETM's dossier. */}
            <Field label="Échéance">
              <p className="text-sm tabular-nums">
                {detail.fnc.echeance ? formatHfsqlDate(detail.fnc.echeance) : '—'}
              </p>
            </Field>
            {/* The complainant ETM acted for — this screen's own client is
                always Ets Malterre, so it is the only place the real one shows. */}
            <Field label="Client final">
              <p className="text-sm truncate">{detail.fnc.client_etm || '—'}</p>
            </Field>
          </div>
        </div>
      )}

      <SectionCard icon={FileWarning} title="Réclamation" isEditing={isEditing}>
        {isEditing && edit ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Client">
                <IdCombobox
                  options={clientOptions}
                  value={edit.IDclient}
                  onChange={(id) => onField('IDclient', id)}
                  placeholder="Choisir un client…"
                />
              </Field>
              <Field label="Défaut">
                <IdCombobox
                  options={defautOptions}
                  value={edit.IDdefaut_textile}
                  onChange={(id) => onField('IDdefaut_textile', id)}
                  placeholder="Choisir un défaut…"
                />
              </Field>
              <Field label="Date">
                <input
                  type="date"
                  value={edit.date}
                  onChange={(e) => onField('date', e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
            <Field label="Observations du client">
              <textarea
                rows={5}
                value={edit.message_client}
                onChange={(e) => onField('message_client', e.target.value)}
                className={textareaClass}
              />
            </Field>
            <Field label="Observations du responsable d'atelier">
              <textarea
                rows={5}
                value={edit.message_resp_atelier}
                onChange={(e) => onField('message_resp_atelier', e.target.value)}
                className={textareaClass}
              />
            </Field>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Observations du client">
              <ReadText value={detail.message_client} empty="Aucune observation transmise" />
            </Field>
            <Field label="Observations du responsable d'atelier">
              <ReadText value={detail.message_resp_atelier} empty="Aucune observation" />
            </Field>
          </div>
        )}
      </SectionCard>

      <SectionCard icon={Package} title="Affectation" isEditing={isEditing}>
        {isEditing && edit ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Type">
              <PopoverSelect
                options={AFFECTATION_OPTIONS}
                value={affectationIdOf(edit.type_reference)}
                onChange={(id) => onField('type_reference', affectationTypeOf(id))}
                hideEmpty
              />
            </Field>
            <Field label="Référence">
              <input
                type="text"
                value={edit.reference}
                onChange={(e) => onField('reference', e.target.value)}
                placeholder={edit.type_reference === '2' ? 'ex. Ma100602' : 'ex. 3368/5'}
                className={inputClass}
              />
            </Field>
          </div>
        ) : (
          <div className="flex items-center gap-4 flex-wrap">
            <Badge variant="outline" className="text-xs">
              {affectationLabelOf(detail.type_reference)}
            </Badge>
            <span className="text-sm font-medium">{detail.reference || '—'}</span>
            {!!detail.reference && <AffectationCheck retourId={detail.IDretour_client} />}
          </div>
        )}
      </SectionCard>

      <SectionCard icon={CheckCircle2} title="Traitement" isEditing={isEditing}>
        {isEditing && edit ? (
          <div className="space-y-3">
            <Field label="Résolution">
              <PopoverSelect
                options={resolutionOptions}
                value={edit.IDresolution_qualite}
                onChange={(id) => onField('IDresolution_qualite', id)}
                emptyLabel="— aucune —"
              />
            </Field>
            <Field label="Réponse">
              <textarea
                rows={6}
                value={edit.reponse}
                onChange={(e) => onField('reponse', e.target.value)}
                className={textareaClass}
              />
            </Field>
            {!!detail.fnc && (
              <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                <Send className="h-3 w-3 mt-0.5 flex-shrink-0" />
                La résolution et la réponse sont republiées sur la fiche de non-conformité N°{' '}
                {detail.fnc.IDdossier_qualite} d&apos;Ets Malterre.
              </p>
            )}
          </div>
        ) : (
          <>
            {detail.resolution_libelle || detail.reponse.trim() ? (
              <>
                {!!detail.resolution_libelle && (
                  <p className="text-sm font-semibold text-accent mb-1.5">{detail.resolution_libelle}</p>
                )}
                <ReadText value={detail.reponse} empty="Aucun commentaire" />
              </>
            ) : (
              <p className="text-sm text-muted-foreground italic">En attente de traitement</p>
            )}
          </>
        )}
      </SectionCard>
    </>
  )
}

/** The legacy's IMG_Trouvé — a green tick when the reference resolves to real
 *  rolls, a plain note when it does not. 6 historical references match nothing
 *  at all, and `stock_ecru.numero` is not unique, so this counts. */
function AffectationCheck({ retourId }: { retourId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['retour-client-trm-traca', retourId],
    queryFn: () => apiFetch<Tracabilite>(`/retours-client-trm/${retourId}/tracabilite`),
  })
  if (isLoading) return <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
  if (!data) return null
  if (!data.resolved) {
    return <span className="text-xs text-muted-foreground italic">aucune pièce en stock</span>
  }
  return (
    <span className="text-xs text-green-700 flex items-center gap-1">
      <CheckCircle2 className="h-3.5 w-3.5" />
      {data.pieces.length} pièce{data.pieces.length > 1 ? 's' : ''}
      {data.titre ? ` · ${data.titre}` : ''}
    </span>
  )
}

// ── Tab 2 — Traçabilité ──────────────────────────────────

function TracabiliteTab({ detail }: { detail: RetourDetail }) {
  const { data, isLoading } = useQuery({
    queryKey: ['retour-client-trm-traca', detail.IDretour_client],
    queryFn: () => apiFetch<Tracabilite>(`/retours-client-trm/${detail.IDretour_client}/tracabilite`),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    )
  }
  if (!data || !data.resolved) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Link2 className="h-10 w-10 opacity-40 mb-3" />
        <p className="text-sm">
          {detail.reference
            ? `La référence « ${detail.reference} » ne correspond à aucune pièce en stock.`
            : 'Aucune affectation — renseignez un numéro de pièce ou de lot.'}
        </p>
      </div>
    )
  }

  // One roll opens expanded; a finished lot brings 15–19 and would bury the page.
  const single = data.pieces.length === 1

  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap px-1">
        <div className="min-w-0">
          <p className="text-lg font-heading font-bold truncate">{data.titre}</p>
          {!!data.sous_titre && <p className="text-xs text-muted-foreground truncate">{data.sous_titre}</p>}
        </div>
        <Badge variant="outline" className="text-xs">
          {data.kind === 'lot_fini' ? 'Lot fini' : 'Pièce'} · {data.pieces.length} rouleau
          {data.pieces.length > 1 ? 'x' : ''}
        </Badge>
      </div>

      {data.pieces.map((p) => (
        <PieceCard key={p.IDstock_ecru} piece={p} defaultOpen={single} />
      ))}

      {data.documents.length > 0 && (
        <SectionCard icon={FileText} title="Documents">
          <div className="space-y-1.5">
            {data.documents.map((d) => (
              <button
                key={`${d.kind}-${d.id}`}
                type="button"
                onClick={() =>
                  window.open(
                    d.kind === 'commande_sst'
                      ? `${API_URL}/commandes-sous-traitant/${d.id}/pdf`
                      : `${API_URL}/expeditions-trm/${d.id}/pdf`,
                    '_blank',
                  )
                }
                className="w-full flex items-center gap-2.5 p-2 rounded-lg border bg-zinc-100/80 hover:border-accent/50 transition-colors text-left"
              >
                <div className="icon-box-gold h-8 w-8 rounded-md flex items-center justify-center flex-shrink-0">
                  {d.kind === 'commande_sst' ? <FileText className="h-4 w-4" /> : <Truck className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{d.label}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {[d.sous_titre, d.date ? formatHfsqlDate(d.date) : ''].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <Printer className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              </button>
            ))}
          </div>
        </SectionCard>
      )}
    </>
  )
}

function PieceCard({ piece, defaultOpen }: { piece: TracaPiece; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  useEffect(() => {
    setOpen(defaultOpen)
  }, [defaultOpen, piece.IDstock_ecru])

  return (
    <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 p-3 hover:bg-zinc-50 transition-colors text-left"
      >
        <div className="icon-box-gold h-9 w-9 rounded-md flex items-center justify-center flex-shrink-0">
          <Package className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-sm truncate">{piece.numero}</p>
            {piece.second_choix === 1 && (
              <Badge
                variant="outline"
                className="text-[10px] py-0 bg-amber-500/15 text-amber-800 border-amber-500/30"
              >
                2nd choix
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {[
              piece.metier ? `Métier ${piece.metier}` : '',
              piece.poids > 0 ? `${fmtNum(piece.poids)} kg` : '',
              piece.date_saisie ? fmtEventDateTime(piece.date_saisie) : '',
              piece.IDordre_fabrication > 0 ? `OF ${piece.IDordre_fabrication}` : '',
            ]
              .filter(Boolean)
              .join('  ·  ')}
          </p>
        </div>
        {piece.defauts.length > 0 && (
          <Badge
            variant="outline"
            className="text-[10px] py-0 bg-red-500/10 text-red-800 border-red-500/30 flex-shrink-0"
          >
            {piece.defauts.length} défaut{piece.defauts.length > 1 ? 's' : ''}
          </Badge>
        )}
        <ChevronDown
          className={cn('h-4 w-4 text-muted-foreground flex-shrink-0 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="border-t p-3 grid grid-cols-1 lg:grid-cols-2 gap-4 bg-zinc-100/50">
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5 uppercase tracking-wide">
              <History className="h-3.5 w-3.5" />
              Historique
            </p>
            <EventTimeline
              events={piece.events.map((e) => ({
                id: e.IDevenement_piece,
                date: e.date,
                evenement: e.evenement,
                observation: e.observation,
                IDbonnetier: e.IDbonnetier,
                bonnetier: e.bonnetier,
              }))}
              loading={false}
            />
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5 uppercase tracking-wide">
              <FileWarning className="h-3.5 w-3.5" />
              Défauts relevés
            </p>
            {piece.defauts.length === 0 ? (
              <p className="text-sm text-muted-foreground italic text-center py-3">Aucun défaut relevé</p>
            ) : (
              <div className="space-y-1.5">
                {piece.defauts.map((d) => (
                  <div
                    key={d.IDdefaut_qualite}
                    className="p-2 rounded-lg border bg-card shadow-sm flex items-center gap-2.5 shadow-[inset_4px_0_0_0_rgb(239_68_68)]"
                  >
                    <BonnetierAvatar id={d.IDSpotteur} name={d.spotteur} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium truncate">{d.spotteur || 'Inconnu'}</p>
                        <p className="text-[10px] text-muted-foreground tabular-nums flex-shrink-0">
                          {fmtEventDateTime(d.date)}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        <span className="text-accent font-medium">{d.role}</span>
                        {' · '}
                        {defautLabel(d)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Right sidebar (§8) ───────────────────────────────────

function RetourSidebar({
  detail,
  lookups,
  isEditing,
  edit,
  onField,
  activeTab,
  onTabChange,
  canManage,
  onToggleArchive,
  isToggling,
}: {
  detail: RetourDetail
  lookups: Lookups | undefined
  isEditing: boolean
  edit: EditState | null
  onField: <K extends keyof EditState>(key: K, value: EditState[K]) => void
  activeTab: SidebarTab
  onTabChange: (t: SidebarTab) => void
  canManage: boolean
  onToggleArchive: () => void
  isToggling: boolean
}) {
  return (
    <div className="w-96 flex-shrink-0 flex flex-col gap-3 min-h-0">
      <div className="flex-1 min-h-0 rounded-xl border flex flex-col overflow-hidden bg-zinc-100/80">
        <div className="flex border-b p-1 gap-1 rounded-t-xl bg-zinc-200/50">
          {SIDEBAR_TABS.map((t) => {
            const Icon = t.icon
            const active = activeTab === t.key
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => onTabChange(t.key)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md transition-colors',
                  active ? 'bg-accent text-accent-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent/10',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            )
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-transparent">
          {activeTab === 'journal' && (
            <JournalTab detail={detail} isEditing={isEditing} edit={edit} onField={onField} />
          )}
          {activeTab === 'documents' && <DocumentsTab detail={detail} />}
          {activeTab === 'info' && (
            <InfoTab detail={detail} lookups={lookups} isEditing={isEditing} edit={edit} onField={onField} />
          )}
        </div>
      </div>

      <StatusFooter
        archive={detail.archive}
        onToggle={onToggleArchive}
        isToggling={isToggling}
        disabled={isEditing || !canManage}
      />
    </div>
  )
}

function JournalTab({
  detail,
  isEditing,
  edit,
  onField,
}: {
  detail: RetourDetail
  isEditing: boolean
  edit: EditState | null
  onField: <K extends keyof EditState>(key: K, value: EditState[K]) => void
}) {
  return (
    <div className={cn('p-3 rounded-lg border bg-card shadow-sm', isEditing && editSectionClass)}>
      <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
        <MessageSquare className="h-3.5 w-3.5" />
        Suivi du dossier
      </p>
      {isEditing && edit ? (
        <textarea
          rows={16}
          value={edit.journal}
          onChange={(e) => onField('journal', e.target.value)}
          className={textareaClass}
          placeholder="Notes internes…"
        />
      ) : (
        <ReadText value={detail.journal} empty="Aucune note" />
      )}
    </div>
  )
}

/** The photos and reports Ets Malterre attached to its dossier — the evidence
 *  for the complaint. Nothing keys a document on a retour, so a retour created
 *  here rather than by a FNC has none by construction. */
function DocumentsTab({ detail }: { detail: RetourDetail }) {
  const { data, isLoading } = useQuery({
    queryKey: ['retour-client-trm-docs', detail.IDretour_client],
    queryFn: () =>
      apiFetch<{ documents: DocRow[]; degraded: boolean }>(
        `/retours-client-trm/${detail.IDretour_client}/documents`,
      ),
  })
  const [viewing, setViewing] = useState<DocRow | null>(null)

  if (!detail.fnc) {
    return (
      <p className="text-sm text-muted-foreground italic text-center py-6">
        Ce retour n&apos;a pas de fiche de non-conformité, donc aucune pièce jointe.
      </p>
    )
  }
  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-accent" />
      </div>
    )
  }
  if (data?.degraded) {
    return (
      <p className="text-sm text-muted-foreground italic text-center py-6">
        Les pièces jointes du dossier Ets Malterre ne sont pas consultables depuis ce serveur.
      </p>
    )
  }
  if (!data || data.documents.length === 0) {
    return <p className="text-sm text-muted-foreground italic text-center py-6">Aucune pièce jointe</p>
  }

  return (
    <>
      <div className="space-y-1.5">
        {data.documents.map((d) => (
          <button
            key={d.IDdoc_qualite}
            type="button"
            onClick={() => setViewing(d)}
            className="w-full flex items-center gap-2.5 p-2 rounded-lg border bg-card shadow-sm hover:border-accent/50 transition-colors text-left"
          >
            <div className="icon-box-gold h-8 w-8 rounded-md flex items-center justify-center flex-shrink-0">
              <FileText className="h-4 w-4" />
            </div>
            <p className="text-sm truncate flex-1">{d.nom || `Document ${d.IDdoc_qualite}`}</p>
          </button>
        ))}
      </div>

      {/* §18.B full-bleed viewer — the file is the content, chrome would crop it. */}
      <Dialog open={viewing !== null} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-5xl h-[85vh] p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-4 py-2.5 border-b">
            <DialogTitle className="text-sm">{viewing?.nom || 'Document'}</DialogTitle>
          </DialogHeader>
          {viewing && (
            <iframe
              title={viewing.nom || 'Document'}
              src={`${API_URL}/retours-client-trm/${detail.IDretour_client}/documents/${viewing.IDdoc_qualite}/fichier`}
              className="flex-1 w-full border-0 bg-zinc-100"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

/** The legacy's Info tab: which knitter and which métier the responsable
 *  attributes the defect to. Free of the affectation — the atelier fills these
 *  from its own judgement, and they are set on only a third of the dossiers. */
function InfoTab({
  detail,
  lookups,
  isEditing,
  edit,
  onField,
}: {
  detail: RetourDetail
  lookups: Lookups | undefined
  isEditing: boolean
  edit: EditState | null
  onField: <K extends keyof EditState>(key: K, value: EditState[K]) => void
}) {
  const bonnetierOptions = useMemo(
    () => (lookups?.bonnetiers ?? []).map((b) => ({ id: b.IDbonnetier, primary: b.nom })),
    [lookups],
  )
  const machineOptions = useMemo(
    () => (lookups?.machines ?? []).map((m) => ({ id: m.IDmachine, primary: m.nom })),
    [lookups],
  )

  return (
    <div className={cn('p-3 rounded-lg border bg-card shadow-sm space-y-3', isEditing && editSectionClass)}>
      <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
        <Info className="h-3.5 w-3.5" />
        Attribution
      </p>
      {isEditing && edit ? (
        <>
          <Field label="Bonnetier">
            <IdCombobox
              options={bonnetierOptions}
              value={edit.IDbonnetier}
              onChange={(id) => onField('IDbonnetier', id)}
              placeholder="— aucun —"
            />
          </Field>
          <Field label="Machine">
            <IdCombobox
              options={machineOptions}
              value={edit.IDmachine}
              onChange={(id) => onField('IDmachine', id)}
              placeholder="— aucune —"
            />
          </Field>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm">
            <User className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-muted-foreground text-xs">Bonnetier</span>
            <span className="ml-auto truncate">{detail.bonnetier_nom || '—'}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Factory className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-muted-foreground text-xs">Machine</span>
            <span className="ml-auto truncate">{detail.machine_nom || '—'}</span>
          </div>
        </>
      )}
    </div>
  )
}

/** §29.3 — binary status pill with a split toggle. `archivé` is the legacy's
 *  Terminé / Réactiver pair; ETM closes its own dossier separately. */
function StatusFooter({
  archive,
  onToggle,
  isToggling,
  disabled,
}: {
  archive: 0 | 1
  onToggle: () => void
  isToggling: boolean
  disabled: boolean
}) {
  const isDone = archive === 1
  const Icon = isDone ? CheckCircle2 : Clock
  const label = isDone ? 'Terminé' : 'En cours'
  const actionLabel = isDone ? 'Réactiver' : 'Terminer'
  const ActionIcon = isDone ? Clock : CheckCircle2

  return (
    <div
      className={cn(
        'flex-shrink-0 rounded-xl border shadow-sm overflow-hidden flex items-stretch h-11',
        isDone ? 'bg-success border-success' : 'bg-primary border-primary',
      )}
    >
      <div className="flex items-center gap-2 px-3 flex-1 text-white min-w-0">
        <Icon className="h-4 w-4 flex-shrink-0" />
        <span className="text-sm font-bold uppercase tracking-wide truncate">{label}</span>
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled || isToggling}
        title={isDone ? 'Réactiver ce dossier' : 'Marquer ce dossier terminé'}
        className="px-3.5 bg-white/15 hover:bg-white/25 active:bg-white/30 disabled:bg-white/5 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-semibold border-l border-white/25 flex items-center gap-1.5 transition-colors"
      >
        {isToggling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ActionIcon className="h-3.5 w-3.5" />}
        {actionLabel}
      </button>
    </div>
  )
}

// ── « Nouveau » dialog ───────────────────────────────────
//
// A complaint that reached the atelier directly instead of through an ETM FNC.
// Asks for the identity fields up front rather than dropping an empty row —
// a retour with no client and no défaut says nothing to the next reader.

function CreateRetourDialog({
  open,
  lookups,
  onClose,
  onCreated,
}: {
  open: boolean
  lookups: Lookups | undefined
  onClose: () => void
  onCreated: (id: number) => void
}) {
  const [IDclient, setIDclient] = useState(0)
  const [IDdefaut, setIDdefaut] = useState(0)
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setIDclient(0)
      setIDdefaut(0)
      setMessage('')
      setError(null)
    }
  }, [open])

  const createMut = useMutation({
    mutationFn: () =>
      apiFetch<{ IDretour_client: number }>('/retours-client-trm', {
        method: 'POST',
        body: JSON.stringify({ IDclient, IDdefaut_textile: IDdefaut, message_client: message }),
      }),
    onSuccess: (d) => onCreated(d.IDretour_client),
    onError: (e: Error) => setError(e.message || 'Création impossible'),
  })

  const clientOptions = useMemo(
    () => (lookups?.clients ?? []).map((c) => ({ id: c.IDclient, primary: c.nom })),
    [lookups],
  )
  const defautOptions = useMemo(
    () => (lookups?.defauts ?? []).map((d) => ({ id: d.IDdefaut_textile, primary: d.nom, secondary: d.categorie })),
    [lookups],
  )

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="h-5 w-5 text-accent" />
            Nouveau retour client
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Client">
            <IdCombobox
              options={clientOptions}
              value={IDclient}
              onChange={setIDclient}
              placeholder="Choisir un client…"
            />
          </Field>
          <Field label="Défaut">
            <IdCombobox
              options={defautOptions}
              value={IDdefaut}
              onChange={setIDdefaut}
              placeholder="Choisir un défaut…"
            />
          </Field>
          <Field label="Observations du client">
            <textarea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className={textareaClass}
              placeholder="Ce que le client signale…"
            />
          </Field>
          <p className="text-xs text-muted-foreground flex items-start gap-1.5">
            <Building2 className="h-3 w-3 mt-0.5 flex-shrink-0" />
            Un retour créé ici n&apos;est rattaché à aucune fiche de non-conformité : il n&apos;y a donc rien à
            répondre côté Ets Malterre.
          </p>
          {!!error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={createMut.isPending}>
            Annuler
          </Button>
          <Button
            onClick={() => {
              setError(null)
              if (IDclient <= 0) {
                setError('Vous devez sélectionner un client')
                return
              }
              createMut.mutate()
            }}
            disabled={createMut.isPending}
          >
            {createMut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Créer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
