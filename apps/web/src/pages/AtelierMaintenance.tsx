// Atelier › Maintenance — port of the legacy FI_Maintenance.wdw (Tricotage
// Malterre mode). Layout: Fiche (MasterDetailLayout, mps_designer §4–§9).
//
// Left  = the active métiers, most urgent first, each with its rouloir counter
//         ("Rouloir dans N Kgs" — the legacy string), what is due, and a §41
//         liseré on the worst of its items.
// Center= the maintenance fiche: Identification (description + fonture),
//         Rouloir (last visit, comment, the 15 000 Kg counter), Entretien (the
//         periodic per-métier items: Ventilateurs, Couronnes, Fuites d'air, …)
//         and Garniture (the legacy's six date + comment pairs). Every item
//         shows the kg knitted since it was last done (Mickaël, 2026-10-01).
// Right = the selected métier, two tabs: Métier (read-only characteristics)
//         and Aiguilles (its needle references and the constructeur mounted
//         for each — LIVA #1263, components/maintenance/AiguillesTab.tsx, its
//         own query and immediate writes).
//
// API: /api/maintenance-trm (MPS API — routes/maintenance-trm.ts holds the
// data rules; lib/maintenance-trm.ts the kg-since and state rules).
//
// Deliberate deltas vs the legacy window (house convention: state them):
//  - The red/green padlock (IMG_Verrou) becomes the standard gold Modifier edit
//    mode with the §28 unsaved-changes guard, like Gestion des OF.
//  - The rainbow needle dials become single-hue meters with a status word —
//    see the header of components/maintenance/MaintenanceGauge.tsx for why.
//  - Ventilateurs / Couronnes / Fuites d'air were ONE atelier-wide date each;
//    they are per métier since 2026-10-01 (Mickaël), and the atelier keeps
//    items of its own. Items are created / edited here (OperationDialog).
//  - « Effectué ce jour » on every item, outside edit mode, confirmed.
//  - The garniture dates have no colour: the base holds no frequency for
//    garniture work, so an alert threshold would be invented data.
//  - No Imprimer / Envoyer un email (§6.1): the legacy window produces no
//    document, and a placeholder pair would be noise.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  Brush,
  CalendarCheck,
  CalendarClock,
  Cog,
  Factory,
  Fan,
  Gauge,
  Loader2,
  Pencil,
  Pin,
  Plus,
  Save,
  Search,
  Settings2,
  Wrench,
  X,
} from 'lucide-react'
import { MasterDetailLayout } from '@/components/layout/MasterDetailLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PopoverSelect } from '@/components/ui/popover-select'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { UnsavedChangesDialog } from '@/components/shared/UnsavedChangesDialog'
import {
  EtatChip,
  LinearMeter,
  RadialMeter,
  etatSpec,
  type MeterEtat,
} from '@/components/maintenance/MaintenanceGauge'
import {
  OperationDialog,
  type OperationDraft,
  type Portee,
} from '@/components/maintenance/OperationDialog'
import { AiguillesTab, useNbAiguilles } from '@/components/maintenance/AiguillesTab'
import { useAutoSelectFirst } from '@/hooks/useAutoSelectFirst'
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard'
import { useHasPermission } from '@/contexts/PermissionsContext'
import { apiFetch } from '@/lib/api'
import { formatHfsqlDate, hfsqlDateToInput, inputDateToHfsql } from '@/lib/dates'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'

// ── Types (API payloads) ───────────────────────────────

interface OperationSlot {
  date: string | null
  commentaire: string | null
  /** Kg knitted since `date` (weighed rolls); null without a date. */
  kgDepuis: number | null
}

interface EntretienMetier {
  id: number
  nom: string
  frequenceMois: number
  date: string | null
  commentaire: string | null
  moisEcoules: number | null
  ratio: number | null
  etat: MeterEtat
  kgDepuis: number | null
}

interface Garniture {
  nettPlatines: OperationSlot
  nettCylindre: OperationSlot
  nettPlateau: OperationSlot
  chgAiguilles: OperationSlot
  chgPlatines: OperationSlot
  pulsonique: OperationSlot
}

type GarnitureKey = keyof Garniture

interface Metier {
  id: number
  emplacement: string
  nom: string
  description: string | null
  doubleFonture: boolean
  archive: boolean
  /** Worst state over the rouloir and the periodic items. */
  etat: MeterEtat
  /** Names of the items that are due ('Rouloir', 'Ventilateurs', …). */
  aFaire: string[]
  entretiens: EntretienMetier[]
  rouloir: {
    derniereVisite: string | null
    commentaire: string | null
    produitKg: number
    restantKg: number
    ratio: number
    etat: MeterEtat
  }
  garniture: Garniture
  caracteristiques: {
    jauge: number
    diametre: number
    nbChutes: number
    nbChutesMax: number
    elasthanne: boolean
    vitesse: number
    adresseAutomate: number | null
    connecte: boolean
  }
}

interface MetiersPayload {
  seuilRouloirKg: number
  metiers: Metier[]
}

/** The item catalogue. `derniereMaintenance` / meter fields are filled for
 *  atelier items only — a per-métier item's dates live on each métier. */
interface OperationEntretien {
  id: number
  nom: string
  portee: Portee
  derniereMaintenance: string | null
  frequenceMois: number
  moisEcoules: number | null
  ratio: number | null
  etat: MeterEtat
}

/** What « Effectué ce jour » targets on a métier. */
type FaitItem = 'rouloir' | GarnitureKey | number

// ── Constants ──────────────────────────────────────────

/** The six garniture rows, in the legacy form's top-to-bottom order. The
 *  workshop reads this screen the way it reads the machine — don't reorder. */
const GARNITURE_ROWS: { key: GarnitureKey; label: string }[] = [
  { key: 'nettPlatines', label: 'Nettoyage des platines' },
  { key: 'nettCylindre', label: 'Nettoyage du cylindre' },
  { key: 'nettPlateau', label: 'Nettoyage du plateau' },
  { key: 'chgAiguilles', label: 'Changement des aiguilles' },
  { key: 'chgPlatines', label: 'Changement des platines' },
  { key: 'pulsonique', label: 'Pulsoniques' },
]

const editSectionClass = 'border-l-4 border-l-accent/70 bg-accent/[0.03]'

// ── Small helpers ──────────────────────────────────────

/** "il y a 10 mois" / "il y a 2 ans" from an HFSQL date. Derived, never stored
 *  — it exists because a bare "01/05/2013" doesn't read as thirteen years old. */
