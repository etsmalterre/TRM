// Atelier › Maintenance — port of the legacy FI_Maintenance.wdw (Tricotage
// Malterre mode). Layout: Fiche (MasterDetailLayout, mps_designer §4–§9).
//
// Left  = the 30 active métiers, most urgent first, each with its rouloir
//         counter ("Rouloir dans N Kgs" — the legacy string) and a §41 liseré.
// Center= the maintenance fiche: Identification (description + fonture),
//         Rouloir (last visit, comment, the 15 000 Kg counter) and Garniture
//         (the legacy's six date + comment pairs, in the legacy's order).
// Right = Entretien (the three atelier-wide operations + "Effectué ce jour"),
//         Métier (read-only characteristics) and Rouloir (the OFs the counter
//         is made of).
//
// API: /api/maintenance-trm (ETM shared API — routes/maintenance-trm.ts holds
// the data rules and the recovered legacy spec, including why the rouloir
// threshold is 15 000 Kg and how that was measured rather than guessed).
//
// Deliberate deltas vs the legacy window (house convention: state them):
//  - The red/green padlock (IMG_Verrou) becomes the standard gold Modifier edit
//    mode with the §28 unsaved-changes guard, like Gestion des OF.
//  - The rainbow needle dials become single-hue meters with a status word —
//    see the header of components/maintenance/MaintenanceGauge.tsx for why.
//  - The three gauges are rendered from `operation_maintenance` rather than
//    hard-wired, so a fourth operation added in the base shows up on its own.
//  - The garniture dates gain a derived "il y a N ans" caption. No colour on
//    them: the base holds no frequency for garniture work, so an alert
//    threshold would be invented data.
//  - New: the Rouloir sidebar tab lists the OFs behind the counter. The legacy
//    printed the number with no way to check it.
//  - No Imprimer / Envoyer un email (§6.1): the legacy window produces no
//    document, and a placeholder pair would be noise.

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ComponentType } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  Brush,
  CalendarClock,
  ClipboardList,
  Cog,
  Gauge,
  Loader2,
  Pencil,
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

interface OperationEntretien {
  id: number
  nom: string
  derniereMaintenance: string | null
  frequenceMois: number
  moisEcoules: number | null
  ratio: number | null
  etat: MeterEtat
}

