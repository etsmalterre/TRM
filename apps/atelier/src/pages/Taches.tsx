// Tâches d'atelier. Two categories (rules on the API, lib/taches-atelier.ts):
//
// RÉCURRENTES — the general jobs of the factory (cobwebs in the stock, the
// workshop floors…) the bonnetiers do when few métiers run (Vincent
// 2026-11-05).
// - A task STAYS on the list: « Fait » adds a dated réalisation with its team.
//   The list is sorted by the server: red, amber, then never-done and
//   oldest-done first, so the neglected job rises by itself.
// - The card shows who did it last (faces) and an « il y a N j » tag. With a
//   frequency (set by the régleur) the tag is red from F days (to do now),
//   amber from F − 10 % (can be done now, ahead), green below — rule
//   `niveauTache` on the API. Without one it stays grey.
// - Only a régleur adds, edits and removes them; removing archives it on the
//   server, the history stays.
//
// PONCTUELLES — one-off requests to a GROUP, never a person (Vincent
// 2026-11-10):
// - anyone creates one, for the bonnetiers or the régleurs. A bonnetier's
//   request to the régleurs arrives UNDATED and red: the first régleur sets
//   its due date. Every other request is dated at creation;
// - neutral until its date has passed, then red for its group (the creator,
//   waiting, sees it neutral). Red is handled by Fait, Repousser (new date +
//   motif) or Abandonner (motif) — and the métier list imposes it
//   (TachesRougesGate);
// - it leaves the list once closed; its creator keeps it a week, read-only,
//   to see what became of it.
//
// A card is one tap target (Vincent 2026-11-10: a big « Fait » on every card
// made the list a wall of gold). The tap opens the task's sheet: its history,
// « Fait » (or the ponctuelle's actions), « Modifier » when allowed, and
// « Annuler » while a wrong « Fait » may still be cancelled.
//
// « Fait » = pick your coéquipiers (faces, none is fine), then confirm. The
// hour is the server's. The declarer may cancel within 10 min (wrong tap).
//
// Reached from the « Tâches » button under the métier list (ChoixMetier).
import { useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  CalendarClock,
  Check,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Repeat,
  Save,
  Trash2,
  XCircle,
} from 'lucide-react'
import { PosteHeader } from '@/components/layout/PosteHeader'
import { BonnetierPhoto } from '@/components/atelier/BonnetierPhoto'
import { ConfirmSheet } from '@/components/atelier/ConfirmSheet'
import { Pastille } from '@/components/atelier/Pastille'
import { Segment } from '@/components/atelier/Segment'
import { BandeauFait } from '@/components/atelier/BandeauFait'
import {
  aujourdhuiIso,
  ChoixEcheance,
  erreurTache,
  ErreurLigne,
  FeuillesPonctuelle,
  formatJour,
  heure,
  nomsEquipe,
  Puce,
  Sheet,
  type FeuillePonctuelle,
} from '@/components/atelier/TacheSheets'
import { useIdentite } from '@/contexts/BonnetierContext'
import {
  creerTache,
  fetchRealisationsTache,
  fetchTaches,
  modifierTache,
  supprimerTache,
  type GroupeTache,
  type RealisationTache,
  type Tache,
} from '@/lib/atelier-api'
import { vibrer } from '@/lib/vibration'
import { cn } from '@/lib/utils'

/** Prefix of every task query; the list itself is keyed by who looks
 *  (`tachesQueryKey`), since a ponctuelle's colour depends on it. */
export const TACHES_QUERY_KEY = ['atelier', 'taches'] as const
export const tachesQueryKey = (moi: number | null) => [...TACHES_QUERY_KEY, 'liste', moi] as const

/** The task list as the current person sees it. */
export function useTaches() {
  const { identite } = useIdentite()
  const moi = identite?.id ?? null
  return useQuery({
    queryKey: tachesQueryKey(moi),
    queryFn: () => fetchTaches(moi),
  })
}

const VUES = ['recurrentes', 'ponctuelles', 'mes-demandes'] as const
type Vue = (typeof VUES)[number]

const LIBELLE_GROUPE: Record<GroupeTache, string> = {
  bonnetiers: 'les bonnetiers',
  regleurs: 'les régleurs',
}

