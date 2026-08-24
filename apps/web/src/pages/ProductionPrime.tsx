import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  AlertCircle,
  BadgeCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Coins,
  Loader2,
  Minus,
  PackageX,
  PieChart,
  Printer,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Users,
} from 'lucide-react'
import { apiFetch, API_URL } from '@/lib/api'
import { cn } from '@/lib/utils'
import { fmtNum } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

// Production › Prime — semester production bonus (legacy FI_Prime / FEN_Prime).
// Read-only dashboard: the semester being browsed (Précédent / Suivant, blocked
// at the current one), the déclassements analysis, the current week, and the
// per-bonnetier répartition. All computation lives in the API (ETM
// `routes/prime-trm.ts`) so the screen and the printed PDF can never disagree.
//
// Layout: hero navy band on top, then the classic two-column shape — the
// répartition as a left list panel (zinc body, §43 navy cap), the money story
// on the right (tiles → analysis → current week). Every section is capped by
// the §43 navy widget band; the production blocs carry the §7 status colors.

// ── Types (mirror apps/api/src/routes/prime-trm.ts) ──────

interface PrimeBloc {
  kg: number
  montant: number
}

interface PrimeBlocSet {
  premierChoix: PrimeBloc
  secondChoix: PrimeBloc
  retourClient: PrimeBloc
  total: number
}

interface DeclassementType {
  type: string
  kg: number
  pieces: number
  /** Positive "manque à gagner" (kg × 0,20 €) — rendered with a minus. */
  montant: number
  pct: number
}

interface DeclassementsAnalyse {
  kg: number
  kgTotal: number
  taux: number | null
  comparaison: { label: string; debut: string; fin: string; taux: number | null }
  types: DeclassementType[]
}

interface PrimePayload {
  periode: {
    numSemestre: 1 | 2
    label: string
    debut: string
    fin: string
    estCourante: boolean
    precedentRef: string
    suivantRef: string | null
  }
  taux: { premierChoix: number; secondChoix: number; retourClient: number }
  semestre: PrimeBlocSet
  semaine: PrimeBlocSet & { numero: number; debut: string; fin: string }
  repartition: Array<{
    IDbonnetier: number
    prenom: string
    nom: string
    jours: number
    montant: number
  }>
  joursTotal: number
  declassements: DeclassementsAnalyse
}

// ── Formatting ───────────────────────────────────────────

function fmtEur(v: number): string {
  return `${fmtNum(v, 2)} €`
}