function ageLabel(hf: string | null): string | null {
  if (!hf || !/^\d{8}$/.test(hf)) return null
  const y = Number(hf.slice(0, 4))
  const m = Number(hf.slice(4, 6))
  const d = Number(hf.slice(6, 8))
  const now = new Date()
  let months = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m)
  if (now.getDate() < d) months -= 1
  if (months < 0) return null
  if (months === 0) return 'ce mois-ci'
  if (months === 1) return 'il y a 1 mois'
  if (months < 24) return `il y a ${months} mois`
  return `il y a ${Math.floor(months / 12)} ans`
}

const emptyDraft = (m: Metier) => ({
  description: m.description ?? '',
  doubleFonture: m.doubleFonture,
  rouloirDate: m.rouloir.derniereVisite ?? '',
  rouloirCommentaire: m.rouloir.commentaire ?? '',
  garniture: Object.fromEntries(
    GARNITURE_ROWS.map((r) => [
      r.key,
      { date: m.garniture[r.key].date ?? '', commentaire: m.garniture[r.key].commentaire ?? '' },
    ]),
  ) as Record<GarnitureKey, { date: string; commentaire: string }>,
  entretiens: Object.fromEntries(
    m.entretiens.map((e) => [e.id, { date: e.date ?? '', commentaire: e.commentaire ?? '' }]),
  ) as Record<number, { date: string; commentaire: string }>,
})

type Draft = ReturnType<typeof emptyDraft>

function todayHf(): string {
  const d = new Date()
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
}

// ══════════════════════════════════════════════════════
//  Left panel — the métier queue
// ══════════════════════════════════════════════════════

/** Selection id of the pinned « Atelier » entry — never a machine id. */
const ATELIER_ID = -1

interface AtelierSummary {
  etat: MeterEtat
  aFaire: string[]
  nbEntretiens: number
}

function AtelierListCard({
  summary,
  selected,
  onSelect,
}: {
  summary: AtelierSummary
  selected: boolean
  onSelect: () => void
}) {
  const { etat } = summary
  return (
    <div
      onClick={onSelect}
      className={cn(
        // Navy-tinted, with its own icon box: reads as a different kind of
        // thing than the white métier cards below.
        'p-3 border rounded-lg cursor-pointer transition-all bg-primary/[0.04] flex items-center gap-3',
        selected
          ? etat === 'due'
            ? 'border-red-500 ring-1 ring-red-500'
            : etat === 'proche'
              ? 'border-amber-500 ring-1 ring-amber-500'
              : 'border-primary/60 ring-1 ring-primary/60'
          : 'border-primary/20 hover:border-primary/40',
        etat === 'due' && 'shadow-[inset_4px_0_0_0_rgb(239_68_68)]',
        etat === 'proche' && 'shadow-[inset_4px_0_0_0_rgb(245_158_11)]',
      )}
    >
      <div className="h-9 w-9 rounded-md bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0">
        <Factory className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm">Atelier</p>
        {summary.aFaire.length > 0 ? (
          <p className="text-[11px] font-medium text-red-700 truncate">
            À faire : {summary.aFaire.join(', ')}
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground truncate">
            Entretiens généraux · {summary.nbEntretiens} élément
            {summary.nbEntretiens > 1 ? 's' : ''}
          </p>
        )}
      </div>
    </div>
  )
}

function MetierList({
  rows,
  isLoading,
  isError,
  error,
  selectedId,
  onSelect,
  searchQuery,
  onSearchChange,
  dueOnly,
  dueCount,
  onToggleDue,
  atelier,
}: {
  rows: Metier[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  selectedId: number | null
  onSelect: (id: number) => void
  searchQuery: string
  onSearchChange: (q: string) => void
  dueOnly: boolean
  dueCount: number
  onToggleDue: () => void
  /** The pinned building entry; null when filtered out. */
  atelier: AtelierSummary | null
}) {
  return (
    <div className="flex flex-col h-full rounded-lg border shadow-sm bg-zinc-100/80">
      <div className="p-3 border-b rounded-t-lg bg-zinc-200/50">
        {/* §41: the counter pill sits flush right of the search input. */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Rechercher (métier, description...)"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              autoComplete="off"
              className="w-full h-9 pl-9 pr-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          {dueCount > 0 && (
            <button
              type="button"
              onClick={onToggleDue}
              aria-pressed={dueOnly}
              title="Entretiens à faire"
              className={cn(
                'h-7 min-w-[1.75rem] px-1.5 inline-flex items-center justify-center rounded-md text-xs font-semibold tabular-nums border transition-colors flex-shrink-0',
                dueOnly
                  ? 'bg-red-500 text-white border-red-500 shadow-sm'
                  : 'bg-red-500/10 text-red-700 border-red-500/30 hover:bg-red-500/20',
              )}
            >
              {dueCount}
            </button>
          )}
        </div>
      </div>

      {/* The building, pinned above the métiers and outside their scroll: it is
          not a machine, and its items have nothing to do with the selected one. */}
      {atelier && (
        <div className="px-3 pt-3 pb-2.5 border-b border-border/70">
          <AtelierListCard
            summary={atelier}
            selected={selectedId === ATELIER_ID}
            onSelect={() => onSelect(ATELIER_ID)}
          />
        </div>
      )}
      <p className="px-3 pt-2.5 -mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Métiers
      </p>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-transparent">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
          </div>
        )}
        {isError && (
          <div className="flex flex-col items-center justify-center py-8 text-destructive">
            <AlertCircle className="h-6 w-6 mb-2" />
            <p className="text-sm text-center">{error?.message ?? 'Erreur de chargement'}</p>
          </div>
        )}
        {!isLoading && !isError && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Wrench className="h-12 w-12 mb-2 opacity-50" />
            <p className="text-sm">Aucun métier</p>
          </div>
        )}

        {!isLoading &&
          !isError &&
          rows.map((m) => {
            const selected = selectedId === m.id
            // The liseré carries the worst item; the meter stays the rouloir's.
            const etat = m.etat
            const selectedRing =
              etat === 'due'
                ? 'border-red-500 ring-1 ring-red-500'
                : etat === 'proche'
                  ? 'border-amber-500 ring-1 ring-amber-500'
                  : 'border-zinc-400 ring-1 ring-zinc-400'
            const hoverBorder =
              etat === 'due'
                ? 'border-border hover:border-red-500/50'
                : etat === 'proche'
                  ? 'border-border hover:border-amber-500/50'
                  : 'border-border hover:border-zinc-400/60'
            return (
              <div
                key={m.id}
                onClick={() => onSelect(m.id)}
                className={cn(
                  'p-3 border rounded-lg cursor-pointer transition-all bg-white',
                  selected ? selectedRing : hoverBorder,
                  // §30.3: inset shadow, never border-l-4 — it composes with
                  // the selection ring instead of fighting the border shorthand.
                  etat === 'due' && 'shadow-[inset_4px_0_0_0_rgb(239_68_68)]',
                  etat === 'proche' && 'shadow-[inset_4px_0_0_0_rgb(245_158_11)]',
                )}
              >
                <div className="flex items-baseline gap-2">
                  <p className="font-medium text-sm truncate">{m.emplacement || m.nom}</p>
                  {m.description && (
                    <p className="text-xs text-muted-foreground truncate">{m.description}</p>
                  )}
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <LinearMeter
                    ratio={m.rouloir.ratio}
                    etat={m.rouloir.etat}
                    className="h-1.5 flex-1"
                  />
                  {/* The legacy string, kept verbatim. */}
                  <p
                    className={cn(
                      'text-[11px] tabular-nums flex-shrink-0',
                      m.rouloir.etat === 'ok'
                        ? 'text-muted-foreground'
                        : etatSpec(m.rouloir.etat).text,
                    )}
                  >
                    Rouloir dans {fmtNum(m.rouloir.restantKg)} Kgs
                  </p>
                </div>
                {m.aFaire.length > 0 && (
                  <p className="mt-1 text-[11px] font-medium text-red-700 truncate">
                    À faire : {m.aFaire.join(', ')}
                  </p>
                )}
              </div>
            )
          })}
      </div>

      <div className="p-3 border-t text-xs text-muted-foreground flex items-center justify-between rounded-b-lg bg-zinc-200/50">
        <span>
          {rows.length} métier{rows.length > 1 ? 's' : ''}
        </span>
        {/* No "+ Nouveau": a métier is created in FEN_Gestion_des_machines,
            which is not ported. Documented exception to §5's footer contract. */}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════
