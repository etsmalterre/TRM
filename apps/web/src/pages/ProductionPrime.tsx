import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  AlertCircle,
  BadgeCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  PackageX,
  Printer,
  TriangleAlert,
  Users,
} from 'lucide-react'
import { apiFetch, API_URL } from '@/lib/api'
import { cn } from '@/lib/utils'
import { fmtNum } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

// Production › Prime — semester production bonus (legacy FI_Prime / FEN_Prime).
// Read-only dashboard: the semester being browsed (Précédent / Suivant, blocked
// at the current one), the current week, and the per-bonnetier répartition.
// All computation lives in the API (ETM `routes/prime-trm.ts`) so the screen
// and the printed PDF can never disagree.

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

/** Amount color: green when it earns, red when it costs, muted at zero. */
function montantClass(v: number): string {
  if (v > 0) return 'text-green-600'
  if (v < 0) return 'text-destructive'
  return 'text-muted-foreground'
}

// ── The three production blocs share one visual definition ──

const BLOCS = [
  {
    key: 'premierChoix' as const,
    label: 'Production 1er Choix',
    icon: BadgeCheck,
    iconBg: 'bg-green-500/10',
    iconColor: 'text-green-600',
    badge: 'bg-green-500/15 text-green-700 border-green-500/30',
  },
  {
    key: 'secondChoix' as const,
    label: 'Production 2nd Choix',
    icon: TriangleAlert,
    iconBg: 'bg-amber-400/10',
    iconColor: 'text-amber-600',
    badge: 'bg-amber-500/15 text-amber-800 border-amber-500/30',
  },
  {
    key: 'retourClient' as const,
    label: 'Retour client',
    icon: PackageX,
    iconBg: 'bg-destructive/10',
    iconColor: 'text-destructive/70',
    badge: 'bg-destructive/10 text-destructive border-destructive/30',
  },
]

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
      src={`${API_URL}/prime-trm/bonnetiers/${id}/photo`}
      alt={prenom}
      className="h-10 w-10 rounded-full flex-shrink-0 object-cover border border-border/60 bg-muted"
      onError={() => setFailed(true)}
    />
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
    <div className="h-full flex flex-col gap-3 min-h-0">
      {/* Toolbar — semester navigation + total + print */}
      <div className="flex-shrink-0 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            title="Semestre précédent"
            disabled={isFetching}
            onClick={() => setRef(periode.precedentRef)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            title="Semestre suivant"
            disabled={periode.suivantRef === null || isFetching}
            onClick={() => periode.suivantRef && setRef(periode.suivantRef)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="min-w-0">
          <p className="text-lg font-heading font-bold tracking-tight leading-tight">
            {periode.label}
            {periode.estCourante && (
              <Badge variant="secondary" className="text-[10px] ml-2 align-middle">
                En cours
              </Badge>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            du {frDate(periode.debut)} au {frDate(periode.fin)}
          </p>
        </div>

        <div className="flex-1" />

        <div className="text-right">
          <p className="text-xs text-muted-foreground leading-tight">Prime du semestre</p>
          <p className={cn('text-2xl font-heading font-bold tabular-nums leading-tight', montantClass(semestre.total))}>
            {fmtEur(semestre.total)}
          </p>
        </div>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          title="Imprimer"
          onClick={() => window.open(`${API_URL}/prime-trm/pdf?ref=${ref}`, '_blank')}
        >
          <Printer className="h-4 w-4" />
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-auto scrollbar-transparent space-y-4">
        {/* Semester blocs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {BLOCS.map((b) => {
            const bloc = semestre[b.key]
            return (
              <Card key={b.key} className="card-premium">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0', b.iconBg)}>
                        <b.icon className={cn('h-4 w-4', b.iconColor)} />
                      </div>
                      <p className="text-sm font-semibold truncate">{b.label}</p>
                    </div>
                    <Badge variant="outline" className={cn('text-[10px] flex-shrink-0 tabular-nums', b.badge)}>
                      {fmtTaux(tauxOf[b.key])}
                    </Badge>
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-2">
                    <span className="text-sm text-muted-foreground tabular-nums">{fmtNum(bloc.kg)} kg</span>
                    <span className={cn('text-xl font-bold tabular-nums', montantClass(bloc.montant))}>
                      {fmtEur(bloc.montant)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Current week — always the running week, whatever semester is browsed */}
        <Card className="card-premium">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg flex items-center justify-center icon-box-gold">
                  <CalendarDays className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold leading-tight">Semaine {semaine.numero}</p>
                  <p className="text-xs text-muted-foreground">
                    du {frDate(semaine.debut, false)} au {frDate(semaine.fin, false)}
                  </p>
                </div>
              </div>
              <span className={cn('text-lg font-bold tabular-nums', montantClass(semaine.total))}>
                {fmtEur(semaine.total)}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
              {BLOCS.map((b) => {
                const bloc = semaine[b.key]
                return (
                  <div
                    key={b.key}
                    className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <b.icon className={cn('h-3.5 w-3.5 flex-shrink-0', b.iconColor)} />
                      <span className="text-xs text-muted-foreground truncate">{b.label}</span>
                    </div>
                    <div className="flex items-baseline gap-2 flex-shrink-0 tabular-nums">
                      <span className="text-xs text-muted-foreground">{fmtNum(bloc.kg)} kg</span>
                      <span className={cn('text-sm font-semibold', montantClass(bloc.montant))}>
                        {fmtEur(bloc.montant)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Répartition */}
        <Card className="card-premium">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg flex items-center justify-center icon-box-gold">
                <Users className="h-4 w-4" />
              </div>
              <p className="text-sm font-semibold">Répartition</p>
              {repartition.length > 0 && (
                <Badge variant="secondary" className="text-xs ml-auto tabular-nums">
                  {joursTotal} jours travaillés
                </Badge>
              )}
            </div>
            {repartition.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Users className="h-10 w-10 mb-2 opacity-40" />
                <p className="text-sm">Aucun bonnetier sur la période</p>
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {repartition.map((r) => (
                  <div
                    key={r.IDbonnetier}
                    className={cn(
                      'flex items-center gap-3 rounded-lg border-l-4 border border-border/60 bg-zinc-100/80 p-3',
                      'border-l-amber-400/60',
                    )}
                  >
                    <BonnetierAvatar id={r.IDbonnetier} prenom={r.prenom} nom={r.nom} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{r.prenom}</p>
                      <p className="text-[11px] text-muted-foreground tabular-nums">{r.jours} jours</p>
                    </div>
                    <span className={cn('text-sm font-bold tabular-nums flex-shrink-0', montantClass(r.montant))}>
                      {fmtEur(r.montant)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
