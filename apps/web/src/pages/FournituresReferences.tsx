// Fournitures › Références (LIVA #1263, Nicolas + Vincent, 2026-10-07) — the
// catalogue of every material that is not yarn: aiguilles first (55 needle
// references taken from Nicolas's sheet « Stock aiguille ») and platines
// — the only two types for now. TRM-only: « Fils » stays ETM's shared screens.
// Layout: Fiche (MasterDetailLayout, mps_designer §4–§9).
//
// Left  = the articles, filtered by type (Aiguilles by default) or archived.
// Center= the fiche: Identification (type, référence, position for the types
//         that sit on the cylindre / plateau, note), Constructeurs acceptés,
//         Métiers (read-only — what a métier takes is managed in Atelier ›
//         Maintenance, tab Aiguilles), Stock (by constructeur, orders per year).
// Right = the stock movements of the article.
//
// A reference is SHARED by the métiers that take it: editing it here edits it
// for all of them. Writes under edit_fournitures. ?id=<article> selects one
// (the link from the Maintenance tab).
//
// API: /api/fournitures-trm (MPS API, routes/fournitures-trm.ts).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  ExternalLink,
  Factory,
  Loader2,
  Package,
  Pencil,
  Plus,
  Save,
  Search,
  Tags,
  Warehouse,
  X,
} from 'lucide-react'
import { MasterDetailLayout } from '@/components/layout/MasterDetailLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PopoverSelect } from '@/components/ui/popover-select'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { UnsavedChangesDialog } from '@/components/shared/UnsavedChangesDialog'
import { ConstructeurChip, ConstructeursAcceptes } from '@/components/fournitures/ConstructeurPicker'
import { useAutoSelectFirst } from '@/hooks/useAutoSelectFirst'
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard'
import { useHasPermission } from '@/contexts/PermissionsContext'
import { apiFetch } from '@/lib/api'
import { formatHfsqlDate } from '@/lib/dates'
import { fmtNum } from '@/lib/format'
import {
  POSITION_LABEL,
  ageLabel,
  apiErrorMessage,
  etatStock,
  useCatalogue,
  useSetCatalogue,
  type Article,
  type Catalogue,
  type FournitureType,
  type Mouvement,
  type Position,
} from '@/lib/fournitures'
import { cn } from '@/lib/utils'

const editSectionClass = 'border-l-4 border-l-accent/70 bg-accent/[0.03]'
const inputClass =
  'w-full h-9 px-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring'

/** Left-list filter: a type id, or the archived articles. */
type Filtre = number | 'archives'

interface Draft {
  idType: number
  reference: string
  position: Position | null
  commentaire: string
  constructeurs: number[]
  nouveaux: string[]
}

const draftDe = (a: Article): Draft => ({
  idType: a.idType,
  reference: a.reference,
  position: a.position,
  commentaire: a.commentaire ?? '',
  constructeurs: a.constructeurs.map((c) => c.id),
  nouveaux: [],
})

const STOCK_TEXT = { vide: 'text-destructive', bas: 'text-amber-700', ok: 'text-muted-foreground' } as const

// ══════════════════════════════════════════════════════
//  Left panel
// ══════════════════════════════════════════════════════

