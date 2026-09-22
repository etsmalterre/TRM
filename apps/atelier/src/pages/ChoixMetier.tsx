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
// head of its waiting queue, in the same three slots as an active tile (the
// article where the progress bar goes, the figures as pills underneath). The
// régleur reads the « Inactifs » list as the machines to set up next; a re-run
// of the same reference is a short setup, a machine idle for a week is a
// signal, and the waiting OF is what they will mount. The full history lives
// one tap away, on the poste's empty state.
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
//    the finished-but-still-active ones there — and, since 2026-09-22, the
//    ones whose OF the régleur has not launched yet: lib/vue-metiers.ts);
//  - tapping a métier whose OF has not started opens the réglage sheet, not
//    the poste — the legacy's own routing, eligibility check included.
import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Loader2, AlertCircle, ChevronRight, Wrench, Pause, Play, ArrowRight } from 'lucide-react'
import { fetchMachines, type Machine } from '@/lib/atelier-api'
import { depuis } from '@/lib/depuis'
import { PosteHeader } from '@/components/layout/PosteHeader'
import { Segment } from '@/components/atelier/Segment'
import { Pastille } from '@/components/atelier/Pastille'
import { useIdentite } from '@/contexts/BonnetierContext'
import { cn } from '@/lib/utils'
import { teinteArrets } from '@/lib/teinte-arrets'
import { vibrer } from '@/lib/vibration'
import { estInactif, lireVue } from '@/lib/vue-metiers'

export function ChoixMetier() {
  const navigate = useNavigate()
  const { identite } = useIdentite()
  const regleur = identite?.regleur ?? false
  // The tab is in the URL, not in state, so a back arrow returns to it
  // (lib/vue-metiers.ts). `replace`: switching tabs is not a history step.
  const [params, setParams] = useSearchParams()
  const voirActives = lireVue(params) === 'actifs'
  const setVoirActives = (actifs: boolean) =>
    setParams(actifs ? {} : { vue: 'inactifs' }, { replace: true })

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
    // The two tabs are complementary: a métier inactive for this role never
    // shows in Actifs too (an unlaunched OF sat in both for a bonnetier,
    // 2026-09-22). `actif` still keeps the régleur's finished-but-open OFs
    // out of Actifs, as before.
    return {
      actives: all.filter((m) => m.actif && !estInactif(m, regleur)),
      inactives: all.filter((m) => estInactif(m, regleur)),
    }
  }, [data, regleur])

  const liste = voirActives ? actives : inactives

  function ouvrir(m: Machine) {
    // The legacy buzzed on a métier; a light tick keeps the habit.
    vibrer('tick')
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
          <MetierTile key={m.IDmachine} m={m} regleur={regleur} onOpen={() => ouvrir(m)} />
        ))}
      </main>

      {/* The build's version, on a thin white strip of its own under the list.
          It used to float over the bottom-right corner and sat on top of the
          tiles as they scrolled by (user, 2026-09-15): a strip in the flex
          column never covers content. It also owns the bottom safe-area
          inset, so the list no longer needs its own trailing spacer. */}
      <footer
        className="flex-shrink-0 flex justify-end px-3 pt-1 bg-card border-t border-border select-none"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.25rem)' }}
      >
        <span className="text-[10px] leading-none text-muted-foreground tabular-nums">
          Version {__APP_VERSION__}
        </span>
      </footer>
    </div>
  )
}

/** The three legacy tile icons (reglage1 / pause1 / play1), as glyphs. An idle
 *  métier gets none: the dashed circle it used to carry said nothing the muted
 *  tile does not (Vincent, 2026-09-15). */
const ETATS = {
  reglage: { Icon: Wrench, titre: 'En réglage — OF non lancé', classe: 'text-warning' },
  pause: { Icon: Pause, titre: 'OF interrompu', classe: 'text-primary' },
  marche: { Icon: Play, titre: 'En marche', classe: 'text-success' },
} as const

const pct = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 })
const arrets = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

/** The 2nd-choice pill earns its place from 1 %, for BOTH roles (Vincent,
 *  2026-09-22): below that the figure rounds to « 0 % » or « 0,5 % » and says
 *  nothing. The legacy showed it to the régleur only, and only under a lit
 *  bell; a bonnetier who reads « 1,5 % » on their métier knits more carefully,
 *  so the ratio now rides on every list (`of.pct_defaut`) and this threshold
 *  is the only rule. */