export function Taches() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { identite } = useIdentite()
  const regleur = identite?.regleur ?? false
  const moi = identite?.id ?? 0
  const monGroupe: GroupeTache = regleur ? 'regleurs' : 'bonnetiers'

  const [feuille, setFeuille] = useState<{
    tache: Tache
    quoi: FeuillePonctuelle
  } | null>(null)
  // The open task sheet, by id: it follows the polled list, and closes by
  // itself when the task leaves it (a ponctuelle closed by someone else).
  const [ouverteId, setOuverteId] = useState<number | null>(null)
  // null = closed; 'nouvelle' = creation; a task = edition.
  const [edition, setEdition] = useState<Tache | 'nouvelle' | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  const { data: taches, isLoading, isError } = useTaches()

  const rafraichir = () => queryClient.invalidateQueries({ queryKey: TACHES_QUERY_KEY })

  const ponctuelles = (taches ?? []).filter((t) => t.categorie === 'ponctuelle')
  // Two questions, so a request may sit in both (Vincent 2026-11-10, like a
  // mail sent to a list you are on: in Sent and in the inbox):
  // « Ponctuelles » = what my group must do (open, addressed to my group);
  // « Mes demandes » = everything I sent and is still open, plus what was
  // abandoned this week (with its motif) — a follow-up view, never red. A
  // done request leaves both at once: an empty list is the goal.
  const aTraiter = ponctuelles.filter((t) => t.groupe === monGroupe && t.cloture === null)
  const mesDemandes = ponctuelles.filter((t) => t.cree_par?.id === moi)
  const recurrentes = (taches ?? []).filter((t) => t.categorie === 'recurrente')

  // Three tabs, like the métier list's Actifs / Inactifs (Vincent 2026-11-10):
  // Récurrentes · Ponctuelles · Mes demandes — what my group must do apart from
  // what I wait on, so a red dot always means « something to do here ». The
  // tab is in the URL (`?vue=…`) so a back arrow returns to it. Without one:
  // Récurrentes, unless it is empty and Ponctuelles is not.
  const [params, setParams] = useSearchParams()
  const vueUrl = params.get('vue')
  const vue: Vue = VUES.includes(vueUrl as Vue)
    ? (vueUrl as Vue)
    : recurrentes.length === 0 && aTraiter.length > 0
      ? 'ponctuelles'
      : 'recurrentes'
  const setVue = (v: Vue) => setParams({ vue: v }, { replace: true })
  // Count = what is open in the tab; a red dot when it holds something red
  // for me (the tab not shown must still say it). Mes demandes is never red.
  const rougeAFaire = aTraiter.some((t) => t.niveau === 'rouge')
  const rougeRecurrentes = recurrentes.some((t) => t.niveau === 'rouge')

  const ouverte = (taches ?? []).find((t) => t.id === ouverteId) ?? null

  const carte = (t: Tache, envoi = false) => (
    <TacheCarte
      key={t.id}
      // Mes demandes is a follow-up view: waiting is never red there.
      t={envoi ? { ...t, niveau: null } : t}
      envoi={envoi}
      regleur={regleur}
      onOpen={() => {
        vibrer('tick')
        setErreur(null)
        setOuverteId(t.id)
      }}
    />
  )

  return (
    <div className="h-full flex flex-col bg-background">
      <PosteHeader titre="Tâches" onBack={() => navigate('/')} />

      <div className="flex-shrink-0 p-2 bg-zinc-200/50 border-b border-border">
        <div className="flex gap-1 rounded-lg bg-background p-1">
          <Segment
            compact
            label="Récurrentes"
            count={recurrentes.length}
            icone={rougeRecurrentes ? <PointRouge /> : undefined}
            active={vue === 'recurrentes'}
            onClick={() => setVue('recurrentes')}
          />
          <Segment
            compact
            label="Ponctuelles"
            count={aTraiter.filter((t) => t.cloture === null).length}
            icone={rougeAFaire ? <PointRouge /> : undefined}
            active={vue === 'ponctuelles'}
            onClick={() => setVue('ponctuelles')}
          />
          <Segment
            compact
            label="Mes demandes"
            count={mesDemandes.filter((t) => t.cloture === null).length}
            active={vue === 'mes-demandes'}
            onClick={() => setVue('mes-demandes')}
          />
        </div>
      </div>

      <main className="flex-1 min-h-0 overflow-y-auto scrollbar-transparent p-3 space-y-2.5">
        {erreur && !ouverte && (
          <p className="flex items-start gap-2 text-sm text-destructive px-0.5">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>{erreur}</span>
          </p>
        )}
        {isLoading && (
          <div className="flex justify-center pt-10">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
          </div>
        )}
        {isError && <p className="pt-10 text-center text-sm text-destructive">Impossible de charger les tâches.</p>}
        {taches && vue === 'ponctuelles' && aTraiter.length === 0 && (
          <p className="pt-10 text-center text-sm text-muted-foreground italic">
            Aucune tâche ponctuelle pour {LIBELLE_GROUPE[monGroupe]}.
          </p>
        )}
        {taches && vue === 'mes-demandes' && mesDemandes.length === 0 && (
          <p className="pt-10 text-center text-sm text-muted-foreground italic">
            Aucune demande en cours. Créez-en une ci-dessous.
          </p>
        )}
        {taches && vue === 'recurrentes' && recurrentes.length === 0 && (
          <p className="pt-10 text-center text-sm text-muted-foreground italic">
            {regleur ? 'Aucune tâche récurrente. Ajoutez la première ci-dessous.' : 'Aucune tâche récurrente.'}
          </p>
        )}
        {/* Ponctuelles, grouped by who asked: the régleurs' requests matter
            more, so they come first (Vincent 2026-11-10). Inside a group the
            server's order holds: red first, then the nearest date. */}
        {vue === 'ponctuelles' &&
          ([true, false] as const).map((deRegleur) => {
            const liste = aTraiter.filter((t) => !!t.cree_par_regleur === deRegleur)
            if (liste.length === 0) return null
            return (
              <section key={String(deRegleur)} className="space-y-2.5">
                <h2 className="pt-1 px-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {deRegleur ? 'Demandées par les régleurs' : 'Demandées par les bonnetiers'}
                </h2>
                {liste.map((t) => carte(t))}
              </section>
            )
          })}
        {/* Mes demandes, grouped by whom they were sent to (Vincent
            2026-11-10): the heading says it, so the card does not. */}
        {vue === 'mes-demandes' &&
          (['regleurs', 'bonnetiers'] as const).map((g) => {
            const liste = mesDemandes.filter((t) => t.groupe === g)
            if (liste.length === 0) return null
            return (
              <section key={g} className="space-y-2.5">
                <h2 className="pt-1 px-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Pour {LIBELLE_GROUPE[g]}
                </h2>
                {liste.map((t) => carte(t, true))}
              </section>
            )
          })}
        {vue === 'recurrentes' && recurrentes.map((t) => carte(t))}
      </main>

      {/* A bonnetier creates ponctuelles only: no button on Récurrentes. */}
      {(regleur || vue !== 'recurrentes') && (
        <div className="flex-shrink-0 border-t border-border bg-zinc-200/50 p-3">
          <button
            type="button"
            onClick={() => setEdition('nouvelle')}
            disabled={!identite}
            className="w-full h-14 rounded-xl bg-primary text-primary-foreground text-lg font-semibold flex items-center justify-center gap-2 active:opacity-90 disabled:opacity-40"
          >
            <Plus className="h-5 w-5" />
            Nouvelle tâche
          </button>
          <div style={{ height: 'env(safe-area-inset-bottom)' }} />
        </div>
      )}

      <BandeauFait />
      {ouverte && identite && (
        <DetailSheet
          t={ouverte}
          moi={moi}
          regleur={regleur}
          erreur={erreur}
          onClose={() => setOuverteId(null)}
          onFeuille={(quoi) => setFeuille({ tache: ouverte, quoi })}
          onModifier={() => setEdition(ouverte)}
        />
      )}
      {feuille && identite && (
        <FeuillesPonctuelle
          tache={feuille.tache}
          moi={moi}
          feuille={feuille.quoi}
          onClose={() => setFeuille(null)}
          onDone={() => {
            setFeuille(null)
            setOuverteId(null)
            setErreur(null)
            rafraichir()
          }}
        />
      )}
      {edition && identite && (
        <EditionSheet
          tache={edition === 'nouvelle' ? null : edition}
          moi={moi}
          regleur={regleur}
          categorieInitiale={vue === 'recurrentes' && regleur ? 'recurrente' : 'ponctuelle'}
          // From Ponctuelles: for my own group; from Mes demandes: for the other one.
          groupeInitial={vue === 'ponctuelles' ? monGroupe : monGroupe === 'regleurs' ? 'bonnetiers' : 'regleurs'}
          onClose={() => setEdition(null)}
          onDone={() => {
            setEdition(null)
            rafraichir()
          }}
        />
      )}
    </div>
  )
}

