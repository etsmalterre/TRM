// The wall display: the floor plan with one tile per métier, polled from
// GET /api/trs/atelier. A Poste-family screen (§45: the context is imposed —
// here by the building — and the operator reads it at arm's length) with the
// one thing a Poste has that this does not: there is no commit. Nothing on
// this screen writes.
//
// Three bands, only the middle one flexes: the navy header, the plan, and a
// one-line footer that says when the plan was last read and when the parc
// last moved. The footer is not decoration — the recorder that feeds
// `evenement_machine` has no watched heartbeat (TRS/docs/recorder.md), so a
// silent PLC looks exactly like an idle workshop unless *something* on a
// wall says "the last transition was three hours ago".
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, WifiOff } from 'lucide-react'
import { fetchAtelier } from '@/lib/trs-api'
import { placer, type Emplacement } from '@/lib/plan'
import { fmtDuree, fmtHeure } from '@/lib/affichage'
import { Bandeau } from '@/components/Bandeau'
import { MetierTile, EmplacementVide } from '@/components/MetierTile'
import { cn } from '@/lib/utils'

/** How often the plan is re-read. The recorder rewrites `machine.vitesse`
 *  every ~10 s and polls the PLC every second, so 10 s is as fresh as the
 *  data gets. */
const POLL_MS = 10_000

/** The « depuis » durations tick locally between polls. */
const TICK_MS = 15_000

/** Beyond this, the footer flags the parc as possibly silent: on a working
 *  shift the 30 métiers produce a transition every few minutes. */
const SILENCE_MS = 60 * 60_000

function useNow(everyMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), everyMs)
    return () => window.clearInterval(id)
  }, [everyMs])
  return now
}

export function Atelier() {
  const q = useQuery({
    queryKey: ['trs', 'atelier'],
    queryFn: fetchAtelier,
    refetchInterval: POLL_MS,
    staleTime: POLL_MS,
  })
  const now = useNow(TICK_MS)
  const data = q.data
  const plan = data ? placer(data.machines) : null

  const dernierMs = data?.dernierEvenement ? new Date(data.dernierEvenement).getTime() : null
  const silence = dernierMs !== null && now - dernierMs > SILENCE_MS
  const horsLigne = q.isError || (q.failureCount > 0 && !q.isFetching)

  return (
    <div className="h-full flex flex-col bg-background">
      <Bandeau data={data} />

      <main className="flex-1 min-h-0 p-3 flex flex-col gap-3">
        {q.isLoading && (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            Lecture du parc…
          </div>
        )}
        {q.isError && !data && (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-destructive">
            <WifiOff className="h-8 w-8" />
            <div className="text-lg font-semibold">Le serveur ne répond pas</div>
            <div className="text-sm text-muted-foreground">Nouvel essai toutes les {POLL_MS / 1000} s.</div>
          </div>
        )}

        {plan && (
          <>
            {/* Row 3 — eleven métiers, no walkway inside the row. */}
            <div className="flex-1 min-h-0 basis-0 grid grid-cols-11 gap-2">
              {plan.haut.map((s) => (
                <Slot key={s.code} slot={s} now={now} />
              ))}
            </div>

            {/* The transversal walkway. */}
            <Allee horizontale />

            {/* Rows 2 and 1 — ten slots each, two longitudinal walkways. */}
            <div className="flex-[2] min-h-0 basis-0 grid grid-rows-2 gap-3">
              {plan.bas.map((row, i) => (
                <div
                  key={i}
                  className="min-h-0 grid gap-2"
                  style={{ gridTemplateColumns: colonnesBas(row) }}
                >
                  {row.map((s) => (
                    <SlotEtAllee key={s.code} slot={s} now={now} />
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      <footer className="flex-shrink-0 h-8 px-4 flex items-center gap-4 border-t border-border/60 bg-zinc-200/50 text-xs text-muted-foreground">
        <span>
          Actualisé <span className="font-medium text-foreground">{fmtHeure(data?.generatedAt, true)}</span>
        </span>
        <span>
          Dernier événement du parc{' '}
          <span className="font-medium text-foreground">{fmtHeure(data?.dernierEvenement)}</span>
          {dernierMs !== null && <span> · il y a {fmtDuree(now - dernierMs)}</span>}
        </span>
        {silence && (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-medium text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5" />
            Plus aucune transition depuis {fmtDuree(now - dernierMs!)} — automate ou recorder à vérifier
          </span>
        )}
        {horsLigne && (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-0.5 font-medium text-red-800">
            <WifiOff className="h-3.5 w-3.5" />
            Hors ligne — dernière lecture {fmtHeure(data?.generatedAt, true)}
          </span>
        )}
        {plan && plan.horsPlan.length > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-medium text-amber-800">
            Hors plan : {plan.horsPlan.map((m) => m.emplacement || `#${m.id}`).join(', ')}
          </span>
        )}
        <span className="ml-auto tabular-nums">v{__APP_VERSION__}</span>
      </footer>
    </div>
  )
}

/** Column template of a lower row: a tile per slot, plus a walkway column
 *  after B and after H. */
const ALLEE_W = '28px'
function colonnesBas(row: Emplacement[]): string {
  return row.map((s) => (s.alleeApres ? `minmax(0,1fr) ${ALLEE_W}` : 'minmax(0,1fr)')).join(' ')
}

function Slot({ slot, now }: { slot: Emplacement; now: number }) {
  if (slot.machine) return <MetierTile machine={slot.machine} nowMs={now} />
  return <EmplacementVide code={slot.code} />
}

function SlotEtAllee({ slot, now }: { slot: Emplacement; now: number }) {
  return (
    <>
      <div className="min-h-0">
        <Slot slot={slot} now={now} />
      </div>
      {slot.alleeApres && <Allee />}
    </>
  )
}

/** A walkway — the floor between the machines, drawn as the warm sand of the
 *  charter's surfaces rather than a black line, so the plan stays a plan and
 *  not a diagram. */
function Allee({ horizontale = false }: { horizontale?: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        'rounded-full bg-sand-darker/70',
        horizontale ? 'flex-shrink-0 h-3 mx-1' : 'w-full h-full',
      )}
    />
  )
}
