// One métier on the floor plan.
//
// The legacy tile (Appli_TRS, photo of 2026-08-28): the code on top, then
// three stacked pills — RPM while running or « Depuis » in red while stopped,
// TRS, Arrêts — and a métier without an OF shows its code only. Same
// information architecture here.
//
// The machine state colours the WHOLE card (user's decision, 2026-08-28 — a
// left liseré alone was too quiet for a wall read from across the shop):
// 2 px border, a header band at 20 % and a body at 10 % of the state hue,
// the pattern of the visitage roll cards. Consequence, same as there:
// nothing laid on the body may be a wash of the same hue — so the value
// pills are SOLID, white text on the ladder colour, which is also what the
// legacy did. Colour is status colour (dataviz): good / warning / critical,
// and every pill carries its word, so nothing is colour-alone.
//
// Every size is in --u (index.css) so the tile scales with the tablet.
import { cn } from '@/lib/utils'
import type { TrsMachine } from '@/lib/trs-api'
import {
  teinteArrets,
  teinteDepuis,
  teinteTrs,
  teinteVitesse,
  fmtArrets,
  fmtDuree,
  fmtPct,
  type Teinte,
} from '@/lib/affichage'

/** `neutre` is for a value that does not exist yet (« — » on arrêts while
 *  the OF has no finished piece): not a warning, so not amber. */
const PILL: Record<Teinte | 'neutre', string> = {
  vert: 'bg-emerald-600 text-white',
  ambre: 'bg-amber-500 text-white',
  rouge: 'bg-red-600 text-white',
  neutre: 'bg-zinc-400 text-white',
}

type Etat = 'marche' | 'arret' | 'inconnu'
const CARD: Record<Etat, { frame: string; band: string; code: string; mot: string }> = {
  marche: {
    frame: 'border-emerald-500 bg-emerald-50',
    band: 'bg-emerald-200',
    code: 'text-emerald-950',
    mot: 'text-emerald-800',
  },
  arret: {
    frame: 'border-red-500 bg-red-50',
    band: 'bg-red-200',
    code: 'text-red-950',
    mot: 'text-red-800',
  },
  inconnu: {
    frame: 'border-zinc-400 bg-zinc-50',
    band: 'bg-zinc-200',
    code: 'text-zinc-800',
    mot: 'text-zinc-600',
  },
}

function Pill({ valeur, label, teinte }: { valeur: string; label: string; teinte: Teinte | 'neutre' }) {
  return (
    <div
      className={cn(
        'flex-1 min-h-0 rounded-[calc(var(--u)*0.6)] px-[calc(var(--u)*0.3)] flex flex-col items-center justify-center leading-none',
        PILL[teinte],
      )}
    >
      <div className="text-[calc(var(--u)*1.45)] font-bold whitespace-nowrap">{valeur}</div>
      <div className="text-[max(9px,calc(var(--u)*0.72))] uppercase tracking-wide text-white/85 mt-[calc(var(--u)*0.2)]">
        {label}
      </div>
    </div>
  )
}

export function MetierTile({ machine, nowMs }: { machine: TrsMachine; nowMs: number }) {
  const { emplacement, etat, enProduction, of } = machine
  const marche = etat === 1
  const depuisMs = machine.depuisMs === null ? null : Math.max(0, nowMs - machine.depuisMs)

  if (!enProduction) {
    return (
      <div className="h-full rounded-[calc(var(--u)*0.9)] border-2 border-zinc-300 bg-zinc-50 flex flex-col overflow-hidden text-zinc-500">
        <div className="bg-zinc-200 px-[calc(var(--u)*0.6)] py-[calc(var(--u)*0.3)]">
          <div className="text-[calc(var(--u)*1.9)] font-heading font-bold tracking-tight leading-none text-zinc-600">
            {emplacement}
          </div>
        </div>
        <div className="mt-auto px-[calc(var(--u)*0.6)] pb-[calc(var(--u)*0.5)] text-[max(9px,calc(var(--u)*0.85))] leading-tight">
          {of ? 'OF non démarré' : 'Sans OF'}
          {marche && (
            <span className="block text-[max(9px,calc(var(--u)*0.75))] opacity-80">
              tourne · {machine.vitesse} tr/min
            </span>
          )}
        </div>
      </div>
    )
  }

  const c = CARD[etat === null ? 'inconnu' : marche ? 'marche' : 'arret']
  return (
    <div
      className={cn(
        'h-full rounded-[calc(var(--u)*0.9)] border-2 flex flex-col overflow-hidden',
        c.frame,
      )}
    >
      <div
        className={cn(
          'flex-shrink-0 flex items-baseline justify-between gap-1 px-[calc(var(--u)*0.6)] py-[calc(var(--u)*0.3)]',
          c.band,
        )}
      >
        <div className={cn('text-[calc(var(--u)*1.9)] font-heading font-bold tracking-tight leading-none', c.code)}>
          {emplacement}
        </div>
        <span className={cn('text-[max(9px,calc(var(--u)*0.72))] font-semibold uppercase tracking-wide', c.mot)}>
          {marche ? 'marche' : etat === null ? '?' : 'arrêt'}
        </span>
      </div>
      {of && (
        <div
          className="flex-shrink-0 px-[calc(var(--u)*0.6)] pt-[calc(var(--u)*0.3)] text-[max(9px,calc(var(--u)*0.8))] text-foreground/70 leading-tight truncate"
          title={`OF ${of.id}`}
        >
          {of.reference}
          {of.coloris ? ` · ${of.coloris}` : ''}
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col gap-[calc(var(--u)*0.35)] p-[calc(var(--u)*0.5)]">
        {marche ? (
          <Pill
            valeur={String(machine.vitesse)}
            label="tr/min"
            teinte={teinteVitesse(machine.vitesse, of?.vitesseCible ?? 0)}
          />
        ) : (
          // Reads « 7 min arrêté » — the legacy's « Depuis » under the value
          // read as a stray word (user, 2026-08-28).
          <Pill
            valeur={depuisMs === null ? '—' : fmtDuree(depuisMs)}
            label="arrêté"
            teinte={depuisMs === null ? 'ambre' : teinteDepuis(depuisMs)}
          />
        )}
        <Pill
          valeur={fmtPct(machine.trs)}
          label="TRS"
          teinte={machine.trs === null ? 'ambre' : teinteTrs(machine.trs)}
        />
        {/* Mean per piece over the last finished pieces of the OF (the
            tablet's NombreArrets, lib/regles.ts) — « — » until one is finished. */}
        <Pill
          valeur={fmtArrets(machine.arretsParPiece)}
          label="arrêts / pièce"
          teinte={machine.arretsParPiece === null ? 'neutre' : teinteArrets(machine.arretsParPiece)}
        />
      </div>
    </div>
  )
}

/** A place on the floor with no métier in it (1B). */
export function EmplacementVide({ code }: { code: string }) {
  return (
    <div className="h-full rounded-[calc(var(--u)*0.9)] border-2 border-dashed border-zinc-400/60 px-[calc(var(--u)*0.6)] py-[calc(var(--u)*0.3)] text-zinc-500/60">
      <div className="text-[calc(var(--u)*1.9)] font-heading font-bold tracking-tight leading-none">{code}</div>
    </div>
  )
}
