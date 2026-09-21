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
// red: it is what Admin Pointage has to close.
//
// Landscape, arm's length: faces on the left (the action), the table on the right.
import type React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, Loader2 } from 'lucide-react'
import { fetchEnPoste, fetchSalaries, type LigneEnPoste, type SalarieGrille, type Statut } from '@/lib/pointage-api'
import { Horloge } from '@/components/Horloge'
import { SalariePhoto } from '@/components/SalariePhoto'
import { useAppareil } from '@/contexts/AppareilContext'
import { heure, jourCourt } from '@/lib/heures'
import { cn } from '@/lib/utils'

// `ligne` styles the « En poste » card of that status: a §41 liseré (inset
// shadow, not a border, so it never fights the card's own border) and, for a
// break, an amber tint of the whole card. « Non fermé » has its own, red, in
// LigneTable.
const STATUT: Record<Statut, { label: string; anneau: string; pastille: string; ligne: string }> = {
  au_travail: {
    label: 'Au travail',
    anneau: 'ring-success',
    pastille: 'bg-success/15 text-success',
    ligne: 'bg-white border-border shadow-[inset_4px_0_0_0_hsl(var(--success))]',
  },
  en_pause: {
    label: 'En pause',
    anneau: 'ring-warning',
    pastille: 'bg-warning/20 text-amber-800',
    ligne: 'bg-amber-50 border-amber-200 shadow-[inset_4px_0_0_0_hsl(var(--warning))]',
  },
  hors_poste: { label: '', anneau: 'ring-transparent', pastille: '', ligne: '' },
}

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
        <section className="flex-1 min-w-0 flex flex-col gap-3">
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

        {/* Same rules as the faces: a small heading, then cards straight on the
            page — no panel, no column headers (each card labels its own
            figures). Fixed width; the faces take whatever the tablet has left. */}
        <section className="flex-shrink-0 w-[32rem] flex flex-col gap-3">
          <h2 className="flex-shrink-0 flex items-baseline justify-between text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <span>En poste</span>
            {enPoste.data && (
              <span className="text-sm font-medium normal-case tracking-normal tabular-nums">
                {enPoste.data.lignes.length} {enPoste.data.lignes.length > 1 ? 'salariés' : 'salarié'}
              </span>
            )}
          </h2>
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-transparent space-y-3">
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

// A card is the record, not the person: no photo and no status pill — the
// face tile on the left already carries both, and a second portrait made the
// two halves read as the same list twice (Vincent, 2026-09-21). The status is
// the card itself: white with a green liseré at work, amber on a break, red on
// a shift left open (§41 liseré + tint).
//
// Two lines, always the same height: the name, then three labelled figures
// (Arrivée · Pauses · Cumul des pauses) like the recap of the salarié screen.
// No column headers to line up with, and the pause chips sit side by side so
// two pauses do not make a taller card. The running pause is the amber chip.
function LigneTable({ l, jour }: { l: LigneEnPoste; jour: string }) {
  const pauses = [
    [l.debutPause1Ms, l.finPause1Ms],
    [l.debutPause2Ms, l.finPause2Ms],
  ].filter((p): p is [number, number | null] => p[0] !== null)
  const statut: Statut = pauses.some(([, f]) => f === null) ? 'en_pause' : 'au_travail'
  const st = STATUT[statut]
  const autreJour = l.jour !== jour
  return (
    <div
      className={cn(
        'rounded-2xl border px-5 py-3 shadow-sm',
        l.nonFermee ? 'bg-red-50 border-red-200 shadow-[inset_4px_0_0_0_theme(colors.red.500)]' : st.ligne,
      )}
    >
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="truncate text-lg font-semibold leading-tight text-primary">{l.salarie.prenom}</span>
        <span className="truncate text-sm text-muted-foreground">{l.salarie.nom}</span>
        {l.nonFermee && (
          <span className="ml-auto inline-flex h-5 flex-shrink-0 items-center self-center rounded-full bg-red-100 px-2 text-[11px] font-semibold text-red-800">
            Non fermé
          </span>
        )}
      </div>
      <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-4">
        <Stat label={autreJour ? `Arrivée · ${jourCourt(l.jour)}` : 'Arrivée'} alerte={l.nonFermee}>
          <span className="text-xl font-semibold tabular-nums text-foreground">{heure(l.debutMs)}</span>
        </Stat>
        <Stat label="Pauses">
          {pauses.length === 0 ? (
            <span className="text-xl font-semibold text-muted-foreground/40">—</span>
          ) : (
            <span className="flex flex-wrap gap-1.5">
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
            </span>
          )}
        </Stat>
        <Stat label="Cumul des pauses" className="text-right" valueClass="justify-end">
          <span className={cn('text-xl font-semibold tabular-nums', l.cumulPauseMin > 0 ? 'text-foreground' : 'text-muted-foreground/60')}>
            {l.cumulPauseMin}
          </span>
          <span className="ml-1 text-xs font-medium text-muted-foreground">min</span>
        </Stat>
      </div>
    </div>
  )
}

/** A labelled figure of a card — the salarié screen's recap vocabulary. */
function Stat({ label, alerte, className, valueClass, children }: {
  label: string
  alerte?: boolean
  className?: string
  valueClass?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('min-w-0 leading-tight', className)}>
      <p className={cn('mb-0.5 truncate text-[11px] font-semibold uppercase tracking-wide', alerte ? 'text-red-700' : 'text-muted-foreground')}>
        {label}
      </p>
      <div className={cn('flex h-7 items-center whitespace-nowrap', valueClass)}>{children}</div>
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
