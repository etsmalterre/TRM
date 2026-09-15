// The métier picker — legacy FEN_Choix_Metier.
//
// Two lists behind one switch, exactly as the legacy has it: the métiers that
// still owe pieces (« Actifs ») and everything else. The bonnetier arrives here
// knowing which machine they are standing at, so this screen's only job is to
// let them hit the right tile without looking twice.
//
// The segments say « Actifs / Inactifs », not the legacy's « Actives /
// Inactives »: the legacy's list was titled « Machines Actives », this screen
// is titled « Métiers », and métier is masculine (user, 2026-09-15).
//
// An IDLE tile is not blank (user, 2026-09-15): it carries the last OF that
// ran on the métier — reference, coloris, how long ago it stopped — and the
// head of its waiting queue. The régleur reads the « Inactifs » list as the
// machines to set up next; a re-run of the same reference is a short setup, a
// machine idle for a week is a signal, and the waiting OF is what they will
// mount. The full history lives one tap away, on the poste's empty state.
//
// Tiles are deliberately NOT colour-coded by consigne. §41 says a colour is
// only worth spending when it discriminates, and 7 of the 9 running OFs on the
// live base carry a consigne — a liseré here would paint almost every active
// tile red and teach the operator to ignore it. The consigne gets its full red
// callout one screen later (§46), where it is actually actionable.
//
// The RÉGLEUR sees the same screen with the régleur build's extras (legacy
// configuration Appli_Regleur, `Android\gen\Compile`):
//  - a state glyph on every active tile — réglage (the OF has not started),
//    pause (interrupted) or marche;
//  - the alert of `bAlert = pctDefaut > 2 % ou nFreqArret > 1`, which IS the
//    §41 attention state this list is allowed to spend red on: it is rare by
//    construction, and it names the métier the régleur should walk to next;
//  - « Inactifs » = métiers with NO active OF (the bonnetier build also lists
//    the finished-but-still-active ones there);
//  - tapping a métier whose OF has not started opens the réglage sheet, not
//    the poste — the legacy's own routing, eligibility check included.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Loader2, AlertCircle, ChevronRight, Wrench, Pause, Play } from 'lucide-react'
import { fetchMachines, type Machine, type MachineInactif } from '@/lib/atelier-api'
import { depuis } from '@/lib/depuis'
import { PosteHeader } from '@/components/layout/PosteHeader'
import { Segment } from '@/components/atelier/Segment'
import { useIdentite } from '@/contexts/BonnetierContext'
import { cn } from '@/lib/utils'
import { teinteArrets, type TeinteArrets } from '@/lib/teinte-arrets'

export function ChoixMetier() {
  const navigate = useNavigate()
  const { identite } = useIdentite()
  const regleur = identite?.regleur ?? false
  const [voirActives, setVoirActives] = useState(true)

  const { data, isLoading, isError } = useQuery({
    // The role is part of the key: the régleur list carries extra fields the
    // bonnetier list does not, and the poste reads the same cache entry.
    queryKey: ['atelier', 'machines', regleur],
    queryFn: () => fetchMachines(regleur),
    // The floor changes under the operator's feet — an OF gets terminé, the
    // next one activates. Polled and refetched on focus by the QueryClient
    // defaults (lib/rafraichissement.ts), so the list is never more than
    // POLL_MS behind another phone or the ERP.
  })

  const { actives, inactives } = useMemo(() => {
    const all = data ?? []
    return {
      actives: all.filter((m) => m.actif),
      inactives: regleur ? all.filter((m) => !m.of) : all.filter((m) => !m.actif),
    }
  }, [data, regleur])

  const liste = voirActives ? actives : inactives

  function ouvrir(m: Machine) {
    // Legacy (Appli_Regleur): « si pas DateValide(demarrage_prod) alors
    // OuvreFenêtreMobile(FEN_Reglage_Machine) » — after the eligibility check,
    // which the réglage screen itself renders here.
    if (regleur && m.of && !m.of.demarre) navigate(`/metier/${m.IDmachine}/reglage`)
    else navigate(`/metier/${m.IDmachine}`)
  }

  return (
    <div className="h-full flex flex-col bg-background">
      <PosteHeader titre="Métiers" />

      {/* The switch between the two lists. Not a §29.3 pill: that pattern is
          for a mode that changes what a commit writes, and this only chooses
          which rows are shown. A two-segment control with its counts is the
          honest shape, styled like the ERP's submenu tabs (§3). */}
      <div className="flex-shrink-0 p-2 bg-zinc-200/50 border-b border-border">
        <div className="flex gap-1 rounded-lg bg-background p-1">
          <Segment
            label="Actifs"
            count={actives.length}
            active={voirActives}
            onClick={() => setVoirActives(true)}
          />
          <Segment
            label="Inactifs"
            count={inactives.length}
            active={!voirActives}
            onClick={() => setVoirActives(false)}
          />
        </div>
      </div>

      <main className="flex-1 min-h-0 overflow-y-auto scrollbar-transparent p-3 space-y-2.5">
        {isLoading && (
          <div className="flex justify-center pt-10">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center gap-2 pt-10 text-center text-muted-foreground">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm">Impossible de charger les métiers.</p>
          </div>
        )}

        {data && liste.length === 0 && (
          <p className="pt-10 text-center text-sm text-muted-foreground italic">
            {voirActives ? 'Aucun métier en production.' : 'Tous les métiers tournent.'}
          </p>
        )}

        {liste.map((m) => (
          <MetierTile key={m.IDmachine} m={m} onOpen={() => ouvrir(m)} />
        ))}

        {/* The safe-area inset as trailing padding, so the last tile clears the
            gesture bar instead of sitting under it. */}
        <div style={{ height: 'env(safe-area-inset-bottom)' }} />
      </main>
    </div>
  )
}

