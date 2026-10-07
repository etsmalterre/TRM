// Fournitures › Gestion — the suppliers of every material that is not yarn
// (aiguilles, platines for now), managed by type (LIVA #1263,
// Nicolas + Vincent, 2026-10-07). Layout: Fiche (MasterDetailLayout,
// mps_designer §4–§9), modelled on ETM's FilsGestion.
//
// TRM's own table (trm_fourniture_fournisseur), NOT ETM's `fournisseur`: the
// yarn suppliers stay in Fils › Fournisseurs, shared with ETM.
//
// Left  = suppliers, search + segmented filter by type (Tous / each type /
//         Archivés), « + Nouveau » (asks the name — names are unique).
// Center= Identification (contact, téléphone, email, commentaire) and Types
//         fournis (chips over the catalogue types).
// Right = Entrées — the last stock entries received from this supplier.
//
// API: /api/fournitures-trm/fournisseurs (MPS API, routes/fournitures-trm.ts).
// Writes under edit_fournitures. Archiving never deletes: past entries keep
// pointing at the supplier.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  Factory,
  FileText,
  Loader2,
  PackageOpen,
  Pencil,
  Plus,
  Save,
  Search,
  Tags,
  User,
  X,
} from 'lucide-react'
import { MasterDetailLayout } from '@/components/layout/MasterDetailLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { UnsavedChangesDialog } from '@/components/shared/UnsavedChangesDialog'
import { ConstructeurChip } from '@/components/fournitures/ConstructeurPicker'
import { useAutoSelectFirst } from '@/hooks/useAutoSelectFirst'
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard'
import { useHasPermission } from '@/contexts/PermissionsContext'
import { apiFetch } from '@/lib/api'
import { formatHfsqlDate } from '@/lib/dates'
import { fmtNum } from '@/lib/format'
import { CATALOGUE_KEY, apiErrorMessage, useCatalogue, type FournitureType } from '@/lib/fournitures'
import { cn } from '@/lib/utils'

// ── Types (API payloads) ───────────────────────────────

interface Fournisseur {
  id: number
  nom: string
  contact: string | null
  tel: string | null
  email: string | null
  commentaire: string | null
  archive: boolean
  types: number[]
  nbEntrees: number
  derniereEntree: string | null
}

interface Entree {
  id: number
  date: string | null
  quantite: number
  reference: string
  type: string
  constructeur: string | null
  commentaire: string | null
}

const LIST_KEY = ['fournitures-trm-fournisseurs'] as const

const editSectionClass = 'border-l-4 border-l-accent/70 bg-accent/[0.03]'

const inputClass =
  'w-full h-8 px-2.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring'

/** Left-list filter: everyone active, one type, or the archived ones. */
type Filtre = 'tous' | 'archives' | number

interface Draft {
  nom: string
  contact: string
  tel: string
  email: string
  commentaire: string
  types: number[]
}

const draftOf = (f: Fournisseur): Draft => ({
  nom: f.nom,
  contact: f.contact ?? '',
  tel: f.tel ?? '',
  email: f.email ?? '',
  commentaire: f.commentaire ?? '',
  types: [...f.types].sort((a, b) => a - b),
})

const sameDraft = (a: Draft, b: Draft) =>
  a.nom === b.nom &&
  a.contact === b.contact &&
  a.tel === b.tel &&
  a.email === b.email &&
  a.commentaire === b.commentaire &&
  a.types.length === b.types.length &&
  a.types.every((t, i) => t === b.types[i])

// ══════════════════════════════════════════════════════
//  Page
// ══════════════════════════════════════════════════════

