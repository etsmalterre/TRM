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
import {
  ArrowLeftRight,
  ArrowRight,
  Clock,
  Divide,
  Info,
  OctagonX,
  Palette,
  Pause,
  Play,
  RotateCcw,
  Smartphone,
  Square,
  Timer,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ARRETS_PIECES, EQUIPES, FORFAIT_TOTAL_MIN, INTERVENTION_MAX_MIN, SEUILS } from '@/lib/regles'
import { fmtArrets, teinteArrets } from '@/lib/affichage'

const pct = (r: number) => `${Math.round(r * 100)} %`

/** The value drawn in the « Les arrêts » example pill. A sample, not a rule:
 *  its colour comes from the real ladder, so 3 shows amber as it would on
 *  the wall. */
const EXEMPLE_ARRETS = 3

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

/** The tile's arrêts pill, verbatim (MetierTile.Pill: value over its word,
 *  solid ladder colour), drawn at the dialog's scale as a worked example. */
function ExemplePastille({ valeur }: { valeur: number }) {
  return (
    <span
      className={cn(
        'flex-shrink-0 inline-flex flex-col items-center justify-center rounded-[calc(var(--u)*0.6)] px-[calc(var(--u)*0.8)] py-[calc(var(--u)*0.35)] leading-none',
        SWATCH[teinteArrets(valeur)],
      )}
    >
      <span className="text-[calc(var(--u)*1.45)] font-bold tabular-nums">{fmtArrets(valeur)}</span>
      <span className="text-[max(9px,calc(var(--u)*0.72))] uppercase tracking-wide text-white/85 mt-[calc(var(--u)*0.2)] whitespace-nowrap">
        arrêts / pièce
      </span>
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
function ActionOf({ icon, label, plein = true }: { icon: React.ReactNode; label: string; plein?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-[calc(var(--u)*0.4)] rounded-md border border-primary/20 bg-primary/5 px-[calc(var(--u)*0.7)] py-[calc(var(--u)*0.35)] font-semibold text-primary whitespace-nowrap [&>svg]:h-[calc(var(--u)*1)] [&>svg]:w-[calc(var(--u)*1)]',
        // Play / Pause / Square are solid glyphs; a stroke icon (the restart
        // arrow) turns into a blob when filled.
        plein && '[&>svg]:fill-current',
      )}
    >
      {icon}
      {label}
    </span>
  )
}

/** Who presses the button. The régleur owns the whole clock; the bonnetier
 *  only closes it, so his tag is the one drawn in gold. */
const ROLE = {
  regleur: { label: 'Régleur', className: 'bg-zinc-100 text-muted-foreground border-border/60' },
  bonnetier: { label: 'Bonnetier', className: 'bg-gold-light text-gold-foreground border-gold/40' },
} as const

/** One step of the production clock: its action chip(s), an optional word on
 *  when it happens, and the role tags of whoever may press it. */
function Etape({
  roles,
  legende,
  children,
}: {
  roles: (keyof typeof ROLE)[]
  legende?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-[calc(var(--u)*0.35)]">
      <div className="flex items-center gap-[calc(var(--u)*0.35)]">{children}</div>
      {legende && (
        <div className="text-[max(9px,calc(var(--u)*0.75))] text-muted-foreground leading-none">{legende}</div>
      )}
      <div className="flex items-center gap-[calc(var(--u)*0.25)]">
        {roles.map((r) => (
          <span
            key={r}
            className={cn(
              'inline-flex items-center rounded-full border px-[calc(var(--u)*0.55)] py-[calc(var(--u)*0.1)] text-[max(9px,calc(var(--u)*0.7))] font-semibold uppercase tracking-wide leading-tight',
              ROLE[r].className,
            )}
          >
            {ROLE[r].label}
          </span>
        ))}
      </div>
    </div>
  )
}

