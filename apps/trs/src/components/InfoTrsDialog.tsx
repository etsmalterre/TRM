// « Comment le TRS est calculé » — the info dialog behind the band's ⓘ.
//
// Written for the people on the floor, not for a developer: what the shift
// is, what the formula divides, which stops are forgiven and for how long,
// and what each colour on a tile means. Every number comes from
// `lib/regles.ts`, which is pinned to the API's calculation by test — the
// dialog never carries a literal of its own.
//
// Composition is the §18.D banded dialog (mps_designer) minus its footer: a
// navy band with the gold icon tile and the ✕, a zinc body of white cards —
// there is nothing to confirm, so no strip and no button. Hand-rolled — this app has no Radix — and sized in --u like the
// rest of the wall, with the phone-and-tablet rules of §40.6 (single
// scrolling body, `dvh`, never edge-to-edge).
import { useEffect, useRef } from 'react'
import { Clock, Divide, Info, Palette, Pause, Play, Smartphone, Square, Timer, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EQUIPES, FORFAIT_TOTAL_MIN, INTERVENTION_MAX_MIN, SEUILS } from '@/lib/regles'

const pct = (r: number) => `${Math.round(r * 100)} %`

/** The tile's solid pills, shrunk to a legend swatch — same classes as
 *  MetierTile.PILL so the legend shows the real colours. */
const SWATCH = {
  vert: 'bg-emerald-600 text-white',
  ambre: 'bg-amber-500 text-white',
  rouge: 'bg-red-600 text-white',
} as const

function Swatch({ teinte, children }: { teinte: keyof typeof SWATCH; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-[calc(var(--u)*0.4)] px-[calc(var(--u)*0.6)] py-[calc(var(--u)*0.15)] font-semibold tabular-nums whitespace-nowrap leading-tight',
        SWATCH[teinte],
      )}
    >
      {children}
    </span>
  )
}

function Carte({
  icon,
  titre,
  className,
  children,
}: {
  icon: React.ReactNode
  titre: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <section
      className={cn(
        'rounded-lg border border-border/60 bg-card shadow-sm p-[calc(var(--u)*0.8)] flex flex-col gap-[calc(var(--u)*0.45)]',
        className,
      )}
    >
      <h3 className="flex items-center gap-[calc(var(--u)*0.5)] text-[max(12px,calc(var(--u)*1.05))] font-semibold text-foreground">
        <span className="text-accent [&>svg]:h-[calc(var(--u)*1.2)] [&>svg]:w-[calc(var(--u)*1.2)]">{icon}</span>
        {titre}
      </h3>
      <div className="flex flex-col gap-[calc(var(--u)*0.5)] text-[max(11px,calc(var(--u)*0.95))] leading-snug text-foreground/90">
        {children}
      </div>
    </section>
  )
}

function Ligne({ label, valeur, children }: { label: string; valeur: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-[calc(var(--u)*1)] gap-y-[calc(var(--u)*0.15)] items-start border-t border-border/50 pt-[calc(var(--u)*0.5)] first:border-t-0 first:pt-0">
      <div className="font-medium">{label}</div>
      <div className="text-right whitespace-nowrap">{valeur}</div>
      {children && <div className="col-span-2 text-muted-foreground">{children}</div>}
    </div>
  )
}

/** One of the régleur's three phone actions, drawn as the button it is on the
 *  Atelier PWA — navy tint, icon first — so the reader recognises it. */
function ActionOf({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-[calc(var(--u)*0.4)] rounded-md border border-primary/20 bg-primary/5 px-[calc(var(--u)*0.7)] py-[calc(var(--u)*0.35)] font-semibold text-primary whitespace-nowrap [&>svg]:h-[calc(var(--u)*1)] [&>svg]:w-[calc(var(--u)*1)] [&>svg]:fill-current">
      {icon}
      {label}
    </span>
  )
}

/** An information note — the navy-tint strip with a solid ⓘ roundel. The
 *  « > 100 % » strip is the same strip with a figure in place of the ⓘ; the
 *  two are the dialog's only note style, on purpose (consistency across the
 *  cards, user's request 2026-08-28). */