export function FournituresGestion() {
  const queryClient = useQueryClient()
  const canEdit = useHasPermission('edit_fournitures')

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filtre, setFiltre] = useState<Filtre>('tous')
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [writeError, setWriteError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [autoEditForId, setAutoEditForId] = useState<number | null>(null)
  const originalDraftRef = useRef<Draft | null>(null)

  const { data, isLoading, isError, error } = useQuery<{ fournisseurs: Fournisseur[] }>({
    queryKey: LIST_KEY,
    queryFn: () => apiFetch('/fournitures-trm/fournisseurs'),
  })
  const catalogue = useCatalogue()
  const types = useMemo(() => catalogue.data?.types ?? [], [catalogue.data])
  const fournisseurs = useMemo(() => data?.fournisseurs ?? [], [data])

  // Counts per segment, over the active suppliers (archived have their own).
  const counts = useMemo(() => {
    const actifs = fournisseurs.filter((f) => !f.archive)
    const parType = new Map<number, number>()
    for (const f of actifs) for (const t of f.types) parType.set(t, (parType.get(t) ?? 0) + 1)
    return { tous: actifs.length, archives: fournisseurs.length - actifs.length, parType }
  }, [fournisseurs])

  // An armed « Archivés » must not survive its bucket emptying.
  const filtreActif: Filtre = filtre === 'archives' && counts.archives === 0 ? 'tous' : filtre

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return fournisseurs.filter((f) => {
      if (filtreActif === 'archives' ? !f.archive : f.archive) return false
      if (typeof filtreActif === 'number' && !f.types.includes(filtreActif)) return false
      if (!q) return true
      return f.nom.toLowerCase().includes(q) || (f.contact ?? '').toLowerCase().includes(q)
    })
  }, [fournisseurs, searchQuery, filtreActif])

  useAutoSelectFirst({
    rows: filtered,
    selectedId,
    getId: (f) => f.id,
    select: setSelectedId,
    suspended: isEditing || autoEditForId !== null,
  })

  const selected = useMemo(() => fournisseurs.find((f) => f.id === selectedId) ?? null, [fournisseurs, selectedId])

  const startEdit = useCallback(() => {
    if (!selected) return
    const snapshot = draftOf(selected)
    originalDraftRef.current = snapshot
    setDraft(snapshot)
    setWriteError(null)
    setIsEditing(true)
  }, [selected])

  // §25.1: a freshly created supplier opens in edit mode once it is in the list.
  useEffect(() => {
    if (autoEditForId !== null && selected?.id === autoEditForId) {
      startEdit()
      setAutoEditForId(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEditForId, selected])

  const isDirty = useMemo(() => {
    if (!isEditing || !draft || !originalDraftRef.current) return false
    return !sameDraft(draft, originalDraftRef.current)
  }, [isEditing, draft])

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: LIST_KEY })
    // The catalogue lists the active suppliers (stock entry dialog).
    queryClient.invalidateQueries({ queryKey: CATALOGUE_KEY })
  }, [queryClient])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!draft || !selected) return
      return apiFetch(`/fournitures-trm/fournisseurs/${selected.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          nom: draft.nom.trim(),
          contact: draft.contact.trim() || null,
          tel: draft.tel.trim() || null,
          email: draft.email.trim() || null,
          commentaire: draft.commentaire.trim() || null,
          types: draft.types,
        }),
      })
    },
    onSuccess: () => {
      setWriteError(null)
      setIsEditing(false)
      invalidate()
    },
    onError: (e) => setWriteError(apiErrorMessage(e, "L'enregistrement a échoué. Réessayez.")),
  })

  const createMutation = useMutation({
    mutationFn: (body: { nom: string; types: number[] }) =>
      apiFetch<{ id: number }>('/fournitures-trm/fournisseurs', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (res) => {
      setCreateOpen(false)
      // The new supplier must be visible under the filter it lands in.
      if (filtreActif === 'archives') setFiltre('tous')
      invalidate()
      setSelectedId(res.id)
      setAutoEditForId(res.id)
    },
    onError: (e) => setCreateError(apiErrorMessage(e, 'La création a échoué. Réessayez.')),
  })

  const archiveMutation = useMutation({
    mutationFn: (p: { id: number; restaurer: boolean }) =>
      apiFetch(`/fournitures-trm/fournisseurs/${p.id}${p.restaurer ? '?restaurer=1' : ''}`, { method: 'DELETE' }),
    onSuccess: (_r, p) => {
      setArchiveOpen(false)
      setWriteError(null)
      // Follow the supplier into the bucket it moved to.
      setFiltre(p.restaurer ? 'tous' : 'archives')
      setSelectedId(p.id)
      invalidate()
    },
    onError: (e) => {
      setArchiveOpen(false)
      setWriteError(apiErrorMessage(e, "L'opération a échoué. Réessayez."))
    },
  })

  const guard = useUnsavedGuard({
    isDirty,
    save: async () => {
      await saveMutation.mutateAsync()
    },
    onDiscard: () => setIsEditing(false),
  })

  const handleSelect = useCallback(
    (id: number) => {
      guard.guardAction(() => {
        setIsEditing(false)
        setWriteError(null)
        setSelectedId(id)
      })
    },
    [guard],
  )

  const set = useCallback((patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d)), [])

  return (
    <>
      <MasterDetailLayout
        list={
          <FournisseurList
            rows={filtered}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            types={types}
            selectedId={selectedId}
            onSelect={handleSelect}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            filtre={filtreActif}
            counts={counts}
            onFiltre={(f) => guard.guardAction(() => setFiltre(f))}
            onNew={
              canEdit
                ? () => {
                    setCreateError(null)
                    setCreateOpen(true)
                  }
                : undefined
            }
            isEditing={isEditing}
          />
        }
        detailHeader={
          selected ? (
            <DetailHeader
              fournisseur={selected}
              types={types}
              isEditing={isEditing}
              canEdit={canEdit}
              editNom={draft?.nom ?? ''}
              onEditNomChange={(nom) => set({ nom })}
              onStartEdit={startEdit}
              onCancelEdit={() =>
                guard.guardAction(() => {
                  setIsEditing(false)
                  setWriteError(null)
                })
              }
              onSave={() => saveMutation.mutate()}
              isSaving={saveMutation.isPending}
              canSave={!!draft && draft.nom.trim() !== ''}
              onArchive={() => setArchiveOpen(true)}
              onRestore={() => archiveMutation.mutate({ id: selected.id, restaurer: true })}
              isArchiving={archiveMutation.isPending}
            />
          ) : null
        }
        detail={
          <DetailMain
            fournisseur={selected}
            hasSelection={selectedId !== null}
            types={types}
            isEditing={isEditing}
            draft={draft}
            set={set}
            error={writeError}
          />
        }
        sidebar={selected ? <EntreesSidebar fournisseur={selected} /> : null}
        sidebarTitle="Entrées"
        hasSelection={selectedId !== null}
        onBack={() =>
          guard.guardAction(() => {
            setIsEditing(false)
            setSelectedId(null)
          })
        }
      />

      <CreateFournisseurDialog
        open={createOpen}
        types={types}
        initialTypes={typeof filtreActif === 'number' ? [filtreActif] : []}
        saving={createMutation.isPending}
        error={createError}
        onClose={() => setCreateOpen(false)}
        onCreate={(body) => {
          setCreateError(null)
          createMutation.mutate(body)
        }}
      />

      <ConfirmDialog
        open={archiveOpen}
        title="Archiver le fournisseur"
        description={
          selected
            ? `Archiver « ${selected.nom} » ? Il n'est plus proposé pour les entrées de stock. Ses entrées passées restent attachées à son nom, et il peut être restauré depuis les archivés.`
            : undefined
        }
        confirmLabel="Archiver"
        isPending={archiveMutation.isPending}
        onCancel={() => setArchiveOpen(false)}
        onConfirm={() => {
          if (selected) archiveMutation.mutate({ id: selected.id, restaurer: false })
        }}
      />

      <UnsavedChangesDialog open={guard.showDialog} onAction={guard.handleAction} isSaving={guard.isSaving} />
    </>
  )
}