interface ProductionPayload {
  derniereVisite: string | null
  totalKg: number
  seuilRouloirKg: number
  ofs: { id: number; dateCreation: string | null; quantiteKg: number; reference: string | null }[]
}

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
              title="Visite du rouloir à faire"
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
            const etat = m.rouloir.etat
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
                  <LinearMeter ratio={m.rouloir.ratio} etat={etat} className="h-1.5 flex-1" />
                  {/* The legacy string, kept verbatim. */}
                  <p
                    className={cn(
                      'text-[11px] tabular-nums flex-shrink-0',
                      etat === 'ok' ? 'text-muted-foreground' : etatSpec(etat).text,
                    )}
                  >
                    Rouloir dans {fmtNum(m.rouloir.restantKg)} Kgs
                  </p>
                </div>
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
                <EtatChip etat={metier.rouloir.etat} />
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
}: {
  metier: Metier
  seuilKg: number
  isEditing: boolean
  draft: Draft | null
  set: (fn: (d: Draft) => Draft) => void
}) {
  const r = metier.rouloir
  const spec = etatSpec(r.etat)
  const overshoot = r.produitKg - seuilKg

  return (
    <Card className={cn('card-premium', isEditing && editSectionClass)}>
      <CardHeader className="flex flex-row items-center gap-2 pb-2">
        <Gauge className="h-4 w-4 text-accent" />
        <CardTitle className="text-sm font-semibold">Rouloir</CardTitle>
        <span className="ml-auto">
          <EtatChip etat={r.etat} />
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
              Production depuis la visite
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

function GarnitureCard({
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
        <Brush className="h-4 w-4 text-accent" />
        <CardTitle className="text-sm font-semibold">Garniture</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {GARNITURE_ROWS.map((row) => {
          const slot = metier.garniture[row.key]
          const age = ageLabel(slot.date)
          return (
            <div
              key={row.key}
              className="grid grid-cols-1 md:grid-cols-[13rem_9.5rem_minmax(0,1fr)] gap-2 md:gap-3 md:items-center py-1.5 border-b border-border/60 last:border-b-0"
            >
              <p className="text-sm font-medium">{row.label}</p>

              {isEditing && draft ? (
                <input
                  type="date"
                  value={hfsqlDateToInput(draft.garniture[row.key].date)}
                  onChange={(e) =>
                    set((d) => ({
                      ...d,
                      garniture: {
                        ...d.garniture,
                        [row.key]: {
                          ...d.garniture[row.key],
                          date: inputDateToHfsql(e.target.value),
                        },
                      },
                    }))
                  }
                  className="h-8 px-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              ) : (
                <p className="text-sm tabular-nums">
                  {slot.date ? (
                    <>
                      {formatHfsqlDate(slot.date)}
                      {age && <span className="text-xs text-muted-foreground ml-2">{age}</span>}
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </p>
              )}

              {isEditing && draft ? (
                <input
                  type="text"
                  value={draft.garniture[row.key].commentaire}
                  onChange={(e) =>
                    set((d) => ({
                      ...d,
                      garniture: {
                        ...d.garniture,
                        [row.key]: { ...d.garniture[row.key], commentaire: e.target.value },
                      },
                    }))
                  }
                  placeholder="Commentaire"
                  className="h-8 px-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              ) : (
                <p
                  className={cn(
                    'text-sm line-clamp-2',
                    !slot.commentaire && 'text-muted-foreground italic',
                  )}
                  title={slot.commentaire ?? undefined}
                >
                  {slot.commentaire || '—'}
                </p>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

// ══════════════════════════════════════════════════════
//  Right sidebar
// ══════════════════════════════════════════════════════

type SidebarTab = 'entretien' | 'metier' | 'rouloir'

function MaintenanceSidebar({
  metier,
  seuilKg,
  canEdit,
  isEditing,
}: {
  metier: Metier
  seuilKg: number
  canEdit: boolean
  isEditing: boolean
}) {
  const [tab, setTab] = useState<SidebarTab>('entretien')

  const tabs: { key: SidebarTab; label: string; icon: ComponentType<{ className?: string }> }[] = [
    { key: 'entretien', label: 'Entretien', icon: Gauge },
    { key: 'metier', label: 'Métier', icon: Settings2 },
    { key: 'rouloir', label: 'Rouloir', icon: ClipboardList },
  ]

  return (
    <div className="w-96 flex-shrink-0 flex flex-col gap-3 min-h-0">
      <div className="flex-1 min-h-0 rounded-xl border flex flex-col overflow-hidden bg-zinc-100/80">
        <div className="flex border-b p-1 gap-1 rounded-t-xl bg-zinc-200/50">
          {tabs.map((t) => {
            const Icon = t.icon
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                title={t.label}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1 px-1.5 py-2 text-xs font-medium rounded-md transition-colors',
                  tab === t.key
                    ? 'bg-accent text-accent-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-accent/10',
                )}
              >
                <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">{t.label}</span>
              </button>
            )
          })}
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-transparent">
          {tab === 'entretien' && <EntretienTab canEdit={canEdit && !isEditing} />}
          {tab === 'metier' && <MetierTab metier={metier} />}
          {tab === 'rouloir' && <RouloirTab metier={metier} seuilKg={seuilKg} />}
        </div>
      </div>
    </div>
  )
}

/** Tab 1 — the atelier-wide operations (operation_maintenance). Not per-métier:
 *  these are the workshop's ventilateurs, couronnes and air leaks, which is
 *  exactly where the legacy put them (bottom of the left panel, always on). */
function EntretienTab({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient()
  const [confirmId, setConfirmId] = useState<number | null>(null)

  const { data, isLoading, isError } = useQuery<{ operations: OperationEntretien[] }>({
    queryKey: ['maintenance-trm-operations'],
    queryFn: () => apiFetch('/maintenance-trm/operations'),
  })

  const resetMut = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/maintenance-trm/operations/${id}/reset`, { method: 'POST' }),
    onSuccess: (payload: { operations: OperationEntretien[] }) => {
      queryClient.setQueryData(['maintenance-trm-operations'], payload)
      setConfirmId(null)
    },
    onError: () => setConfirmId(null),
  })

  const operations = data?.operations ?? []
  const pending = operations.find((o) => o.id === confirmId)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-accent" />
      </div>
    )
  }
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-destructive">
        <AlertCircle className="h-5 w-5 mb-2" />
        <p className="text-xs text-center">Impossible de charger les entretiens.</p>
      </div>
    )
  }

  return (
    <>
      <p className="text-[11px] text-muted-foreground px-0.5 pb-1">
        Entretiens de l&apos;atelier — communs à tous les métiers.
      </p>

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
                <p className="font-medium text-sm truncate">{op.nom}</p>
                <EtatChip etat={op.etat} className="mt-1" />
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  {/* The legacy's own two labels. */}
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
                onClick={() => setConfirmId(op.id)}
                disabled={resetMut.isPending}
              >
                <CalendarClock className="h-3.5 w-3.5 mr-1.5" />
                Effectué ce jour
              </Button>
            )}
          </div>
        )
      })}

      <ConfirmDialog
        open={pending !== undefined}
        variant="default"
        title="Entretien effectué"
        /* The legacy confirmation sentence, kept verbatim. */
        description={
          pending
            ? `Confirmez-vous que la maintenance des ${pending.nom} a été effectué ce jour ?`
            : undefined
        }
        confirmLabel="Confirmer"
        isPending={resetMut.isPending}
        onCancel={() => setConfirmId(null)}
        onConfirm={() => {
          if (confirmId !== null) resetMut.mutate(confirmId)
        }}
      />
    </>
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

/** Tab 2 — machine characteristics. Read-only on purpose: these columns belong
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

/** Tab 3 — the OFs the rouloir counter is made of. New vs the legacy: it turns
 *  "Rouloir dans 610 Kgs" from an assertion into something checkable. */
function RouloirTab({ metier, seuilKg }: { metier: Metier; seuilKg: number }) {
  const { data, isLoading, isError } = useQuery<ProductionPayload>({
    queryKey: ['maintenance-trm-production', metier.id],
    queryFn: () => apiFetch(`/maintenance-trm/metiers/${metier.id}/production`),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-accent" />
      </div>
    )
  }
  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-destructive">
        <AlertCircle className="h-5 w-5 mb-2" />
        <p className="text-xs text-center">Impossible de charger la production.</p>
      </div>
    )
  }

  if (!data.derniereVisite) {
    return (
      <p className="text-xs text-muted-foreground italic py-6 text-center">
        Aucune visite du rouloir enregistrée : le compteur n&apos;a pas de point de départ.
      </p>
    )
  }

  return (
    <>
      <p className="text-[11px] text-muted-foreground px-0.5 pb-1">
        OF terminés depuis le {formatHfsqlDate(data.derniereVisite)} — c&apos;est ce que compte le
        seuil de {fmtNum(seuilKg)} Kg.
      </p>

      {data.ofs.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-6 text-center">
          Aucun OF terminé depuis la dernière visite.
        </p>
      ) : (
        <>
          {data.ofs.map((o) => (
            <div key={o.id} className="rounded-lg border bg-card px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-medium text-sm">OF {o.id}</p>
                <p className="text-sm tabular-nums flex-shrink-0">{fmtNum(o.quantiteKg, 1)} Kg</p>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[11px] text-muted-foreground truncate">{o.reference ?? '—'}</p>
                <p className="text-[11px] text-muted-foreground flex-shrink-0">
                  {o.dateCreation ? formatHfsqlDate(o.dateCreation) : '—'}
                </p>
              </div>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-2 pt-2 px-1 border-t">
            <p className="text-xs font-medium">
              {data.ofs.length} OF{data.ofs.length > 1 ? 's' : ''}
            </p>
            <p className="text-sm font-semibold tabular-nums">{fmtNum(data.totalKg, 1)} Kg</p>
          </div>
        </>
      )}
    </>
  )
}

// ══════════════════════════════════════════════════════
//  Page
// ══════════════════════════════════════════════════════

export function AtelierMaintenance() {
  const queryClient = useQueryClient()
  const canEdit = useHasPermission('edit_maintenance')

  const [searchQuery, setSearchQuery] = useState('')
  const [dueOnly, setDueOnly] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [writeError, setWriteError] = useState<string | null>(null)

  const { data, isLoading, isError, error } = useQuery<MetiersPayload>({
    queryKey: ['maintenance-trm-metiers'],
    queryFn: () => apiFetch('/maintenance-trm/metiers'),
  })

  const metiers = useMemo(() => data?.metiers ?? [], [data])
  const seuilKg = data?.seuilRouloirKg ?? 15000
  const dueCount = useMemo(() => metiers.filter((m) => m.rouloir.etat === 'due').length, [metiers])

  // §41.4: an armed pill must not survive its bucket emptying.
  const dueFilterActive = dueOnly && dueCount > 0

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return metiers.filter((m) => {
      if (dueFilterActive && m.rouloir.etat !== 'due') return false
      if (!q) return true
      return (
        m.emplacement.toLowerCase().includes(q) ||
        m.nom.toLowerCase().includes(q) ||
        (m.description ?? '').toLowerCase().includes(q)
      )
    })
  }, [metiers, searchQuery, dueFilterActive])

  useAutoSelectFirst({
    rows: filtered,
    selectedId,
    getId: (m: Metier) => m.id,
    select: setSelectedId,
    suspended: isEditing,
  })

  const selected = useMemo(
    () => metiers.find((m) => m.id === selectedId) ?? null,
    [metiers, selectedId],
  )

  // Keep the draft aligned with the selected métier while NOT editing, so
  // entering edit mode always starts from what is on screen.
  useEffect(() => {
    if (!isEditing) setDraft(selected ? emptyDraft(selected) : null)
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
      }
      return apiFetch(`/maintenance-trm/metiers/${selected.id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      })
    },
    onSuccess: () => {
      setWriteError(null)
      setIsEditing(false)
      // The rouloir counter moves with the visit date, and the list order
      // follows the counter — refetch rather than patch the cache.
      queryClient.invalidateQueries({ queryKey: ['maintenance-trm-metiers'] })
      if (selectedId !== null) {
        queryClient.invalidateQueries({ queryKey: ['maintenance-trm-production', selectedId] })
      }
    },
    onError: (e: Error) => {
      setWriteError(
        e.message.includes('409')
          ? "Ce métier est archivé : sa fiche de maintenance n'est plus modifiable."
          : "L'enregistrement a échoué. Réessayez.",
      )
    },
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
          />
        }
        detailHeader={
          selected ? (
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
              />
              <GarnitureCard metier={selected} isEditing={isEditing} draft={draft} set={set} />
            </div>
          )
        }
        sidebar={
          selected ? (
            <MaintenanceSidebar
              metier={selected}
              seuilKg={seuilKg}
              canEdit={canEdit}
              isEditing={isEditing}
            />
          ) : null
        }
        sidebarTitle="Entretien"
        hasSelection={selectedId !== null}
        onBack={() =>
          guard.guardAction(() => {
            setIsEditing(false)
            setSelectedId(null)
          })
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
