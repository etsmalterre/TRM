// The navy band on top of the wall display — the same role PosteHeader plays
// on the atelier phones: with no sidebar (§3 is the desk shell), this band is
// what makes the tablet read as a Malterre app. Left: the Malterre marks —
// the gold M badge and the white wordmark — then the app name. Centre: the
// shift and the parc counts. Right: the one hero figure of the view
// (dataviz: exactly one), the parc's shift TRS.
//
// Sized in --u (index.css) like the rest of the screen.
import type { TrsAtelier } from '@/lib/trs-api'
import { fmtHeure, fmtPct } from '@/lib/affichage'

export function Bandeau({ data }: { data: TrsAtelier | undefined }) {
  return (
    <header className="flex-shrink-0 bg-gradient-brand text-white shadow-lg">
      <div style={{ height: 'env(safe-area-inset-top)' }} />
      <div className="h-[calc(var(--u)*4.4)] flex items-stretch">
        <div className="flex items-center gap-[calc(var(--u)*0.9)] px-[calc(var(--u)*1)] border-r border-white/15">
          <img
            src="/logo-m.png"
            alt=""
            className="h-[calc(var(--u)*2.9)] w-[calc(var(--u)*2.9)] rounded-[calc(var(--u)*0.6)] flex-shrink-0"
          />
          <img src="/logo-full.png" alt="Malterre" className="h-[calc(var(--u)*2.2)] w-auto" />
        </div>
        <div className="flex items-baseline gap-[calc(var(--u)*0.6)] px-[calc(var(--u)*1.2)] border-r border-white/15">
          <span className="text-[calc(var(--u)*1.9)] font-heading font-bold tracking-tight leading-none">TRS</span>
          <span className="text-[calc(var(--u)*1)] text-white/70">Atelier</span>
        </div>

        <div className="flex-1 min-w-0 flex items-center justify-center gap-[calc(var(--u)*2.2)] px-[calc(var(--u)*1)]">
          {data ? (
            <>
              <div className="text-center leading-tight">
                <div className="text-[max(9px,calc(var(--u)*0.72))] uppercase tracking-wide text-white/60">Équipe</div>
                <div className="text-[calc(var(--u)*1.35)] font-semibold whitespace-nowrap leading-none">
                  {data.equipe.nom}
                  <span className="ml-[calc(var(--u)*0.6)] text-[calc(var(--u)*1)] font-normal text-white/80">
                    {fmtHeure(data.equipe.debut)} → {fmtHeure(data.equipe.fin)}
                  </span>
                </div>
              </div>
              <Compte n={data.parc.enMarche} label="en marche" point="bg-emerald-400" />
              <Compte n={data.parc.arret} label="à l'arrêt" point="bg-red-400" />
              <Compte n={data.parc.inactifs} label="sans OF" point="bg-white/40" />
            </>
          ) : (
            <span className="text-[calc(var(--u)*1)] text-white/70">Lecture du parc…</span>
          )}
        </div>

        <div className="flex items-center gap-[calc(var(--u)*0.9)] px-[calc(var(--u)*1.4)] border-l border-white/15">
          <div className="text-right leading-tight">
            <div className="text-[max(9px,calc(var(--u)*0.72))] uppercase tracking-wide text-white/60">TRS atelier</div>
            <div className="text-[max(9px,calc(var(--u)*0.8))] text-white/60">équipe en cours</div>
          </div>
          <div className="text-[calc(var(--u)*2.9)] font-heading font-bold tracking-tight leading-none text-gold">
            {fmtPct(data?.parc.trs ?? null)}
          </div>
        </div>
      </div>
    </header>
  )
}

function Compte({ n, label, point }: { n: number; label: string; point: string }) {
  return (
    <div className="flex items-center gap-[calc(var(--u)*0.5)] whitespace-nowrap">
      <span className={`h-[calc(var(--u)*0.8)] w-[calc(var(--u)*0.8)] rounded-full ${point}`} />
      <span className="text-[calc(var(--u)*1.35)] font-semibold leading-none">{n}</span>
      <span className="text-[calc(var(--u)*0.95)] text-white/80">{label}</span>
    </div>
  )
}
