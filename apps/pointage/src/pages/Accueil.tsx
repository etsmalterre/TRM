// The wall screen: the clock, the faces, and today's lines.
//
// Legacy FEN_Pointage showed the clock and TABLE_Pointage, with a « Pointage »
// button leading to FEN_Choix_salarié (a button per salarié). With seven
// active salariés the faces fit on the home screen itself, so the tablet saves
// that tap: touching your face IS pointing (§45.4 — identification is a gate,
// and the photo is the check).
//
// Landscape, arm's length: faces on the left (the action), the day table on the
// right (what the legacy table showed: arrival, pauses, departure).
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, Loader2 } from 'lucide-react'
import { fetchJour, fetchSalaries, type LigneJour, type SalarieGrille, type Statut } from '@/lib/pointage-api'
import { Horloge } from '@/components/Horloge'
import { SalariePhoto } from '@/components/SalariePhoto'
import { useAppareil } from '@/contexts/AppareilContext'
import { heure } from '@/lib/heures'
import { cn } from '@/lib/utils'

const STATUT: Record<Statut, { label: string; anneau: string; pastille: string }> = {
  au_travail: { label: 'Au travail', anneau: 'ring-success', pastille: 'bg-success/15 text-success' },
  en_pause: { label: 'En pause', anneau: 'ring-warning', pastille: 'bg-warning/20 text-amber-800' },
  hors_poste: { label: '', anneau: 'ring-transparent', pastille: '' },
}

export function Accueil() {
  const navigate = useNavigate()
  const { appareil } = useAppareil()
  const salaries = useQuery({ queryKey: ['pointage', 'salaries'], queryFn: fetchSalaries })
  const jour = useQuery({ queryKey: ['pointage', 'jour'], queryFn: fetchJour })

  return (
    <div className="h-full flex flex-col">
      <header className="flex-shrink-0 bg-gradient-brand text-white">
        <div className="safe-top" />
        <div className="px-8 py-4 grid grid-cols-[1fr_auto_1fr] items-center gap-6">
          <img src="/logo-full.png" alt="Malterre" className="h-10 w-auto justify-self-start" />
          <Horloge />
          <div className="justify-self-end text-right text-xs text-white/45 leading-relaxed">
            {appareil?.libelle}
            <br />
            <span className="tabular-nums text-white/30">Version {__APP_VERSION__}</span>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 flex gap-6 p-6">
        <section className="flex-[3] min-w-0 flex flex-col gap-3">
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

        <section className="flex-[2] min-w-0 flex flex-col rounded-xl border border-border bg-white shadow-sm overflow-hidden">
          <div className="flex-shrink-0 px-4 py-2.5 bg-sand border-b border-border flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-accent">Aujourd’hui</span>
            {jour.data && (
              <span className="text-xs text-muted-foreground tabular-nums">{jour.data.lignes.length} pointages</span>
            )}
          </div>
          <div className="flex-shrink-0 grid grid-cols-[minmax(0,1.5fr)_4rem_minmax(0,1.6fr)_4rem] gap-3 px-4 py-2 border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Salarié</span>
            <span>Arrivée</span>
            <span>Pauses</span>
            <span>Départ</span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-transparent">
            {jour.isError && <Injoignable />}
            {jour.data && jour.data.lignes.length === 0 && (
              <p className="p-6 text-center text-muted-foreground italic">Personne n’a encore pointé aujourd’hui.</p>
            )}
            {/* Newest first: the line a salarié looks for is the one he just made. */}
            {[...(jour.data?.lignes ?? [])]
              .sort((a, b) => (b.debutMs ?? 0) - (a.debutMs ?? 0) || b.id - a.id)
              .map((l) => (
                <LigneDuJour key={l.id} l={l} />
              ))}
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

function LigneDuJour({ l }: { l: LigneJour }) {
  const pauses: Array<[number | null, number | null]> = [
    [l.debutPause1Ms, l.finPause1Ms],
    [l.debutPause2Ms, l.finPause2Ms],
  ]
  return (
    <div className="grid grid-cols-[minmax(0,1.5fr)_4rem_minmax(0,1.6fr)_4rem] gap-3 items-center px-4 py-2 border-b border-border/60 text-sm tabular-nums">
      <span className="flex items-center gap-2 min-w-0">
        <SalariePhoto salarie={l.salarie} size={32} />
        <span className="truncate font-medium text-foreground">{l.salarie.prenom}</span>
      </span>
      <span>{heure(l.debutMs)}</span>
      <span className="text-xs leading-snug">
        {pauses
          .filter(([d]) => d !== null)
          .map(([d, f], i) => (
            <span key={i} className={cn('block', f === null && 'text-amber-700 font-semibold')}>
              {heure(d)} – {f === null ? 'en cours' : heure(f)}
            </span>
          ))}
      </span>
      <span className={cn(l.finMs === null && 'text-xs font-semibold text-success')}>
        {l.finMs === null ? 'en poste' : heure(l.finMs)}
      </span>
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
