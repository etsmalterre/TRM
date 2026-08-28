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
import { useEffect, useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, WifiOff } from 'lucide-react'
import { fetchAtelier } from '@/lib/trs-api'
import { placer, type Emplacement } from '@/lib/plan'
import { fmtDuree, fmtHeure } from '@/lib/affichage'
import { Bandeau } from '@/components/Bandeau'
import { MetierTile, EmplacementVide } from '@/components/MetierTile'

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

      <main className="flex-1 min-h-0 p-[calc(var(--u)*0.6)] flex flex-col gap-[calc(var(--u)*0.6)] bg-sand-darker">
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
            {/* The plan is the floor seen from where the tablet hangs (plan.ts):
                rows 1 and 2 on top, the transversal walkway under them, row 3
                along the bottom. The upper block is ONE grid: rows 1 and 2,
                then the transversal walkway on its last row — and the two
                longitudinal walkways span all three rows, so they run from
                the top edge down into the transversal one as one continuous
                floor lane (the drawing's black lines meet; user's correction
                2026-08-28). */}
            <BlocHaut rows={plan.haut} now={now} />

            {/* Row 3 — eleven métiers, no walkway inside the row. */}
            <div className="flex-1 min-h-0 basis-0 grid grid-cols-11 gap-[calc(var(--u)*0.5)]">
              {plan.bas.map((s) => (
                <Slot key={s.code} slot={s} now={now} />
              ))}
            </div>
          </>
        )}
      </main>

      {/* Three zones on a 1fr / auto / 1fr grid so the alert pills sit on the
          true centre of the screen (user's request 2026-08-28), whatever the
          width of the timestamps on the left and the version on the right. */}
      <footer className="flex-shrink-0 h-[calc(var(--u)*2.3)] px-[calc(var(--u)*1)] grid grid-cols-[1fr_auto_1fr] items-center gap-[calc(var(--u)*1)] border-t border-border/60 bg-zinc-200/50 text-[max(9px,calc(var(--u)*0.85))] text-muted-foreground whitespace-nowrap overflow-hidden">
        <div className="min-w-0 flex items-center gap-[calc(var(--u)*1)] overflow-hidden">
          <span>
            Actualisé <span className="font-medium text-foreground">{fmtHeure(data?.generatedAt, true)}</span>
          </span>
          <span>
            Dernier événement du parc{' '}
            <span className="font-medium text-foreground">{fmtHeure(data?.dernierEvenement)}</span>
            {dernierMs !== null && <span> · il y a {fmtDuree(now - dernierMs)}</span>}
          </span>
        </div>
        <div className="flex items-center justify-center gap-[calc(var(--u)*0.6)]">
          {silence && (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-2 py-0.5 font-medium text-slate-900">
              <AlertTriangle className="h-3.5 w-3.5" />
              Plus aucune transition depuis {fmtDuree(now - dernierMs!)} — automate ou recorder à vérifier
            </span>
          )}
          {horsLigne && (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-2 py-0.5 font-medium text-white">
              <WifiOff className="h-3.5 w-3.5" />
              Hors ligne — dernière lecture {fmtHeure(data?.generatedAt, true)}
            </span>
          )}
          {plan && plan.horsPlan.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-2 py-0.5 font-medium text-slate-900">
              Hors plan : {plan.horsPlan.map((m) => m.emplacement || `#${m.id}`).join(', ')}
            </span>
          )}
        </div>
        <span className="justify-self-end tabular-nums flex-shrink-0">v{__APP_VERSION__}</span>
      </footer>
    </div>
  )
}

/** Thickness of the walkways, the transversal one and the longitudinal ones alike. */
const ALLEE = 'calc(var(--u)*1.4)'

/** Grid columns of the upper block: a tile column per slot, plus a walkway
 *  column after each slot that has one. Returns the template and, for the
 *  first row's shape, which grid column each slot and each walkway takes. */
function colonnesHaut(row: Emplacement[]): { template: string; slots: number[]; allees: number[] } {
  const parts: string[] = []
  const slots: number[] = []
  const allees: number[] = []
  for (const s of row) {
    parts.push('minmax(0,1fr)')
    slots.push(parts.length)
    if (s.alleeApres) {
      parts.push(ALLEE)
      allees.push(parts.length)
    }
  }
  return { template: parts.join(' '), slots, allees }
}

function BlocHaut({ rows, now }: { rows: Emplacement[][]; now: number }) {
  const cols = colonnesHaut(rows[0])
  // Rows 1..n are the tile rows, row n+1 is the transversal walkway.
  const ligneAllee = rows.length + 1
  return (
    <div
      className="flex-[2] min-h-0 basis-0 grid gap-[calc(var(--u)*0.5)]"
      style={{
        gridTemplateColumns: cols.template,
        gridTemplateRows: `${rows.map(() => 'minmax(0,1fr)').join(' ')} ${ALLEE}`,
      }}
    >
      <Allee style={{ gridColumn: '1 / -1', gridRow: ligneAllee }} />
      {cols.allees.map((c) => (
        <Allee key={c} style={{ gridColumn: c, gridRow: `1 / ${ligneAllee + 1}` }} />
      ))}
      {rows.map((row, ri) =>
        row.map((s, ci) => (
          <div key={s.code} className="min-h-0" style={{ gridColumn: cols.slots[ci], gridRow: ri + 1 }}>
            <Slot slot={s} now={now} />
          </div>
        )),
      )}
    </div>
  )
}

function Slot({ slot, now }: { slot: Emplacement; now: number }) {
  if (slot.machine) return <MetierTile machine={slot.machine} nowMs={now} />
  return <EmplacementVide code={slot.code} />
}

/** A walkway — a painted lane on the shop floor. Slate on the warm concrete of
 *  the plan, so the lanes read at a glance from across the room. OPAQUE on
 *  purpose: the longitudinal lanes overlap the transversal one at the
 *  junctions, and a translucent lane would print the overlap darker and show
 *  its rounded cap through — with one opaque colour the junction is invisible. */
function Allee({ style }: { style: CSSProperties }) {
  return <div aria-hidden className="rounded-full bg-slate-400" style={style} />
}