/** 'YYYY-MM-DD' → 'DD/MM/YYYY' (or 'DD/MM'). */
function frDate(iso: string, withYear = true): string {
  return withYear
    ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
    : `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

function fmtTaux(v: number): string {
  return `${v > 0 ? '+' : ''}${fmtNum(v, 2)} €/Kg`
}

function fmtPct(v: number): string {
  return `${fmtNum(v * 100, 2)} %`
}

/** Amount color on a white surface: green earns, red costs, muted at zero. */
function montantClass(v: number): string {
  if (v > 0) return 'text-green-600'
  if (v < 0) return 'text-destructive'
  return 'text-muted-foreground'
}

/** Amount color on the navy band: gold is the brand highlight, red for losses. */
function montantOnNavyClass(v: number): string {
  return v < 0 ? 'text-red-300' : 'text-gold'
}

// ── The three production blocs share one visual definition ──

const BLOCS = [
  {
    key: 'premierChoix' as const,
    label: 'Production 1er Choix',
    icon: BadgeCheck,
    edge: 'border-l-green-500/60',
    iconBg: 'bg-green-500/10',
    iconColor: 'text-green-600',
    badge: 'bg-green-500/15 text-green-700 border-green-500/30',
  },
  {
    key: 'secondChoix' as const,
    label: 'Production 2nd Choix',
    icon: TriangleAlert,
    edge: 'border-l-amber-400/60',
    iconBg: 'bg-amber-400/10',
    iconColor: 'text-amber-600',
    badge: 'bg-amber-500/15 text-amber-800 border-amber-500/30',
  },
  {
    key: 'retourClient' as const,
    label: 'Retour client',
    icon: PackageX,
    edge: 'border-l-destructive/60',
    iconBg: 'bg-destructive/10',
    iconColor: 'text-destructive/70',
    badge: 'bg-destructive/10 text-destructive border-destructive/30',
  },
]

// ── §43 navy widget band, shared by the section cards ────

function SectionBand({
  icon: Icon,
  children,
  actions,
}: {
  icon: typeof Users
  children: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="flex-shrink-0 flex items-center gap-2.5 border-b-2 border-gold bg-primary px-4 py-2.5">
      <div className="h-8 w-8 flex-shrink-0 rounded-lg flex items-center justify-center shadow-sm bg-gold text-gold-foreground">
        <Icon className="h-[18px] w-[18px]" />
      </div>
      <h2 className="min-w-0 flex-1 text-base font-heading font-bold tracking-tight truncate text-primary-foreground">
        {children}
      </h2>
      {actions}
    </div>
  )
}

// ── Déclassements: fixed defect-type colors + donut ──────
// Palette validated with the dataviz six-checks script against the app surface
// (light mode); the 6.9-ΔE deutan pair is relieved by the 2px slice gaps and
// the ranked legend list, which always names every slice with its values.
// Color follows the ENTITY: a type keeps its color whatever its rank.

const DEFAUT_COLORS: Record<string, string> = {
  Maille: '#3B7DC9',
  'Démaillage': '#BE5F37',
  'Barrure Lycra': '#00A190',
  'Autre Barrure': '#B84A6E',
  Trou: '#C28A04',
  Grille: '#8A63B8',
  Autres: '#94A3B8',
  'Non renseigné': '#CBD5E1',
}

function defautColor(type: string): string {
  return DEFAUT_COLORS[type] ?? DEFAUT_COLORS.Autres
}

/** Dependency-free SVG donut. Slices start at 12 o'clock; the white stroke
 *  provides the 2px surface gap between fills the mark specs require. */
function Donut({
  slices,
  centerTitle,
  centerSub,
  size = 224,
  thickness = 34,
}: {
  slices: Array<{ label: string; value: number; color: string; title: string }>
  centerTitle: string
  centerSub: string
  size?: number
  thickness?: number
}) {
  const c = size / 2
  const R = c - 4
  const total = slices.reduce((s, x) => s + x.value, 0)
  if (total <= 0) return null

  const polar = (angle: number, radius: number) => ({
    x: c + radius * Math.sin(angle),
    y: c - radius * Math.cos(angle),
  })
  let acc = 0
  const paths = slices
    .filter((s) => s.value > 0)
    .map((s) => {
      const a0 = (acc / total) * Math.PI * 2
      acc += s.value
      // Cap at 99.999% so a lone full-circle slice still renders as an arc.
      const a1 = Math.min(acc / total, 0.99999) * Math.PI * 2
      const rOut = R
      const rIn = R - thickness
      const large = a1 - a0 > Math.PI ? 1 : 0
      const p0 = polar(a0, rOut)
      const p1 = polar(a1, rOut)
      const p2 = polar(a1, rIn)
      const p3 = polar(a0, rIn)
      const d = [
        `M ${p0.x} ${p0.y}`,
        `A ${rOut} ${rOut} 0 ${large} 1 ${p1.x} ${p1.y}`,
        `L ${p2.x} ${p2.y}`,
        `A ${rIn} ${rIn} 0 ${large} 0 ${p3.x} ${p3.y}`,
        'Z',
      ].join(' ')
      return { ...s, d }
    })

  // `size` is the coordinate space; the SVG scales to its container so the
  // donut grows into whatever room the card gives it.
  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" className="w-full h-auto max-w-[360px] flex-shrink-0">
      {paths.map((s) => (
        <path key={s.label} d={s.d} fill={s.color} stroke="white" strokeWidth={2} strokeLinejoin="round">
          <title>{s.title}</title>
        </path>
      ))}
      <text x={c} y={c - 5} textAnchor="middle" className="fill-foreground" fontSize={size / 9} fontWeight={700}>
        {centerTitle}
      </text>
      <text x={c} y={c + size / 14} textAnchor="middle" className="fill-muted-foreground" fontSize={size / 18}>
        {centerSub}
      </text>
    </svg>
  )
}

// ── Taux comparison — two labeled mini-bars, verdict chip ──

function TauxComparison({ data }: { data: DeclassementsAnalyse }) {
  const { taux, comparaison, kg, kgTotal } = data
  const prevTaux = comparaison.taux
  const deltaPts = taux !== null && prevTaux !== null ? (taux - prevTaux) * 100 : null
  const max = Math.max(taux ?? 0, prevTaux ?? 0)
  // Verdict tint for the headline — only when a comparison exists; the chip
  // below repeats it with an icon + label so the colour is never alone.
  const verdictClass =
    deltaPts === null
      ? 'text-foreground'
      : deltaPts < -0.005
        ? 'text-green-700'
        : deltaPts > 0.005
          ? 'text-destructive'
          : 'text-foreground'

  const bar = (value: number | null, colorClass: string) => (
    <div className="flex-1 h-2.5 rounded-full bg-zinc-200/70 overflow-hidden">
      {value !== null && max > 0 && (
        <div
          className={cn('h-full rounded-full', colorClass)}
          style={{ width: `${Math.max(3, (value / max) * 100)}%` }}
        />
      )}
    </div>
  )

  return (
    <div className="h-full flex flex-col justify-center gap-6">
      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Taux de 2nd choix</p>
        <p className={cn('text-5xl font-heading font-bold tabular-nums leading-tight', verdictClass)}>
          {taux !== null ? fmtPct(taux) : '—'}
        </p>
        <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
          {fmtNum(kg)} kg déclassés sur {fmtNum(kgTotal)} kg produits
        </p>
      </div>

      {/* The comparison, readable at a glance: shorter bar = better semester. */}
      <div className="space-y-2">
        <div className="flex items-center gap-2.5">
          <span className="w-28 text-xs font-medium flex-shrink-0">Ce semestre</span>
          {bar(taux, 'bg-primary')}
          <span className="w-14 text-xs font-semibold tabular-nums text-right">
            {taux !== null ? fmtPct(taux) : '—'}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          {/* Always the FULL previous semester — a fixed number to beat, not a
              window that moves with the calendar. Which semester it is lives in
              the tooltip; the PDF spells it out. */}
          <span className="w-28 text-xs text-muted-foreground flex-shrink-0 cursor-help" title={`${comparaison.label} (semestre complet)`}>
            Semestre préc.
          </span>
          {bar(prevTaux, 'bg-zinc-400')}
          <span className="w-14 text-xs tabular-nums text-muted-foreground text-right">
            {prevTaux !== null ? fmtPct(prevTaux) : '—'}
          </span>
        </div>
      </div>

      {deltaPts !== null ? (
        <div
          className={cn(
            'inline-flex items-center gap-1.5 self-start rounded-md px-2.5 py-1.5 text-sm font-semibold tabular-nums',
            deltaPts < -0.005
              ? 'bg-green-500/10 text-green-700'
              : deltaPts > 0.005
                ? 'bg-destructive/10 text-destructive'
                : 'bg-muted text-muted-foreground',
          )}
        >
          {deltaPts < -0.005 ? (
            <TrendingDown className="h-4 w-4" />
          ) : deltaPts > 0.005 ? (
            <TrendingUp className="h-4 w-4" />
          ) : (
            <Minus className="h-4 w-4" />
          )}
          {deltaPts > 0 ? '+' : ''}
          {fmtNum(deltaPts, 2)} pt ·{' '}
          {deltaPts < -0.005 ? 'en amélioration' : deltaPts > 0.005 ? 'en dégradation' : 'stable'}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Pas de production comparable sur {comparaison.label}</p>
      )}
    </div>
  )
}

// ── Déclassements analysis card ──────────────────────────

function DeclassementsCard({ data }: { data: DeclassementsAnalyse }) {
  const { types, kg } = data
  const totalPerdu = types.reduce((s, t) => s + t.montant, 0)

  return (
    <div className="rounded-lg border shadow-sm overflow-hidden bg-card lg:flex-1 lg:min-h-0 flex flex-col">
      <SectionBand
        icon={PieChart}
        actions={
          kg > 0 ? (
            <span className="text-lg font-heading font-bold tabular-nums text-red-300">
              -{fmtEur(totalPerdu)}
            </span>
          ) : undefined
        }
      >
        Analyse des déclassements
        <span className="font-normal text-white/60 text-sm"> · 2nd choix</span>
      </SectionBand>

      {kg <= 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-8 text-muted-foreground">
          <BadgeCheck className="h-10 w-10 mb-2 text-green-600/50" />
          <p className="text-sm">Aucun déclassement sur la période</p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 p-4 sm:p-5 flex flex-col xl:flex-row gap-6 xl:gap-8">
          <div className="xl:w-80 flex-shrink-0">
            <TauxComparison data={data} />
          </div>
          <div className="hidden xl:block w-px bg-border flex-shrink-0" />

          {/* Donut + ranked legend (the legend doubles as the data table,
              strictly sorted by lost money — server-side order). Side by side
              only when there is real room for both; stacked otherwise. The
              legend rows spread over the card's full height. */}
          <div className="flex-1 min-w-0 flex flex-col 2xl:flex-row items-center 2xl:items-stretch gap-6">
            <div className="flex items-center justify-center 2xl:w-[42%] flex-shrink-0">
              <Donut
                slices={types.map((t) => ({
                  label: t.type,
                  value: t.kg,
                  color: defautColor(t.type),
                  title: `${t.type} — ${fmtNum(t.kg)} kg · -${fmtEur(t.montant)} (${fmtNum(t.pct * 100, 1)} %)`,
                }))}
                centerTitle={`${fmtNum(kg)} kg`}
                centerSub="déclassés"
              />
            </div>
            <div className="flex-1 min-w-0 w-full flex flex-col justify-evenly gap-1">
              {types.map((t) => (
                <div key={t.type} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted/50">
                  <span
                    className="h-2.5 w-2.5 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: defautColor(t.type) }}
                  />
                  <span className="text-sm min-w-0 flex-1 truncate">{t.type}</span>
                  <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap w-16 text-right">
                    {fmtNum(t.kg)} kg
                  </span>
                  <span className="text-sm font-semibold tabular-nums whitespace-nowrap text-destructive w-20 text-right">
                    -{fmtEur(t.montant)}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap w-12 text-right">
                    {fmtNum(t.pct * 100, 1)} %
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Bonnetier avatar: photo with initials fallback ───────

function BonnetierAvatar({ id, prenom, nom }: { id: number; prenom: string; nom: string }) {
  const [failed, setFailed] = useState(false)
  const initials = `${prenom.charAt(0)}${nom.charAt(0)}`.toUpperCase() || '?'
  if (failed) {
    return (
      <div className="h-10 w-10 rounded-full flex-shrink-0 flex items-center justify-center bg-primary/10 text-primary text-sm font-semibold">
        {initials}
      </div>
    )
  }
  return (
    <img
      src={`${API_URL}/prime-trm/bonnetiers/${id}/photo?size=96`}
      alt={prenom}
      className="h-10 w-10 rounded-full flex-shrink-0 object-cover border-2 border-white shadow-sm bg-muted"
      onError={() => setFailed(true)}
    />
  )
}

// ── Répartition — left list panel ────────────────────────

function RepartitionPanel({
  repartition,
  joursTotal,
  total,
}: {
  repartition: PrimePayload['repartition']
  joursTotal: number
  total: number
}) {
  return (
    <div className="lg:w-80 flex-shrink-0 flex flex-col rounded-lg border shadow-sm overflow-hidden bg-zinc-100/80 lg:min-h-0 order-last lg:order-none">
      <SectionBand icon={Users}>Répartition</SectionBand>
      {repartition.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
          <Users className="h-10 w-10 mb-2 opacity-40" />
          <p className="text-sm">Aucun bonnetier sur la période</p>
        </div>
      ) : (
        <>
          <div className="lg:flex-1 lg:min-h-0 lg:overflow-auto scrollbar-transparent p-3 space-y-2">
            {repartition.map((r) => (
              <div key={r.IDbonnetier} className="flex items-center gap-3 p-2.5 rounded-lg border bg-card shadow-sm">
                <BonnetierAvatar id={r.IDbonnetier} prenom={r.prenom} nom={r.nom} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{r.prenom}</p>
                  <p className="text-[11px] text-muted-foreground tabular-nums">{r.jours} jours</p>
                </div>
                <span className={cn('text-sm font-heading font-bold tabular-nums flex-shrink-0', montantClass(r.montant))}>
                  {fmtEur(r.montant)}
                </span>
              </div>
            ))}
          </div>
          <div className="p-3 border-t bg-zinc-200/50 flex items-center justify-between text-xs">
            <span className="text-muted-foreground tabular-nums">{joursTotal} jours travaillés</span>
            <span className={cn('font-heading font-bold text-sm tabular-nums', montantClass(total))}>
              {fmtEur(total)}
            </span>
          </div>
        </>
      )}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────

export function ProductionPrime() {
  // Reference date driving the browsed semester; the API answers with the
  // period bounds plus the prev/next refs, so navigation is a plain setState.
  const [ref, setRef] = useState(() => new Date().toISOString().slice(0, 10))

  const { data, isLoading, isError, isFetching } = useQuery<PrimePayload>({
    queryKey: ['prime-trm', ref],
    queryFn: () => apiFetch(`/prime-trm?ref=${ref}`),
    placeholderData: keepPreviousData,
  })

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    )
  }
  if (isError || !data) {
    return (
      <div className="h-full flex items-center justify-center gap-2 text-destructive text-sm">
        <AlertCircle className="h-4 w-4" />
        Erreur de chargement de la prime
      </div>
    )
  }

  const { periode, semestre, semaine, repartition, joursTotal, taux } = data
  const tauxOf = { premierChoix: taux.premierChoix, secondChoix: taux.secondChoix, retourClient: taux.retourClient }

  return (
    <div className="h-full flex flex-col gap-4 min-h-0">
      {/* Hero band — period navigation + semester total (navy, §43 language) */}
      <div className="flex-shrink-0 rounded-lg border-b-2 border-gold bg-primary shadow-sm px-3 sm:px-4 py-3 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-white/80 hover:bg-white/15 hover:text-white"
            title="Semestre précédent"
            disabled={isFetching}
            onClick={() => setRef(periode.precedentRef)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-white/80 hover:bg-white/15 hover:text-white"
            title="Semestre suivant"
            disabled={periode.suivantRef === null || isFetching}
            onClick={() => periode.suivantRef && setRef(periode.suivantRef)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="h-9 w-9 flex-shrink-0 rounded-lg flex items-center justify-center shadow-sm bg-gold text-gold-foreground">
          <Coins className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-lg font-heading font-bold tracking-tight leading-tight text-primary-foreground truncate">
              {periode.label}
            </p>
            {periode.estCourante && (
              <Badge className="bg-white/15 text-white border-transparent text-[10px] flex-shrink-0">
                En cours
              </Badge>
            )}
          </div>
          <p className="text-xs text-white/60">
            du {frDate(periode.debut)} au {frDate(periode.fin)}
          </p>
        </div>

        <div className="flex-1" />

        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wide text-white/60 leading-tight">
            Prime du semestre
          </p>
          <p
            className={cn(
              'text-2xl font-heading font-bold tabular-nums leading-tight',
              montantOnNavyClass(semestre.total),
            )}
          >
            {fmtEur(semestre.total)}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-white/80 hover:bg-white/15 hover:text-white"
          title="Imprimer"
          onClick={() => window.open(`${API_URL}/prime-trm/pdf?ref=${ref}`, '_blank')}
        >
          <Printer className="h-4 w-4" />
        </Button>
      </div>

      {/* Body: répartition left panel + money story on the right */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4 overflow-auto lg:overflow-hidden scrollbar-transparent">
        <RepartitionPanel repartition={repartition} joursTotal={joursTotal} total={semestre.total} />

        <div className="flex-1 min-w-0 flex flex-col gap-4 lg:min-h-0 lg:overflow-auto scrollbar-transparent">
          {/* Semester blocs — §7 status-colored cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {BLOCS.map((b) => {
              const bloc = semestre[b.key]
              return (
                <div
                  key={b.key}
                  className={cn(
                    'rounded-lg border-l-4 border border-border/60 bg-card shadow-sm p-4',
                    b.edge,
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0', b.iconBg)}>
                      <b.icon className={cn('h-4 w-4', b.iconColor)} />
                    </div>
                    <p className="text-sm font-semibold truncate">{b.label}</p>
                  </div>
                  <div className="mt-4 flex items-end justify-between gap-2">
                    <div className="min-w-0">
                      <Badge variant="outline" className={cn('text-[10px] tabular-nums', b.badge)}>
                        {fmtTaux(tauxOf[b.key])}
                      </Badge>
                      <p className="text-sm font-medium tabular-nums mt-1.5 whitespace-nowrap">{fmtNum(bloc.kg)} kg</p>
                    </div>
                    <span className={cn('text-2xl font-heading font-bold tabular-nums whitespace-nowrap', montantClass(bloc.montant))}>
                      {fmtEur(bloc.montant)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Current week — only meaningful on the current semester: the block
              always describes the RUNNING week, which has nothing to do with a
              browsed historical period. */}
          {periode.estCourante && (
            <div className="rounded-lg border shadow-sm overflow-hidden bg-card">
              <SectionBand
                icon={CalendarDays}
                actions={
                  <>
                    <Badge className="bg-white/15 text-white border-transparent text-[10px] flex-shrink-0">
                      Semaine en cours
                    </Badge>
                    <span className={cn('text-lg font-heading font-bold tabular-nums', montantOnNavyClass(semaine.total))}>
                      {fmtEur(semaine.total)}
                    </span>
                  </>
                }
              >
                Semaine {semaine.numero}
                <span className="font-normal text-white/60 text-sm">
                  {' '}· du {frDate(semaine.debut, false)} au {frDate(semaine.fin, false)}
                </span>
              </SectionBand>
              <div className="p-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                {BLOCS.map((b) => {
                  const bloc = semaine[b.key]
                  return (
                    <div
                      key={b.key}
                      className={cn(
                        'flex items-center justify-between gap-2 rounded-lg border-l-4 border border-border/60 bg-zinc-100/80 px-3 py-2.5',
                        b.edge,
                      )}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <b.icon className={cn('h-3.5 w-3.5 flex-shrink-0', b.iconColor)} />
                        <span className="text-xs font-medium truncate">{b.label}</span>
                      </div>
                      <div className="flex items-baseline gap-2 flex-shrink-0 tabular-nums">
                        <span className="text-xs text-muted-foreground">{fmtNum(bloc.kg)} kg</span>
                        <span className={cn('text-sm font-bold', montantClass(bloc.montant))}>
                          {fmtEur(bloc.montant)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Why the 2nd-choix line loses money — defect breakdown + trend.
              Last, so it takes whatever height remains under the money cards. */}
          <DeclassementsCard data={data.declassements} />
        </div>
      </div>
    </div>
  )
}