const SEUIL_PCT_DEFAUT = 0.01

function MetierTile({ m, regleur, onOpen }: { m: Machine; regleur: boolean; onOpen: () => void }) {
  const of = m.of
  const r = m.regleur
  // The red frame: second choice above the server's 2 % for both roles
  // (`alerte_defaut`, Vincent 2026-09-22 — same trigger as the régleur), plus
  // the stops for a régleur (`regleur.alerte`).
  const alerte = !!of?.alerte_defaut || !!r?.alerte
  const defauts = !!of && of.pct_defaut >= SEUIL_PCT_DEFAUT
  // The figures get a row of their own, running under the glyph and the
  // chevron: on a 360 px phone the middle column alone is ~140 px, not enough
  // for the two pills side by side — and the defect pill must always sit left
  // of the stops pill, never wrap under it (2026-09-14). A bonnetier's tile
  // carries the defect pill alone; the stops pill is the régleur's.
  const figures = !!of && (defauts || (!!r && r.arrets_piece.moyenne !== null))
  // The idle tile's pills: when the last OF stopped, and the one waiting.
  const dernier = !of ? (m.inactif?.dernier_of ?? null) : null
  const prochain = !of ? (m.inactif?.prochain_of ?? null) : null
  const repos = !!dernier || !!prochain
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'w-full text-left rounded-xl border bg-card shadow-sm p-3.5',
        'grid grid-cols-[auto_1fr_auto_auto] items-center gap-x-3 gap-y-2 active:bg-muted transition-colors',
        of ? 'border-border' : 'border-border/60',
        // §41: the frame colour is reserved for "needs my attention now" —
        // exactly what the legacy alert means, now for both roles.
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
          (figures || repos) && 'row-span-2',
        )}
      >
        {m.label}
      </span>

      <span className="min-w-0">
        {of && !regleur && !of.demarre ? (
          // A bonnetier cannot launch (2026-09-22): the métier sits in
          // Inactifs (lib/vue-metiers.ts) and says why, instead of a 0 % bar
          // that reads as a job to start.
          <span className="block text-sm text-muted-foreground italic truncate">
            OF non lancé — en attente du régleur
          </span>
        ) : of ? (
          // The one thing a régleur reads at a glance: how far the OF is.
          // The reference, coloris and OF number live on the poste screen
          // one tap away (decision 2026-09-14).
          <Avancement of={of} />
        ) : dernier ? (
          // Where the bar would be: the article that ran here last. Muted
          // like the code, so nothing on an idle tile reads as running.
          <span className="block text-sm font-medium text-muted-foreground truncate">
            {dernier.reference}
            {dernier.coloris ? ` · ${dernier.coloris}` : ''}
          </span>
        ) : (
          <span className="block text-sm text-muted-foreground italic">Aucun OF en cours</span>
        )}
      </span>

      {r ? <EtatGlyphe etat={r.etat} /> : <span />}
      <ChevronRight className="h-6 w-6 text-muted-foreground" />

      {figures && (
        <span className="col-start-2 col-span-3 flex flex-nowrap gap-1.5 min-w-0 overflow-hidden">
          {defauts && of && (
            // Just the figure: red and a percentage is enough to read
            // « 2nd choix » — the label crowded the tile (2026-09-14).
            <Pastille rouge title="Poids de 2nd choix sur les derniers rouleaux de la référence">
              {pct.format(of.pct_defaut)}
            </Pastille>
          )}
          {r && r.arrets_piece.moyenne !== null && (
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

      {repos && (
        <span className="col-start-2 col-span-3 flex flex-wrap gap-1.5 min-w-0">
          {dernier && (
            <Pastille title="Fin du dernier OF sur ce métier">Terminé {depuis(dernier.fin_ms)}</Pastille>
          )}
          {prochain && (
            <Pastille accent className="max-w-full" title={`OF ${prochain.IDordre_fabrication} en attente sur ce métier`}>
              <ArrowRight className="h-3 w-3" />
              <span className="truncate">
                {prochain.reference}
                {prochain.coloris ? ` · ${prochain.coloris}` : ''}
              </span>
            </Pastille>
          )}
        </span>
      )}
    </button>
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
