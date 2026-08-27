// Production › Gestion des OF — port of the legacy FEN_Gestion_des_OF.wdw
// (Tricotage Malterre mode). Layout: Fiche (MasterDetailLayout, mps_designer
// §4–§9) with a §29.4 multi-state status pill under the sidebar tabs.
//
// Left list = the OF queue (En cours / Attente / Terminés), one card per OF
// with its métier badge; waiting OFs reorder within their métier's queue
// (legacy ▲▼ arrows → hover chevrons on the card). Center = the OF form
// (métier, quantités, options visitage, consigne, tables Tricoter/Incorporer,
// commande liée + Réalisable). Right = the legacy 5-tab panel: Observations /
// Production / Visitage / Qualité / Performance.
//
// API: /api/of-trm (ETM shared API — see routes/of-trm.ts for the data rules).
//
// Deliberate deltas vs the legacy window (noted per the house convention):
//  - The red/green padlock (legacy edit-unlock) is the standard gold Modifier
//    edit mode with the §28 unsaved-changes guard.
//  - État (Attente / En cours / Terminé) lives in the §29 status pill below
//    the sidebar, not as header chrome; Activer / Terminer are its transitions.
//  - The ▶ play glyph on active list cards is replaced by a progression bar.
//  - The Visitage dropdown labels come from the legacy combo (screenshot
//    2026-08-24): 1 = "2 premières pièces et toutes les 3 pièces",
//    2 = "Toutes les pièces"; the 20 pre-2021 rows at 0 display "—".
//  - Per-piece % (Production tab) is an estimation — the legacy formula is in
//    PCS-compressed code; the API flags the payload `approx` and the UI says so.
//  - Observations can be added in view mode too (the workshop adds from
//    terminals; the bureau shouldn't need edit mode for a message).
//  - The legacy ETAT_OF print is not ported yet — Imprimer opens the §18
//    placeholder dialog.
//  - The center body is a two-column grid above ~780px of PANEL width
//    (measured, not a `lg:` viewport gate — see OfDetailBody) and its cards
//    run on tighter paddings than the §7 default. Both exist so a whole OF —
//    settings, consigne, commande, composition — fits one screen without a
//    scroll: the fiche is read at the machine, and a régleur should not have
//    to scroll to learn which lots feed the run he is about to start.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity, AlertCircle, Award, Bell, Check, CheckCircle2, ChevronDown,
  ChevronUp, ClipboardList, Clock, Eye, Factory, Info, Layers, Loader2,
  MessageSquare, Pencil, Plus, Printer, RefreshCw, Save, Search, Trash2, X,
} from 'lucide-react'
import { MasterDetailLayout } from '@/components/layout/MasterDetailLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  BonnetierAvatar,
  EventTimeline,
  fmtEventDateTime as fmtDateTime,
} from '@/components/shared/PieceEvents'
import { PopoverSelect, SearchableCombobox, type PopoverSelectOption } from '@/components/ui/popover-select'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { UnsavedChangesDialog } from '@/components/shared/UnsavedChangesDialog'
import { TmRollIcon } from '@/components/icons/TmRollIcon'
import { useHasPermission } from '@/contexts/PermissionsContext'
import { CreateOfDialog } from '@/components/of/CreateOfDialog'
import { AddFilButton, AddIncorporeButton, nextDraftKey, type FilPair, type LotLookup } from '@/components/of/FilPickers'
import { HorsRefBadge } from '@/components/of/HorsRefBadge'
import { ConsigneCallout } from '@/components/of/ConsigneCallout'
import { useAutoSelectFirst } from '@/hooks/useAutoSelectFirst'
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard'
import { useElementSize } from '@/hooks/useElementSize'
import { apiFetch, API_URL } from '@/lib/api'
import { fmtNum } from '@/lib/format'
import { formatHfsqlDate } from '@/lib/dates'
import { niceScale } from '@/lib/chart-scale'
import { cn } from '@/lib/utils'

// ── Types (API payloads) ───────────────────────────────

type StatusFilter = 'encours' | 'attente' | 'termine'

interface OfListRow {
  id: number
  IDmachine: number
  machine: string
  ref_label: string
  contexture: string
  coloris_label: string
  client_nom: string
  commande_numero: number
  quantite: number
  realise: number | null
  progression_pct: number | null
  priorite: number
  prioritaire: number
  auto_activation: number
  sonneter: number
  est_actif: number
  est_termine: number
  date_creation: string | null
}

interface CompositionRow {
  id: number
  IDref_fil: number
  IDcolori_fil: number
  IDstock_fil: number
  ref_label: string
  coloris_label: string
  pourcentage: number
  lot: string
  lot_stock: number
  pair_stock: number
  /** This yarn is knitted by the run but absent from the reference's own
   *  `composition_ecru` — a deliberate variation (usually to burn internal
   *  stock on a run the customer won't notice). The OF froze its composition,
   *  so the fact survives; this is what makes it visible six months later. */
  hors_ref: boolean
}

interface IncorporeRow {
  id: number
  IDstock_fil: number
  lot: string
  ref_label: string
  coloris_label: string
  poids: number
}

interface OfDetail {
  id: number
  quantite: number
  poids_piece: number
  nb_pieces: number
  visitage: number
  nettoyage: number
  finir_fil: number
  ouvert_visiteuse: number
  maille_ouverture: number
  sonneter: number
  auto_activation: number
  prioritaire: number
  priorite: number
  est_actif: number
  est_termine: number
  vitesse: number
  observations: string
  date_creation: string | null
  demarrage_prod: string | null
  arret_prod: string | null
  IDmachine: number
  machine: { id: number; nom: string; jauge: number; diametre: number } | null
  IDref_ecru: number
  IDcolori_ecru: number
  ref_label: string
  ref_designation: string
  contexture: string
  coloris_label: string
  composition: CompositionRow[]
  incorpore: IncorporeRow[]
  compatibles: string[]
  commande: {
    IDcommande_client: number
    IDligne_commande_client: number
    numero: number
    client_nom: string
    quantite: number
  } | null
  realise: number
  realisable: number
  has_production: boolean
}

interface MachineLookup { id: number; nom: string; jauge: number; diametre: number; emplacement: string; archive: number }


interface ObservationRow { id: number; observation: string; IDbonnetier: number; bonnetier: string; date: string | null }

interface ProductionPiece {
  id: number
  numero: number
  poids: number
  date_debut: string | null
  date_fin: string | null
  minutes: number | null
  pct: number | null
  visite: boolean
}
interface ProductionPayload { pieces: ProductionPiece[]; produites: number; non_visitees: number; approx: boolean }

interface PieceEvent {
  id: number
  evenement: string
  observation: string
  appareil: string
  IDbonnetier: number
  bonnetier: string
  date: string | null
}

interface DefautLite { IDdefaut_qualite: number; description: string; type_defaut: string; taille_cm: number; nombre: number }

interface VisitageRoll {
  id: number
  numero: string
  num_piece_OF: number
  poids: number
  second_choix: number
  visiteur: string
  observations: string
  date_saisie: string | null
  expedie: boolean
  defects: DefautLite[]
}
interface VisitagePayload { pieces: VisitageRoll[]; total_kg: number; second_choix_kg: number }

interface QualitePayload {
  total_kg: number
  second_choix_pct_poids: number
  second_choix_pct_nb: number
  second_choix_kg: number
  pie: Array<{ label: string; value: number }>
  tranches: Array<{ kg_max: number; continue_cm: number; ponctuel: number }>
  nb_defauts: number
}

interface PerformancePayload {
  pieces: Array<{ numero: number; arrets: number }>
  arrets_par_piece: number | null
  total_arrets: number
  covered: boolean
}

interface LigneLookup {
  id: number
  IDcommande_client: number
  commande_numero: number
  client_nom: string
  IDreference: number
  IDcolori: number
  ref_label: string
  contexture: string
  poids_piece_defaut: number
  coloris_label: string
  quantite: number
  couvert: number
  restant: number
}

interface CompositionSeedComponent {
  IDref_fil: number
  IDcolori_fil: number
  pourcentage: number
  ref_label: string
  coloris_label: string
  lots: LotLookup[]
  defaultLot: number
}
interface CompositionSeed { components: CompositionSeedComponent[]; compatibles: Array<{ id: number; nom: string }> }

// ── Shared styling / constants ─────────────────────────

const inputClass = 'w-full h-8 px-2.5 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring'
const editSectionClass = 'border-l-4 border-l-accent/70 bg-accent/[0.03]'

// Tighter than the §7 default (`p-6` / `p-6 pt-0`): five stacked sections at
// full card padding cost ~100px of pure gutter, which was the difference
// between the fiche fitting a 1080p screen and not. Applied to every card of
// this body so the density reads as one deliberate choice, not a stray card.
const cardHeaderClass = 'flex flex-row items-center gap-2 px-4 pt-3.5 pb-2'
const cardContentClass = 'px-4 pb-3.5'

/** The legacy Visitage combo captions (recovered from the live screen —
 *  value 0 exists only on 20 pre-2021 migrated rows and is not offered). */
const VISITAGE_OPTIONS: PopoverSelectOption[] = [
  { id: 1, primary: '2 premières pièces et toutes les 3 pièces' },
  { id: 2, primary: 'Toutes les pièces' },
]

type OfEtat = 'attente' | 'encours' | 'termine'

function ofEtat(row: { est_actif: number; est_termine: number }): OfEtat {
  if (row.est_termine === 1) return 'termine'
  return row.est_actif === 1 ? 'encours' : 'attente'
}

const ETAT_META: Record<OfEtat, {
  label: string
  icon: ComponentType<{ className?: string }>
  solid: string
  cardBorder: string
}> = {
  attente: { label: 'En attente', icon: Clock, solid: 'bg-amber-500 border-amber-500', cardBorder: 'border-l-amber-400/60' },
  encours: { label: 'En cours', icon: Factory, solid: 'bg-primary border-primary', cardBorder: 'border-l-primary/60' },
  termine: { label: 'Terminé', icon: CheckCircle2, solid: 'bg-success border-success', cardBorder: 'border-l-border' },
}

