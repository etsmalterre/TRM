// The wall screen: the clock, the faces, and who is in right now.
//
// Legacy FEN_Pointage showed the clock and TABLE_Pointage, with a « Pointage »
// button leading to FEN_Choix_salarié (a button per salarié). With seven
// active salariés the faces fit on the home screen itself, so the tablet saves
// that tap: touching your face IS pointing (§45.4 — identification is a gate,
// and the photo is the check).
//
// The table is TABLE_Pointage's own content (API /en-poste, query given by
// Vincent): every OPEN line — arrival, pauses, minutes of finished pauses —
// so it reads « who is at work or on a break », not « the day's history ».
// A shift forgotten on a previous day stays in it, as in the legacy, flagged
// amber: it is what Admin Pointage has to close.
//
// Landscape, arm's length: faces on the left (the action), the table on the right.
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, Loader2 } from 'lucide-react'
import { fetchEnPoste, fetchSalaries, type LigneEnPoste, type SalarieGrille, type Statut } from '@/lib/pointage-api'
import { Horloge } from '@/components/Horloge'
import { SalariePhoto } from '@/components/SalariePhoto'
import { useAppareil } from '@/contexts/AppareilContext'
import { heure, jourCourt } from '@/lib/heures'
import { cn } from '@/lib/utils'

const STATUT: Record<Statut, { label: string; anneau: string; pastille: string }> = {
  au_travail: { label: 'Au travail', anneau: 'ring-success', pastille: 'bg-success/15 text-success' },
  en_pause: { label: 'En pause', anneau: 'ring-warning', pastille: 'bg-warning/20 text-amber-800' },
  hors_poste: { label: '', anneau: 'ring-transparent', pastille: '' },
}

/** Salarié · Arrivée · Pauses · Cumul — header and rows share it. */
const COLONNES = 'grid grid-cols-[minmax(0,1.6fr)_4.5rem_minmax(0,1.1fr)_4.25rem] gap-3'