/** « Something red in this tab ». */
function PointRouge() {
  return <span className="h-2.5 w-2.5 rounded-full bg-destructive" aria-label="Tâche en retard" />
}

function BoutonFait({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full h-14 rounded-xl bg-gold text-gold-foreground text-lg font-semibold flex items-center justify-center gap-2 active:opacity-90"
    >
      <Check className="h-5 w-5" />
      Fait
    </button>
  )
}

const boutonSecondaire =
  'flex-1 h-12 rounded-xl border border-border bg-background text-base font-semibold flex items-center justify-center gap-2 active:bg-muted'

/** The state tag of a ponctuelle. Red only when the server says it is red
 *  for me (my group, undated or overdue); waiting on others stays neutral. */
export function TagEcheance({ t }: { t: Tache }) {
  const rouge = t.niveau === 'rouge'
  let texte: string
  if (t.echeance === null) texte = rouge ? 'À dater' : 'Échéance à fixer par les régleurs'
  else if (aujourdhuiIso() > t.echeance) texte = `En retard · ${formatJour(t.echeance)}`
  else texte = `Pour le ${formatJour(t.echeance)}`
  return (
    <Pastille teinte={rouge ? 'rouge' : undefined} className="h-7 px-2.5 text-sm font-semibold">
      {texte}
    </Pastille>
  )
}