//  Center panel
// ══════════════════════════════════════════════════════

function DetailHeader({
  metier,
  isEditing,
  isSaving,
  canEdit,
  onStartEdit,
  onCancel,
  onSave,
}: {
  metier: Metier
  isEditing: boolean
  isSaving: boolean
  canEdit: boolean
  onStartEdit: () => void
  onCancel: () => void
  onSave: () => void
}) {
  const c = metier.caracteristiques
  return (
    <div className="flex-shrink-0 pt-0.5">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'h-11 w-11 rounded-lg flex items-center justify-center flex-shrink-0',
            isEditing ? 'bg-accent/15' : 'icon-box-gold',
          )}
        >
          <Wrench className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          {isEditing ? (
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-heading font-bold tracking-tight truncate">
                {metier.emplacement || metier.nom}
              </h1>
              <Badge className="bg-accent text-accent-foreground flex-shrink-0 gap-1 shadow-sm">
                <Pencil className="h-3 w-3" />
                Mode edition
              </Badge>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-heading font-bold tracking-tight truncate">
                {metier.emplacement || metier.nom}
              </h1>
              <div className="flex gap-1.5 mt-1 flex-wrap">
                <Badge variant="secondary" className="text-xs">
                  {metier.doubleFonture ? 'Double fonture' : 'Simple fonture'}
                </Badge>
                {c.jauge > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    Jauge {c.jauge}
                  </Badge>
                )}
                {c.diametre > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    Ø {c.diametre}&quot;
                  </Badge>
                )}
                <EtatChip etat={metier.etat} />
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
                {isSaving ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                )}
                Enregistrer
              </Button>
            </>
          ) : (
            canEdit && (
              <Button variant="gold" size="sm" onClick={onStartEdit}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Modifier
              </Button>
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
        <Wrench className="h-8 w-8" />
      </div>
      <p className="text-sm">Sélectionnez un métier</p>
    </div>
  )
}

const FONTURE_OPTIONS = [
  { id: 1, primary: 'Simple fonture' },
  { id: 2, primary: 'Double fonture' },
]