function parseNum(v: string): number {
  const x = parseFloat(v.replace(',', '.'))
  return Number.isFinite(x) ? x : 0
}

// ── Compact table (mirror of ClientsCommandes' PanelTable) ──

function PanelTable<T extends { id: number }>({
  loading, rows, columns, emptyLabel, emptyIcon: EmptyIcon, onRowClick, selectedId, rowClassName,
}: {
  loading: boolean
  rows: T[]
  columns: { key: string; label: string; align: 'left' | 'right'; render: (r: T) => ReactNode }[]
  emptyLabel: string
  emptyIcon: ComponentType<{ className?: string }>
  onRowClick?: (r: T) => void
  selectedId?: number | null
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
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={cn(
                'border-b border-border/40 last:border-0',
                onRowClick ? 'cursor-pointer hover:bg-accent/10' : 'hover:bg-accent/5',
                selectedId === r.id && 'bg-accent/10',
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

// ── Hand-rolled SVG charts (dataviz recipes from the ETM dashboard) ──

/** Single-series line chart drawn at real pixel size (never a scaled viewBox). */
function MiniLineChart({
  values, xLabels, color, unit, height = 160,
}: {
  values: number[]
  xLabels: (i: number) => string
  color: string
  unit: string
  height?: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  const [plotRef, plot] = useElementSize<HTMLDivElement>()
  const W = plot.w
  const H = height
  const PAD = { top: 8, right: 8, bottom: 18, left: 34 }
  const scale = useMemo(() => niceScale(0, Math.max(0, ...values)), [values])
  const innerW = Math.max(0, W - PAD.left - PAD.right)
  const innerH = Math.max(0, H - PAD.top - PAD.bottom)
  const span = scale.hi - scale.lo || 1
  const x = (i: number) => PAD.left + (values.length > 1 ? (innerW * i) / (values.length - 1) : innerW / 2)
  const y = (v: number) => PAD.top + innerH - (innerH * (v - scale.lo)) / span
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ')

  return (
    <div>
      <div ref={plotRef} style={{ height: H }}>
        {W > 0 && values.length > 0 && (
          <svg width={W} height={H} className="block" onMouseLeave={() => setHover(null)}>
            {scale.ticks.map((t) => (
              <g key={t}>
                <line
                  x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)}
                  className="text-border" stroke="currentColor" strokeWidth={1}
                  opacity={t === 0 ? 1 : 0.45}
                />
                <text x={PAD.left - 5} y={y(t) + 3} textAnchor="end" className="fill-muted-foreground text-[9px] tabular-nums">
                  {fmtNum(t)}
                </text>
              </g>
            ))}
            {hover != null && (
              <line
                x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH}
                className="text-accent" stroke="currentColor" strokeWidth={1} opacity={0.7}
              />
            )}
            <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            {values.map((v, i) => (
              <circle
                key={i} cx={x(i)} cy={y(v)} r={hover === i ? 4 : 2.5}
                fill={color} stroke="#fff" strokeWidth={hover === i ? 2 : 1}
              />
            ))}
            {/* Sparse x labels — first / middle / last to stay legible. */}
            {values.map((_, i) => (
              (i === 0 || i === values.length - 1 || i === Math.floor((values.length - 1) / 2)) && values.length > 1 ? (
                <text key={`l${i}`} x={x(i)} y={H - 5} textAnchor="middle" className="fill-muted-foreground text-[9px] tabular-nums">
                  {xLabels(i)}
                </text>
              ) : null
            ))}
            {values.map((_, i) => (
              <rect
                key={`h${i}`}
                x={x(i) - (values.length > 1 ? innerW / (values.length - 1) / 2 : innerW / 2)}
                y={PAD.top}
                width={values.length > 1 ? innerW / (values.length - 1) : innerW}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
            ))}
          </svg>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground text-center h-4">
        {hover != null ? `${xLabels(hover)} · ${fmtNum(values[hover])} ${unit}` : ' '}
      </p>
    </div>
  )
}

/** Donut segment between two fractions of the circle, starting at 12 o'clock
 *  and running clockwise. Radii in viewBox units, centre (0,0). */
function donutPath(from: number, to: number, outer: number, inner: number): string {
  const a0 = from * 2 * Math.PI - Math.PI / 2
  const a1 = to * 2 * Math.PI - Math.PI / 2
  const large = to - from > 0.5 ? 1 : 0
  const p = (a: number, r: number) => `${(Math.cos(a) * r).toFixed(3)},${(Math.sin(a) * r).toFixed(3)}`
  return [
    `M${p(a0, outer)}`,
    `A${outer},${outer} 0 ${large} 1 ${p(a1, outer)}`,
    `L${p(a1, inner)}`,
    `A${inner},${inner} 0 ${large} 0 ${p(a0, inner)}`,
    'Z',
  ].join(' ')
}

/** CVD-validated categorical palette (ETM dashboard, dataviz skill). */
const PIE_COLORS = ['#e34948', '#eda100', '#1baf7a', '#2a78d6', '#eb6834', '#4a3aa7', '#e87ba4', '#008300']

function DefautsDonut({ slices }: { slices: Array<{ label: string; value: number }> }) {
  const [hover, setHover] = useState<string | null>(null)
  const total = slices.reduce((s, x) => s + x.value, 0)
  const arcs = useMemo(() => {
    let acc = 0
    return slices.map((s, i) => {
      const from = total > 0 ? acc / total : 0
      acc += s.value
      return { ...s, color: PIE_COLORS[i % PIE_COLORS.length], from, to: total > 0 ? acc / total : 0 }
    })
  }, [slices, total])
  const active = hover ? arcs.find((a) => a.label === hover) ?? null : null

  if (slices.length === 0 || total === 0) {
    return <p className="text-sm text-muted-foreground italic text-center py-4">Aucun défaut relevé</p>
  }
  return (
    <div>
      <div className="relative mx-auto" style={{ width: 168, height: 168 }}>
        <svg viewBox="-50 -50 100 100" width={168} height={168} className="block">
          {arcs.map((a) => (
            <path
              key={a.label}
              d={donutPath(a.from, a.to, 46, 27)}
              fill={a.color}
              stroke="#fff" strokeWidth={2} vectorEffect="non-scaling-stroke"
              opacity={hover && hover !== a.label ? 0.4 : 1}
              onMouseEnter={() => setHover(a.label)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center" style={{ width: 84 }}>
          <p className="max-w-full truncate text-[10px] font-medium text-muted-foreground">{active ? active.label : 'Défauts'}</p>
          <p className="text-base font-bold leading-tight tabular-nums">{fmtNum(active ? active.value : total)}</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-0.5">
        {arcs.map((a) => (
          <span key={a.label} className={cn('flex items-center gap-1 text-[11px]', hover === a.label && 'font-semibold')}>
            <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: a.color }} aria-hidden />
            <span className="text-muted-foreground">{a.label}</span>
            <span className="font-medium tabular-nums">{fmtNum(a.value)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

// ── §29.4 status pill (Attente → En cours → Terminé) ───

function StatutPill({
  etat, onActiver, onTerminer, isChanging, disabled, canEdit,
}: {
  etat: OfEtat
  onActiver: () => void
  onTerminer: () => void
  isChanging: boolean
  disabled: boolean
  canEdit: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const meta = ETAT_META[etat]
  const Icon = meta.icon

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  // The pill offers only the REACHABLE transitions: a waiting OF can start, a
  // running OF can finish, a finished OF is final.
  // Without edit_of the pill still states where the OF stands — that is the
  // read-only half of §29 — it just offers no way to move it.
  const transitions = !canEdit
    ? []
    : etat === 'attente'
      ? [{ key: 'activer', label: 'Passer en cours', icon: Factory, run: onActiver }]
      : etat === 'encours'
        ? [{ key: 'terminer', label: 'Terminer l’OF', icon: CheckCircle2, run: onTerminer }]
        : []

  return (
    <div ref={rootRef} className="flex-shrink-0 relative">
      <div className={cn('rounded-xl border shadow-sm overflow-hidden flex items-stretch h-11', meta.solid)}>
        <div className="flex items-center gap-2 px-3 flex-1 text-white min-w-0">
          <Icon className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm font-bold uppercase tracking-wide truncate">{meta.label}</span>
        </div>
        {transitions.length > 0 && (
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            disabled={disabled || isChanging}
            title="Changer le statut"
            className="px-3.5 bg-white/15 hover:bg-white/25 active:bg-white/30 disabled:bg-white/5 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-semibold border-l border-white/25 flex items-center gap-1.5 transition-colors"
          >
            {isChanging
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <ChevronUp className={cn('h-3.5 w-3.5 transition-transform', menuOpen && 'rotate-180')} />}
            Changer
          </button>
        )}
      </div>
      {menuOpen && (
        <div className="absolute bottom-full right-0 mb-1 w-full min-w-[220px] rounded-lg border bg-white shadow-lg overflow-hidden z-50">
          {transitions.map((t) => {
            const TIcon = t.icon
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => { setMenuOpen(false); t.run() }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors hover:bg-zinc-100"
              >
                <TIcon className="h-4 w-4" />
                {t.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── §18 placeholder (Imprimer — ETAT_OF not ported yet) ──

function PlaceholderDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5 text-accent" />Imprimer
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Printer className="h-12 w-12 mb-3 opacity-40" />
          <p className="text-sm font-medium">En developpement</p>
          <p className="text-xs mt-1">La fiche OF (ETAT_OF) sera disponible prochainement.</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Draft model (edit mode) ────────────────────────────

interface DraftComp {
  key: number
  IDref_fil: number
  IDcolori_fil: number
  IDstock_fil: number
  ref_label: string
  coloris_label: string
  lot: string
  pourcentage: string
  /** Carried through from the detail so the marker survives edit mode. A row
   *  the user adds here starts `false` and gets its real value on the next
   *  read: only the API knows the reference's composition. */
  hors_ref: boolean
}
interface DraftInc {
  key: number
  IDstock_fil: number
  ref_label: string
  coloris_label: string
  lot: string
  poids: string
}
interface Draft {
  IDmachine: number
  quantite: string
  poids_piece: string
  visitage: number
  nettoyage: number
  finir_fil: boolean
  ouvert_visiteuse: boolean
  maille_ouverture: boolean
  sonneter: boolean
  auto_activation: boolean
  observations: string
  composition: DraftComp[]
  incorpore: DraftInc[]
}


function draftFromDetail(d: OfDetail): Draft {
  return {
    IDmachine: d.IDmachine,
    quantite: String(d.quantite),
    poids_piece: String(d.poids_piece),
    visitage: d.visitage,
    nettoyage: d.nettoyage,
    finir_fil: d.finir_fil === 1,
    ouvert_visiteuse: d.ouvert_visiteuse === 1,
    maille_ouverture: d.maille_ouverture === 1,
    sonneter: d.sonneter === 1,
    auto_activation: d.auto_activation === 1,
    observations: d.observations,
    composition: d.composition.map((c) => ({
      key: nextDraftKey(),
      IDref_fil: c.IDref_fil,
      IDcolori_fil: c.IDcolori_fil,
      IDstock_fil: c.IDstock_fil,
      ref_label: c.ref_label,
      coloris_label: c.coloris_label,
      lot: c.lot,
      pourcentage: String(c.pourcentage),
      hors_ref: !!c.hors_ref,
    })),
    incorpore: d.incorpore.map((i) => ({
      key: nextDraftKey(),
      IDstock_fil: i.IDstock_fil,
      ref_label: i.ref_label,
      coloris_label: i.coloris_label,
      lot: i.lot,
      poids: String(i.poids),
    })),
  }
}

// ═══════════════════════════════════════════════════════
//  Main page
// ═══════════════════════════════════════════════════════

export function ProductionOf() {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('encours')
  const [isEditing, setIsEditing] = useState(false)
  // Read stays open to whoever holds the Production menu — the atelier and
  // the poste de visitage next door consult the queue, the consigne and the
  // declared pieces all day. `edit_of` is what turns the screen writable, and
  // it is the server that enforces it: the nine write routes of /of-trm 403
  // without it. Hiding the affordances here only spares a dead button.
  const canEdit = useHasPermission('edit_of')
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [terminerConfirmOpen, setTerminerConfirmOpen] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)
  const [writeError, setWriteError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const originalDraftRef = useRef<Draft | null>(null)
  const updateDraft = useCallback((updater: (d: Draft) => Draft) => {
    setDraft((cur) => (cur ? updater(cur) : cur))
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 250)
    return () => clearTimeout(t)
  }, [searchQuery])

  const { data: rows, isLoading, isError, error } = useQuery<OfListRow[]>({
    queryKey: ['of-trm', statusFilter, statusFilter === 'termine' ? debouncedQuery : ''],
    queryFn: () => apiFetch(`/of-trm?statut=${statusFilter}${statusFilter === 'termine' && debouncedQuery ? `&q=${encodeURIComponent(debouncedQuery)}` : ''}`),
  })

  const { data: detail, isLoading: detailLoading } = useQuery<OfDetail>({
    queryKey: ['of-trm', 'detail', selectedId],
    queryFn: () => apiFetch(`/of-trm/${selectedId}`),
    enabled: selectedId !== null,
  })

  // Client-side text filter for the two live buckets (the terminés bucket is
  // searched server-side by OF number — deliberate limitation, see of-trm.ts).
  const filtered = useMemo(() => {
    if (!rows) return []
    const q = searchQuery.trim().toLowerCase()
    if (!q || statusFilter === 'termine') return rows
    return rows.filter((r) =>
      String(r.id).includes(q)
      || r.ref_label.toLowerCase().includes(q)
      || r.coloris_label.toLowerCase().includes(q)
      || r.client_nom.toLowerCase().includes(q)
      || r.machine.toLowerCase().includes(q))
  }, [rows, searchQuery, statusFilter])

  useAutoSelectFirst({
    rows: filtered,
    selectedId,
    getId: (r) => r.id,
    select: setSelectedId,
    suspended: isEditing,
  })

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['of-trm'] })
  }, [queryClient])

  // ── Edit mode ──
  const startEdit = useCallback(() => {
    if (!detail) return
    const d = draftFromDetail(detail)
    originalDraftRef.current = draftFromDetail(detail)
    setDraft(d)
    setIsEditing(true)
  }, [detail])

  const isDirty = isEditing && draft !== null && originalDraftRef.current !== null
    && JSON.stringify({ ...draft, composition: draft.composition.map(({ key, ...c }) => c), incorpore: draft.incorpore.map(({ key, ...i }) => i) })
    !== JSON.stringify({ ...originalDraftRef.current, composition: originalDraftRef.current.composition.map(({ key, ...c }) => c), incorpore: originalDraftRef.current.incorpore.map(({ key, ...i }) => i) })

  const handleSave = useCallback(async () => {
    if (!draft || selectedId === null) return
    const orig = originalDraftRef.current
    await apiFetch(`/of-trm/${selectedId}`, {
      method: 'PUT',
      body: JSON.stringify({
        IDmachine: draft.IDmachine,
        quantite: parseNum(draft.quantite) || undefined,
        poids_piece: parseNum(draft.poids_piece) || undefined,
        visitage: draft.visitage,
        nettoyage: draft.nettoyage as 1 | 2,
        finir_fil: draft.finir_fil ? 1 : 0,
        ouvert_visiteuse: draft.ouvert_visiteuse ? 1 : 0,
        maille_ouverture: draft.maille_ouverture ? 1 : 0,
        sonneter: draft.sonneter ? 1 : 0,
        auto_activation: draft.auto_activation ? 1 : 0,
        observations: draft.observations,
      }),
    })
    const compChanged = !orig || JSON.stringify(draft.composition.map(({ key, ...c }) => c)) !== JSON.stringify(orig.composition.map(({ key, ...c }) => c))
    if (compChanged && draft.composition.length > 0) {
      await apiFetch(`/of-trm/${selectedId}/composition`, {
        method: 'PUT',
        body: JSON.stringify({
          rows: draft.composition.map((c) => ({
            IDref_fil: c.IDref_fil,
            IDcolori_fil: c.IDcolori_fil,
            IDstock_fil: c.IDstock_fil,
            pourcentage: parseNum(c.pourcentage),
          })),
        }),
      })
    }
    const incChanged = !orig || JSON.stringify(draft.incorpore.map(({ key, ...i }) => i)) !== JSON.stringify(orig.incorpore.map(({ key, ...i }) => i))
    if (incChanged) {
      await apiFetch(`/of-trm/${selectedId}/incorpore`, {
        method: 'PUT',
        body: JSON.stringify({
          rows: draft.incorpore
            .filter((i) => i.IDstock_fil > 0 && parseNum(i.poids) > 0)
            .map((i) => ({ IDstock_fil: i.IDstock_fil, poids: parseNum(i.poids) })),
        }),
      })
    }
    invalidateAll()
    setIsEditing(false)
  }, [draft, selectedId, invalidateAll])

  const saveMut = useMutation({
    mutationFn: handleSave,
    onError: () => setWriteError('Enregistrement refusé — l’OF est peut-être terminé, ou la quantité verrouillée par la production.'),
  })

  const guard = useUnsavedGuard({
    isDirty,
    save: handleSave,
    onDiscard: () => setIsEditing(false),
  })

  // ── Actions ──
  const terminerMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/of-trm/${id}/terminer`, { method: 'POST' }),
    onSuccess: () => { setTerminerConfirmOpen(false); invalidateAll() },
    onError: () => { setTerminerConfirmOpen(false); setWriteError('Impossible de terminer cet OF.') },
  })
  const activerMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/of-trm/${id}/activer`, { method: 'POST' }),
    onSuccess: invalidateAll,
    onError: () => setWriteError('Activation refusée — le métier a déjà un OF en cours. Terminez-le d’abord.'),
  })
  const reorderMut = useMutation({
    mutationFn: ({ id, direction }: { id: number; direction: 'up' | 'down' }) =>
      apiFetch(`/of-trm/${id}/reorder`, { method: 'POST', body: JSON.stringify({ direction }) }),
    onSuccess: invalidateAll,
  })
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/of-trm/${id}`, { method: 'DELETE' }),
    onSuccess: (_d, deletedId) => {
      setDeleteConfirmOpen(false)
      const cached = queryClient.getQueryData<OfListRow[]>(['of-trm', statusFilter, statusFilter === 'termine' ? debouncedQuery : '']) ?? []
      const remaining = cached.filter((r) => r.id !== deletedId)
      invalidateAll()
      setSelectedId(remaining.length > 0 ? remaining[0].id : null)
    },
    onError: () => {
      setDeleteConfirmOpen(false)
      setWriteError('Suppression impossible : cet OF a déjà produit des pièces. Terminez-le plutôt.')
    },
  })

  const handleSelect = useCallback((id: number) => {
    guard.guardAction(() => { setIsEditing(false); setSelectedId(id) })
  }, [guard])

  const handleStatusFilterChange = useCallback((s: StatusFilter) => {
    guard.guardAction(() => { setIsEditing(false); setStatusFilter(s); setSelectedId(null) })
  }, [guard])

  const etat: OfEtat | null = detail ? ofEtat(detail) : null

  return (
    <>
      <MasterDetailLayout
        list={
          <OfList
            rows={filtered}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            selectedId={selectedId}
            onSelect={handleSelect}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={handleStatusFilterChange}
            onReorder={(id, direction) => reorderMut.mutate({ id, direction })}
            reorderPending={reorderMut.isPending}
            onNew={() => setCreateOpen(true)}
            isEditing={isEditing}
            canEdit={canEdit}
          />
        }
        detailHeader={detail ? (
          <DetailHeader
            detail={detail}
            isEditing={isEditing}
            isSaving={saveMut.isPending}
            onStartEdit={startEdit}
            onCancel={() => guard.guardAction(() => setIsEditing(false))}
            onSave={() => saveMut.mutate()}
            onPrint={() => setPrintOpen(true)}
            onDelete={() => setDeleteConfirmOpen(true)}
            canEdit={canEdit}
          />
        ) : null}
        detail={
          selectedId === null ? (
            <EmptyDetail />
          ) : detailLoading || !detail ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-accent" />
            </div>
          ) : (
            <OfDetailBody detail={detail} isEditing={isEditing} draft={draft} set={updateDraft} />
          )
        }
        sidebar={detail && etat ? (
          <OfSidebar
            detail={detail}
            etat={etat}
            isEditing={isEditing}
            onActiver={() => activerMut.mutate(detail.id)}
            onTerminer={() => setTerminerConfirmOpen(true)}
            isChanging={activerMut.isPending || terminerMut.isPending}
            canEdit={canEdit}
          />
        ) : null}
        sidebarTitle="Suivi de l'OF"
        hasSelection={selectedId !== null}
        onBack={() => guard.guardAction(() => { setIsEditing(false); setSelectedId(null) })}
      />

      <UnsavedChangesDialog open={guard.showDialog} onAction={guard.handleAction} isSaving={guard.isSaving} />

      <CreateOfDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(newId) => {
          setCreateOpen(false)
          invalidateAll()
          setStatusFilter('attente')
          setSelectedId(newId)
        }}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Supprimer l'OF"
        description="Cette action supprime l'ordre de fabrication, sa composition et ses observations. Elle est irréversible et n'est possible que si aucune pièce n'a été produite."
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
        open={terminerConfirmOpen}
        variant="default"
        title="Terminer l'OF"
        description="L'OF sera clôturé et retiré de la file du métier. Si l'OF suivant a l'activation automatique, il démarrera aussitôt."
        confirmLabel="Terminer"
        isPending={terminerMut.isPending}
        onCancel={() => setTerminerConfirmOpen(false)}
        onConfirm={() => { if (selectedId !== null) terminerMut.mutate(selectedId) }}
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

      <PlaceholderDialog open={printOpen} onClose={() => setPrintOpen(false)} />
    </>
  )
}

// ── Left panel: OF queue ───────────────────────────────

function OfList({
  rows, isLoading, isError, error,
  selectedId, onSelect,
  searchQuery, onSearchChange,
  statusFilter, onStatusFilterChange,
  onReorder, reorderPending,
  onNew, isEditing, canEdit,
}: {
  rows: OfListRow[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  selectedId: number | null
  onSelect: (id: number) => void
  searchQuery: string
  onSearchChange: (q: string) => void
  statusFilter: StatusFilter
  onStatusFilterChange: (s: StatusFilter) => void
  onReorder: (id: number, direction: 'up' | 'down') => void
  reorderPending: boolean
  onNew: () => void
  isEditing: boolean
  canEdit: boolean
}) {
  // Attente view groups the queue per métier so the ▲▼ reorder reads naturally.
  const groups = useMemo(() => {
    if (statusFilter !== 'attente') return null
    const byMachine = new Map<string, OfListRow[]>()
    for (const r of rows) {
      const arr = byMachine.get(r.machine) ?? []
      arr.push(r)
      byMachine.set(r.machine, arr)
    }
    return Array.from(byMachine.entries()).sort((a, b) => a[0].localeCompare(b[0], 'fr'))
  }, [rows, statusFilter])

  return (
    <div className="flex flex-col h-full rounded-lg border shadow-sm bg-zinc-100/80">
      <div className="p-3 border-b rounded-t-lg bg-zinc-200/50 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder={statusFilter === 'termine' ? 'Rechercher (n° OF)' : 'Rechercher (n°, réf, client...)'}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            autoComplete="off"
            className="w-full h-9 pl-9 pr-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex gap-1">
          {([
            { key: 'encours', label: 'En cours' },
            { key: 'attente', label: 'Attente' },
            { key: 'termine', label: 'Terminés' },
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
            <Factory className="h-12 w-12 mb-2 opacity-50" />
            <p className="text-sm">Aucun ordre de fabrication</p>
          </div>
        )}

        {!isLoading && !isError && (groups ? (
          groups.map(([machine, group]) => (
            <div key={machine} className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-1 pt-1">
                Métier {machine}
              </p>
              {group.map((r, i) => (
                <OfListCard
                  key={r.id}
                  row={r}
                  selected={selectedId === r.id}
                  onClick={() => onSelect(r.id)}
                  reorder={canEdit && group.length > 1 && !isEditing ? {
                    canUp: i > 0,
                    canDown: i < group.length - 1,
                    pending: reorderPending,
                    onMove: (dir) => onReorder(r.id, dir),
                  } : undefined}
                />
              ))}
            </div>
          ))
        ) : (
          rows.map((r) => (
            <OfListCard key={r.id} row={r} selected={selectedId === r.id} onClick={() => onSelect(r.id)} />
          ))
        ))}
      </div>

      <div className="p-3 border-t text-xs text-muted-foreground flex items-center justify-between rounded-b-lg bg-zinc-200/50">
        <span>{rows.length} ordre{rows.length > 1 ? 's' : ''} de fabrication</span>
        {!isEditing && canEdit && (
          <Button size="sm" variant="ghost" className="text-accent hover:text-accent hover:bg-accent/10" onClick={onNew}>
            <Plus className="h-3.5 w-3.5 mr-1" />Nouveau
          </Button>
        )}
      </div>
    </div>
  )
}

function OfListCard({
  row, selected, onClick, reorder,
}: {
  row: OfListRow
  selected: boolean
  onClick: () => void
  reorder?: { canUp: boolean; canDown: boolean; pending: boolean; onMove: (dir: 'up' | 'down') => void }
}) {
  const etat = ofEtat(row)
  return (
    <div
      onClick={onClick}
      className={cn(
        'group p-3 border-l-4 border rounded-lg cursor-pointer bg-white transition-colors',
        ETAT_META[etat].cardBorder,
        selected ? 'border-accent ring-1 ring-accent' : 'border-border hover:border-accent/50',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="font-medium text-sm">OF {row.id}</p>
          {row.sonneter === 1 && <Bell className="h-3 w-3 text-amber-600 flex-shrink-0" aria-label="Sonneter" />}
          {row.auto_activation === 1 && row.est_actif === 0 && row.est_termine === 0 && (
            <RefreshCw className="h-3 w-3 text-accent-blue flex-shrink-0" aria-label="Activation automatique" />
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {reorder && (
            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost" size="icon" className="h-5 w-5"
                disabled={!reorder.canUp || reorder.pending}
                title="Monter dans la file"
                onClick={(e) => { e.stopPropagation(); reorder.onMove('up') }}
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost" size="icon" className="h-5 w-5"
                disabled={!reorder.canDown || reorder.pending}
                title="Descendre dans la file"
                onClick={(e) => { e.stopPropagation(); reorder.onMove('down') }}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
          <Badge variant="outline" className="text-[10px] py-0 font-mono">{row.machine || '—'}</Badge>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-1 truncate">
        {row.ref_label}{row.coloris_label ? ` - ${row.coloris_label}` : ''}
      </p>
      <div className="flex items-center justify-between gap-2 mt-0.5">
        <p className="text-[11px] text-muted-foreground truncate">{row.client_nom}</p>
        {row.commande_numero > 0 && (
          <p className="text-[10px] text-muted-foreground tabular-nums flex-shrink-0">N° {fmtNum(row.commande_numero)}</p>
        )}
      </div>
      {etat === 'encours' && row.progression_pct !== null && (
        <div className="flex items-center gap-2 mt-1.5">
          <div className="flex-1 h-1.5 rounded-full bg-zinc-200 overflow-hidden">
            <div
              className={cn('h-full rounded-full', row.progression_pct >= 99.9 ? 'bg-green-500' : 'bg-accent')}
              style={{ width: `${Math.min(100, row.progression_pct)}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums flex-shrink-0">{fmtNum(row.progression_pct, 1)} %</span>
        </div>
      )}
    </div>
  )
}

// ── Detail header ──────────────────────────────────────

function DetailHeader({
  detail, isEditing, isSaving, onStartEdit, onCancel, onSave, onPrint, onDelete, canEdit,
}: {
  detail: OfDetail
  isEditing: boolean
  isSaving: boolean
  onStartEdit: () => void
  onCancel: () => void
  onSave: () => void
  onPrint: () => void
  onDelete: () => void
  canEdit: boolean
}) {
  return (
    <div className="flex-shrink-0 pt-0.5">
      <div className="flex items-center gap-3">
        <div className={cn('h-11 w-11 rounded-lg flex items-center justify-center', isEditing ? 'bg-accent/15' : 'icon-box-gold')}>
          <TmRollIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-heading font-bold tracking-tight truncate">OF N° {detail.id}</h1>
            {isEditing && (
              <Badge className="bg-accent text-accent-foreground flex-shrink-0 gap-1 shadow-sm">
                <Pencil className="h-3 w-3" />Mode edition
              </Badge>
            )}
          </div>
          {/* État lives in the §29 sidebar pill — the header shows only the
              computed context (métier / date), never the user-controlled state. */}
          <div className="flex gap-1.5 mt-1 flex-wrap items-center">
            {detail.machine && <Badge variant="secondary" className="text-xs font-mono">{detail.machine.nom}</Badge>}
            <span className="text-xs text-muted-foreground">Créé le {formatHfsqlDate(detail.date_creation ?? '')}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isEditing ? (
            <>
              <Button
                variant="outline" size="icon"
                className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                title="Supprimer l'OF"
                onClick={onDelete}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={onCancel} disabled={isSaving}>
                <X className="h-3.5 w-3.5 mr-1.5" />Annuler
              </Button>
              <Button size="sm" onClick={onSave} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                Enregistrer
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="icon" className="h-9 w-9" title="Imprimer" onClick={onPrint}>
                <Printer className="h-4 w-4" />
              </Button>
              {detail.est_termine === 0 && canEdit && (
                <Button variant="gold" size="sm" onClick={onStartEdit}>
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />Modifier
                </Button>
              )}
            </>
          )}
        </div>
      </div>
      <div className={cn('h-1 w-24 mt-3 rounded-full', isEditing ? 'bg-accent' : 'bg-gradient-to-r from-accent via-accent to-accent/30')} />
    </div>
  )
}

function EmptyDetail() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
      <div className="icon-box-gold h-16 w-16 rounded-lg flex items-center justify-center mb-3">
        <Factory className="h-8 w-8" />
      </div>
      <p className="text-sm">Sélectionnez un ordre de fabrication</p>
    </div>
  )
}

// ── Center panel ───────────────────────────────────────

function OfDetailBody({
  detail, isEditing, draft, set,
}: {
  detail: OfDetail
  isEditing: boolean
  draft: Draft | null
  set: (updater: (d: Draft) => Draft) => void
}) {
  // Two columns are driven by the MEASURED panel width, not a Tailwind `lg:`
  // gate: this panel's width is set by the master-detail mode (§4), so at a
  // 1400px viewport — where `lg:`/`xl:` are long since true — it is only
  // ~390px wide and a split would shred the params grid. 780px is where the
  // four figures still hold one line beside the consigne column.
  const [bodyRef, bodySize] = useElementSize<HTMLDivElement>()
  const twoCols = bodySize.w >= 780

  return (
    <div ref={bodyRef} className="flex-1 min-h-0 overflow-auto space-y-3 scrollbar-transparent pr-0.5">
      <ReferenceBanner detail={detail} />
      <div className={cn('gap-3', twoCols ? 'grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]' : 'flex flex-col')}>
        <ParamsCard detail={detail} isEditing={isEditing} draft={draft} set={set} />
        <div className="flex flex-col gap-3">
          <ConsigneCard detail={detail} isEditing={isEditing} draft={draft} set={set} />
          <CommandeCard detail={detail} />
        </div>
      </div>
      <TricoterCard detail={detail} isEditing={isEditing} draft={draft} set={set} />
      <IncorporerCard detail={detail} isEditing={isEditing} draft={draft} set={set} />
    </div>
  )
}

/** The gold reference banner of the legacy form: ref - coloris + contexture. */
function ReferenceBanner({ detail }: { detail: OfDetail }) {
  return (
    <div className="rounded-lg border border-gold/30 bg-gradient-to-r from-gold/30 via-gold/10 to-transparent px-3.5 py-2.5 flex items-center gap-3">
      <TmRollIcon className="h-7 w-7 text-primary flex-shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold leading-tight truncate">
          {detail.ref_label}{detail.coloris_label ? ` - ${detail.coloris_label}` : ''}
        </p>
        <p className="text-xs text-muted-foreground italic truncate">{detail.contexture || detail.ref_designation}</p>
      </div>
      {detail.machine && (
        <p className="ml-auto text-xs text-muted-foreground flex-shrink-0">
          Jauge {detail.machine.jauge || '—'}{detail.machine.diametre ? ` - Ø${detail.machine.diametre}"` : ''}
        </p>
      )}
    </div>
  )
}

function KV({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  )
}

/** A read-mode figure of the params strip: the four numbers a régleur checks
 *  first (métier, poids/pièce, quantité, nb pièces) read as instruments, not
 *  as form fields — they are not editable outside edit mode anyway. */
function Figure({
  label, value, unit, mono,
}: {
  label: string
  value: string
  unit?: string
  mono?: boolean
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-secondary/60 px-3 py-2 min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground truncate">{label}</p>
      <p className={cn('mt-0.5 text-base font-semibold leading-tight truncate', mono ? 'font-mono' : 'tabular-nums')}>
        {value}
        {unit && <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>}
      </p>
    </div>
  )
}

/** One line of the settings panel under the figures: micro-label left, the
 *  value (or its control, in edit mode) right. */
function SettingRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 min-h-[2.75rem]">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground flex-shrink-0">{label}</p>
      <div className="min-w-0 text-right">{children}</div>
    </div>
  )
}

function ParamsCard({
  detail, isEditing, draft, set,
}: {
  detail: OfDetail
  isEditing: boolean
  draft: Draft | null
  set: (updater: (d: Draft) => Draft) => void
}) {
  const { data: machines } = useQuery<MachineLookup[]>({
    queryKey: ['of-trm-machines'],
    queryFn: () => apiFetch('/of-trm/lookups/machines'),
    staleTime: 5 * 60_000,
    enabled: isEditing,
  })
  const machineOptions: PopoverSelectOption[] = useMemo(() => (machines ?? []).map((m) => ({
    id: m.id,
    primary: m.nom,
    secondary: detail.compatibles.includes(m.nom) ? 'compatible' : undefined,
  })), [machines, detail.compatibles])

  const d = isEditing && draft ? draft : null
  const quantite = d ? parseNum(d.quantite) : detail.quantite
  const poidsPiece = d ? parseNum(d.poids_piece) : detail.poids_piece
  const nbPieces = poidsPiece > 0 ? Math.max(1, Math.ceil(quantite / poidsPiece)) : detail.nb_pieces
  const quantiteLocked = detail.has_production

  const checkboxes: Array<{ key: keyof Draft & ('finir_fil' | 'ouvert_visiteuse' | 'maille_ouverture' | 'sonneter' | 'auto_activation'); label: string; view: number }> = [
    { key: 'finir_fil', label: 'Finir le fil', view: detail.finir_fil },
    { key: 'ouvert_visiteuse', label: 'Ouvert au large', view: detail.ouvert_visiteuse },
    { key: 'maille_ouverture', label: "Maille d'ouverture", view: detail.maille_ouverture },
    { key: 'sonneter', label: 'Sonneter', view: detail.sonneter },
    { key: 'auto_activation', label: 'Activation auto', view: detail.auto_activation },
  ]

  const visitageLabel = VISITAGE_OPTIONS.find((o) => o.id === detail.visitage)?.primary ?? '—'
  const nettoyageLabel = detail.nettoyage > 0
    ? `${detail.nettoyage} nettoyage${detail.nettoyage > 1 ? 's' : ''}`
    : '—'

  return (
    // `h-full` + a spread content column: the grid row is as tall as the
    // consigne/commande stack beside it, and a card that stopped 80px short of
    // its neighbour read as a rendering accident rather than as a column.
    <Card className={cn('card-premium h-full flex flex-col', isEditing && editSectionClass)}>
      <CardHeader className={cardHeaderClass}>
        <Factory className="h-4 w-4 text-accent" />
        <CardTitle className="text-sm font-semibold">Paramètres de tricotage</CardTitle>
        {detail.compatibles.length > 0 && (
          <span
            className="ml-auto text-[11px] text-muted-foreground truncate"
            title={`Compatible sur : ${detail.compatibles.join(', ')}`}
          >
            Compatible sur : {detail.compatibles.join(', ')}
          </span>
        )}
      </CardHeader>
      <CardContent className={cn(cardContentClass, 'flex-1 flex flex-col justify-between gap-3')}>
        {d ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <KV label="Métier">
              <PopoverSelect
                options={machineOptions}
                value={d.IDmachine}
                onChange={(id) => set((cur) => ({ ...cur, IDmachine: id }))}
                hideEmpty
                size="sm"
                widthClass="w-full"
              />
            </KV>
            <KV label="Poids pièce (Kg)">
              <input
                className={inputClass}
                value={d.poids_piece}
                onChange={(e) => set((cur) => ({ ...cur, poids_piece: e.target.value }))}
                inputMode="decimal"
              />
            </KV>
            <KV label="Quantité (Kg)">
              <input
                className={cn(inputClass, quantiteLocked && 'opacity-60 cursor-not-allowed bg-muted')}
                value={d.quantite}
                onChange={(e) => set((cur) => ({ ...cur, quantite: e.target.value }))}
                disabled={quantiteLocked}
                title={quantiteLocked ? 'La production a démarré — la quantité est verrouillée.' : undefined}
                inputMode="decimal"
              />
            </KV>
            <KV label="Nb pièces">
              <span className="tabular-nums leading-8">{fmtNum(nbPieces)} pièce{nbPieces > 1 ? 's' : ''}</span>
            </KV>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Figure label="Métier" value={detail.machine?.nom ?? '—'} mono />
            <Figure label="Poids pièce" value={fmtNum(detail.poids_piece, 2)} unit="Kg" />
            <Figure label="Quantité" value={fmtNum(detail.quantite, 2)} unit="Kg" />
            <Figure label="Nb pièces" value={fmtNum(nbPieces)} unit={nbPieces > 1 ? 'pièces' : 'pièce'} />
          </div>
        )}

        {/* The two settings ride the same surface as the figures above rather
            than floating as loose label/value pairs: they are readings of the
            same instrument panel, and two free-standing pairs in the middle of
            a stretched card read as leftovers. */}
        <div className="rounded-lg border border-border/50 bg-secondary/60 divide-y divide-border/50 overflow-hidden">
          <SettingRow label="Visitage">
            {d ? (
              <PopoverSelect
                options={VISITAGE_OPTIONS}
                value={d.visitage}
                onChange={(id) => set((cur) => ({ ...cur, visitage: id }))}
                emptyLabel="—"
                hideEmpty={d.visitage !== 0}
                size="sm"
                widthClass="w-full"
              />
            ) : (
              <span className="text-sm font-medium">{visitageLabel}</span>
            )}
          </SettingRow>
          <SettingRow label="Nettoyage">
            {d ? (
              <div className="flex items-center justify-end gap-4 h-8">
                {[1, 2].map((v) => (
                  <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="nettoyage"
                      checked={d.nettoyage === v}
                      onChange={() => set((cur) => ({ ...cur, nettoyage: v }))}
                      className="accent-[hsl(44,92%,50%)]"
                    />
                    {v} Nettoyage{v > 1 ? 's' : ''}
                  </label>
                ))}
              </div>
            ) : (
              <span className="text-sm font-medium whitespace-nowrap">{nettoyageLabel}</span>
            )}
          </SettingRow>
        </div>

        {d ? (
          <div className="flex flex-wrap gap-x-5 gap-y-2 pt-0.5">
            {checkboxes.map((c) => (
              <label key={c.key} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={d[c.key] as boolean}
                  onCheckedChange={(v) => set((cur) => ({ ...cur, [c.key]: v === true }))}
                />
                {c.label}
              </label>
            ))}
          </div>
        ) : (
          // View mode: a row of five disabled, mostly-empty checkboxes is noise
          // that reads as a broken form. Chips say the same thing — on ones lit
          // in accent, off ones muted — and stay legible at a glance.
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {checkboxes.map((c) => (
              <Badge
                key={c.key}
                variant="outline"
                className={cn(
                  'text-[11px] font-medium gap-1',
                  c.view === 1
                    ? 'bg-accent/10 text-accent border-accent/25'
                    : 'font-normal text-muted-foreground/70 border-border/60',
                )}
              >
                {c.view === 1 && <Check className="h-3 w-3" />}
                {c.label}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** The consigne is the same object the poste de visitage puts under a red
 *  callout, so on the fiche it wears the same face (§46) — a fiche that shows
 *  it as one more quiet card teaches the reader it is optional, and it is not:
 *  it changes what the bonnetier does with his hands.
 *
 *  Two states keep the plain card: EMPTY (there is nothing to shout, and the
 *  header is what names the missing thing) and EDITING (the field is being
 *  written, not obeyed — dressing an input as an alert would read as a
 *  validation error, and the gold §9 edit border needs its own frame). */
function ConsigneCard({
  detail, isEditing, draft, set,
}: {
  detail: OfDetail
  isEditing: boolean
  draft: Draft | null
  set: (updater: (d: Draft) => Draft) => void
}) {
  const d = isEditing && draft ? draft : null
  if (!isEditing && detail.observations.trim()) {
    return <ConsigneCallout texte={detail.observations} className="card-premium" />
  }
  return (
    <Card className={cn('card-premium', isEditing && editSectionClass)}>
      <CardHeader className={cardHeaderClass}>
        <Info className="h-4 w-4 text-accent" />
        <CardTitle className="text-sm font-semibold">Consigne</CardTitle>
      </CardHeader>
      <CardContent className={cardContentClass}>
        {d ? (
          <textarea
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
            value={d.observations}
            onChange={(e) => set((cur) => ({ ...cur, observations: e.target.value }))}
            placeholder="Consigne pour le bonnetier…"
          />
        ) : (
          <p className="text-sm text-muted-foreground italic">Aucune consigne</p>
        )}
      </CardContent>
    </Card>
  )
}

// ── Tricoter (asso_fil_of) ─────────────────────────────

function TricoterCard({
  detail, isEditing, draft, set,
}: {
  detail: OfDetail
  isEditing: boolean
  draft: Draft | null
  set: (updater: (d: Draft) => Draft) => void
}) {
  const d = isEditing && draft ? draft : null
  const quantite = d ? parseNum(d.quantite) : detail.quantite

  const totalPct = d
    ? d.composition.reduce((s, c) => s + parseNum(c.pourcentage), 0)
    : detail.composition.reduce((s, c) => s + c.pourcentage, 0)

  return (
    <Card className={cn('card-premium', isEditing && editSectionClass)}>
      <CardHeader className={cardHeaderClass}>
        <Layers className="h-4 w-4 text-accent" />
        <CardTitle className="text-sm font-semibold">Tricoter</CardTitle>
        <Badge variant="secondary" className="text-xs ml-auto">{(d ? d.composition : detail.composition).length}</Badge>
      </CardHeader>
      <CardContent className={cn(cardContentClass, 'space-y-2')}>
        {d ? (
          <>
            {d.composition.map((c) => (
              <CompositionEditRow
                key={c.key}
                row={c}
                onChange={(next) => set((cur) => ({ ...cur, composition: cur.composition.map((x) => (x.key === c.key ? next : x)) }))}
                onRemove={() => set((cur) => ({ ...cur, composition: cur.composition.filter((x) => x.key !== c.key) }))}
              />
            ))}
            <AddFilButton
              label="Ajouter un fil"
              onAdd={(pair, lot) => set((cur) => ({
                ...cur,
                composition: [...cur.composition, {
                  key: nextDraftKey(),
                  IDref_fil: pair.IDref_fil,
                  IDcolori_fil: pair.IDcolori_fil,
                  IDstock_fil: lot?.id ?? 0,
                  ref_label: pair.ref_label,
                  coloris_label: pair.coloris_label,
                  lot: lot?.lot ?? '',
                  pourcentage: cur.composition.length === 0 ? '100' : '',
                  hors_ref: false,
                }],
              }))}
            />
          </>
        ) : detail.composition.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Aucun fil</p>
        ) : (
          <PanelTable
            loading={false}
            rows={detail.composition}
            emptyLabel="Aucun fil"
            emptyIcon={Layers}
            columns={[
              {
                key: 'fil',
                label: 'Fil',
                align: 'left',
                render: (r) => (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="font-medium">{r.ref_label}</span>
                    {!!r.hors_ref && <HorsRefBadge />}
                  </span>
                ),
              },
              { key: 'colori', label: 'Colori', align: 'left', render: (r) => r.coloris_label || '—' },
              { key: 'pct', label: '%', align: 'right', render: (r) => `${fmtNum(r.pourcentage, 2)} %` },
              { key: 'besoin', label: 'Besoin', align: 'right', render: (r) => `${fmtNum(quantite * r.pourcentage / 100, 2)} Kg` },
              {
                key: 'stock',
                label: 'Stock',
                align: 'right',
                // Amber when the (fil, coloris) pair holds less than this OF
                // needs — the per-line half of the Réalisable bar, which only
                // ever gave the verdict for the run as a whole.
                render: (r) => {
                  const short = r.pair_stock < quantite * r.pourcentage / 100 - 0.001
                  return (
                    <span
                      className={cn(short && 'text-amber-700 font-semibold')}
                      title={short ? 'Stock insuffisant pour le besoin de cet OF' : undefined}
                    >
                      {fmtNum(r.pair_stock, 2)} Kg
                    </span>
                  )
                },
              },
              { key: 'lot', label: 'Lot', align: 'right', render: (r) => <span className="font-mono">{r.lot || '—'}</span> },
            ]}
          />
        )}
        <div className="flex justify-end pt-1">
          <span className={cn('text-xs tabular-nums', Math.abs(totalPct - 100) > 0.01 ? 'text-amber-700 font-semibold' : 'text-muted-foreground')}>
            Total des pourcentages : {fmtNum(totalPct, 2)} %
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

function CompositionEditRow({
  row, onChange, onRemove,
}: {
  row: DraftComp
  onChange: (next: DraftComp) => void
  onRemove: () => void
}) {
  const { data: lots, isLoading } = useQuery<LotLookup[]>({
    queryKey: ['of-trm-lots', row.IDref_fil, row.IDcolori_fil],
    queryFn: () => apiFetch(`/of-trm/lookups/lots?refFil=${row.IDref_fil}&coloriFil=${row.IDcolori_fil}`),
    staleTime: 60_000,
  })
  // The weight rides in `description` (popover rows only), not `secondary`,
  // which would also land on the trigger and leave the closed field reading
  // "10131 — 168,8 Kg". The field names the lot; the weight is a label right
  // of it, like the création dialog.
  const lotOptions: PopoverSelectOption[] = useMemo(() => (lots ?? []).map((l) => ({
    id: l.id,
    primary: l.lot || `#${l.id}`,
    description: `${fmtNum(l.stock, 1)} Kg en stock`,
  })), [lots])
  const chosenLot = (lots ?? []).find((l) => l.id === row.IDstock_fil) ?? null

  return (
    <div className="rounded-lg border border-border/60 bg-zinc-100/80 p-2.5 flex flex-wrap items-center gap-2">
      <div className="min-w-0 flex-1 basis-40">
        <p className="text-sm font-medium truncate">
          {row.ref_label}
          {!!row.hors_ref && <HorsRefBadge className="ml-1.5 align-middle" />}
        </p>
        <p className="text-[11px] text-muted-foreground truncate">{row.coloris_label || '—'}</p>
      </div>
      <div className="flex items-center gap-1.5">
        <input
          className={cn(inputClass, 'w-16 text-right')}
          value={row.pourcentage}
          onChange={(e) => onChange({ ...row, pourcentage: e.target.value })}
          inputMode="decimal"
          placeholder="%"
        />
        <span className="text-xs text-muted-foreground">%</span>
      </div>
      <div className="w-24">
        {isLoading ? (
          <div className="h-8 bg-muted animate-pulse rounded-md" />
        ) : (
          <PopoverSelect
            options={lotOptions}
            value={row.IDstock_fil}
            onChange={(id) => {
              const lot = (lots ?? []).find((l) => l.id === id)
              onChange({ ...row, IDstock_fil: id, lot: lot?.lot ?? '' })
            }}
            emptyLabel="Sans lot"
            size="sm"
            widthClass="w-full"
          />
        )}
      </div>
      {chosenLot && (
        <span className="text-[11px] text-muted-foreground whitespace-nowrap" title="Stock de ce lot">
          stock <span className="tabular-nums font-semibold">{fmtNum(chosenLot.stock, 1)} Kg</span>
        </span>
      )}
      <Button
        variant="ghost" size="icon"
        className="h-7 w-7 text-destructive hover:text-destructive"
        title="Retirer ce fil"
        onClick={onRemove}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}


// ── Incorporer (fil_incorpore) ─────────────────────────

function IncorporerCard({
  detail, isEditing, draft, set,
}: {
  detail: OfDetail
  isEditing: boolean
  draft: Draft | null
  set: (updater: (d: Draft) => Draft) => void
}) {
  const d = isEditing && draft ? draft : null
  const rows = d ? d.incorpore : null

  // View mode with nothing to show: a one-line note instead of an empty card.
  if (!d && detail.incorpore.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic px-1">
        Incorporer : aucun lot supplémentaire.
      </p>
    )
  }

  return (
    <Card className={cn('card-premium', isEditing && editSectionClass)}>
      <CardHeader className={cardHeaderClass}>
        <Plus className="h-4 w-4 text-accent" />
        <CardTitle className="text-sm font-semibold">Incorporer</CardTitle>
        <Badge variant="secondary" className="text-xs ml-auto">{(rows ?? detail.incorpore).length}</Badge>
      </CardHeader>
      <CardContent className={cn(cardContentClass, 'space-y-2')}>
        {d ? (
          <>
            {d.incorpore.map((r) => (
              <IncorporeEditRow
                key={r.key}
                row={r}
                onChange={(next) => set((cur) => ({ ...cur, incorpore: cur.incorpore.map((x) => (x.key === r.key ? next : x)) }))}
                onRemove={() => set((cur) => ({ ...cur, incorpore: cur.incorpore.filter((x) => x.key !== r.key) }))}
              />
            ))}
            <AddIncorporeButton
              onAdd={(lot, pair) => set((cur) => ({
                ...cur,
                incorpore: [...cur.incorpore, {
                  key: nextDraftKey(),
                  IDstock_fil: lot.id,
                  ref_label: pair.ref_label,
                  coloris_label: pair.coloris_label,
                  lot: lot.lot,
                  poids: '',
                }],
              }))}
            />
          </>
        ) : (
          <PanelTable
            loading={false}
            rows={detail.incorpore}
            emptyLabel="Aucun lot incorporé"
            emptyIcon={Plus}
            columns={[
              { key: 'lot', label: 'Lot', align: 'left', render: (r) => <span className="font-mono">{r.lot || '—'}</span> },
              { key: 'fil', label: 'Fil', align: 'left', render: (r) => r.ref_label },
              { key: 'colori', label: 'Coloris', align: 'left', render: (r) => r.coloris_label || '—' },
              { key: 'poids', label: 'Poids', align: 'right', render: (r) => `${fmtNum(r.poids, 2)} Kg` },
            ]}
          />
        )}
      </CardContent>
    </Card>
  )
}

function IncorporeEditRow({
  row, onChange, onRemove,
}: {
  row: DraftInc
  onChange: (next: DraftInc) => void
  onRemove: () => void
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-zinc-100/80 p-2.5 flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">
          <span className="font-mono">{row.lot || '—'}</span>
          <span className="text-muted-foreground font-normal"> · {row.ref_label}{row.coloris_label ? ` ${row.coloris_label}` : ''}</span>
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        <input
          className={cn(inputClass, 'w-20 text-right')}
          value={row.poids}
          onChange={(e) => onChange({ ...row, poids: e.target.value })}
          inputMode="decimal"
          placeholder="Kg"
        />
        <span className="text-xs text-muted-foreground">Kg</span>
      </div>
      <Button
        variant="ghost" size="icon"
        className="h-7 w-7 text-destructive hover:text-destructive"
        title="Retirer ce lot"
        onClick={onRemove}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}


// ── Commande liée + Réalisable ─────────────────────────

function CommandeCard({ detail }: { detail: OfDetail }) {
  const cmd = detail.commande
  const remaining = Math.max(0, detail.quantite - detail.realise)
  const realisableOk = detail.realisable >= remaining - 0.001
  const pct = (v: number) => (detail.quantite > 0 ? Math.min(100, Math.max(0, (v / detail.quantite) * 100)) : 0)

  return (
    <Card className="card-premium">
      <CardHeader className={cardHeaderClass}>
        <ClipboardList className="h-4 w-4 text-accent" />
        <CardTitle className="text-sm font-semibold">Commande client</CardTitle>
      </CardHeader>
      <CardContent className={cn(cardContentClass, 'space-y-3')}>
        {cmd ? (
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-sm font-semibold tabular-nums flex-shrink-0">N° {fmtNum(cmd.numero)}</span>
            <span className="text-sm text-muted-foreground truncate">{cmd.client_nom}</span>
            <span className="ml-auto text-xs tabular-nums text-muted-foreground flex-shrink-0" title="Quantité de la ligne de commande">
              {fmtNum(cmd.quantite, 2)} Kg
            </span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">Aucune commande liée</p>
        )}

        <Meter
          label="Réalisé"
          value={`${fmtNum(detail.realise, 2)} / ${fmtNum(detail.quantite, 2)} Kg`}
          pct={pct(detail.realise)}
          barClass="bg-accent"
        />
        <Meter
          label="Réalisable (stock de fil)"
          value={`${fmtNum(detail.realisable, 2)} Kg`}
          pct={pct(detail.realisable)}
          barClass={realisableOk ? 'bg-green-500' : 'bg-amber-500'}
          valueClass={realisableOk ? 'text-green-700' : 'text-amber-700'}
          note={realisableOk ? undefined : `Le stock de fil ne couvre pas le restant à produire (${fmtNum(remaining, 2)} Kg).`}
        />
      </CardContent>
    </Card>
  )
}

/** Label + figure over a slim track — the two progress readings of the OF.
 *  Single-hue fills on purpose (`dataviz`): the colour IS the verdict, so a
 *  gradient or a second hue would say something the number does not. */
function Meter({
  label, value, pct, barClass, valueClass, note,
}: {
  label: string
  value: string
  pct: number
  barClass: string
  valueClass?: string
  note?: string
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <p className="text-[11px] font-medium text-muted-foreground truncate">{label}</p>
        <p className={cn('text-xs font-semibold tabular-nums flex-shrink-0', valueClass)}>{value}</p>
      </div>
      <div className="h-2 rounded-full bg-zinc-200 overflow-hidden">
        <div className={cn('h-full rounded-full', barClass)} style={{ width: `${pct}%` }} />
      </div>
      {note && <p className="text-[11px] text-amber-700 mt-1">{note}</p>}
    </div>
  )
}

// ── Right sidebar — the legacy 5 tabs + §29 status pill ──

type SidebarTab = 'observations' | 'production' | 'visitage' | 'qualite' | 'performance'

function OfSidebar({
  detail, etat, isEditing, onActiver, onTerminer, isChanging, canEdit,
}: {
  detail: OfDetail
  etat: OfEtat
  isEditing: boolean
  onActiver: () => void
  onTerminer: () => void
  isChanging: boolean
  canEdit: boolean
}) {
  const [tab, setTab] = useState<SidebarTab>('observations')
  // Selecting another OF resets the tab-local piece/roll focus via key-scoped
  // components below (queries are keyed by id), the tab itself persists.

  const tabs: { key: SidebarTab; label: string; icon: ComponentType<{ className?: string }> }[] = [
    { key: 'observations', label: 'Obs.', icon: MessageSquare },
    { key: 'production', label: 'Prod.', icon: Factory },
    { key: 'visitage', label: 'Visitage', icon: Eye },
    { key: 'qualite', label: 'Qualité', icon: Award },
    { key: 'performance', label: 'Perf.', icon: Activity },
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
                  tab === t.key ? 'bg-accent text-accent-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent/10',
                )}
              >
                <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">{t.label}</span>
              </button>
            )
          })}
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-transparent">
          {tab === 'observations' && <ObservationsTab ofId={detail.id} canEdit={canEdit} />}
          {tab === 'production' && <ProductionTab ofId={detail.id} />}
          {tab === 'visitage' && <VisitageTab ofId={detail.id} />}
          {tab === 'qualite' && <QualiteTab ofId={detail.id} />}
          {tab === 'performance' && <PerformanceTab ofId={detail.id} />}
        </div>
      </div>

      <StatutPill
        etat={etat}
        onActiver={onActiver}
        onTerminer={onTerminer}
        isChanging={isChanging}
        disabled={isEditing}
        canEdit={canEdit}
      />
    </div>
  )
}

// Tab 1 — Observations (message_of)

function ObservationsTab({ ofId, canEdit }: { ofId: number; canEdit: boolean }) {
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const { data, isLoading } = useQuery<ObservationRow[]>({
    queryKey: ['of-trm-observations', ofId],
    queryFn: () => apiFetch(`/of-trm/${ofId}/observations`),
  })
  const addMut = useMutation({
    mutationFn: () => apiFetch(`/of-trm/${ofId}/observations`, {
      method: 'POST',
      body: JSON.stringify({ observation: text.trim() }),
    }),
    onSuccess: () => {
      setText('')
      queryClient.invalidateQueries({ queryKey: ['of-trm-observations', ofId] })
    },
  })

  return (
    <>
      {isLoading && <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-14 bg-muted animate-pulse rounded-md" />)}</div>}
      {!isLoading && (data ?? []).length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <MessageSquare className="h-8 w-8 mb-2 opacity-50" />
          <p className="text-sm">Aucune observation</p>
        </div>
      )}
      {(data ?? []).map((o) => (
        <div key={o.id} className="p-3 rounded-lg border bg-card shadow-sm">
          <div className="flex items-center gap-2.5">
            <BonnetierAvatar id={o.IDbonnetier} name={o.bonnetier} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium truncate">{o.bonnetier || 'Bureau'}</p>
                <p className="text-[10px] text-muted-foreground tabular-nums flex-shrink-0">{fmtDateTime(o.date)}</p>
              </div>
            </div>
          </div>
          <p className="text-sm text-muted-foreground whitespace-pre-line mt-1.5">{o.observation}</p>
        </div>
      ))}
      {/* The workshop writes from its terminals; the bureau adds here without
          needing edit mode (deliberate delta vs the legacy edit-gated Ajouter).
          Reading the thread stays open without edit_of — an observation is how
          the atelier is told what to watch for. */}
      {canEdit && (
      <div className="pt-1 space-y-1.5">
        <textarea
          rows={2}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
          placeholder="Ajouter une observation…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Button
          variant="outline" size="sm" className="w-full"
          disabled={text.trim() === '' || addMut.isPending}
          onClick={() => addMut.mutate()}
        >
          {addMut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
          Ajouter
        </Button>
      </div>
      )}
    </>
  )
}

// Tab 2 — Production (piece_production + evenement_piece)

function ProductionTab({ ofId }: { ofId: number }) {
  const [pieceId, setPieceId] = useState<number | null>(null)
  const { data, isLoading } = useQuery<ProductionPayload>({
    queryKey: ['of-trm-production', ofId],
    queryFn: () => apiFetch(`/of-trm/${ofId}/production`),
  })
  const { data: events, isLoading: eventsLoading } = useQuery<PieceEvent[]>({
    queryKey: ['of-trm-piece-evts', ofId, pieceId],
    queryFn: () => apiFetch(`/of-trm/${ofId}/pieces/${pieceId}/evenements`),
    enabled: pieceId !== null,
  })

  // Default focus on the newest piece once loaded.
  useEffect(() => {
    if (data && data.pieces.length > 0 && (pieceId === null || !data.pieces.some((p) => p.id === pieceId))) {
      setPieceId(data.pieces[0].id)
    }
  }, [data, pieceId])

  const focused = data?.pieces.find((p) => p.id === pieceId) ?? null

  return (
    <>
      <div className="text-center py-1">
        <p className="text-lg font-bold">{data ? `${fmtNum(data.produites)} pièces produites` : '…'}</p>
        {data && data.non_visitees > 0 && (
          <p className="text-xs text-destructive">{fmtNum(data.non_visitees)} pièce{data.non_visitees > 1 ? 's' : ''} non visitée{data.non_visitees > 1 ? 's' : ''}</p>
        )}
        {data?.approx && (
          <p className="text-[10px] text-muted-foreground mt-0.5" title="Le % est estimé à partir de la fiche machine (trs / chutes / vitesse) — la formule legacy exacte n'est pas récupérable.">
            % de rendement : estimation ⓘ
          </p>
        )}
      </div>
      <PanelTable
        loading={isLoading}
        rows={data?.pieces ?? []}
        emptyLabel="Aucune pièce produite"
        emptyIcon={Factory}
        onRowClick={(p) => setPieceId(p.id)}
        selectedId={pieceId}
        columns={[
          { key: 'numero', label: 'Pièce', align: 'left', render: (p) => <span className="font-medium">N° {p.numero}</span> },
          { key: 'minutes', label: 'Durée', align: 'right', render: (p) => (p.minutes !== null ? `${fmtNum(p.minutes)} min` : 'en cours') },
          {
            key: 'pct', label: '%', align: 'right', render: (p) => p.pct === null ? <span className="text-muted-foreground">—</span> : (
              <span className={cn('font-semibold', p.pct >= 95 ? 'text-green-700' : p.pct >= 70 ? 'text-foreground' : 'text-amber-700')}>
                {fmtNum(p.pct)} %
              </span>
            ),
          },
        ]}
      />
      {focused && (
        <div className="pt-1">
          <p className="text-xs font-semibold mb-1.5">Pièce N° {focused.numero}</p>
          <EventTimeline events={events} loading={eventsLoading} />
        </div>
      )}
    </>
  )
}

// Tab 3 — Visitage (stock_ecru rolls + their events)

function VisitageTab({ ofId }: { ofId: number }) {
  const [rollId, setRollId] = useState<number | null>(null)
  const { data, isLoading } = useQuery<VisitagePayload>({
    queryKey: ['of-trm-visitage', ofId],
    queryFn: () => apiFetch(`/of-trm/${ofId}/visitage`),
  })
  const { data: events, isLoading: eventsLoading } = useQuery<PieceEvent[]>({
    queryKey: ['of-trm-roll-evts', ofId, rollId],
    queryFn: () => apiFetch(`/of-trm/${ofId}/rolls/${rollId}/evenements`),
    enabled: rollId !== null,
  })
  const focused = data?.pieces.find((p) => p.id === rollId) ?? null

  return (
    <>
      <div className="text-center py-1">
        <p className="text-lg font-bold">{data ? `${fmtNum(data.total_kg, 2)} Kgs visité` : '…'}</p>
        {data && data.second_choix_kg > 0 && (
          <p className="text-xs text-muted-foreground">dont {fmtNum(data.second_choix_kg, 2)} Kg en 2ème choix</p>
        )}
      </div>
      <PanelTable
        loading={isLoading}
        rows={data?.pieces ?? []}
        emptyLabel="Aucune pièce visitée"
        emptyIcon={TmRollIcon}
        onRowClick={(p) => setRollId(p.id)}
        selectedId={rollId}
        columns={[
          { key: 'numero', label: 'Pièce', align: 'left', render: (p) => <span className="font-medium font-mono">{p.numero}</span> },
          { key: 'poids', label: 'Poids', align: 'right', render: (p) => `${fmtNum(p.poids, 1)} Kg` },
          {
            key: 'choix', label: 'Choix', align: 'right', render: (p) => p.second_choix === 1 ? (
              <Badge variant="outline" className="text-[10px] py-0 bg-amber-500/15 text-amber-800 border-amber-500/30">2ème choix</Badge>
            ) : (
              <span className="text-muted-foreground text-[11px]">1er choix</span>
            ),
          },
        ]}
        rowClassName={(p) => (p.expedie ? 'opacity-70' : undefined)}
      />
      {focused && (
        <div className="pt-1 space-y-1.5">
          <p className="text-xs font-semibold">Pièce {focused.numero}</p>
          {focused.defects.length > 0 && (
            <div className="p-2 rounded-lg border border-amber-500/30 bg-amber-500/10">
              <p className="text-[11px] font-medium text-amber-800 mb-0.5">Défauts</p>
              <p className="text-xs text-amber-900">
                {focused.defects.map((df) => {
                  const detail = df.taille_cm > 0 ? `${fmtNum(df.taille_cm)} cm` : df.nombre > 0 ? `x${fmtNum(df.nombre)}` : ''
                  return `${df.type_defaut}${detail ? ` (${detail})` : ''}`
                }).join(' · ')}
              </p>
            </div>
          )}
          {focused.visiteur && (
            <p className="text-[11px] text-muted-foreground">Visité par {focused.visiteur} · {fmtDateTime(focused.date_saisie)}</p>
          )}
          <EventTimeline events={events} loading={eventsLoading} />
        </div>
      )}
    </>
  )
}

// Tab 4 — Qualité (defaut_qualite, second choix, tranches de 300 kg)

function QualiteTab({ ofId }: { ofId: number }) {
  const [mode, setMode] = useState<'continue' | 'ponctuel'>('continue')
  const { data, isLoading } = useQuery<QualitePayload>({
    queryKey: ['of-trm-qualite', ofId],
    queryFn: () => apiFetch(`/of-trm/${ofId}/qualite`),
  })

  if (isLoading) {
    return <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-md" />)}</div>
  }
  if (!data || data.total_kg === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Award className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm">Aucune production visitée</p>
      </div>
    )
  }
  const pct = data.second_choix_pct_poids
  return (
    <>
      <div className="text-center py-2">
        <p className={cn('text-3xl font-bold tabular-nums', pct < 2 ? 'text-green-600' : pct < 5 ? 'text-amber-600' : 'text-destructive')}>
          {fmtNum(pct, 2).replace('.', ',')} %
        </p>
        <p
          className="text-sm font-medium"
          title={`Second choix : ${fmtNum(data.second_choix_kg, 2)} Kg sur ${fmtNum(data.total_kg, 2)} Kg (${fmtNum(data.second_choix_pct_nb, 1)} % des pièces)`}
        >
          Second Choix ⓘ
        </p>
      </div>

      <div className="p-3 rounded-lg border bg-card shadow-sm">
        <div className="flex justify-center gap-1 mb-2">
          {([
            { key: 'continue', label: 'Continue' },
            { key: 'ponctuel', label: 'Ponctuel' },
          ] as const).map((opt) => (
            <button
              key={opt.key}
              onClick={() => setMode(opt.key)}
              className={cn(
                'px-3 py-1 text-xs rounded-md transition-colors',
                mode === opt.key ? 'bg-accent text-accent-foreground shadow-sm font-medium' : 'text-muted-foreground hover:bg-accent/10',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <MiniLineChart
          values={data.tranches.map((t) => (mode === 'continue' ? t.continue_cm : t.ponctuel))}
          xLabels={(i) => `${fmtNum(data.tranches[i]?.kg_max ?? 0)} Kg`}
          color="#e34948"
          unit={mode === 'continue' ? 'cm' : 'défauts'}
          height={150}
        />
        <p className="text-[10px] text-muted-foreground text-center">Tranches de 300 Kgs</p>
      </div>

      <div className="p-3 rounded-lg border bg-card shadow-sm">
        <DefautsDonut slices={data.pie} />
      </div>
    </>
  )
}

// Tab 5 — Performance (evenement_machine — arrêts per rouleau)

function PerformanceTab({ ofId }: { ofId: number }) {
  const { data, isLoading } = useQuery<PerformancePayload>({
    queryKey: ['of-trm-perf', ofId],
    queryFn: () => apiFetch(`/of-trm/${ofId}/performance`),
  })

  if (isLoading) {
    return <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-md" />)}</div>
  }
  if (!data || !data.covered || data.pieces.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-muted-foreground text-center px-4">
        <Activity className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm font-medium">Aucune donnée automate sur la période</p>
        <p className="text-xs mt-1">Le recorder ne couvre que les métiers connectés à un automate.</p>
      </div>
    )
  }
  return (
    <>
      <div className="text-center py-2">
        <p className="text-3xl font-bold tabular-nums text-green-600">{fmtNum(data.arrets_par_piece ?? 0, 1)}</p>
        <p className="text-sm font-medium" title="Arrêts machine détectés par l'automate pendant le tricotage de chaque pièce (arrêts de moins de 2 min ignorés).">
          Nombre d'arrêts par pièce ⓘ
        </p>
      </div>
      <div className="p-3 rounded-lg border bg-card shadow-sm">
        <MiniLineChart
          values={data.pieces.map((p) => p.arrets)}
          xLabels={(i) => `Pièce ${data.pieces[i]?.numero ?? ''}`}
          color="#e34948"
          unit="arrêts"
          height={170}
        />
        <p className="text-[10px] text-muted-foreground text-center">Arrêts par rouleau</p>
      </div>
    </>
  )
}