/** The three legacy tile icons (reglage1 / pause1 / play1), as glyphs. */
const ETATS = {
  reglage: { Icon: Wrench, titre: 'En réglage — OF non lancé', classe: 'text-warning' },
  pause: { Icon: Pause, titre: 'OF interrompu', classe: 'text-primary' },
  marche: { Icon: Play, titre: 'En marche', classe: 'text-success' },
} as const

const pct = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 })
const arrets = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

/** The 2nd-choice pill only earns its place from 1 %: below that the figure
 *  rounds to « 0 % » or « 0,5 % » and tells the régleur nothing the bell has
 *  not already said (2026-09-14). The API zeroes it without an alert anyway. */
const SEUIL_PCT_DEFAUT = 0.01

function MetierTile({ m, onOpen }: { m: Machine; onOpen: () => void }) {
  const of = m.of
  const r = m.regleur
  const alerte = !!r?.alerte
  // The régleur figures get a row of their own, running under the glyph and
  // the chevron: on a 360 px phone the middle column alone is ~140 px, not
  // enough for the two pills side by side — and the defect pill must always
  // sit left of the stops pill, never wrap under it (2026-09-14).
  const figures = !!of && !!r && (alerte || r.arrets_piece.moyenne !== null)
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'w-full text-left rounded-xl border bg-card shadow-sm p-3.5',
        'grid grid-cols-[auto_1fr_auto_auto] items-center gap-x-3 gap-y-2 active:bg-muted transition-colors',
        of ? 'border-border' : 'border-border/60',
        // §41: the frame colour is reserved for "needs my attention now" —
        // and on the régleur list that is exactly what the legacy alert means.
        alerte && 'border-destructive/50 bg-destructive/5',
      )}
    >
      {/* The métier code is the biggest thing on the tile: it is what the
          bonnetier matches against the machine in front of them. It spans
          both rows so it stays centred on the whole tile. */}
      <span
        className={cn(
          'text-4xl font-heading font-bold tracking-tight tabular-nums w-16',
          of ? 'text-foreground' : 'text-muted-foreground',
          figures && 'row-span-2',
        )}
      >
        {m.label}
      </span>

      <span className="min-w-0">
        {of ? (
          // The one thing a régleur reads at a glance: how far the OF is.
          // The reference, coloris and OF number live on the poste screen
          // one tap away (decision 2026-09-14).
          <Avancement of={of} />
        ) : (
          <Repos inactif={m.inactif} />
        )}
      </span>

      {r ? <EtatGlyphe etat={r.etat} /> : <span />}
      <ChevronRight className="h-6 w-6 text-muted-foreground" />

      {figures && (
        <span className="col-start-2 col-span-3 flex flex-nowrap gap-1.5 min-w-0 overflow-hidden">
          {alerte && r.pct_defaut >= SEUIL_PCT_DEFAUT && (
            // Just the figure: red and a percentage is enough for a régleur to
            // read « 2nd choix » — the label crowded the tile (2026-09-14).
            <Pastille rouge title="Poids de 2nd choix sur les derniers rouleaux de la référence">
              {pct.format(r.pct_defaut)}
            </Pastille>
          )}
          {r.arrets_piece.moyenne !== null && (
            // Same colour as the tablet's pill for the same figure — the
            // ladder lives in lib/teinte-arrets.ts, tested against the TRS source.
            <Pastille
              teinte={teinteArrets(r.arrets_piece.moyenne)}
              title={`Arrêts anormaux par pièce, en moyenne sur les ${r.arrets_piece.pieces} dernières pièces terminées de l'OF — le chiffre de la tablette TRS`}
            >
              {arrets.format(r.arrets_piece.moyenne)} arrêt{r.arrets_piece.moyenne >= 2 ? 's' : ''} / pièce
            </Pastille>
          )}
        </span>
      )}
    </button>
  )
}