// ══════════════════════════════════════════════════════
//  Left panel — the supplier list
// ══════════════════════════════════════════════════════

function FournisseurList({
  rows,
  isLoading,
  isError,
  error,
  types,
  selectedId,
  onSelect,
  searchQuery,
  onSearchChange,
  filtre,
  counts,
  onFiltre,
  onNew,
  isEditing,
}: {
  rows: Fournisseur[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  types: FournitureType[]
  selectedId: number | null
  onSelect: (id: number) => void
  searchQuery: string
  onSearchChange: (q: string) => void
  filtre: Filtre
  counts: { tous: number; archives: number; parType: Map<number, number> }
  onFiltre: (f: Filtre) => void
  onNew?: () => void
  isEditing: boolean
}) {
  const nomType = new Map(types.map((t) => [t.id, t.nom]))
  const options: { key: Filtre; label: string }[] = [
    { key: 'tous', label: `Tous (${counts.tous})` },
    ...types.map((t) => ({ key: t.id as Filtre, label: `${t.nom}s (${counts.parType.get(t.id) ?? 0})` })),
    ...(counts.archives > 0 ? [{ key: 'archives' as Filtre, label: `Archivés (${counts.archives})` }] : []),
  ]
  return (
    <div className="flex flex-col h-full rounded-lg border shadow-sm bg-zinc-100/80">
      <div className="p-3 border-b rounded-t-lg bg-zinc-200/50 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Rechercher (nom, contact)..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            autoComplete="off"
            className="w-full h-9 pl-9 pr-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {options.map((opt) => (
            <button
              key={String(opt.key)}
              type="button"
              onClick={() => onFiltre(opt.key)}
              className={cn(
                'px-2 py-1 text-xs rounded-md transition-colors flex-grow basis-[calc(33.333%-0.25rem)]',
                filtre === opt.key
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
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-8 text-destructive">
            <AlertCircle className="h-6 w-6 mb-2" />
            <p className="text-sm">{error?.message || 'Erreur'}</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Factory className="h-12 w-12 mb-3 opacity-50" />
            <p className="text-sm">Aucun fournisseur</p>
          </div>
        ) : (
          rows.map((f) => (
            <div
              key={f.id}
              onClick={() => onSelect(f.id)}
              className={cn(
                'p-3 border rounded-lg cursor-pointer transition-all',
                selectedId === f.id
                  ? 'border-accent bg-white ring-1 ring-accent'
                  : 'border-border bg-white hover:border-accent/50',
              )}
            >
              <div className="flex items-center gap-2">
                <Factory className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <p className={cn('font-medium text-sm truncate', f.archive && 'text-muted-foreground')}>{f.nom}</p>
              </div>
              {f.types.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {f.types.map((t) => (
                    <Badge key={t} variant="secondary" className="text-[10px] py-0">
                      {nomType.get(t) ?? '—'}
                    </Badge>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {f.nbEntrees === 0
                  ? 'Aucune entrée'
                  : `${f.nbEntrees} entrée${f.nbEntrees > 1 ? 's' : ''}${
                      f.derniereEntree ? ` · dernière le ${formatHfsqlDate(f.derniereEntree)}` : ''
                    }`}
              </p>
            </div>
          ))
        )}
      </div>
      <div className="p-3 border-t text-xs text-muted-foreground flex items-center justify-between rounded-b-lg bg-zinc-200/50">
        <span>
          {rows.length} fournisseur{rows.length !== 1 ? 's' : ''}
        </span>
        {!isEditing && onNew && (
          <Button size="sm" variant="ghost" onClick={onNew} className="text-accent hover:text-accent hover:bg-accent/10">
            <Plus className="h-3.5 w-3.5 mr-1" />
            Nouveau
          </Button>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════
//  Center — header + fiche
// ══════════════════════════════════════════════════════

function DetailHeader({
  fournisseur,
  types,
  isEditing,
  canEdit,
  editNom,
  onEditNomChange,
  onStartEdit,
  onCancelEdit,
  onSave,
  isSaving,
  canSave,
  onArchive,
  onRestore,
  isArchiving,
}: {
  fournisseur: Fournisseur
  types: FournitureType[]
  isEditing: boolean
  canEdit: boolean
  editNom: string
  onEditNomChange: (v: string) => void
  onStartEdit: () => void
  onCancelEdit: () => void
  onSave: () => void
  isSaving: boolean
  canSave: boolean
  onArchive: () => void
  onRestore: () => void
  isArchiving: boolean
}) {
  const nomType = new Map(types.map((t) => [t.id, t.nom]))
  return (
    <div className="flex-shrink-0 pt-0.5">
      <div className="flex items-center gap-3">
        <div className={cn('h-11 w-11 rounded-lg flex items-center justify-center', isEditing ? 'bg-accent/15' : 'icon-box-gold')}>
          <Factory className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <div className="flex items-center gap-3">
              <input
                value={editNom}
                onChange={(e) => onEditNomChange(e.target.value)}
                autoFocus
                maxLength={100}
                className="flex-1 text-xl font-heading font-bold h-10 px-3 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <Badge className="bg-accent text-accent-foreground flex-shrink-0 gap-1 shadow-sm">
                <Pencil className="h-3 w-3" />
                Mode edition
              </Badge>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-heading font-bold tracking-tight truncate">{fournisseur.nom}</h1>
              <div className="flex gap-1.5 mt-1 flex-wrap">
                {fournisseur.archive && (
                  <Badge variant="outline" className="text-xs gap-1">
                    <Archive className="h-3 w-3" />
                    Archivé
                  </Badge>
                )}
                {fournisseur.types.map((t) => (
                  <Badge key={t} variant="secondary" className="text-xs">
                    {nomType.get(t) ?? '—'}
                  </Badge>
                ))}
              </div>
            </>
          )}
        </div>
        {canEdit && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {isEditing ? (
              <>
                <Button variant="outline" size="sm" onClick={onCancelEdit}>
                  <X className="h-3.5 w-3.5 mr-1.5" />
                  Annuler
                </Button>
                <Button size="sm" onClick={onSave} disabled={isSaving || !canSave}>
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  {isSaving ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
              </>
            ) : fournisseur.archive ? (
              <Button variant="outline" size="sm" onClick={onRestore} disabled={isArchiving}>
                {isArchiving ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <ArchiveRestore className="h-3.5 w-3.5 mr-1.5" />
                )}
                Restaurer
              </Button>
            ) : (
              <>
                <Button variant="outline" size="icon" className="h-9 w-9" title="Archiver" onClick={onArchive}>
                  <Archive className="h-4 w-4" />
                </Button>
                <Button variant="gold" size="sm" onClick={onStartEdit}>
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Modifier
                </Button>
              </>
            )}
          </div>
        )}
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

function Field({
  label,
  value,
  isEditing,
  draftValue,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string
  value: string | null
  isEditing: boolean
  draftValue: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <div className="space-y-1 min-w-0">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {isEditing ? (
        <input
          type={type}
          value={draftValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className={inputClass}
        />
      ) : (
        <p className={cn('text-sm truncate', !value && 'text-muted-foreground italic')}>{value || '—'}</p>
      )}
    </div>
  )
}

function DetailMain({
  fournisseur,
  hasSelection,
  types,
  isEditing,
  draft,
  set,
  error,
}: {
  fournisseur: Fournisseur | null
  hasSelection: boolean
  types: FournitureType[]
  isEditing: boolean
  draft: Draft | null
  set: (patch: Partial<Draft>) => void
  error: string | null
}) {
  if (!hasSelection || !fournisseur) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="icon-box-gold h-16 w-16 mx-auto">
            <Factory className="h-8 w-8" />
          </div>
          <p className="text-muted-foreground text-sm">Sélectionnez un fournisseur dans la liste</p>
        </div>
      </div>
    )
  }

  const editing = isEditing && !!draft
  const typesAffiches = editing ? draft!.types : fournisseur.types

  return (
    <div className="flex-1 min-h-0 overflow-auto space-y-4 scrollbar-transparent pr-0.5">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      <Card className={cn('card-premium', editing && editSectionClass)}>
        <CardHeader className="flex flex-row items-center gap-2 pb-2 space-y-0">
          <User className="h-4 w-4 text-accent" />
          <CardTitle className="text-sm font-semibold">Identification</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field
              label="Contact"
              value={fournisseur.contact}
              isEditing={editing}
              draftValue={draft?.contact ?? ''}
              onChange={(contact) => set({ contact })}
              placeholder="Nom du contact"
            />
            <Field
              label="Téléphone"
              value={fournisseur.tel}
              isEditing={editing}
              draftValue={draft?.tel ?? ''}
              onChange={(tel) => set({ tel })}
              type="tel"
            />
            <Field
              label="Email"
              value={fournisseur.email}
              isEditing={editing}
              draftValue={draft?.email ?? ''}
              onChange={(email) => set({ email })}
              type="email"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              Commentaire
            </label>
            {editing ? (
              <textarea
                value={draft?.commentaire ?? ''}
                onChange={(e) => set({ commentaire: e.target.value })}
                rows={4}
                maxLength={2000}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
              />
            ) : fournisseur.commentaire ? (
              <p className="text-sm text-muted-foreground whitespace-pre-line">{fournisseur.commentaire}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">Aucun commentaire</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className={cn('card-premium', editing && editSectionClass)}>
        <CardHeader className="flex flex-row items-center gap-2 pb-2 space-y-0">
          <Tags className="h-4 w-4 text-accent" />
          <CardTitle className="text-sm font-semibold">Types fournis</CardTitle>
          <Badge variant="secondary" className="text-xs ml-auto">
            {typesAffiches.length}
          </Badge>
        </CardHeader>
        <CardContent>
          {editing ? (
            <div className="flex flex-wrap gap-2">
              {types.map((t) => {
                const on = draft!.types.includes(t.id)
                return (
                  <ConstructeurChip
                    key={t.id}
                    label={t.nom}
                    active={on}
                    onClick={() =>
                      set({
                        types: (on ? draft!.types.filter((x) => x !== t.id) : [...draft!.types, t.id]).sort(
                          (a, b) => a - b,
                        ),
                      })
                    }
                  />
                )
              })}
            </div>
          ) : typesAffiches.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Aucun type renseigné</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {types
                .filter((t) => typesAffiches.includes(t.id))
                .map((t) => (
                  <Badge key={t.id} className="bg-accent/10 text-accent hover:bg-accent/20 border-accent/20">
                    {t.nom}
                  </Badge>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ══════════════════════════════════════════════════════
//  Right sidebar — stock entries from this supplier
// ══════════════════════════════════════════════════════

function EntreesSidebar({ fournisseur }: { fournisseur: Fournisseur }) {
  const { data, isLoading, isError } = useQuery<{ entrees: Entree[] }>({
    queryKey: [...LIST_KEY, fournisseur.id, 'entrees'],
    queryFn: () => apiFetch(`/fournitures-trm/fournisseurs/${fournisseur.id}/entrees`),
  })
  const entrees = data?.entrees ?? []
  return (
    <div className="w-96 flex-shrink-0 flex flex-col gap-3 min-h-0">
      <div className="flex-1 min-h-0 rounded-xl border flex flex-col overflow-hidden bg-zinc-100/80">
        <div className="flex items-center gap-1.5 border-b px-3 py-2.5 rounded-t-xl bg-zinc-200/50 text-xs font-semibold">
          <PackageOpen className="h-3.5 w-3.5 text-accent" />
          Entrées de stock
          {entrees.length > 0 && <span className="ml-auto font-normal text-muted-foreground">{entrees.length}</span>}
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-transparent">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-accent" />
            </div>
          ) : isError ? (
            <p className="text-sm text-destructive py-2">Impossible de charger les entrées.</p>
          ) : entrees.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <PackageOpen className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">Aucune entrée de ce fournisseur</p>
            </div>
          ) : (
            entrees.map((e) => (
              <div key={e.id} className="p-3 rounded-lg border bg-card shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium tabular-nums min-w-0 truncate">{e.reference}</p>
                  <span className="text-sm font-semibold tabular-nums text-green-700 flex-shrink-0">
                    +{fmtNum(e.quantite)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {e.date ? formatHfsqlDate(e.date) : '—'} · {e.type}
                  {e.constructeur && ` · ${e.constructeur}`}
                </p>
                {e.commentaire && <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{e.commentaire}</p>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════
//  « + Nouveau » — names are unique, so the name is asked first
// ══════════════════════════════════════════════════════

function CreateFournisseurDialog({
  open,
  types,
  initialTypes,
  saving,
  error,
  onClose,
  onCreate,
}: {
  open: boolean
  types: FournitureType[]
  /** Pre-ticked: the type the list is filtered on. */
  initialTypes: number[]
  saving: boolean
  error: string | null
  onClose: () => void
  onCreate: (body: { nom: string; types: number[] }) => void
}) {
  const [nom, setNom] = useState('')
  const [choisis, setChoisis] = useState<number[]>([])

  useEffect(() => {
    if (!open) return
    setNom('')
    setChoisis(initialTypes)
    // Reset on opening only, not when the filter array is rebuilt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const valide = nom.trim() !== ''

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-accent" />
            Nouveau fournisseur
          </DialogTitle>
        </DialogHeader>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (valide && !saving) onCreate({ nom: nom.trim(), types: choisis })
          }}
        >
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Nom</label>
            <input
              type="text"
              autoFocus
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              maxLength={100}
              autoComplete="off"
              className="w-full h-9 px-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Types fournis</p>
            <div className="flex flex-wrap gap-2">
              {types.map((t) => {
                const on = choisis.includes(t.id)
                return (
                  <ConstructeurChip
                    key={t.id}
                    label={t.nom}
                    active={on}
                    onClick={() => setChoisis((cur) => (on ? cur.filter((x) => x !== t.id) : [...cur, t.id]))}
                  />
                )
              })}
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="mt-4 gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Annuler
            </Button>
            <Button type="submit" disabled={!valide || saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Créer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
