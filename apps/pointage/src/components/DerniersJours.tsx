// « 7 derniers jours » on the salarié's screen: his last worked days judged by
// the very rules of the daily « Rapport de pointage » email (API
// lib/rapport-pointage.ts, read through the email's own analyserJours) — red
// where the email turns red, the email's reason in words underneath, and GREEN
// for a day in order (Vincent, 2026-09-24: show what is right too, so the
// salarié aims at an all-green week).
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { fetchJournees, type Journee, type PlageHM } from '@/lib/pointage-api'
import { dureeTexte, jourCourt } from '@/lib/heures'
import { cn } from '@/lib/utils'

const GRID = 'grid grid-cols-[7.5rem_repeat(4,minmax(0,1fr))] items-center gap-x-3'
const plage = (p: PlageHM) => `${p.debut}–${p.fin}`

function Heure({ valeur, rouge }: { valeur: string | null; rouge: boolean }) {
  if (valeur === null) return <span className="text-sm font-semibold text-destructive whitespace-nowrap">non pointé</span>
  return <span className={cn('tabular-nums', rouge && 'font-bold text-destructive')}>{valeur}</span>
}

function Ligne({ j }: { j: Journee }) {
  const alerte = j.alertes.length > 0
  const pause = j.pauseMin + j.repasMin
  return (
    <li
      className={cn(
        'px-4 py-2',
        alerte
          ? 'bg-destructive/[0.06] shadow-[inset_4px_0_0_0_hsl(var(--destructive))]'
          : 'bg-success/[0.06] shadow-[inset_4px_0_0_0_hsl(var(--success))]',
      )}
    >
      <div className={cn(GRID, 'text-base')}>
        <div className="min-w-0">
          <p className={cn('flex items-center gap-1.5 font-semibold leading-tight', alerte ? 'text-destructive' : 'text-success')}>
            {alerte ? <AlertCircle className="h-4 w-4 flex-shrink-0" /> : <CheckCircle2 className="h-4 w-4 flex-shrink-0" />}
            {jourCourt(j.jour)}
          </p>
          <p className="pl-[1.375rem] text-xs text-muted-foreground tabular-nums leading-tight">{j.prevu ? plage(j.prevu) : 'Journée'}</p>
        </div>
        <div className="text-center"><Heure valeur={j.debut} rouge={j.rouge.debut} /></div>
        <div className="text-center">
          <span className={cn('tabular-nums', j.rouge.pause || j.rouge.repas ? 'font-bold text-destructive' : !pause && 'text-muted-foreground')}>
            {pause ? dureeTexte(pause) : '—'}
          </span>
        </div>
        <div className="text-center">
          {j.debut === null ? <span className="text-muted-foreground">—</span> : <Heure valeur={j.fin} rouge={j.rouge.fin} />}
        </div>
        <div className="text-right tabular-nums font-semibold text-primary">
          {j.enPosteMin !== null ? dureeTexte(j.enPosteMin) : <span className="text-muted-foreground font-normal">—</span>}
        </div>
      </div>
      {alerte && <p className="mt-0.5 text-sm leading-snug text-destructive">{j.alertes.join(' · ')}</p>}
    </li>
  )
}

export function DerniersJours({ idSalarie }: { idSalarie: number }) {
  // Past days: read once per visit, not on the tablet's 10 s poll.
  const { data } = useQuery({
    queryKey: ['pointage', 'journees', idSalarie],
    queryFn: () => fetchJournees(idSalarie),
    refetchInterval: false,
  })
  if (!data?.length) return null
  const aVerifier = data.filter((j) => j.alertes.length).length

  return (
    <div className="flex-shrink-0 rounded-xl border border-border bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-2 bg-sand border-b border-border flex items-center gap-2">
        <span className="flex-1 text-xs font-semibold uppercase tracking-wide text-accent">7 derniers jours</span>
        {/* The good days first: the count to raise, out of the days shown. */}
        <span className="rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success tabular-nums">
          {data.length - aVerifier} / {data.length} au vert
        </span>
        {aVerifier > 0 && (
          <span className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive">
            {aVerifier} à vérifier
          </span>
        )}
      </div>
      <div className={cn(GRID, 'px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground')}>
        <span>Jour</span>
        <span className="text-center">Arrivée</span>
        <span className="text-center">Pauses</span>
        <span className="text-center">Départ</span>
        <span className="text-right">En poste</span>
      </div>
      <ul className="divide-y divide-border">
        {data.map((j) => (
          <Ligne key={j.jour} j={j} />
        ))}
      </ul>
    </div>
  )
}