function IdentificationCard({
  metier,
  isEditing,
  draft,
  set,
}: {
  metier: Metier
  isEditing: boolean
  draft: Draft | null
  set: (fn: (d: Draft) => Draft) => void
}) {
  return (
    <Card className={cn('card-premium', isEditing && editSectionClass)}>
      <CardHeader className="flex flex-row items-center gap-2 pb-2">
        <Cog className="h-4 w-4 text-accent" />
        <CardTitle className="text-sm font-semibold">Identification</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground">Description</p>
            {isEditing && draft ? (
              <input
                type="text"
                value={draft.description}
                onChange={(e) => set((d) => ({ ...d, description: e.target.value }))}
                placeholder="Marque, modèle…"
                className="w-full h-9 px-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            ) : (
              <p className={cn('text-sm', !metier.description && 'text-muted-foreground italic')}>
                {metier.description || 'Non renseignée'}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground">Fonture</p>
            {isEditing && draft ? (
              <PopoverSelect
                options={FONTURE_OPTIONS}
                value={draft.doubleFonture ? 2 : 1}
                onChange={(id) => set((d) => ({ ...d, doubleFonture: id === 2 }))}
                hideEmpty
                widthClass="w-44"
              />
            ) : (
              <p className="text-sm">{metier.doubleFonture ? 'Double fonture' : 'Simple fonture'}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function RouloirCard({
  metier,
  seuilKg,
  isEditing,
  draft,
  set,
  onFait,
}: {
  metier: Metier
  seuilKg: number
  isEditing: boolean
  draft: Draft | null
  set: (fn: (d: Draft) => Draft) => void
  /** « Effectué ce jour » — absent without the right or in edit mode. */
  onFait?: () => void
}) {
  const r = metier.rouloir
  const spec = etatSpec(r.etat)
  const overshoot = r.produitKg - seuilKg

  return (
    <Card className={cn('card-premium', isEditing && editSectionClass)}>
      <CardHeader className="flex flex-row items-center gap-2 pb-2 space-y-0">
        <Gauge className="h-4 w-4 text-accent" />
        <CardTitle className="text-sm font-semibold">Rouloir</CardTitle>
        <span className="ml-auto flex items-center gap-2">
          <EtatChip etat={r.etat} />
          {onFait && <FaitButton onClick={onFait} />}
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 18rem so the date input and the "Aujourd'hui" shortcut fit side by
            side in edit mode without clipping. */}
        <div className="grid grid-cols-1 sm:grid-cols-[18rem_1fr] gap-3">
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground">Dernière visite le</p>
            {isEditing && draft ? (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={hfsqlDateToInput(draft.rouloirDate)}
                  onChange={(e) =>
                    set((d) => ({ ...d, rouloirDate: inputDateToHfsql(e.target.value) }))
                  }
                  className="h-9 px-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  title="Enregistrer la visite du rouloir à la date du jour — le compteur repart de zéro"
                  onClick={() => set((d) => ({ ...d, rouloirDate: todayHf() }))}
                >
                  <CalendarClock className="h-3.5 w-3.5 mr-1.5" />
                  Aujourd&apos;hui
                </Button>
              </div>
            ) : (
              <p className={cn('text-sm', !r.derniereVisite && 'text-muted-foreground italic')}>
                {r.derniereVisite ? formatHfsqlDate(r.derniereVisite) : 'Jamais'}
                {r.derniereVisite && (
                  <span className="text-xs text-muted-foreground ml-2">
                    {ageLabel(r.derniereVisite)}
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground">Commentaire</p>
            {isEditing && draft ? (
              <textarea
                rows={3}
                value={draft.rouloirCommentaire}
                onChange={(e) => set((d) => ({ ...d, rouloirCommentaire: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-y"
              />
            ) : (
              <p
                className={cn(
                  'text-sm whitespace-pre-wrap',
                  !r.commentaire && 'text-muted-foreground italic',
                )}
              >
                {r.commentaire || 'Aucun commentaire'}
              </p>
            )}
          </div>
        </div>

        {/* The counter. The legacy printed "Prochaine visite dans N Kg" and
            nothing else; the meter makes the interval itself visible. */}
        <div>
          <div className="flex items-baseline justify-between mb-1.5 gap-2">
            <p className="text-[11px] font-medium text-muted-foreground">
              Tricoté depuis la visite
            </p>
            <p className={cn('text-xs font-semibold tabular-nums', spec.text)}>
              {fmtNum(r.produitKg)} / {fmtNum(seuilKg)} Kg
            </p>
          </div>
          <LinearMeter ratio={r.ratio} etat={r.etat} />
          <p className="text-[11px] text-muted-foreground mt-1.5">
            {!r.derniereVisite ? (
              'Aucune visite enregistrée — le compteur ne peut pas être calculé.'
            ) : r.etat === 'due' ? (
              <span className={spec.text}>
                Visite due — {fmtNum(overshoot)} Kg au-delà du seuil. Prochaine visite dans 0 Kg.
              </span>
            ) : (
              <>Prochaine visite dans {fmtNum(r.restantKg)} Kg.</>
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

/** « Effectué ce jour » — the one quick action of an item, outside edit mode. */
function FaitButton({ onClick, compact }: { onClick: () => void; compact?: boolean }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn('h-7 px-2 text-xs', compact && 'w-7 px-0')}
      title="Effectué ce jour"
      onClick={onClick}
    >
      <CalendarCheck className={cn('h-3.5 w-3.5', !compact && 'mr-1.5')} />
      {!compact && 'Effectué ce jour'}
    </Button>
  )
}

function KgDepuis({ kg }: { kg: number | null }) {
  if (kg === null) return <span className="text-muted-foreground">—</span>
  return <span className="tabular-nums">{fmtNum(kg)} Kg</span>
}

// Shared grid of the Entretien and Garniture rows: item · date · kg tricotés ·
// commentaire · action. One template so the two cards line up column for column.
const ITEM_GRID =
  'grid grid-cols-1 md:grid-cols-[12rem_10rem_6.5rem_minmax(0,1fr)_auto] gap-1.5 md:gap-3 md:items-center py-1.5 border-b border-border/60 last:border-b-0'

function ItemHeaderRow() {
  return (
    <div className={cn(ITEM_GRID, 'hidden md:grid py-0 pb-1 text-[11px] font-medium text-muted-foreground')}>
      <span />
      <span>Dernière fois</span>
      <span>Tricoté depuis</span>
      <span>Commentaire</span>
      <span className="w-7" />
    </div>
  )
}

function ItemRow({
  label,
  sub,
  date,
  kgDepuis,
  commentaire,
  isEditing,
  draftDate,
  draftCommentaire,
  onDraftDate,
  onDraftCommentaire,
  onFait,
  onManage,
}: {
  label: string
  sub?: React.ReactNode
  date: string | null
  kgDepuis: number | null
  commentaire: string | null
  isEditing: boolean
  draftDate: string
  draftCommentaire: string
  onDraftDate: (hf: string) => void
  onDraftCommentaire: (v: string) => void
  onFait?: () => void
  onManage?: () => void
}) {
  const age = ageLabel(date)
  return (
    <div className={ITEM_GRID}>
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{label}</p>
        {sub}
      </div>

      {isEditing ? (
        <input
          type="date"
          value={hfsqlDateToInput(draftDate)}
          onChange={(e) => onDraftDate(inputDateToHfsql(e.target.value))}
          className="h-8 px-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        />
      ) : (
        <p className="text-sm tabular-nums">
          {date ? (
            <>
              {formatHfsqlDate(date)}
              {age && <span className="block text-[11px] text-muted-foreground">{age}</span>}
            </>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </p>
      )}

      <p className="text-sm">
        <span className="md:hidden text-[11px] text-muted-foreground mr-1.5">Tricoté depuis</span>
        <KgDepuis kg={kgDepuis} />
      </p>

      {isEditing ? (
        <input
          type="text"
          value={draftCommentaire}
          onChange={(e) => onDraftCommentaire(e.target.value)}
          placeholder="Commentaire"
          className="h-8 px-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        />
      ) : (
        <p
          className={cn('text-sm line-clamp-2', !commentaire && 'text-muted-foreground italic')}
          title={commentaire ?? undefined}
        >
          {commentaire || '—'}
        </p>
      )}

      <div className="flex items-center gap-1 md:justify-end min-w-[1.75rem]">
        {onManage && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground"
            title="Modifier l'entretien (nom, fréquence)"
            onClick={onManage}
          >
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
        )}
        {onFait && <FaitButton onClick={onFait} compact />}
      </div>
    </div>
  )
}

function EntretienCard({
  metier,
  isEditing,
  draft,
  set,
  onFait,
  onManage,
  onAdd,
}: {
  metier: Metier
  isEditing: boolean
  draft: Draft | null
  set: (fn: (d: Draft) => Draft) => void
  onFait?: (item: FaitItem, label: string) => void
  onManage?: (id: number) => void
  onAdd?: () => void
}) {
  const setSlot = (id: number, patch: Partial<{ date: string; commentaire: string }>) =>
    set((d) => ({
      ...d,
      entretiens: {
        ...d.entretiens,
        [id]: { ...(d.entretiens[id] ?? { date: '', commentaire: '' }), ...patch },
      },
    }))

  return (
    <Card className={cn('card-premium', isEditing && editSectionClass)}>
      <CardHeader className="flex flex-row items-center gap-2 pb-2 space-y-0">
        <Fan className="h-4 w-4 text-accent" />
        <CardTitle className="text-sm font-semibold">Entretien</CardTitle>
      </CardHeader>
      <CardContent>
        {metier.entretiens.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-2">Aucun entretien périodique.</p>
        ) : (
          <>
            <ItemHeaderRow />
            {metier.entretiens.map((e) => {
              const spec = etatSpec(e.etat)
              const slot = draft?.entretiens[e.id] ?? { date: '', commentaire: '' }
              return (
                <ItemRow
                  key={e.id}
                  label={e.nom}
                  sub={
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                      Tous les {e.frequenceMois} mois
                      {e.etat !== 'ok' && e.etat !== 'inconnu' && (
                        <span className={cn('font-medium', spec.text)}>· {spec.label}</span>
                      )}
                      {e.etat === 'inconnu' && <span>· jamais fait</span>}
                    </p>
                  }
                  date={e.date}
                  kgDepuis={e.kgDepuis}
                  commentaire={e.commentaire}
                  isEditing={isEditing && !!draft}
                  draftDate={slot.date}
                  draftCommentaire={slot.commentaire}
                  onDraftDate={(hf) => setSlot(e.id, { date: hf })}
                  onDraftCommentaire={(v) => setSlot(e.id, { commentaire: v })}
                  onFait={onFait ? () => onFait(e.id, e.nom) : undefined}
                  onManage={onManage ? () => onManage(e.id) : undefined}
                />
              )
            })}
          </>
        )}
        {onAdd && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 text-accent hover:text-accent hover:bg-accent/10"
            onClick={onAdd}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Ajouter un entretien
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function GarnitureCard({
  metier,
  isEditing,
  draft,
  set,
  onFait,
}: {
  metier: Metier
  isEditing: boolean
  draft: Draft | null
  set: (fn: (d: Draft) => Draft) => void
  onFait?: (item: FaitItem, label: string) => void
}) {
  const setSlot = (key: GarnitureKey, patch: Partial<{ date: string; commentaire: string }>) =>
    set((d) => ({
      ...d,
      garniture: { ...d.garniture, [key]: { ...d.garniture[key], ...patch } },
    }))

  return (
    <Card className={cn('card-premium', isEditing && editSectionClass)}>
      <CardHeader className="flex flex-row items-center gap-2 pb-2 space-y-0">
        <Brush className="h-4 w-4 text-accent" />
        <CardTitle className="text-sm font-semibold">Garniture</CardTitle>
      </CardHeader>
      <CardContent>
        <ItemHeaderRow />
        {GARNITURE_ROWS.map((row) => {
          const slot = metier.garniture[row.key]
          return (
            <ItemRow
              key={row.key}
              label={row.label}
              date={slot.date}
              kgDepuis={slot.kgDepuis}
              commentaire={slot.commentaire}
              isEditing={isEditing && !!draft}
              draftDate={draft?.garniture[row.key].date ?? ''}
              draftCommentaire={draft?.garniture[row.key].commentaire ?? ''}
              onDraftDate={(hf) => setSlot(row.key, { date: hf })}
              onDraftCommentaire={(v) => setSlot(row.key, { commentaire: v })}
              onFait={onFait ? () => onFait(row.key, row.label) : undefined}
            />
          )
        })}
      </CardContent>
    </Card>
  )
}

// ══════════════════════════════════════════════════════
//  The pinned « Atelier » entry — the building's own items
// ══════════════════════════════════════════════════════

function AtelierDetailHeader({ summary }: { summary: AtelierSummary }) {
  return (
    <div className="flex-shrink-0 pt-0.5">
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-lg flex items-center justify-center flex-shrink-0 bg-primary text-primary-foreground">
          <Factory className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-heading font-bold tracking-tight truncate">Atelier</h1>
          <div className="flex gap-1.5 mt-1 flex-wrap">
            <Badge variant="secondary" className="text-xs">
              Entretiens généraux du bâtiment
            </Badge>
            <EtatChip etat={summary.etat} />
          </div>
        </div>
      </div>
      <div className="h-1 w-24 mt-3 rounded-full bg-gradient-to-r from-accent via-accent to-accent/30" />
    </div>
  )
}

/** The atelier's own dated items (portée « atelier »): the building's air
 *  leaks and whatever comes next — tied to no métier. */
function AtelierDetail({
  operations,
  isLoading,
  isError,
  error,
  canEdit,
  onReset,
  onManage,
  onAdd,
}: {
  operations: OperationEntretien[]
  isLoading: boolean
  isError: boolean
  error: string | null
  canEdit: boolean
  onReset: (op: OperationEntretien) => void
  onManage: (id: number) => void
  onAdd: () => void
}) {
  return (
    <div className="flex-1 min-h-0 overflow-auto space-y-4 scrollbar-transparent pr-0.5">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}
      <Card className="card-premium">
        <CardHeader className="flex flex-row items-center gap-2 pb-2 space-y-0">
          <Fan className="h-4 w-4 text-accent" />
          <CardTitle className="text-sm font-semibold">Entretiens de l&apos;atelier</CardTitle>
          <span className="ml-auto text-[11px] text-muted-foreground">
            Pas d&apos;un métier en particulier
          </span>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-accent" />
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-8 text-destructive">
              <AlertCircle className="h-5 w-5 mb-2" />
              <p className="text-xs text-center">Impossible de charger les entretiens.</p>
            </div>
          ) : operations.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-2">
              Aucun entretien d&apos;atelier.
            </p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-3">
              {operations.map((op) => {
                const spec = etatSpec(op.etat)
                return (
                  <div key={op.id} className="rounded-lg border bg-card p-3">
                    <div className="flex items-start gap-3">
                      <RadialMeter
                        ratio={op.ratio}
                        etat={op.etat}
                        center={op.moisEcoules === null ? '—' : `${op.moisEcoules}`}
                        caption={op.moisEcoules === null ? undefined : 'mois'}
                        size={92}
                      />
                      <div className="min-w-0 flex-1 pt-1">
                        <div className="flex items-start gap-1">
                          <p className="font-medium text-sm truncate flex-1">{op.nom}</p>
                          {canEdit && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 -mt-0.5 text-muted-foreground"
                              title="Modifier l'entretien (nom, fréquence)"
                              onClick={() => onManage(op.id)}
                            >
                              <Settings2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                        <EtatChip etat={op.etat} className="mt-1" />
                        <p className="text-[11px] text-muted-foreground mt-1.5">
                          {op.derniereMaintenance
                            ? `Dernière maintenance le ${formatHfsqlDate(op.derniereMaintenance)}`
                            : 'Aucune maintenance enregistrée'}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Tous les {op.frequenceMois} mois
                          {op.ratio !== null && op.ratio > 1 && (
                            <span className={cn('ml-1 font-medium', spec.text)}>
                              · {Math.round(op.ratio * 100)} % de l&apos;intervalle
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    {canEdit && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full mt-2 h-8"
                        onClick={() => onReset(op)}
                      >
                        <CalendarCheck className="h-3.5 w-3.5 mr-1.5" />
                        Effectué ce jour
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          {canEdit && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 text-accent hover:text-accent hover:bg-accent/10"
              onClick={onAdd}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Ajouter un entretien
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ══════════════════════════════════════════════════════
//  Right sidebar — the selected métier only
// ══════════════════════════════════════════════════════

type SidebarTab = 'metier' | 'aiguilles'

function MaintenanceSidebar({
  metier,
  tab,
  onTab,
  isEditing,
  canEdit,
}: {
  metier: Metier
  tab: SidebarTab
  onTab: (t: SidebarTab) => void
  isEditing: boolean
  canEdit: boolean
}) {
  const nbAiguilles = useNbAiguilles(metier.id)
  const tabs: { id: SidebarTab; label: string; icon: typeof Settings2; count?: number | null }[] = [
    { id: 'metier', label: 'Métier', icon: Settings2 },
    { id: 'aiguilles', label: 'Aiguilles', icon: Pin, count: nbAiguilles },
  ]
  return (
    <div className="w-96 flex-shrink-0 flex flex-col gap-3 min-h-0">
      <div className="flex-1 min-h-0 rounded-xl border flex flex-col overflow-hidden bg-zinc-100/80">
        <div className="flex border-b p-1 gap-1 rounded-t-xl bg-zinc-200/50">
          {tabs.map((t) => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onTab(t.id)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md transition-colors',
                  active ? 'bg-accent text-accent-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent/10',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
                {!!t.count && <span className="text-xs tabular-nums opacity-70">{t.count}</span>}
              </button>
            )
          })}
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-transparent">
          {tab === 'metier' ? (
            <MetierTab metier={metier} />
          ) : (
            <AiguillesTab
              metierId={metier.id}
              metierLabel={metier.emplacement || metier.nom}
              isEditing={isEditing}
              canEdit={canEdit}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function SideKV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-border/60 last:border-b-0">
      <span className="text-xs text-muted-foreground flex-shrink-0">{label}</span>
      <span className="text-sm text-right truncate">{value}</span>
    </div>
  )
}

/** Tab « Métier » — machine characteristics. Read-only on purpose: these columns belong
 *  to FEN_Gestion_des_machines, and this route never names them in an UPDATE. */
function MetierTab({ metier }: { metier: Metier }) {
  const c = metier.caracteristiques
  return (
    <div className="rounded-lg border bg-card p-3">
      <SideKV label="Nom" value={metier.nom || '—'} />
      <SideKV label="Emplacement" value={metier.emplacement || '—'} />
      <SideKV label="Fonture" value={metier.doubleFonture ? 'Double' : 'Simple'} />
      <SideKV label="Jauge" value={c.jauge > 0 ? c.jauge : '—'} />
      <SideKV label="Diamètre" value={c.diametre > 0 ? `${c.diametre}"` : '—'} />
      <SideKV
        label="Chutes"
        value={c.nbChutesMax > 0 ? `${fmtNum(c.nbChutes)} / ${fmtNum(c.nbChutesMax)}` : '—'}
      />
      <SideKV label="Vitesse" value={c.vitesse > 0 ? fmtNum(c.vitesse) : '—'} />
      <SideKV label="Elasthanne" value={c.elasthanne ? 'Oui' : 'Non'} />
      <SideKV label="Adresse automate" value={c.adresseAutomate ?? '—'} />
      <SideKV label="Connecté" value={c.connecte ? 'Oui' : 'Non'} />
      <p className="text-[11px] text-muted-foreground italic pt-2">
        Ces caractéristiques se modifient dans la gestion des machines, pas ici.
      </p>
    </div>
  )
}

// ══════════════════════════════════════════════════════
//  Page
// ══════════════════════════════════════════════════════

/** What the « Effectué ce jour » confirmation is about. */
type FaitPending =
  | { kind: 'metier'; item: FaitItem; label: string }
  | { kind: 'atelier'; op: OperationEntretien }

/** The OperationDialog's subject: a new item (with its preset portée) or one to edit. */
type OperationEdit = { mode: 'create'; portee: Portee } | { mode: 'edit'; op: OperationEntretien }

function apiErrorMessage(e: unknown, fallback: string): string {
  const body = (e as { body?: { message?: string } } | null)?.body
  return body?.message ?? fallback
}

export function AtelierMaintenance() {
  const queryClient = useQueryClient()
  const canEdit = useHasPermission('edit_maintenance')

  const [searchQuery, setSearchQuery] = useState('')
  const [dueOnly, setDueOnly] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [writeError, setWriteError] = useState<string | null>(null)
  const [fait, setFait] = useState<FaitPending | null>(null)
  const [opEdit, setOpEdit] = useState<OperationEdit | null>(null)
  const [opError, setOpError] = useState<string | null>(null)
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('metier')

  const { data, isLoading, isError, error } = useQuery<MetiersPayload>({
    queryKey: ['maintenance-trm-metiers'],
    queryFn: () => apiFetch('/maintenance-trm/metiers'),
  })

  const opsQuery = useQuery<{ operations: OperationEntretien[] }>({
    queryKey: ['maintenance-trm-operations'],
    queryFn: () => apiFetch('/maintenance-trm/operations'),
  })
  const allOperations = useMemo(() => opsQuery.data?.operations ?? [], [opsQuery.data])
  const atelierOperations = useMemo(
    () => allOperations.filter((o) => o.portee === 'atelier'),
    [allOperations],
  )

  const metiers = useMemo(() => data?.metiers ?? [], [data])
  const seuilKg = data?.seuilRouloirKg ?? 15000
  const atelierSummary = useMemo<AtelierSummary>(() => {
    const rang: Record<MeterEtat, number> = { due: 3, proche: 2, ok: 1, inconnu: 0 }
    const etat = atelierOperations.reduce<MeterEtat>(
      (worst, o) => (rang[o.etat] > rang[worst] ? o.etat : worst),
      'ok',
    )
    return {
      etat,
      aFaire: atelierOperations.filter((o) => o.etat === 'due').map((o) => o.nom),
      nbEntretiens: atelierOperations.length,
    }
  }, [atelierOperations])

  // The pill counts everything with something due: métiers, and the atelier.
  const dueCount = useMemo(
    () =>
      metiers.filter((m) => m.etat === 'due').length + (atelierSummary.etat === 'due' ? 1 : 0),
    [metiers, atelierSummary],
  )

  // §41.4: an armed pill must not survive its bucket emptying.
  const dueFilterActive = dueOnly && dueCount > 0

  const atelierVisible = useMemo(() => {
    if (dueFilterActive && atelierSummary.etat !== 'due') return false
    const q = searchQuery.trim().toLowerCase()
    return (
      !q ||
      'atelier'.includes(q) ||
      atelierOperations.some((o) => o.nom.toLowerCase().includes(q))
    )
  }, [dueFilterActive, atelierSummary, searchQuery, atelierOperations])

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return metiers.filter((m) => {
      if (dueFilterActive && m.etat !== 'due') return false
      if (!q) return true
      return (
        m.emplacement.toLowerCase().includes(q) ||
        m.nom.toLowerCase().includes(q) ||
        (m.description ?? '').toLowerCase().includes(q)
      )
    })
  }, [metiers, searchQuery, dueFilterActive])

  // The atelier entry is a valid selection while visible, but auto-select
  // lands on the first métier: that is what the screen is mostly used for.
  const selectableIds = useMemo(
    () => [...filtered.map((m) => m.id), ...(atelierVisible ? [ATELIER_ID] : [])],
    [filtered, atelierVisible],
  )
  useAutoSelectFirst({
    rows: selectableIds,
    selectedId,
    getId: (id: number) => id,
    select: setSelectedId,
    // Wait for the métiers: otherwise the atelier, alone in the list for a
    // moment, would be picked first.
    suspended: isEditing || isLoading,
  })
  const atelierSelected = selectedId === ATELIER_ID

  const selected = useMemo(
    () => metiers.find((m) => m.id === selectedId) ?? null,
    [metiers, selectedId],
  )

  // Keep the draft aligned with the selected métier while NOT editing, so
  // entering edit mode always starts from what is on screen.
  useEffect(() => {
    if (!isEditing) setDraft(selected ? emptyDraft(selected) : null)
  }, [selected, isEditing])

  // An entretien added while editing joins the draft as it is on the server,
  // so it neither reads as an unsaved change nor gets dropped on Enregistrer.
  useEffect(() => {
    if (!isEditing || !selected) return
    setDraft((d) => {
      if (!d) return d
      const missing = selected.entretiens.filter((e) => !(e.id in d.entretiens))
      if (missing.length === 0) return d
      const added = Object.fromEntries(
        missing.map((e) => [e.id, { date: e.date ?? '', commentaire: e.commentaire ?? '' }]),
      )
      return { ...d, entretiens: { ...d.entretiens, ...added } }
    })
  }, [selected, isEditing])

  const isDirty = useMemo(() => {
    if (!isEditing || !draft || !selected) return false
    return JSON.stringify(draft) !== JSON.stringify(emptyDraft(selected))
  }, [isEditing, draft, selected])

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!draft || !selected) return
      const body = {
        description: draft.description.trim() || null,
        doubleFonture: draft.doubleFonture,
        rouloir: {
          derniereVisite: draft.rouloirDate || null,
          commentaire: draft.rouloirCommentaire.trim() || null,
        },
        garniture: Object.fromEntries(
          GARNITURE_ROWS.map((r) => [
            r.key,
            {
              date: draft.garniture[r.key].date || null,
              commentaire: draft.garniture[r.key].commentaire.trim() || null,
            },
          ]),
        ),
        entretiens: selected.entretiens.map((e) => ({
          id: e.id,
          date: draft.entretiens[e.id]?.date || null,
          commentaire: draft.entretiens[e.id]?.commentaire.trim() || null,
        })),
      }
      return apiFetch(`/maintenance-trm/metiers/${selected.id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      })
    },
    onSuccess: () => {
      setWriteError(null)
      setIsEditing(false)
      // The counters move with the dates, and the list order follows them —
      // refetch rather than patch the cache.
      queryClient.invalidateQueries({ queryKey: ['maintenance-trm-metiers'] })
    },
    onError: (e: Error) => {
      setWriteError(
        e.message.includes('409')
          ? "Ce métier est archivé : sa fiche de maintenance n'est plus modifiable."
          : "L'enregistrement a échoué. Réessayez.",
      )
    },
  })

  const faitMut = useMutation({
    mutationFn: async (p: FaitPending) => {
      if (p.kind === 'atelier') {
        return apiFetch(`/maintenance-trm/operations/${p.op.id}/reset`, { method: 'POST' })
      }
      if (!selected) return
      return apiFetch(`/maintenance-trm/metiers/${selected.id}/fait`, {
        method: 'POST',
        body: JSON.stringify({ item: p.item }),
      })
    },
    onSuccess: (_payload, p) => {
      setFait(null)
      setWriteError(null)
      queryClient.invalidateQueries({
        queryKey: [p.kind === 'atelier' ? 'maintenance-trm-operations' : 'maintenance-trm-metiers'],
      })
    },
    onError: (e) => {
      setFait(null)
      setWriteError(apiErrorMessage(e, "L'enregistrement a échoué. Réessayez."))
    },
  })

  const opSaveMut = useMutation({
    mutationFn: async (d: OperationDraft) => {
      if (!opEdit) return
      return opEdit.mode === 'create'
        ? apiFetch('/maintenance-trm/operations', { method: 'POST', body: JSON.stringify(d) })
        : apiFetch(`/maintenance-trm/operations/${opEdit.op.id}`, {
            method: 'PUT',
            body: JSON.stringify({ nom: d.nom, frequenceMois: d.frequenceMois }),
          })
    },
    onSuccess: () => {
      setOpEdit(null)
      queryClient.invalidateQueries({ queryKey: ['maintenance-trm-operations'] })
      queryClient.invalidateQueries({ queryKey: ['maintenance-trm-metiers'] })
    },
    onError: (e) => setOpError(apiErrorMessage(e, "L'enregistrement a échoué. Réessayez.")),
  })

  const opDeleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/maintenance-trm/operations/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setOpEdit(null)
      queryClient.invalidateQueries({ queryKey: ['maintenance-trm-operations'] })
      queryClient.invalidateQueries({ queryKey: ['maintenance-trm-metiers'] })
    },
    onError: (e) => setOpError(apiErrorMessage(e, 'La suppression a échoué. Réessayez.')),
  })

  const guard = useUnsavedGuard({
    isDirty,
    save: async () => {
      await saveMut.mutateAsync()
    },
    onDiscard: () => {
      setIsEditing(false)
      setDraft(selected ? emptyDraft(selected) : null)
    },
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

  const startEdit = useCallback(() => {
    if (!selected) return
    setDraft(emptyDraft(selected))
    setWriteError(null)
    setIsEditing(true)
  }, [selected])

  const set = useCallback((fn: (d: Draft) => Draft) => {
    setDraft((cur) => (cur ? fn(cur) : cur))
  }, [])

  const openCreate = (portee: Portee) => {
    setOpError(null)
    setOpEdit({ mode: 'create', portee })
  }
  const openManage = (id: number) => {
    const op = allOperations.find((o) => o.id === id)
    if (!op) return
    setOpError(null)
    setOpEdit({ mode: 'edit', op })
  }

  // Quick actions exist outside edit mode only: a date typed in the draft and
  // a « done today » written behind it would fight on Enregistrer.
  const quick = canEdit && !isEditing
  const onFaitMetier = quick
    ? (item: FaitItem, label: string) => setFait({ kind: 'metier', item, label })
    : undefined

  const opInitial = useMemo<OperationDraft>(
    () =>
      opEdit?.mode === 'edit'
        ? { nom: opEdit.op.nom, frequenceMois: opEdit.op.frequenceMois, portee: opEdit.op.portee }
        : { nom: '', frequenceMois: 3, portee: opEdit?.portee ?? 'metier' },
    [opEdit],
  )

  const faitDescription = !fait
    ? undefined
    : fait.kind === 'atelier'
      ? `Confirmez-vous que la maintenance des ${fait.op.nom} de l'atelier a été effectuée ce jour ?`
      : `Confirmez-vous que « ${fait.label} » a été effectué ce jour sur le métier ${
          selected?.emplacement || selected?.nom || ''
        } ? Le compteur de kilos repart de zéro.`

  return (
    <>
      <MasterDetailLayout
        list={
          <MetierList
            rows={filtered}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            selectedId={selectedId}
            onSelect={handleSelect}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            dueOnly={dueFilterActive}
            dueCount={dueCount}
            onToggleDue={() => guard.guardAction(() => setDueOnly((v) => !v))}
            atelier={atelierVisible ? atelierSummary : null}
          />
        }
        detailHeader={
          atelierSelected ? (
            <AtelierDetailHeader summary={atelierSummary} />
          ) : selected ? (
            <DetailHeader
              metier={selected}
              isEditing={isEditing}
              isSaving={saveMut.isPending}
              canEdit={canEdit}
              onStartEdit={startEdit}
              onCancel={() =>
                guard.guardAction(() => {
                  setIsEditing(false)
                  setWriteError(null)
                })
              }
              onSave={() => saveMut.mutate()}
            />
          ) : null
        }
        detail={
          atelierSelected ? (
            <AtelierDetail
              operations={atelierOperations}
              isLoading={opsQuery.isLoading}
              isError={opsQuery.isError}
              error={writeError}
              canEdit={canEdit}
              onReset={(op) => setFait({ kind: 'atelier', op })}
              onManage={openManage}
              onAdd={() => openCreate('atelier')}
            />
          ) : !selected ? (
            <EmptyDetail />
          ) : (
            <div className="flex-1 min-h-0 overflow-auto space-y-4 scrollbar-transparent pr-0.5">
              {writeError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <p className="text-sm">{writeError}</p>
                </div>
              )}
              <IdentificationCard
                metier={selected}
                isEditing={isEditing}
                draft={draft}
                set={set}
              />
              <RouloirCard
                metier={selected}
                seuilKg={seuilKg}
                isEditing={isEditing}
                draft={draft}
                set={set}
                onFait={onFaitMetier ? () => onFaitMetier('rouloir', 'Visite du rouloir') : undefined}
              />
              <EntretienCard
                metier={selected}
                isEditing={isEditing}
                draft={draft}
                set={set}
                onFait={onFaitMetier}
                onManage={quick ? openManage : undefined}
                onAdd={canEdit && isEditing ? () => openCreate('metier') : undefined}
              />
              <GarnitureCard
                metier={selected}
                isEditing={isEditing}
                draft={draft}
                set={set}
                onFait={onFaitMetier}
              />
            </div>
          )
        }
        sidebar={
          selected ? (
            <MaintenanceSidebar
              metier={selected}
              tab={sidebarTab}
              onTab={setSidebarTab}
              isEditing={isEditing}
              canEdit={canEdit}
            />
          ) : null
        }
        sidebarTitle="Métier"
        hasSelection={selectedId !== null}
        onBack={() =>
          guard.guardAction(() => {
            setIsEditing(false)
            setSelectedId(null)
          })
        }
      />

      <ConfirmDialog
        open={fait !== null}
        variant="default"
        title="Entretien effectué"
        description={faitDescription}
        confirmLabel="Confirmer"
        isPending={faitMut.isPending}
        onCancel={() => setFait(null)}
        onConfirm={() => {
          if (fait) faitMut.mutate(fait)
        }}
      />

      <OperationDialog
        open={opEdit !== null}
        onOpenChange={(o) => !o && setOpEdit(null)}
        initial={opInitial}
        editing={opEdit?.mode === 'edit'}
        saving={opSaveMut.isPending || opDeleteMut.isPending}
        error={opError}
        onSave={(d) => {
          setOpError(null)
          opSaveMut.mutate(d)
        }}
        onDelete={
          opEdit?.mode === 'edit' ? () => opDeleteMut.mutate(opEdit.op.id) : undefined
        }
      />

      <UnsavedChangesDialog
        open={guard.showDialog}
        onAction={guard.handleAction}
        isSaving={guard.isSaving}
      />
    </>
  )
}