/** The actions of an open ponctuelle as the person may use them: the main
 *  one full width (Fait, or « Fixer l'échéance » on an undated request),
 *  Repousser / Abandonner under it. Shared with the red-task gate. */
export function ActionsPonctuelle({ t, onFeuille }: { t: Tache; onFeuille: (quoi: FeuillePonctuelle) => void }) {
  const a = t.actions
  const secondaires = [
    a.includes('echeance') && a.includes('fait') ? (
      <button key="fait" type="button" onClick={() => onFeuille('fait')} className={boutonSecondaire}>
        <Check className="h-5 w-5" />
        Fait
      </button>
    ) : null,
    a.includes('reporter') ? (
      <button key="reporter" type="button" onClick={() => onFeuille('echeance')} className={boutonSecondaire}>
        <CalendarClock className="h-5 w-5" />
        Repousser
      </button>
    ) : null,
    a.includes('abandonner') ? (
      <button
        key="abandonner"
        type="button"
        onClick={() => onFeuille('abandon')}
        className={cn(boutonSecondaire, 'text-destructive')}
      >
        <XCircle className="h-5 w-5" />
        Abandonner
      </button>
    ) : null,
  ].filter(Boolean)
  return (
    <div className="space-y-2">
      {a.includes('echeance') ? (
        <button
          type="button"
          onClick={() => onFeuille('echeance')}
          className="w-full h-14 rounded-xl bg-gold text-gold-foreground text-lg font-semibold flex items-center justify-center gap-2 active:opacity-90"
        >
          <CalendarClock className="h-5 w-5" />
          Fixer l’échéance
        </button>
      ) : a.includes('fait') ? (
        <BoutonFait onClick={() => onFeuille('fait')} />
      ) : null}
      {secondaires.length > 0 && <div className="flex gap-2">{secondaires}</div>}
    </div>
  )
}

/** A bonnetier following his own request to the régleurs: once sent, he
 *  only sees when he sent it, to whom, and the current date the régleurs
 *  chose — a plain card, not a tap target: no sheet, no history, no action
 *  (Vincent 2026-11-10; the server gives him no `actions` either). */
function suiviSeul(t: Tache, regleur: boolean): boolean {
  return t.categorie === 'ponctuelle' && !regleur && t.groupe === 'regleurs'
}