/** The arrow between two steps, aligned with the chips (first row). */
function Fleche() {
  return (
    <ArrowRight className="h-[calc(var(--u)*1.2)] w-[calc(var(--u)*1.2)] flex-shrink-0 text-muted-foreground/70 mt-[calc(var(--u)*0.45)]" />
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
          <Carte icon={<Smartphone />} titre="Temps de production géré depuis le téléphone" className="col-span-full">
            {/* Four actions, not three: « Relancer » is the pair of « Interrompre »
                (chosen at run time on arret_prod). And the régleur is not the only
                hand on the clock: a bonnetier can terminate an OF at the end of a
                production (user's precision, 2026-08-28). */}
            {/* A flow, not a list: the clock opens, may pause and resume, then
                closes. Each step carries who does it; only the last one also
                belongs to the bonnetier, and that difference is the point. */}
            <div className="flex items-start justify-center gap-[calc(var(--u)*0.5)] flex-wrap">
              <Etape roles={['regleur']} legende="au lancement">
                <ActionOf icon={<Play />} label="Démarrer l'OF" />
              </Etape>
              <Fleche />
              <Etape roles={['regleur']} legende="pendant la production">
                <ActionOf icon={<Pause />} label="Interrompre" />
                <ArrowLeftRight className="h-[calc(var(--u)*0.9)] w-[calc(var(--u)*0.9)] text-muted-foreground" />
                <ActionOf icon={<RotateCcw />} label="Relancer" plein={false} />
              </Etape>
              <Fleche />
              <Etape roles={['regleur', 'bonnetier']} legende="en fin de production">
                <ActionOf icon={<Square />} label="Terminer" />
              </Etape>
            </div>
            {/* The one consequence, as an info strip — the same navy-tint
                strip as the « > 100 % » one below, with an ⓘ tile where that
                one has its figure, so the two read as the same kind of note. */}
            <Note>
              Un OF laissé en cours pendant que le métier ne tricote pas <b>fait baisser le TRS</b>.
            </Note>
          </Carte>

          {/* « Ce qui est déduit » and « Les arrêts » sit side by side: both
              say what happens to a stop, and the pair keeps the dialog on one
              1280 × 800 screen (full-width, the last row fell under the fold). */}
          <Carte icon={<Timer />} titre="Ce qui est déduit">
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

          {/* The arrêts pill = the legacy tablet's own NombreArrets (per piece,
              stops minus declared events), averaged over the last finished
              pieces of the OF — user's decision of 2026-08-28, after nobody
              could remember whether it was per roll or per 3 rolls. The card
              answers exactly that. Numbers from lib/regles.ts. */}
          <Carte icon={<OctagonX />} titre="Les arrêts">
            {/* The tile's own pill as the example, then what the value IS in one
                sentence — no mechanics (user, 2026-08-28). The example value is
                coloured by the real ladder so the swatch never lies. */}
            <div className="flex items-center gap-[calc(var(--u)*0.8)]">
              <ExemplePastille valeur={EXEMPLE_ARRETS} />
              <p>
                Le nombre d'<b>arrêts anormaux</b> du métier <b>par pièce</b> (ni nettoyage, ni fin
                de pièce), en moyenne sur les <b>{ARRETS_PIECES} dernières pièces terminées</b> de
                l'OF.
              </p>
            </div>
            <Note>
              Mis à jour à chaque fin de pièce. Gris tant qu'aucune pièce de l'OF n'est terminée.
            </Note>
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
              label="Arrêté (durée de l'arrêt)"
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
              label="Arrêts / pièce"
              valeur={
                <span className="inline-flex gap-[calc(var(--u)*0.3)]">
                  <Swatch teinte="vert">≤ {SEUILS.arrets.vert}</Swatch>
                  <Swatch teinte="ambre">≤ {SEUILS.arrets.ambre}</Swatch>
                  <Swatch teinte="rouge">&gt; {SEUILS.arrets.ambre}</Swatch>
                </span>
              }
            >
              Gris tant que l'OF n'a pas de pièce terminée.
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