/** The idle tile's middle column: the last OF that ran here and the one waiting
 *  next, each as a tiny label over one line of reference · coloris. Nothing
 *  else: the numbers (pieces, weight, second choice) belong to the history on
 *  the poste, one tap away. A métier with neither reads as it always did. */
function Repos({ inactif }: { inactif: MachineInactif | null }) {
  const dernier = inactif?.dernier_of ?? null
  const prochain = inactif?.prochain_of ?? null
  if (!dernier && !prochain) {
    return <span className="block text-sm text-muted-foreground italic">Aucun OF en cours</span>
  }
  return (
    <span className="block space-y-1">
      {dernier && (
        <span className="block">
          <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
            Dernier OF · {depuis(dernier.fin_ms)}
          </span>
          <span className="block text-sm font-medium truncate">
            {dernier.reference}
            {dernier.coloris ? ` · ${dernier.coloris}` : ''}
          </span>
        </span>
      )}
      {prochain && (
        <span className="block">
          <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">À suivre</span>
          <span className="block text-sm truncate">
            {prochain.reference}
            {prochain.coloris ? ` · ${prochain.coloris}` : ''}
          </span>
        </span>
      )}
    </span>
  )
}

/** The OF's progress as a bar: pieces done over pieces ordered. Deep blue while
 *  running, success green once the order is reached (§29 pill colours — amber
 *  is reserved for warnings). On a « finir le fil » OF the target is an
 *  estimate that the count routinely passes, so the bar caps at 100 % and the
 *  tilde stays on the number: `3 / ~5`. */
function Avancement({ of }: { of: { produites: number; nb_pieces: number; finir_fil: boolean } }) {
  const cible = Math.max(of.nb_pieces, 0)
  const ratio = cible > 0 ? Math.min(of.produites / cible, 1) : 0
  const atteint = cible > 0 && of.produites >= cible
  return (
    <span className="flex items-center gap-2.5">
      <span
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={cible}
        aria-valuenow={Math.min(of.produites, cible)}
        aria-label={`${of.produites} pièces sur ${of.finir_fil ? 'environ ' : ''}${cible}`}
        // Translucent dark track, not `bg-secondary`: that 96 % grey vanished
        // on the alert tile's pale red (`bg-destructive/5`) — the empty part
        // of the bar was unreadable on exactly the tiles a régleur must read
        // first (2026-09-15). A foreground tint darkens whatever it sits on.
        className="flex-1 min-w-0 h-2 rounded-full bg-foreground/[0.12] overflow-hidden"
      >
        <span
          className={cn('block h-full rounded-full transition-[width]', atteint && !of.finir_fil ? 'bg-success' : 'bg-primary')}
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </span>
      <span className="flex-shrink-0 text-sm tabular-nums leading-none">
        <span className="font-semibold text-foreground">{of.produites}</span>
        <span className="text-muted-foreground"> / {of.finir_fil ? '~' : ''}{cible}</span>
      </span>
    </span>
  )
}

function EtatGlyphe({ etat }: { etat: keyof typeof ETATS }) {
  const { Icon, titre, classe } = ETATS[etat]
  return (
    <span title={titre} className={cn('flex-shrink-0 flex items-center justify-center h-9 w-9 rounded-full bg-secondary', classe)}>
      <Icon className="h-5 w-5" />
    </span>
  )
}

/** A régleur figure on the tile: red when it is the reason for the alert,
 *  plain otherwise (the legacy shows the stop figure on every tile). */
/** Soft tints of the tablet's status colours (it paints them solid; the
 *  phone's pills are tinted like the rest of the app). `rouge` is the plain
 *  alert pill; `teinte` is the three-step ladder. */
const TEINTE_PASTILLE: Record<TeinteArrets, string> = {
  vert: 'bg-emerald-500/15 text-emerald-800 border-emerald-500/30',
  ambre: 'bg-amber-500/15 text-amber-800 border-amber-500/30',
  rouge: 'bg-destructive/10 text-destructive border-destructive/30',
}

function Pastille({
  rouge,
  teinte,
  title,
  children,
}: {
  rouge?: boolean
  teinte?: TeinteArrets
  title?: string
  children: React.ReactNode
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center rounded-full px-2 h-6 text-xs font-medium tabular-nums border whitespace-nowrap flex-shrink-0',
        teinte
          ? TEINTE_PASTILLE[teinte]
          : rouge
            ? TEINTE_PASTILLE.rouge
            : 'bg-secondary text-muted-foreground border-border/60',
      )}
    >
      {children}
    </span>
  )
}