export function Accueil() {
  const navigate = useNavigate()
  const { appareil } = useAppareil()
  const salaries = useQuery({ queryKey: ['pointage', 'salaries'], queryFn: fetchSalaries })
  const enPoste = useQuery({ queryKey: ['pointage', 'en-poste'], queryFn: fetchEnPoste })

  return (
    <div className="h-full flex flex-col">
      <header className="flex-shrink-0 bg-gradient-brand text-white">
        <div className="safe-top" />
        <div className="px-8 py-4 grid grid-cols-[1fr_auto_1fr] items-center gap-6">
          <img src="/logo-full.png" alt="Malterre" className="h-20 w-auto justify-self-start" />
          <Horloge />
          <div className="justify-self-end text-right text-xs text-white/45 leading-relaxed">
            {appareil?.libelle}
            <br />
            <span className="tabular-nums text-white/30">Version {__APP_VERSION__}</span>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 flex gap-6 p-6">
        <section className="flex-[4] min-w-0 flex flex-col gap-3">
          <h2 className="flex-shrink-0 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Touchez votre photo pour pointer
          </h2>
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-transparent">
            {salaries.isLoading && (
              <div className="flex justify-center pt-16">
                <Loader2 className="h-10 w-10 animate-spin text-gold" />
              </div>
            )}
            {salaries.isError && <Injoignable />}
            {salaries.data && salaries.data.length === 0 && (
              <p className="pt-16 text-center text-muted-foreground italic">Aucun salarié dans le pointage.</p>
            )}
            {salaries.data && salaries.data.length > 0 && (
              <ul className="grid grid-cols-4 gap-4 content-start">
                {salaries.data.map((s) => (
                  <Visage key={s.id} s={s} onPick={() => navigate(`/salarie/${s.id}`)} />
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="flex-[3] min-w-0 flex flex-col rounded-xl border border-border bg-white shadow-sm overflow-hidden">
          <div className="flex-shrink-0 px-4 py-2.5 bg-sand border-b border-border flex items-center justify-between">
            <span className="text-sm font-semibold uppercase tracking-wide text-accent">En poste</span>
            {enPoste.data && (
              <span className="text-sm text-muted-foreground tabular-nums">
                {enPoste.data.lignes.length} {enPoste.data.lignes.length > 1 ? 'salariés' : 'salarié'}
              </span>
            )}
          </div>
          <div className={cn(COLONNES, 'flex-shrink-0 px-4 py-2 border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground')}>
            <span>Salarié</span>
            <span>Arrivée</span>
            <span>Pauses</span>
            <span>Cumul</span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-transparent">
            {enPoste.isError && <Injoignable />}
            {enPoste.data && enPoste.data.lignes.length === 0 && (
              <p className="p-6 text-center text-muted-foreground italic">Personne n’est en poste.</p>
            )}
            {/* Newest arrival first: the line a salarié looks for is the one he just opened. */}
            {enPoste.data &&
              [...enPoste.data.lignes]
                .sort((a, b) => (b.debutMs ?? 0) - (a.debutMs ?? 0) || b.id - a.id)
                .map((l) => <LigneTable key={l.id} l={l} jour={enPoste.data.jour} />)}
          </div>
        </section>
      </main>
    </div>
  )
}

function Visage({ s, onPick }: { s: SalarieGrille; onPick: () => void }) {
  const st = STATUT[s.statut]
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        className="w-full flex flex-col items-center gap-2 rounded-2xl border border-border bg-white px-3 py-4 shadow-sm active:bg-sand active:scale-[0.98] transition"
      >
        {/* The status ring is visible from across the room: who is in, who is on a break. */}
        <SalariePhoto salarie={s} size={104} className={cn('ring-4 ring-offset-2', st.anneau)} />
        <span className="text-xl font-semibold leading-tight text-primary text-center">{s.prenom}</span>
        <span className="-mt-1.5 text-sm text-muted-foreground leading-tight text-center">{s.nom}</span>
        <span className={cn('h-6 px-2.5 rounded-full text-xs font-semibold flex items-center', st.pastille)}>
          {st.label}
        </span>
      </button>
    </li>
  )
}

// A row is read from across the room, like the faces: the same status ring
// and pill (a running pause = « En pause »), the first name in navy, and the
// two figures a salarié checks — his arrival and his pause minutes — at
// text-xl. Pauses are chips, the running one amber.
function LigneTable({ l, jour }: { l: LigneEnPoste; jour: string }) {
  const pauses = [
    [l.debutPause1Ms, l.finPause1Ms],
    [l.debutPause2Ms, l.finPause2Ms],
  ].filter((p): p is [number, number | null] => p[0] !== null)
  const statut: Statut = pauses.some(([, f]) => f === null) ? 'en_pause' : 'au_travail'
  const st = STATUT[statut]
  return (
    <div className={cn(COLONNES, 'items-center px-4 py-3 border-b border-border/60', l.nonFermee && 'bg-amber-50')}>
      <div className="flex items-center gap-3 min-w-0">
        <SalariePhoto
          salarie={l.salarie}
          size={52}
          className={cn(
            'ring-[3px] ring-offset-2',
            l.nonFermee ? 'ring-amber-400 ring-offset-amber-50' : st.anneau,
          )}
        />
        <div className="min-w-0 leading-tight">
          <p className="truncate text-lg font-semibold text-primary">{l.salarie.prenom}</p>
          <p className="truncate text-sm text-muted-foreground">{l.salarie.nom}</p>
          <span
            className={cn(
              'mt-1 inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold',
              l.nonFermee ? 'bg-amber-200/70 text-amber-900' : st.pastille,
            )}
          >
            {l.nonFermee ? 'Non fermé' : st.label}
          </span>
        </div>
      </div>
      <div className="leading-tight tabular-nums">
        {l.jour !== jour && (
          <p className={cn('text-xs', l.nonFermee ? 'font-semibold text-amber-700' : 'text-muted-foreground')}>
            {jourCourt(l.jour)}
          </p>
        )}
        <p className="text-xl font-semibold text-foreground">{heure(l.debutMs)}</p>
      </div>
      <div className="flex flex-col items-start gap-1">
        {pauses.length === 0 && <span className="text-sm text-muted-foreground/50">—</span>}
        {pauses.map(([d, f], i) => (
          <span
            key={i}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-sm tabular-nums whitespace-nowrap',
              f === null ? 'bg-warning/20 text-amber-800 font-semibold' : 'bg-sand text-foreground font-medium',
            )}
          >
            {heure(d)}
            <span className={f === null ? 'text-amber-800/60' : 'text-muted-foreground'}>–</span>
            {f === null ? 'en cours' : heure(f)}
          </span>
        ))}
      </div>
      <div className="leading-tight tabular-nums whitespace-nowrap">
        <span className={cn('text-xl font-semibold', l.cumulPauseMin > 0 ? 'text-foreground' : 'text-muted-foreground/60')}>{l.cumulPauseMin}</span>
        <span className="ml-1 text-xs font-medium text-muted-foreground">min</span>
      </div>
    </div>
  )
}

function Injoignable() {
  return (
    <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
      <AlertCircle className="h-8 w-8 text-destructive" />
      <p className="text-sm">
        Impossible de joindre le serveur.
        <br />
        Vérifiez le réseau ; l’écran réessaie tout seul.
      </p>
    </div>
  )
}