function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-[calc(var(--u)*0.8)] rounded-md bg-primary/5 border border-primary/10 px-[calc(var(--u)*0.8)] py-[calc(var(--u)*0.4)]">
      <span className="inline-flex h-[calc(var(--u)*1.9)] w-[calc(var(--u)*1.9)] flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Info className="h-[calc(var(--u)*1.2)] w-[calc(var(--u)*1.2)]" />
      </span>
      <div>{children}</div>
    </div>
  )
}

export function InfoTrsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const fermer = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    fermer.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const n = FORFAIT_TOTAL_MIN.nettoyage
  const f = FORFAIT_TOTAL_MIN.finPiece

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-[calc(var(--u)*1)]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="info-trs-titre"
        className="w-[min(100%,calc(var(--u)*84))] max-h-[96dvh] flex flex-col rounded-xl bg-primary overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1 · band — §43 */}
        <div className="flex-shrink-0 flex items-center gap-[calc(var(--u)*0.8)] rounded-t-xl border-b-2 border-gold bg-primary px-[calc(var(--u)*1.2)] py-[calc(var(--u)*0.55)]">
          <div className="h-[calc(var(--u)*2.6)] w-[calc(var(--u)*2.6)] flex-shrink-0 rounded-lg flex items-center justify-center shadow-sm bg-gold text-gold-foreground">
            <Info className="h-[calc(var(--u)*1.5)] w-[calc(var(--u)*1.5)]" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="info-trs-titre" className="text-[calc(var(--u)*1.35)] font-heading font-bold tracking-tight truncate text-primary-foreground">
              Comment le TRS est calculé
            </h2>
            <p className="text-[max(10px,calc(var(--u)*0.85))] text-white/70 truncate">
              Ce que la tablette mesure sur chaque métier, équipe par équipe
            </p>
          </div>
          <button
            ref={fermer}
            type="button"
            onClick={onClose}
            title="Fermer"
            aria-label="Fermer"
            className="h-[calc(var(--u)*2.6)] w-[calc(var(--u)*2.6)] flex-shrink-0 rounded-md flex items-center justify-center text-white/80 hover:bg-white/15 hover:text-white"
          >
            <X className="h-[calc(var(--u)*1.4)] w-[calc(var(--u)*1.4)]" />
          </button>
        </div>

        {/* 2 · body — zinc, white cards */}
        {/* Grid rows stretch: the two side-by-side cards share their top and
            bottom edges (user's request, 2026-08-28). */}
        <div className="flex-1 min-h-0 overflow-y-auto rounded-b-xl bg-zinc-100 p-[calc(var(--u)*0.7)] grid grid-cols-1 sm:grid-cols-2 gap-[calc(var(--u)*0.6)] scrollbar-transparent">
          <Carte icon={<Divide />} titre="La formule" className="col-span-full">
            {/* The one line, nothing under it (user's decision, 2026-08-28): the
                terms are explained by the cards that follow. */}
            <div className="rounded-md bg-primary/5 border border-primary/10 px-[calc(var(--u)*1)] py-[calc(var(--u)*0.7)] text-center font-heading font-semibold text-[calc(var(--u)*1.25)] text-primary">
              TRS = temps de marche réel ÷ temps de production possible
            </div>
          </Carte>

          {/* The production clock is a human act: three phone actions by the
              régleur open and close it. Shown as the three actions, then the
              one consequence — nothing else (user's decision, 2026-08-28). */}
          <Carte icon={<Smartphone />} titre="Temps de production géré par les régleurs" className="col-span-full">
            <div className="flex items-center gap-[calc(var(--u)*0.4)]">
              <ActionOf icon={<Play />} label="Démarrer l'OF" />
              <ActionOf icon={<Pause />} label="Interrompre" />
              <ActionOf icon={<Square />} label="Terminer" />
            </div>
            {/* The one consequence, as an info strip — the same navy-tint
                strip as the « > 100 % » one below, with an ⓘ tile where that
                one has its figure, so the two read as the same kind of note. */}
            <Note>
              Un OF laissé en cours pendant que le métier ne tricote pas <b>fait baisser le TRS</b>.
            </Note>
          </Carte>

          <Carte icon={<Timer />} titre="Ce qui est déduit" className="col-span-full">
            {/* Three bare rows, no prose (user's decision, 2026-08-28). */}
            <Ligne label="Chaque arrêt du métier" valeur={<b>{INTERVENTION_MAX_MIN} min</b>} />
            <Ligne
              label="Nettoyage"
              valeur={
                <>
                  <b>{n.sans} min</b> · <b>{n.lycra} min</b> avec élasthanne
                </>
              }
            />
            <Ligne
              label="Fin de pièce"
              valeur={
                <>
                  <b>{f.sans} min</b> · <b>{f.lycra} min</b> avec élasthanne
                </>
              }
            />
            {/* The one thing worth designing here: the > 100 % case, which
                otherwise reads as a bug on the wall. Same navy tint as the
                formula block, the figure as a solid green pill like the tile's. */}
            <div className="flex items-center gap-[calc(var(--u)*0.8)] rounded-md bg-primary/5 border border-primary/10 px-[calc(var(--u)*0.8)] py-[calc(var(--u)*0.4)]">
              <span className="inline-flex items-center rounded-[calc(var(--u)*0.5)] bg-emerald-600 px-[calc(var(--u)*0.7)] py-[calc(var(--u)*0.25)] text-[calc(var(--u)*1.2)] font-bold tabular-nums text-white whitespace-nowrap leading-none">
                &gt; 100 %
              </span>
              <div>
                <b>Le TRS peut dépasser 100 %.</b>{' '}
                <span className="text-muted-foreground">
                  Un nettoyage ou une fin de pièce fait plus vite que le temps déduit fait gagner la
                  différence.
                </span>
              </div>
            </div>
          </Carte>

          <Carte icon={<Clock />} titre="L'équipe">
            <p>
              Le TRS repart de zéro à chaque équipe et se calcule du début de l'équipe jusqu'à
              maintenant, sur le temps où un OF est en cours sur le métier.
            </p>
            <div className="grid grid-cols-3 gap-[calc(var(--u)*0.5)]">
              {EQUIPES.map((e) => (
                <div key={e.nom} className="rounded-md bg-zinc-100 px-[calc(var(--u)*0.6)] py-[calc(var(--u)*0.4)] text-center">
                  <div className="font-medium">{e.nom}</div>
                  <div className="text-muted-foreground tabular-nums whitespace-nowrap">
                    {e.debut} → {e.fin}
                  </div>
                </div>
              ))}
            </div>
            <Note>
              Un métier sans OF démarré est grisé : rien à mesurer, <b>il n'entre pas dans le calcul</b>.
            </Note>
          </Carte>

          <Carte icon={<Palette />} titre="Les couleurs de la tuile">
            <Ligne
              label="TRS"
              valeur={
                <span className="inline-flex gap-[calc(var(--u)*0.3)]">
                  <Swatch teinte="rouge">≤ {pct(SEUILS.trs.rouge)}</Swatch>
                  <Swatch teinte="ambre">≤ {pct(SEUILS.trs.ambre)}</Swatch>
                  <Swatch teinte="vert">&gt; {pct(SEUILS.trs.ambre)}</Swatch>
                </span>
              }
            />
            <Ligne
              label="Depuis (métier à l'arrêt)"
              valeur={
                <span className="inline-flex gap-[calc(var(--u)*0.3)]">
                  <Swatch teinte="ambre">&lt; {SEUILS.depuisRougeMin} min</Swatch>
                  <Swatch teinte="rouge">≥ {SEUILS.depuisRougeMin} min</Swatch>
                </span>
              }
            >
              Un métier arrêté passe au rouge au bout de {SEUILS.depuisRougeMin} minutes.
            </Ligne>
            <Ligne
              label="tr/min (métier en marche)"
              valeur={
                <span className="inline-flex gap-[calc(var(--u)*0.3)]">
                  <Swatch teinte="rouge">&lt; {pct(SEUILS.vitesse.ambre)}</Swatch>
                  <Swatch teinte="ambre">≥ {pct(SEUILS.vitesse.ambre)}</Swatch>
                  <Swatch teinte="vert">≥ {pct(SEUILS.vitesse.vert)}</Swatch>
                </span>
              }
            >
              De la vitesse cible de la référence.
            </Ligne>
          </Carte>

        </div>

        {/* No footer strip (user's decision, 2026-08-28): the band's ✕, Escape
            and the backdrop are the three ways out, and a read-only dialog has
            nothing to confirm. The body carries the bottom radius instead. */}
      </div>
    </div>
  )
}
