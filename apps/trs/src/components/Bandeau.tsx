// The navy band on top of the wall display — the same role PosteHeader plays
// on the atelier phones: with no sidebar (§3 is the desk shell), this band is
// what makes the tablet read as a Malterre app. Left: the mark and the app
// name. Centre: the shift and the parc counts. Right: the one hero figure of
// the view (dataviz: exactly one), the parc's shift TRS.
import type { TrsAtelier } from '@/lib/trs-api'
import { fmtHeure, fmtPct } from '@/lib/affichage'

export function Bandeau({ data }: { data: TrsAtelier | undefined }) {
  return (
    <header className="flex-shrink-0 bg-gradient-brand text-white shadow-lg">
      <div style={{ height: 'env(safe-area-inset-top)' }} />
      <div className="h-14 flex items-stretch">
        <div className="w-14 flex-shrink-0 flex items-center justify-center border-r border-white/15">
          <span className="text-gold font-heading font-bold text-3xl leading-none">M</span>
        </div>
        <div className="flex items-center gap-3 px-4 border-r border-white/15">
          <span className="text-2xl font-heading font-bold tracking-tight">TRS</span>
          <span className="text-sm text-white/70">Atelier</span>
        </div>

        <div className="flex-1 min-w-0 flex items-center justify-center gap-6 px-4">
          {data ? (
            <>
              <div className="text-center leading-tight">
                <div className="text-[10px] uppercase tracking-wide text-white/60">Équipe</div>
                <div className="text-lg font-semibold whitespace-nowrap">
                  {data.equipe.nom}
                  <span className="ml-2 text-sm font-normal text-white/80">
                    {fmtHeure(data.equipe.debut)} → {fmtHeure(data.equipe.fin)}
                  </span>
                </div>
              </div>
              <Compte n={data.parc.enMarche} label="en marche" point="bg-emerald-400" />
              <Compte n={data.parc.arret} label="à l'arrêt" point="bg-red-400" />
              <Compte n={data.parc.inactifs} label="sans OF" point="bg-white/40" />
            </>
          ) : (
            <span className="text-sm text-white/70">Lecture du parc…</span>
          )}
        </div>

        <div className="flex items-center gap-3 px-5 border-l border-white/15">
          <div className="text-right leading-tight">
            <div className="text-[10px] uppercase tracking-wide text-white/60">TRS atelier</div>
            <div className="text-[11px] text-white/60">équipe en cours</div>
          </div>
          <div className="text-4xl font-heading font-bold tracking-tight leading-none">
            {fmtPct(data?.parc.trs ?? null)}
          </div>
        </div>
      </div>
    </header>
  )
}

function Compte({ n, label, point }: { n: number; label: string; point: string }) {
  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      <span className={`h-2.5 w-2.5 rounded-full ${point}`} />
      <span className="text-lg font-semibold">{n}</span>
      <span className="text-sm text-white/80">{label}</span>
    </div>
  )
}