/** « mar. 10/11 à 15:55 » */
function quand(ms: number): string {
  const le = new Date(ms)
  return `${le.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'numeric' })} à ${le.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
}

/** Who asked, and when — « (face) Créée par Olivier le lun. 07/11 à 15:55 ».
 *  The group is not repeated: on « Ponctuelles » (and in the red-task gate)
 *  it is always the viewer's own (Vincent 2026-11-10). */
export function LigneDemande({ t }: { t: Tache }) {
  return (
    <span className="mt-1.5 flex items-center gap-2 text-sm text-muted-foreground">
      {t.cree_par && <BonnetierPhoto id={t.cree_par.id} nom={t.cree_par.prenom} size={28} />}
      <span className="min-w-0">
        Créée par {t.cree_par?.prenom || '—'} le {quand(t.cree_le_ms)}
        {t.nb_reports > 0 && ` · repoussée ${t.nb_reports} fois`}
      </span>
    </span>
  )
}

/** On « Mes demandes », only its author sees the card: no face, no name,
 *  and the group is the section heading — « Envoyée le mar. 10/11 à 15:55 ». */
function LigneEnvoi({ t }: { t: Tache }) {
  return <span className="mt-1 block text-sm text-muted-foreground">Envoyée le {quand(t.cree_le_ms)}</span>
}

/** A closed ponctuelle's tag. */
function TagCloture({ t }: { t: Tache }) {
  return t.cloture === 'faite' ? (
    <Pastille teinte="vert" className="h-7 px-2.5 text-sm font-semibold">
      Faite
    </Pastille>
  ) : (
    <Pastille className="h-7 px-2.5 text-sm font-semibold">Abandonnée</Pastille>
  )
}

/** The whole card is the tap target: it opens the task's sheet. Red frame
 *  when the task is red for the viewer. A bonnetier's request to the
 *  régleurs (`suiviSeul`) is a plain card instead: nothing to open. */
function TacheCarte({
  t,
  envoi,
  regleur,
  onOpen,
}: {
  t: Tache
  /** A card of « Mes demandes ». */
  envoi: boolean
  regleur: boolean
  onOpen: () => void
}) {
  const d = t.derniere
  const ponctuelle = t.categorie === 'ponctuelle'
  // A bonnetier's « Mes demandes » is a follow-up only (Vincent
  // 2026-11-10): no card there is a tap target — he acts from Ponctuelles.
  // A régleur keeps his hand on what he sent the bonnetiers.
  const passive = suiviSeul(t, regleur) || (envoi && !regleur)
  const tag = ponctuelle ? t.cloture ? <TagCloture t={t} /> : <TagEcheance t={t} /> : <TagAge t={t} />
  if (envoi) {
    // Follow-up card: title and its state on one line, the date it was sent
    // under it.
    const corps = (
      <span className="min-w-0 flex-1 block">
        <span className="flex items-start gap-2">
          <span className="min-w-0 flex-1 text-lg font-semibold leading-snug">{t.libelle}</span>
          <span className="flex-shrink-0">{tag}</span>
        </span>
        {t.description && (
          <span className="block text-sm text-muted-foreground mt-0.5 line-clamp-2 whitespace-pre-wrap">
            {t.description}
          </span>
        )}
        <LigneEnvoi t={t} />
      </span>
    )
    const cadreEnvoi = cn(
      'w-full text-left rounded-xl border border-border bg-card shadow-sm p-3.5 flex items-start gap-2',
      t.cloture && 'opacity-80',
    )
    if (passive) return <div className={cadreEnvoi}>{corps}</div>
    return (
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          cadreEnvoi,
          'active:bg-muted transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        {corps}
        <ChevronRight className="h-6 w-6 flex-shrink-0 mt-0.5 text-muted-foreground" />
      </button>
    )
  }
  const contenu = (
    <span className="min-w-0 flex-1 block">
      <span className="block text-lg font-semibold leading-snug">{t.libelle}</span>
      {t.description && (
        <span className="block text-sm text-muted-foreground mt-0.5 line-clamp-2 whitespace-pre-wrap">
          {t.description}
        </span>
      )}
      {ponctuelle && <LigneDemande t={t} />}
      {!ponctuelle && !!t.frequence_jours && (
        <span className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
          <Repeat className="h-3 w-3 flex-shrink-0" />
          Tous les {t.frequence_jours} jour{t.frequence_jours > 1 ? 's' : ''}
        </span>
      )}
      <span className="mt-2.5 flex items-center gap-2.5">
        {/* Who did it last, as faces only — the workshop knows each other
            by face (Vincent, 2026-11-05); the names are in the sheet. */}
        {ponctuelle ? (
          <span className="flex-1" />
        ) : d ? (
          <span
            className="min-w-0 flex-1 flex items-center -space-x-2.5"
            title={nomsEquipe(d.equipe)}
            aria-label={`Faite par ${nomsEquipe(d.equipe)}`}
          >
            {d.equipe.slice(0, 5).map((m) => (
              <BonnetierPhoto key={m.id} id={m.id} nom={m.prenom} size={40} className="ring-2 ring-card" />
            ))}
            {d.equipe.length > 5 && (
              <span className="h-10 w-10 rounded-full ring-2 ring-card bg-secondary text-sm font-semibold text-muted-foreground flex items-center justify-center">
                +{d.equipe.length - 5}
              </span>
            )}
          </span>
        ) : (
          <span className="min-w-0 flex-1 text-sm text-muted-foreground italic">Personne encore</span>
        )}
        {tag}
      </span>
    </span>
  )
  const cadre = cn(
    'w-full text-left rounded-xl border bg-card shadow-sm p-3.5 flex items-start gap-2',
    t.niveau === 'rouge' ? 'border-destructive/50' : 'border-border',
    t.cloture && 'opacity-80',
  )
  if (passive) return <div className={cadre}>{contenu}</div>
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        cadre,
        'active:bg-muted transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      {contenu}
      <ChevronRight className="h-6 w-6 flex-shrink-0 mt-0.5 text-muted-foreground" />
    </button>
  )
}

/** The task's sheet: what it is and what the viewer may do. A récurrente
 *  also shows its history (who did it, when); a ponctuelle shows only its
 *  date (Vincent 2026-11-10: no « Pour les … », no history — the date and the
 *  buttons are what matter at the machine). */
function DetailSheet({
  t,
  moi,
  regleur,
  erreur,
  onClose,
  onFeuille,
  onModifier,
}: {
  t: Tache
  moi: number
  regleur: boolean
  erreur: string | null
  onClose: () => void
  onFeuille: (quoi: FeuillePonctuelle) => void
  onModifier: () => void
}) {
  const ponctuelle = t.categorie === 'ponctuelle'
  const realisations = useQuery({
    queryKey: [...TACHES_QUERY_KEY, t.id, 'realisations'],
    queryFn: () => fetchRealisationsTache(t.id),
    enabled: !ponctuelle,
  })

  const peutModifier = ponctuelle ? t.actions.includes('modifier') : regleur

  return (
    <Sheet titre={t.libelle} detail={t.description || undefined} onClose={onClose}>
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-transparent px-5 pb-2 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {ponctuelle ? (
            t.cloture ? (
              <TagCloture t={t} />
            ) : (
              <TagEcheance t={t} />
            )
          ) : (
            <>
              <TagAge t={t} />
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Repeat className="h-3.5 w-3.5 flex-shrink-0" />
                {t.frequence_jours ? `Tous les ${t.frequence_jours} jours` : 'Sans fréquence'}
              </span>
            </>
          )}
        </div>

        {!ponctuelle && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Historique</p>
            {realisations.isLoading && (
              <div className="flex justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-accent" />
              </div>
            )}
            {realisations.isError && (
              <p className="py-2 text-sm text-destructive">Impossible de charger l'historique.</p>
            )}
            {realisations.data && realisations.data.length === 0 && (
              <p className="py-2 text-sm text-muted-foreground italic">Jamais faite.</p>
            )}
            {realisations.data?.map((r: RealisationTache) => (
              <div key={r.id} className="flex items-center gap-3 rounded-xl border border-border p-2.5">
                <div className="flex -space-x-2 flex-shrink-0">
                  {r.equipe.slice(0, 3).map((m) => (
                    <BonnetierPhoto key={m.id} id={m.id} nom={m.prenom} size={36} className="ring-2 ring-card" />
                  ))}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Faite par {nomsEquipe(r.equipe)}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">{heure.format(new Date(r.fait_le_ms))}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex-shrink-0 p-5 pt-3 space-y-2 border-t border-border">
        <ErreurLigne erreur={erreur} />
        {ponctuelle ? (
          t.cloture === null && <ActionsPonctuelle t={t} onFeuille={onFeuille} />
        ) : (
          <BoutonFait onClick={() => onFeuille('fait')} />
        )}
        {peutModifier && (
          <button type="button" onClick={onModifier} className={cn(boutonSecondaire, 'w-full flex-none')}>
            <Pencil className="h-5 w-5" />
            Modifier
          </button>
        )}
        <div style={{ height: 'env(safe-area-inset-bottom)' }} />
      </div>
    </Sheet>
  )
}

/** First amber day, mirror of the API's `seuilAmbre` (frequency − 10 %, at
 *  least one day before it) — for the explanations only; the colour itself
 *  comes from the server. */
function seuilAmbre(f: number): number {
  return f - Math.max(1, Math.ceil(f * 0.1))
}

/** « Il y a 12 j » — coloured only when the task has a frequency. */
function TagAge({ t }: { t: Tache }) {
  const texte = t.age_jours === null ? 'Jamais faite' : t.age_jours === 0 ? 'Aujourd’hui' : `Il y a ${t.age_jours} j`
  const titre = t.frequence_jours
    ? `Tous les ${t.frequence_jours} j : orange dès ${seuilAmbre(t.frequence_jours)} j, rouge dès ${t.frequence_jours} j`
    : t.derniere
      ? `Faite le ${heure.format(new Date(t.derniere.fait_le_ms))}`
      : undefined
  return (
    <Pastille teinte={t.niveau ?? undefined} title={titre} className="h-7 px-2.5 text-sm font-semibold">
      {texte}
    </Pastille>
  )
}

/** The régleur's choices of frequency, in days. */
const FREQUENCES = [7, 15, 30, 60, 90]

function Etiquette({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </label>
  )
}

/** Create or edit a task. Anyone creates a ponctuelle; only a régleur creates
 *  (and edits, removes) a récurrente. A ponctuelle's creator edits its wording
 *  only — its date moves with « Repousser », with a motif. */
function EditionSheet({
  tache,
  moi,
  regleur,
  categorieInitiale,
  groupeInitial,
  onClose,
  onDone,
}: {
  tache: Tache | null
  moi: number
  regleur: boolean
  /** A new task starts in the category of the tab it was created from. */
  categorieInitiale: 'ponctuelle' | 'recurrente'
  groupeInitial: GroupeTache
  onClose: () => void
  onDone: () => void
}) {
  const [categorie, setCategorie] = useState<'ponctuelle' | 'recurrente'>(tache?.categorie ?? categorieInitiale)
  const ponctuelle = categorie === 'ponctuelle'
  const [libelle, setLibelle] = useState(tache?.libelle ?? '')
  const [description, setDescription] = useState(tache?.description ?? '')
  // Ponctuelle: for whom, and by when. A bonnetier's request to the régleurs
  // carries no date (the régleurs set it).
  const [groupe, setGroupe] = useState<GroupeTache>(groupeInitial)
  const [echeance, setEcheance] = useState<string | null>(null)
  const sansDate = !regleur && groupe === 'regleurs'
  // Récurrente: a preset, « Aucune » (null) or « Autre », which opens a number
  // field under the chips (Vincent 2026-11-05). A stored value outside the
  // presets opens on « Autre » with it in the field, so the sheet never loses it.
  const stockee = tache?.frequence_jours ?? null
  const [preset, setPreset] = useState<number | null>(stockee !== null && FREQUENCES.includes(stockee) ? stockee : null)
  const [autre, setAutre] = useState(stockee !== null && !FREQUENCES.includes(stockee))
  const [saisie, setSaisie] = useState(autre ? String(stockee) : '')
  // Focus the field only on a tap on « Autre » — opening a task already on
  // « Autre » must not raise the keyboard.
  const [focusAutre, setFocusAutre] = useState(false)
  const frequenceJours = ponctuelle ? null : autre ? (saisie === '' ? null : Number(saisie)) : preset
  const frequenceInvalide =
    !ponctuelle && autre && (frequenceJours === null || frequenceJours < 1 || frequenceJours > 365)
  const [erreur, setErreur] = useState<string | null>(null)
  const [confirmSuppr, setConfirmSuppr] = useState(false)

  const enregistrer = useMutation({
    mutationFn: async (): Promise<void> => {
      const base = {
        IDbonnetier: moi,
        libelle: libelle.trim(),
        description: description.trim(),
      }
      if (tache) {
        await modifierTache(tache.id, {
          ...base,
          frequence_jours: frequenceJours,
        })
      } else if (ponctuelle) {
        await creerTache({
          ...base,
          frequence_jours: null,
          categorie: 'ponctuelle',
          groupe,
          echeance: sansDate ? null : echeance,
        })
      } else {
        await creerTache({ ...base, frequence_jours: frequenceJours })
      }
    },
    onSuccess: onDone,
    onError: (e) => setErreur(erreurTache(e)),
  })
  const supprimer = useMutation({
    mutationFn: () => supprimerTache(tache!.id, moi),
    onSuccess: onDone,
    onError: (e) => setErreur(erreurTache(e)),
  })

  const vide = libelle.trim().length === 0
  const modifie =
    !tache ||
    libelle.trim() !== tache.libelle ||
    description.trim() !== tache.description ||
    (!ponctuelle && frequenceJours !== tache.frequence_jours)
  const empeche = vide
    ? 'Donnez un nom à la tâche.'
    : frequenceInvalide
      ? 'Indiquez une fréquence de 1 à 365 jours.'
      : !tache && ponctuelle && !sansDate && !echeance
        ? 'Choisissez une échéance.'
        : !modifie
          ? 'Rien à enregistrer.'
          : null

  return (
    <Sheet titre={tache ? 'Modifier la tâche' : 'Nouvelle tâche'} onClose={onClose}>
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-transparent px-5 space-y-3">
        {/* Only a régleur chooses: a bonnetier creates ponctuelles. */}
        {!tache && regleur && (
          <div className="flex gap-1.5">
            <Puce actif={ponctuelle} onClick={() => setCategorie('ponctuelle')}>
              Ponctuelle
            </Puce>
            <Puce actif={!ponctuelle} onClick={() => setCategorie('recurrente')}>
              Récurrente
            </Puce>
          </div>
        )}
        <div className="space-y-1">
          <Etiquette htmlFor="tache-libelle">Tâche</Etiquette>
          <input
            id="tache-libelle"
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
            maxLength={120}
            placeholder={ponctuelle ? 'Ex. : Régler la tension du 3G' : "Ex. : Toiles d'araignées dans le stock"}
            className="w-full h-12 rounded-xl border border-border bg-background px-3 text-base focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="space-y-1">
          <Etiquette htmlFor="tache-description">Précisions (facultatif)</Etiquette>
          <textarea
            id="tache-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Où, avec quoi…"
            className="w-full rounded-xl border border-border bg-background p-3 text-base leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {ponctuelle && !tache && (
          <>
            <div className="space-y-1.5">
              <Etiquette>Pour</Etiquette>
              <div className="flex gap-1.5">
                <Puce actif={groupe === 'bonnetiers'} onClick={() => setGroupe('bonnetiers')}>
                  Les bonnetiers
                </Puce>
                <Puce actif={groupe === 'regleurs'} onClick={() => setGroupe('regleurs')}>
                  Les régleurs
                </Puce>
              </div>
            </div>
            {sansDate ? (
              <p className="pb-1 text-sm text-muted-foreground">Les régleurs fixeront l’échéance.</p>
            ) : (
              <div className="space-y-1.5 pb-1">
                <Etiquette>À faire au plus tard</Etiquette>
                <ChoixEcheance valeur={echeance} onChange={setEcheance} />
              </div>
            )}
          </>
        )}

        {!ponctuelle && (
          <div className="space-y-1.5 pb-1">
            <Etiquette>À faire tous les… (facultatif)</Etiquette>
            <div className="flex flex-wrap gap-1.5">
              {FREQUENCES.map((n) => (
                <Puce
                  key={n}
                  actif={!autre && preset === n}
                  onClick={() => {
                    setAutre(false)
                    setPreset(n)
                  }}
                >
                  {n} j
                </Puce>
              ))}
              <Puce
                actif={autre}
                onClick={() => {
                  setAutre(true)
                  setFocusAutre(true)
                  // Start from the preset that was on, so « Autre » adjusts it.
                  if (saisie === '' && preset !== null) setSaisie(String(preset))
                }}
              >
                Autre
              </Puce>
              <Puce
                actif={!autre && preset === null}
                onClick={() => {
                  setAutre(false)
                  setPreset(null)
                }}
              >
                Aucune
              </Puce>
            </div>
            {autre && (
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus={focusAutre}
                  aria-label="Fréquence en jours"
                  value={saisie}
                  onChange={(e) => setSaisie(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
                  placeholder="—"
                  className={cn(
                    'w-24 h-12 rounded-xl border bg-background px-3 text-base text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-ring',
                    frequenceInvalide && saisie !== '' ? 'border-destructive' : 'border-border',
                  )}
                />
                <span className="text-base">jours</span>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {frequenceInvalide
                ? 'Entre 1 et 365 jours.'
                : frequenceJours
                  ? `Rouge à ${frequenceJours} j sans être faite, orange dès ${seuilAmbre(frequenceJours)} j, vert avant.`
                  : 'Sans fréquence, la tâche reste grise.'}
            </p>
          </div>
        )}
      </div>
      <div className="flex-shrink-0 p-5 pt-3 space-y-2">
        <ErreurLigne erreur={erreur} />
        <button
          type="button"
          onClick={() => enregistrer.mutate()}
          disabled={!!empeche || enregistrer.isPending}
          title={empeche ?? 'Enregistrer la tâche'}
          className="w-full h-16 rounded-xl bg-gold text-gold-foreground text-lg font-semibold flex items-center justify-center gap-2 active:opacity-90 disabled:opacity-40"
        >
          {enregistrer.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
          Enregistrer
        </button>
        {/* A ponctuelle is never deleted: it is abandoned, with a motif. */}
        {tache && !ponctuelle && (
          <button
            type="button"
            onClick={() => setConfirmSuppr(true)}
            disabled={supprimer.isPending}
            className="w-full h-14 rounded-xl border border-destructive/40 bg-background text-destructive text-base font-semibold flex items-center justify-center gap-2 active:bg-destructive/10 disabled:opacity-40"
          >
            {supprimer.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}
            Supprimer la tâche
          </button>
        )}
        <div style={{ height: 'env(safe-area-inset-bottom)' }} />
      </div>
      {confirmSuppr && tache && (
        <ConfirmSheet
          titre="Supprimer cette tâche ?"
          detail={`${tache.libelle} — elle disparaît de la liste, l'historique est gardé.`}
          oui="Oui, supprimer"
          icone={<Trash2 className="h-5 w-5" />}
          variante="destructive"
          onCancel={() => setConfirmSuppr(false)}
          onConfirm={() => {
            setConfirmSuppr(false)
            supprimer.mutate()
          }}
        />
      )}
    </Sheet>
  )
}
