// The navy band on top of the wall display — the same role PosteHeader plays
// on the atelier phones: with no sidebar (§3 is the desk shell), this band is
// what makes the tablet read as a Malterre app. Left: the Malterre wordmark,
// then the faces of whoever is clocked in (LIVA #1194, 2026-09-23). Centre:
// the shift. Right: the shift's production in kg, then the one hero figure of
// the view (dataviz: exactly one), the parc's shift TRS in gold, then the ⓘ
// that opens « Comment le TRS est calculé ». Nothing else — the app name and
// the parc counters were removed at the user's request (2026-08-28); the kg
// and the faces were added at his request on 2026-09-23. The kg is white and
// smaller than the TRS on purpose: it is a second figure, not a second hero.
//
// Sized in --u (index.css) like the rest of the screen.
import { useState } from 'react'
import { Info } from 'lucide-react'
import type { TrsAtelier } from '@/lib/trs-api'
import { fmtHeure, fmtKg, fmtPct } from '@/lib/affichage'
import { InfoTrsDialog } from '@/components/InfoTrsDialog'
import { Visage } from '@/components/Visage'

/** The wordmark is 400 × 130 (3.08 : 1); at 2.6u tall it is 8u wide. The
 *  logo cell is pinned to that width so the DEV badge, narrower, sits
 *  centred in the same cell and the band's centre does not shift between
 *  dev and prod. */
const LOGO_CELL_W = 'calc(var(--u)*8)'

const LABEL = 'text-[max(9px,calc(var(--u)*0.72))] uppercase tracking-wide text-white/60'

export function Bandeau({ data }: { data: TrsAtelier | undefined }) {
  const [infoOpen, setInfoOpen] = useState(false)

  return (
    <header className="flex-shrink-0 bg-gradient-brand text-white shadow-lg">
      <div style={{ height: 'env(safe-area-inset-top)' }} />
      <div className="h-[calc(var(--u)*4.4)] flex items-stretch">
        <div className="flex items-center justify-center px-[calc(var(--u)*1.2)] border-r border-white/15">
          {/* The full Malterre wordmark only (user's decision, 2026-08-28) — or,
              on a local dev server, the same DEV badge the ERP sidebar shows, so
              a screen pointed at a dev API is never mistaken for the wall tablet. */}
          <div className="flex items-center justify-center" style={{ width: LOGO_CELL_W }}>
            {import.meta.env.DEV ? (
              <img src="/logo-dev.webp" alt="TRS DEV" className="h-[calc(var(--u)*3.4)] w-auto rounded" />
            ) : (
              <img src="/logo-full.png" alt="Malterre" className="h-[calc(var(--u)*2.6)] w-auto" />
            )}
          </div>
        </div>

        {/* Who is clocked in right now — the `pointage` state at this instant
            (API enPosteA), earliest arrival first so a face keeps its place
            through the shift. Faces only, the name on hover: the atelier knows
            its people, and a wall read from ten metres has no room for names.
            No « En poste » label either (user's request, 2026-09-23): the
            faces fill the band's height. The cell scrolls nothing and wraps
            nothing: a shift is a handful of people, and the centre cell is the
            one that yields (min-w-0). */}
        {data && (
          <div className="flex items-center gap-[calc(var(--u)*0.4)] px-[calc(var(--u)*1)] border-r border-white/15">
            {data.enPoste.length > 0 ? (
              data.enPoste.map((b) => <Visage key={b.id} id={b.id} prenom={b.prenom} nom={b.nom} />)
            ) : (
              <span className="text-[calc(var(--u)*1)] text-white/60 whitespace-nowrap">Personne n’a pointé</span>
            )}
          </div>
        )}

        <div className="flex-1 min-w-0 flex items-center justify-center gap-[calc(var(--u)*2.2)] px-[calc(var(--u)*1)]">
          {data ? (
            <>
              <div className="text-center leading-tight">
                <div className={LABEL}>Équipe</div>
                <div className="text-[calc(var(--u)*1.35)] font-semibold whitespace-nowrap leading-none">
                  {data.equipe.nom}
                  <span className="ml-[calc(var(--u)*0.6)] text-[calc(var(--u)*1)] font-normal text-white/80">
                    {fmtHeure(data.equipe.debut)} → {fmtHeure(data.equipe.fin)}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <span className="text-[calc(var(--u)*1)] text-white/70">Lecture du parc…</span>
          )}
        </div>

        {/* The shift's production: the ERP's « Production » card (pieces whose
            tricotage ended in the shift, nominal weight), same API function.
            White and a step smaller than the TRS — the second figure defers
            to the hero. */}
        {data && (
          <div className="flex items-center gap-[calc(var(--u)*0.9)] px-[calc(var(--u)*1.4)] border-l border-white/15">
            <div className="text-right leading-tight">
              <div className={LABEL}>Production</div>
              <div className="text-[max(9px,calc(var(--u)*0.8))] text-white/60">équipe en cours</div>
            </div>
            <div className="text-[calc(var(--u)*2.2)] font-heading font-bold tracking-tight leading-none whitespace-nowrap tabular-nums">
              {fmtKg(data.production.kg)}
            </div>
          </div>
        )}

        <div className="flex items-center gap-[calc(var(--u)*0.9)] px-[calc(var(--u)*1.4)] border-l border-white/15">
          <div className="text-right leading-tight">
            <div className={LABEL}>TRS atelier</div>
            <div className="text-[max(9px,calc(var(--u)*0.8))] text-white/60">équipe en cours</div>
          </div>
          <div className="text-[calc(var(--u)*2.9)] font-heading font-bold tracking-tight leading-none text-gold">
            {fmtPct(data?.parc.trs ?? null)}
          </div>
        </div>

        {/* The ⓘ — a ghost white icon button (the §18.D band's control style),
            in its own cell so it never crowds the hero figure. Sized to stay a
            finger target on the 960 px tablet (max(40px, …)). */}
        <div className="flex items-center px-[calc(var(--u)*0.7)] border-l border-white/15">
          <button
            type="button"
            onClick={() => setInfoOpen(true)}
            title="Comment le TRS est calculé"
            aria-label="Comment le TRS est calculé"
            aria-haspopup="dialog"
            className="h-[max(40px,calc(var(--u)*3))] w-[max(40px,calc(var(--u)*3))] rounded-full flex items-center justify-center text-white/80 hover:bg-white/15 hover:text-white active:bg-white/25"
          >
            <Info className="h-[max(20px,calc(var(--u)*1.7))] w-[max(20px,calc(var(--u)*1.7))]" />
          </button>
        </div>
      </div>

      <InfoTrsDialog open={infoOpen} onClose={() => setInfoOpen(false)} />
    </header>
  )
}