function ArticleList({
  rows,
  types,
  isLoading,
  isError,
  selectedId,
  onSelect,
  searchQuery,
  onSearchChange,
  filtre,
  onFiltre,
  counts,
  canCreate,
  isEditing,
  onCreate,
}: {
  rows: Article[]
  types: FournitureType[]
  isLoading: boolean
  isError: boolean
  selectedId: number | null
  onSelect: (id: number) => void
  searchQuery: string
  onSearchChange: (q: string) => void
  filtre: Filtre
  onFiltre: (f: Filtre) => void
  counts: Map<Filtre, number>
  canCreate: boolean
  isEditing: boolean
  onCreate: () => void
}) {
  const options: { key: Filtre; label: string }[] = [
    ...types.map((t) => ({ key: t.id as Filtre, label: t.nom })),
    { key: 'archives', label: 'Archivées' },
  ]
  return (
    <div className="flex flex-col h-full rounded-lg border shadow-sm bg-zinc-100/80">
      <div className="p-3 border-b rounded-t-lg bg-zinc-200/50 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Rechercher (référence, métier...)"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            autoComplete="off"
            className="w-full h-9 pl-9 pr-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {options.map((o) => (
            <button
              key={String(o.key)}
              type="button"
              onClick={() => onFiltre(o.key)}
              className={cn(
                'px-2 py-1 text-xs rounded-md transition-colors flex-grow basis-[calc(33.333%-0.25rem)]',
                filtre === o.key
                  ? 'bg-accent text-accent-foreground shadow-sm font-medium'
                  : 'text-muted-foreground hover:bg-accent/10',
              )}
            >
              {o.label}
              {(counts.get(o.key) ?? 0) > 0 && <span className="ml-1 tabular-nums opacity-70">{counts.get(o.key)}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-transparent">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
          </div>
        )}
        {isError && (
          <div className="flex flex-col items-center justify-center py-8 text-destructive">
            <AlertCircle className="h-6 w-6 mb-2" />
            <p className="text-sm text-center">Erreur de chargement</p>
          </div>
        )}
        {!isLoading && !isError && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Package className="h-12 w-12 mb-2 opacity-50" />
            <p className="text-sm">Aucune référence</p>
          </div>
        )}
        {!isLoading &&
          !isError &&
          rows.map((a) => {
            const selected = selectedId === a.id
            const etat = etatStock(a)
            return (
              <div
                key={a.id}
                onClick={() => onSelect(a.id)}
                className={cn(
                  'p-3 border rounded-lg cursor-pointer transition-all bg-white',
                  selected ? 'border-accent ring-1 ring-accent' : 'border-border hover:border-accent/50',
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-medium text-sm truncate tabular-nums">{a.reference}</p>
                  <span className={cn('text-xs tabular-nums flex-shrink-0', STOCK_TEXT[etat], etat !== 'ok' && 'font-medium')}>
                    {fmtNum(a.stock)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  {[a.position ? POSITION_LABEL[a.position] : null, a.metiers.map((m) => m.emplacement).join(' ') || 'sur aucun métier']
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            )
          })}
      </div>

      <div className="p-3 border-t text-xs text-muted-foreground flex items-center justify-between rounded-b-lg bg-zinc-200/50">
        <span>
          {rows.length} référence{rows.length > 1 ? 's' : ''}
        </span>
        {canCreate && !isEditing && (
          <Button size="sm" variant="ghost" className="text-accent hover:text-accent hover:bg-accent/10" onClick={onCreate}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Nouveau
          </Button>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════
//  Center panel
// ══════════════════════════════════════════════════════

function DetailHeader({
  article,
  isEditing,
  isSaving,
  canEdit,
  onStartEdit,
  onCancel,
  onSave,
  onArchive,
}: {
  article: Article
  isEditing: boolean
  isSaving: boolean
  canEdit: boolean
  onStartEdit: () => void
  onCancel: () => void
  onSave: () => void
  onArchive: () => void
}) {
  const etat = etatStock(article)
  return (
    <div className="flex-shrink-0 pt-0.5">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'h-11 w-11 rounded-lg flex items-center justify-center flex-shrink-0',
            isEditing ? 'bg-accent/15' : 'icon-box-gold',
          )}
        >
          <Package className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-heading font-bold tracking-tight truncate">{article.reference}</h1>
              <Badge className="bg-accent text-accent-foreground flex-shrink-0 gap-1 shadow-sm">
                <Pencil className="h-3 w-3" />
                Mode edition
              </Badge>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-heading font-bold tracking-tight truncate tabular-nums">{article.reference}</h1>
              <div className="flex gap-1.5 mt-1 flex-wrap">
                <Badge variant="secondary" className="text-xs">
                  {article.type}
                </Badge>
                {article.position && (
                  <Badge variant="secondary" className="text-xs">
                    {POSITION_LABEL[article.position]}
                  </Badge>
                )}
                <Badge
                  variant="outline"
                  className={cn(
                    'text-xs',
                    etat === 'vide' && 'bg-red-500/10 text-red-700 border-red-500/30',
                    etat === 'bas' && 'bg-amber-500/15 text-amber-800 border-amber-500/30',
                  )}
                >
                  Stock {fmtNum(article.stock)}
                </Badge>
                {article.archive && (
                  <Badge variant="outline" className="text-xs">
                    Archivée
                  </Badge>
                )}
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isEditing ? (
            <>
              <Button variant="outline" size="sm" onClick={onCancel} disabled={isSaving}>
                <X className="h-3.5 w-3.5 mr-1.5" />
                Annuler
              </Button>
              <Button size="sm" onClick={onSave} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                Enregistrer
              </Button>
            </>
          ) : (
            canEdit && (
              <>
                <Button variant="outline" size="sm" onClick={onArchive}>
                  {article.archive ? (
                    <ArchiveRestore className="h-3.5 w-3.5 mr-1.5" />
                  ) : (
                    <Archive className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  {article.archive ? 'Restaurer' : 'Archiver'}
                </Button>
                {!article.archive && (
                  <Button variant="gold" size="sm" onClick={onStartEdit}>
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />
                    Modifier
                  </Button>
                )}
              </>
            )
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

function EmptyDetail() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
      <div className="icon-box-gold h-16 w-16 rounded-lg flex items-center justify-center mb-3">
        <Package className="h-8 w-8" />
      </div>
      <p className="text-sm">Sélectionnez une référence</p>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1 min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}

function IdentificationCard({
  article,
  types,
  isEditing,
  draft,
  set,
}: {
  article: Article
  types: FournitureType[]
  isEditing: boolean
  draft: Draft | null
  set: (patch: Partial<Draft>) => void
}) {
  const type = types.find((t) => t.id === (isEditing && draft ? draft.idType : article.idType))
  return (
    <Card className={cn('card-premium', isEditing && editSectionClass)}>
      <CardHeader className="flex flex-row items-center gap-2 pb-2 space-y-0">
        <Tags className="h-4 w-4 text-accent" />
        <CardTitle className="text-sm font-semibold">Identification</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Type">
            {isEditing && draft ? (
              <PopoverSelect
                options={types.map((t) => ({ id: t.id, primary: t.nom }))}
                value={draft.idType}
                onChange={(id) => set({ idType: id, position: types.find((t) => t.id === id)?.avecPosition ? draft.position : null })}
                hideEmpty
              />
            ) : (
              <p className="text-sm">{article.type}</p>
            )}
          </Field>
          <Field label="Référence">
            {isEditing && draft ? (
              <input
                type="text"
                value={draft.reference}
                onChange={(e) => set({ reference: e.target.value })}
                maxLength={100}
                className={inputClass}
              />
            ) : (
              <p className="text-sm tabular-nums">{article.reference}</p>
            )}
          </Field>
        </div>
        {type?.avecPosition && (
          <Field label="Position">
            {isEditing && draft ? (
              <div className="flex gap-2">
                {(['cylindre', 'plateau'] as const).map((p) => (
                  <ConstructeurChip
                    key={p}
                    label={POSITION_LABEL[p]}
                    active={draft.position === p}
                    onClick={() => set({ position: draft.position === p ? null : p })}
                  />
                ))}
              </div>
            ) : (
              <p className={cn('text-sm', !article.position && 'text-muted-foreground italic')}>
                {article.position ? POSITION_LABEL[article.position] : 'À préciser'}
              </p>
            )}
          </Field>
        )}
        <Field label="Note">
          {isEditing && draft ? (
            <textarea
              rows={2}
              value={draft.commentaire}
              onChange={(e) => set({ commentaire: e.target.value })}
              placeholder="Remplacement prévu, regroupement…"
              maxLength={1000}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
            />
          ) : article.commentaire ? (
            <p className="text-sm text-amber-800 whitespace-pre-line">{article.commentaire}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">Aucune note</p>
          )}
        </Field>
      </CardContent>
    </Card>
  )
}

function ConstructeursCard({
  article,
  constructeurs,
  isEditing,
  draft,
  set,
}: {
  article: Article
  constructeurs: Catalogue['constructeurs']
  isEditing: boolean
  draft: Draft | null
  set: (patch: Partial<Draft>) => void
}) {
  const montes = [...new Set(article.metiers.map((m) => m.monte?.id).filter((id): id is number => id !== undefined))]
  return (
    <Card className={cn('card-premium', isEditing && editSectionClass)}>
      <CardHeader className="flex flex-row items-center gap-2 pb-2 space-y-0">
        <Factory className="h-4 w-4 text-accent" />
        <CardTitle className="text-sm font-semibold">Constructeurs acceptés</CardTitle>
      </CardHeader>
      <CardContent>
        {isEditing && draft ? (
          <ConstructeursAcceptes
            constructeurs={constructeurs}
            ids={draft.constructeurs}
            nouveaux={draft.nouveaux}
            locked={montes}
            onChange={(ids, nouveaux) => set({ constructeurs: ids, nouveaux })}
          />
        ) : article.constructeurs.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            Aucun pour l&apos;instant — un constructeur monté sur un métier devient accepté.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {article.constructeurs.map((c) => (
              <Badge key={c.id} variant="secondary" className="text-xs">
                {c.nom}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function MetiersCard({ article }: { article: Article }) {
  return (
    <Card className="card-premium">
      <CardHeader className="flex flex-row items-center gap-2 pb-2 space-y-0">
        <Factory className="h-4 w-4 text-accent" />
        <CardTitle className="text-sm font-semibold">Métiers</CardTitle>
        <Link
          to="/atelier/maintenance"
          className="ml-auto inline-flex items-center gap-1 text-xs text-accent hover:underline"
        >
          Gérés dans Atelier › Maintenance
          <ExternalLink className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent>
        {article.metiers.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Sur aucun métier.</p>
        ) : (
          <>
            <div className="hidden md:grid grid-cols-[6rem_8rem_8rem_minmax(0,1fr)] gap-3 pb-1 text-[11px] font-medium text-muted-foreground">
              <span>Métier</span>
              <span>Jeu de</span>
              <span>Monté</span>
              <span>Depuis</span>
            </div>
            {article.metiers.map((m) => (
              <div
                key={m.id}
                className="grid grid-cols-2 md:grid-cols-[6rem_8rem_8rem_minmax(0,1fr)] gap-1.5 md:gap-3 py-1.5 border-b border-border/60 last:border-b-0 text-sm"
              >
                <span className="font-medium">{m.emplacement}</span>
                <span className={cn('tabular-nums', m.quantite === null && 'text-muted-foreground italic')}>
                  {m.quantite !== null ? fmtNum(m.quantite) : 'à saisir'}
                </span>
                <span className={cn(!m.monte && 'text-muted-foreground italic')}>{m.monte?.nom ?? 'inconnu'}</span>
                <span className="text-muted-foreground tabular-nums">
                  {m.dateMontage ? `${formatHfsqlDate(m.dateMontage)} · ${ageLabel(m.dateMontage) ?? ''}` : '—'}
                </span>
              </div>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function StockCard({ article }: { article: Article }) {
  const annees = Object.entries(article.commandesParAnnee)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 6)
  const max = Math.max(1, ...annees.map(([, q]) => q))
  return (
    <Card className="card-premium">
      <CardHeader className="flex flex-row items-center gap-2 pb-2 space-y-0">
        <Warehouse className="h-4 w-4 text-accent" />
        <CardTitle className="text-sm font-semibold">Stock</CardTitle>
        <Link to="/fournitures/stock" className="ml-auto inline-flex items-center gap-1 text-xs text-accent hover:underline">
          Entrées et inventaires dans Fournitures › Stock
          <ExternalLink className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Par constructeur</p>
          {article.stockParConstructeur.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Aucun stock.</p>
          ) : (
            article.stockParConstructeur.map((s, i) => (
              <div key={i} className="flex items-baseline justify-between gap-3 text-sm">
                <span className={cn(!s.constructeur && 'text-muted-foreground italic')}>
                  {s.constructeur?.nom ?? 'Non précisé'}
                </span>
                <span className={cn('tabular-nums', s.stock < 0 && 'text-destructive font-medium')}>{fmtNum(s.stock)}</span>
              </div>
            ))
          )}
          <div className="flex items-baseline justify-between gap-3 text-sm font-semibold border-t border-border/60 pt-1.5">
            <span>Total</span>
            <span className={cn('tabular-nums', article.stock <= 0 && 'text-destructive')}>{fmtNum(article.stock)}</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Commandé par an</p>
          {annees.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Aucune entrée.</p>
          ) : (
            annees.map(([annee, q]) => (
              <div key={annee} className="grid grid-cols-[3rem_minmax(0,1fr)_4rem] items-center gap-2 text-sm">
                <span className="tabular-nums text-muted-foreground">{annee}</span>
                <span className="h-2 rounded-full bg-accent/15 overflow-hidden">
                  <span className="block h-full rounded-full bg-accent/70" style={{ width: `${(q / max) * 100}%` }} />
                </span>
                <span className="tabular-nums text-right">{fmtNum(q)}</span>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ══════════════════════════════════════════════════════
//  Right panel — the movements
// ══════════════════════════════════════════════════════

function MouvementsSidebar({ article }: { article: Article }) {
  const { data, isLoading } = useQuery<{ mouvements: Mouvement[] }>({
    queryKey: ['fournitures-trm-mouvements', article.id],
    queryFn: () => apiFetch(`/fournitures-trm/articles/${article.id}/mouvements`),
  })
  const mouvements = data?.mouvements ?? []
  return (
    <div className="w-96 flex-shrink-0 flex flex-col gap-3 min-h-0">
      <div className="flex-1 min-h-0 rounded-xl border flex flex-col overflow-hidden bg-zinc-100/80">
        <div className="flex items-center gap-1.5 border-b px-3 py-2.5 rounded-t-xl bg-zinc-200/50 text-xs font-semibold">
          <Warehouse className="h-3.5 w-3.5 text-accent" />
          Mouvements de stock
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-transparent">
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-accent" />
            </div>
          ) : mouvements.length === 0 ? (
            <p className="text-sm text-muted-foreground italic text-center py-6">Aucun mouvement.</p>
          ) : (
            mouvements.map((m) => (
              <div key={m.id} className="p-3 rounded-lg border bg-card shadow-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{m.libelle}</span>
                  <span
                    className={cn(
                      'text-sm tabular-nums font-medium',
                      m.quantite > 0 ? 'text-green-700' : m.quantite < 0 ? 'text-destructive' : 'text-muted-foreground',
                    )}
                  >
                    {m.quantite > 0 ? '+' : ''}
                    {fmtNum(m.quantite)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {[m.date ? formatHfsqlDate(m.date) : null, m.constructeur ?? 'non précisé', m.fournisseur, m.metier ? `métier ${m.metier}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {m.commentaire && <p className="text-[11px] text-muted-foreground italic mt-0.5">{m.commentaire}</p>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════
//  « + Nouveau » — type and reference first
// ══════════════════════════════════════════════════════

function NouvelleReferenceDialog({
  open,
  types,
  typeParDefaut,
  saving,
  error,
  onClose,
  onSave,
}: {
  open: boolean
  types: FournitureType[]
  typeParDefaut: number
  saving: boolean
  error: string | null
  onClose: () => void
  onSave: (body: { idType: number; reference: string }) => void
}) {
  const [idType, setIdType] = useState(typeParDefaut)
  const [reference, setReference] = useState('')
  useEffect(() => {
    if (!open) return
    setIdType(typeParDefaut)
    setReference('')
  }, [open, typeParDefaut])
  const valide = idType > 0 && reference.trim() !== ''
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-accent" />
            Nouvelle référence
          </DialogTitle>
        </DialogHeader>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (valide && !saving) onSave({ idType, reference: reference.trim() })
          }}
        >
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground">Type</p>
            <div className="flex flex-wrap gap-2">
              {types.map((t) => (
                <ConstructeurChip key={t.id} label={t.nom} active={idType === t.id} onClick={() => setIdType(t.id)} />
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">Référence</label>
            <input
              type="text"
              autoFocus
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Vo LS 83.41 G003"
              maxLength={100}
              className={inputClass}
            />
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

// ══════════════════════════════════════════════════════
//  Page
// ══════════════════════════════════════════════════════

export function FournituresReferences() {
  const canEdit = useHasPermission('edit_fournitures')
  const setCatalogue = useSetCatalogue()
  const [searchParams, setSearchParams] = useSearchParams()

  const [searchQuery, setSearchQuery] = useState('')
  const [filtre, setFiltre] = useState<Filtre | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [writeError, setWriteError] = useState<string | null>(null)
  const [creation, setCreation] = useState(false)
  const [creationError, setCreationError] = useState<string | null>(null)
  const [archivage, setArchivage] = useState(false)
  const [autoEditId, setAutoEditId] = useState<number | null>(null)

  // With the archived ones: the « Archivées » filter reads the same payload.
  const { data, isLoading, isError } = useCatalogue(true)
  const types = useMemo(() => data?.types ?? [], [data])
  const articles = useMemo(() => data?.articles ?? [], [data])

  // Default filter: the first type (Aiguille) — the everyday view.
  const filtreActif: Filtre = filtre ?? types[0]?.id ?? 'archives'

  // ?id=<article> (link from Atelier › Maintenance): select it and its type.
  useEffect(() => {
    const id = Number(searchParams.get('id'))
    if (!id || articles.length === 0) return
    const a = articles.find((x) => x.id === id)
    if (a) {
      setFiltre(a.archive ? 'archives' : a.idType)
      setSelectedId(a.id)
    }
    setSearchParams({}, { replace: true })
  }, [searchParams, articles, setSearchParams])

  const counts = useMemo(() => {
    const m = new Map<Filtre, number>()
    for (const a of articles) {
      const k: Filtre = a.archive ? 'archives' : a.idType
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return m
  }, [articles])

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return articles.filter((a) => {
      if (filtreActif === 'archives' ? !a.archive : a.archive || a.idType !== filtreActif) return false
      if (!q) return true
      return (
        a.reference.toLowerCase().includes(q) ||
        a.metiers.some((m) => m.emplacement.toLowerCase().includes(q)) ||
        (a.commentaire ?? '').toLowerCase().includes(q)
      )
    })
  }, [articles, filtreActif, searchQuery])

  useAutoSelectFirst({
    rows: filtered,
    selectedId,
    getId: (a: Article) => a.id,
    select: setSelectedId,
    suspended: isEditing || isLoading,
  })

  const selected = useMemo(() => articles.find((a) => a.id === selectedId) ?? null, [articles, selectedId])

  useEffect(() => {
    if (!isEditing) setDraft(selected ? draftDe(selected) : null)
  }, [selected, isEditing])

  // §25.1: a reference just created opens in edit mode.
  useEffect(() => {
    if (autoEditId !== null && selected?.id === autoEditId) {
      setDraft(draftDe(selected))
      setIsEditing(true)
      setAutoEditId(null)
    }
  }, [autoEditId, selected])

  const isDirty = useMemo(
    () => isEditing && !!draft && !!selected && JSON.stringify(draft) !== JSON.stringify(draftDe(selected)),
    [isEditing, draft, selected],
  )

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!draft || !selected) return
      return apiFetch<Catalogue>(`/fournitures-trm/articles/${selected.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          idType: draft.idType,
          reference: draft.reference,
          position: draft.position,
          commentaire: draft.commentaire.trim() || null,
          constructeurs: [...draft.constructeurs.map((id) => ({ id })), ...draft.nouveaux.map((nom) => ({ nom }))],
        }),
      })
    },
    onSuccess: (cat) => {
      setWriteError(null)
      setIsEditing(false)
      setCatalogue(cat)
    },
    onError: (e) => setWriteError(apiErrorMessage(e, "L'enregistrement a échoué. Réessayez.")),
  })

  const createMut = useMutation({
    mutationFn: (body: { idType: number; reference: string }) =>
      apiFetch<Catalogue & { id: number }>('/fournitures-trm/articles', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (res, body) => {
      setCatalogue(res)
      setCreation(false)
      setFiltre(body.idType)
      setSearchQuery('')
      setSelectedId(res.id)
      setAutoEditId(res.id)
    },
    onError: (e) => setCreationError(apiErrorMessage(e, 'La création a échoué. Réessayez.')),
  })

  const archiveMut = useMutation({
    mutationFn: (a: Article) =>
      apiFetch<Catalogue>(`/fournitures-trm/articles/${a.id}${a.archive ? '?restaurer=1' : ''}`, { method: 'DELETE' }),
    onSuccess: (_cat, a) => {
      setArchivage(false)
      setWriteError(null)
      // The answer lists archived ones too — refetch both shapes instead.
      setCatalogue(undefined)
      setFiltre(a.archive ? a.idType : 'archives')
    },
    onError: (e) => {
      setArchivage(false)
      setWriteError(apiErrorMessage(e, "L'opération a échoué. Réessayez."))
    },
  })

  const guard = useUnsavedGuard({
    isDirty,
    save: async () => {
      await saveMut.mutateAsync()
    },
    onDiscard: () => {
      setIsEditing(false)
      setDraft(selected ? draftDe(selected) : null)
    },
  })

  const handleSelect = useCallback(
    (id: number) =>
      guard.guardAction(() => {
        setIsEditing(false)
        setWriteError(null)
        setSelectedId(id)
      }),
    [guard],
  )

  const set = useCallback((patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d)), [])

  return (
    <>
      <MasterDetailLayout
        list={
          <ArticleList
            rows={filtered}
            types={types}
            isLoading={isLoading}
            isError={isError}
            selectedId={selectedId}
            onSelect={handleSelect}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            filtre={filtreActif}
            onFiltre={(f) => guard.guardAction(() => setFiltre(f))}
            counts={counts}
            canCreate={canEdit}
            isEditing={isEditing}
            onCreate={() => {
              setCreationError(null)
              setCreation(true)
            }}
          />
        }
        detailHeader={
          selected ? (
            <DetailHeader
              article={selected}
              isEditing={isEditing}
              isSaving={saveMut.isPending}
              canEdit={canEdit}
              onStartEdit={() => {
                setDraft(draftDe(selected))
                setWriteError(null)
                setIsEditing(true)
              }}
              onCancel={() =>
                guard.guardAction(() => {
                  setIsEditing(false)
                  setWriteError(null)
                })
              }
              onSave={() => saveMut.mutate()}
              onArchive={() => setArchivage(true)}
            />
          ) : null
        }
        detail={
          !selected ? (
            <EmptyDetail />
          ) : (
            <div className="flex-1 min-h-0 overflow-auto space-y-4 scrollbar-transparent pr-0.5">
              {writeError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <p className="text-sm">{writeError}</p>
                </div>
              )}
              {isEditing && selected.metiers.length > 1 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800">
                  Référence partagée par {selected.metiers.map((m) => m.emplacement).join(', ')} : la modification
                  vaut pour tous ces métiers.
                </div>
              )}
              <IdentificationCard article={selected} types={types} isEditing={isEditing} draft={draft} set={set} />
              <ConstructeursCard
                article={selected}
                constructeurs={data?.constructeurs ?? []}
                isEditing={isEditing}
                draft={draft}
                set={set}
              />
              <MetiersCard article={selected} />
              <StockCard article={selected} />
            </div>
          )
        }
        sidebar={selected ? <MouvementsSidebar article={selected} /> : null}
        sidebarTitle="Mouvements"
        hasSelection={selectedId !== null}
        onBack={() =>
          guard.guardAction(() => {
            setIsEditing(false)
            setSelectedId(null)
          })
        }
      />

      <NouvelleReferenceDialog
        open={creation}
        types={types}
        typeParDefaut={typeof filtreActif === 'number' ? filtreActif : (types[0]?.id ?? 0)}
        saving={createMut.isPending}
        error={creationError}
        onClose={() => setCreation(false)}
        onSave={(body) => {
          setCreationError(null)
          createMut.mutate(body)
        }}
      />

      <ConfirmDialog
        open={archivage && !!selected}
        variant={selected?.archive ? 'default' : 'destructive'}
        title={selected?.archive ? 'Restaurer la référence' : 'Archiver la référence'}
        description={
          selected?.archive
            ? `« ${selected.reference} » revient dans le catalogue.`
            : `« ${selected?.reference ?? ''} » quitte le catalogue. Son stock et ses mouvements restent en base ; une référence encore sur un métier ne peut pas être archivée.`
        }
        confirmLabel={selected?.archive ? 'Restaurer' : 'Archiver'}
        isPending={archiveMut.isPending}
        onCancel={() => setArchivage(false)}
        onConfirm={() => {
          if (selected) archiveMut.mutate(selected)
        }}
      />

      <UnsavedChangesDialog open={guard.showDialog} onAction={guard.handleAction} isSaving={guard.isSaving} />
    </>
  )
}
