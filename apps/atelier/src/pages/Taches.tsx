// Tâches d'atelier — the general jobs of the factory (cobwebs in the stock,
// the workshop floors…) the bonnetiers do when few métiers run. Decision
// Vincent 2026-11-05; rules on the API in lib/taches-atelier.ts.
//
// - A task STAYS on the list: « Fait » adds a dated réalisation with its team.
//   The list is sorted by the server: red, amber, then never-done and
//   oldest-done first, so the neglected job rises by itself.
// - The card shows who did it last (faces) and an « il y a N j » tag. With a
//   frequency (set by the régleur) the tag is red from F days (to do now),
//   amber from F − 10 % (can be done now, ahead), green below — Vincent
//   2026-11-05, rule `niveauTache` on the API. Without one it stays grey.
// - « Fait » = pick your coéquipiers (faces, none is fine), then confirm. The
//   hour is the server's. The declarer may cancel within 10 min (wrong tap).
// - A régleur (fixed-identity phone) also adds, edits and removes tasks;
//   removing archives it on the server, the history stays.
//
// Reached from the « Tâches » button under the métier list (ChoixMetier).
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, CheckCircle2, Loader2, Pencil, Plus, Repeat, Save, Trash2, Undo2, X } from 'lucide-react'
import { PosteHeader } from '@/components/layout/PosteHeader'
import { Card } from '@/components/ui/card'
import { BonnetierPhoto } from '@/components/atelier/BonnetierPhoto'
import { ConfirmSheet } from '@/components/atelier/ConfirmSheet'
import { Pastille } from '@/components/atelier/Pastille'
import { useIdentite } from '@/contexts/BonnetierContext'
import {
  annulerRealisation,
  creerTache,
  declarerTacheFaite,
  fetchEquipeTaches,
  fetchRealisationsTache,
  fetchTaches,
  modifierTache,
  supprimerTache,
  type MembreEquipe,
  type RealisationTache,
  type Tache,
} from '@/lib/atelier-api'
import type { ApiError } from '@/lib/api'
import { messagePourErreur } from '@/lib/erreurs'
import { vibrer } from '@/lib/vibration'
import { cn } from '@/lib/utils'

export const TACHES_QUERY_KEY = ['atelier', 'taches'] as const

/** The server's own sentence when it sent one (task refusals carry a precise
 *  French message), else the app-wide mapper. */
function erreurTache(e: unknown): string {
  const err = e as ApiError
  if (err.detail && err.code && err.code !== 'appareil_non_enrole') return err.detail
  return messagePourErreur(err)
}

const heure = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' })

function nomsEquipe(equipe: MembreEquipe[]): string {
  return equipe.map((m) => m.prenom || '—').join(' + ')
}

export function Taches() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { identite } = useIdentite()
  const regleur = identite?.regleur ?? false

  const [aFaire, setAFaire] = useState<Tache | null>(null)
  const [historique, setHistorique] = useState<Tache | null>(null)
  // null = closed; 'nouvelle' = creation; a task = edition.
  const [edition, setEdition] = useState<Tache | 'nouvelle' | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  const { data: taches, isLoading, isError } = useQuery({ queryKey: TACHES_QUERY_KEY, queryFn: fetchTaches })

  const rafraichir = () => queryClient.invalidateQueries({ queryKey: TACHES_QUERY_KEY })

  const annuler = useMutation({
    mutationFn: (t: Tache) => annulerRealisation(t.id, t.derniere!.id, identite!.id),
    onSuccess: () => {
      setErreur(null)
      rafraichir()
    },
    onError: (e) => setErreur(erreurTache(e)),
  })

  return (
    <div className="h-full flex flex-col bg-background">
      <PosteHeader titre="Tâches" onBack={() => navigate('/')} />

      <main className="flex-1 min-h-0 overflow-y-auto scrollbar-transparent p-3 space-y-2.5">
        {erreur && (
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
        {taches && taches.length === 0 && (
          <p className="pt-10 text-center text-sm text-muted-foreground italic">
            {regleur ? 'Aucune tâche. Ajoutez la première ci-dessous.' : 'Aucune tâche pour le moment.'}
          </p>
        )}
        {taches?.map((t) => (
          <TacheCarte
            key={t.id}
            t={t}
            moi={identite?.id ?? 0}
            regleur={regleur}
            annulationEnCours={annuler.isPending && annuler.variables?.id === t.id}
            onFait={() => setAFaire(t)}
            onHistorique={() => setHistorique(t)}
            onModifier={() => setEdition(t)}
            onAnnuler={() => annuler.mutate(t)}
          />
        ))}
      </main>

      {regleur && (
        <div className="flex-shrink-0 border-t border-border bg-zinc-200/50 p-3">
          <button
            type="button"
            onClick={() => setEdition('nouvelle')}
            className="w-full h-14 rounded-xl bg-primary text-primary-foreground text-lg font-semibold flex items-center justify-center gap-2 active:opacity-90"
          >
            <Plus className="h-5 w-5" />
            Nouvelle tâche
          </button>
          <div style={{ height: 'env(safe-area-inset-bottom)' }} />
        </div>
      )}

      {aFaire && identite && (
        <FaitSheet
          tache={aFaire}
          moi={identite.id}
          onClose={() => setAFaire(null)}
          onFait={() => {
            setAFaire(null)
            setErreur(null)
            vibrer('confirme')
            rafraichir()
          }}
        />
      )}
      {historique && <HistoriqueSheet tache={historique} onClose={() => setHistorique(null)} />}
      {edition && identite && regleur && (
        <EditionSheet
          tache={edition === 'nouvelle' ? null : edition}
          moi={identite.id}
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

function TacheCarte({
  t,
  moi,
  regleur,
  annulationEnCours,
  onFait,
  onHistorique,
  onModifier,
  onAnnuler,
}: {
  t: Tache
  moi: number
  regleur: boolean
  annulationEnCours: boolean
  onFait: () => void
  onHistorique: () => void
  onModifier: () => void
  onAnnuler: () => void
}) {
  const d = t.derniere
  // Re-evaluated on every poll / render; the server is the real judge.
  const annulable = !!d && d.declare_par === moi && Date.now() < d.annulable_jusqua_ms
  return (
    <Card className="p-3.5 space-y-2.5">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={onHistorique}
          className="min-w-0 flex-1 text-left rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title="Voir l'historique"
        >
          <p className="text-lg font-semibold leading-snug">{t.libelle}</p>
          {t.description && (
            <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap">{t.description}</p>
          )}
          {!!t.frequence_jours && (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Repeat className="h-3 w-3 flex-shrink-0" />
              Tous les {t.frequence_jours} jour{t.frequence_jours > 1 ? 's' : ''}
            </p>
          )}
          {/* Who did it last, as faces only — the workshop knows each other by
              face (the header shows the face alone too), and the names are one
              tap away in the history (Vincent, 2026-11-05). The names stay in
              the label for the tooltip and screen readers. */}
          <span className="mt-2.5 flex items-center gap-2.5">
            {d ? (
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
            <TagAge t={t} />
          </span>
        </button>
        {regleur && (
          <button
            type="button"
            onClick={onModifier}
            title="Modifier la tâche"
            className="flex-shrink-0 h-10 w-10 -mr-1 -mt-1 rounded-full flex items-center justify-center text-muted-foreground active:bg-muted"
          >
            <Pencil className="h-5 w-5" />
          </button>
        )}
      </div>

      {annulable ? (
        <div className="flex gap-2">
          <div className="flex-1 h-14 rounded-xl bg-success/10 text-success text-base font-semibold flex items-center justify-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            Faite
          </div>
          <button
            type="button"
            onClick={onAnnuler}
            disabled={annulationEnCours}
            title="Annuler (erreur de saisie) — possible 10 minutes"
            className="h-14 px-4 rounded-xl border border-border bg-background text-base font-semibold flex items-center justify-center gap-2 active:bg-muted disabled:opacity-40"
          >
            {annulationEnCours ? <Loader2 className="h-5 w-5 animate-spin" /> : <Undo2 className="h-5 w-5" />}
            Annuler
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onFait}
          className="w-full h-14 rounded-xl bg-gold text-gold-foreground text-lg font-semibold flex items-center justify-center gap-2 active:opacity-90"
        >
          <Check className="h-5 w-5" />
          Fait
        </button>
      )}
    </Card>
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

/** Bottom-sheet shell shared by the three sheets of this screen — the same
 *  frame as ConfirmSheet, with a scrolling body. */
function Sheet({ titre, detail, onClose, children }: { titre: string; detail?: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end" onClick={onClose} role="presentation">
      <div
        className="w-full max-h-[90dvh] flex flex-col bg-card text-foreground rounded-t-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 flex items-start gap-2 p-5 pb-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-heading font-bold tracking-tight">{titre}</h2>
            {detail && <p className="text-base text-muted-foreground mt-0.5">{detail}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Fermer"
            className="flex-shrink-0 h-10 w-10 -mr-2 -mt-1 rounded-full flex items-center justify-center text-muted-foreground active:bg-muted"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** « Fait » — who did it with you. Every live bonnetier is offered, régleurs
 *  included; none is fine (you did it alone). */
function FaitSheet({ tache, moi, onClose, onFait }: { tache: Tache; moi: number; onClose: () => void; onFait: () => void }) {
  const [choisis, setChoisis] = useState<Set<number>>(new Set())
  const [erreur, setErreur] = useState<string | null>(null)
  const { data: equipe, isLoading } = useQuery({
    queryKey: ['atelier', 'taches', 'equipe'],
    queryFn: fetchEquipeTaches,
    staleTime: 5 * 60_000,
  })
  const autres = useMemo(() => (equipe ?? []).filter((b) => b.IDbonnetier !== moi), [equipe, moi])

  const declarer = useMutation({
    mutationFn: () => declarerTacheFaite(tache.id, { IDbonnetier: moi, coequipiers: [...choisis] }),
    onSuccess: onFait,
    onError: (e) => {
      vibrer('refuse')
      setErreur(erreurTache(e))
    },
  })

  const basculer = (id: number) => {
    vibrer('tick')
    setChoisis((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const n = choisis.size
  return (
    <Sheet titre={tache.libelle} detail="Avec qui l'avez-vous faite ?" onClose={onClose}>
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-transparent px-5">
        {isLoading && (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
          </div>
        )}
        <div className="grid grid-cols-3 gap-2 pb-2">
          {autres.map((b) => {
            const on = choisis.has(b.IDbonnetier)
            return (
              <button
                key={b.IDbonnetier}
                type="button"
                onClick={() => basculer(b.IDbonnetier)}
                aria-pressed={on}
                className={cn(
                  'relative rounded-xl border-2 p-2 flex flex-col items-center gap-1.5 transition-colors',
                  on ? 'border-gold bg-gold/10' : 'border-border bg-background active:bg-muted',
                )}
              >
                <BonnetierPhoto id={b.IDbonnetier} nom={`${b.prenom} ${b.nom}`} size={64} />
                <span className="text-sm font-medium truncate max-w-full">{b.prenom}</span>
                {on && (
                  <span className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-gold text-gold-foreground flex items-center justify-center">
                    <Check className="h-4 w-4" />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
      <div className="flex-shrink-0 p-5 pt-3 space-y-2 border-t border-border">
        {erreur && (
          <p className="flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>{erreur}</span>
          </p>
        )}
        <button
          type="button"
          onClick={() => declarer.mutate()}
          disabled={declarer.isPending}
          className="w-full h-16 rounded-xl bg-gold text-gold-foreground text-lg font-semibold flex items-center justify-center gap-2 active:opacity-90 disabled:opacity-40"
        >
          {declarer.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
          {n === 0 ? 'Faite seul' : `Faite avec ${n} coéquipier${n > 1 ? 's' : ''}`}
        </button>
        <div style={{ height: 'env(safe-area-inset-bottom)' }} />
      </div>
    </Sheet>
  )
}

function HistoriqueSheet({ tache, onClose }: { tache: Tache; onClose: () => void }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['atelier', 'taches', tache.id, 'realisations'],
    queryFn: () => fetchRealisationsTache(tache.id),
  })
  return (
    <Sheet titre={tache.libelle} detail="Historique" onClose={onClose}>
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-transparent px-5 pb-6 space-y-2">
        {isLoading && (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
          </div>
        )}
        {isError && <p className="py-6 text-center text-sm text-destructive">Impossible de charger l'historique.</p>}
        {data && data.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground italic">Jamais faite.</p>
        )}
        {data?.map((r: RealisationTache) => (
          <div key={r.id} className="flex items-center gap-3 rounded-xl border border-border p-2.5">
            <div className="flex -space-x-2 flex-shrink-0">
              {r.equipe.slice(0, 3).map((m) => (
                <BonnetierPhoto key={m.id} id={m.id} nom={m.prenom} size={36} className="ring-2 ring-card" />
              ))}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{nomsEquipe(r.equipe)}</p>
              <p className="text-xs text-muted-foreground tabular-nums">{heure.format(new Date(r.fait_le_ms))}</p>
            </div>
          </div>
        ))}
        <div style={{ height: 'env(safe-area-inset-bottom)' }} />
      </div>
    </Sheet>
  )
}

/** The régleur's choices of frequency, in days. */
const FREQUENCES = [7, 15, 30, 60, 90]

function ChoixFrequence({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      className={cn(
        'h-10 px-3.5 rounded-full border text-sm font-medium tabular-nums',
        actif ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border active:bg-muted',
      )}
    >
      {children}
    </button>
  )
}

/** Régleur only: create or edit a task; « Supprimer » archives it. */
function EditionSheet({ tache, moi, onClose, onDone }: { tache: Tache | null; moi: number; onClose: () => void; onDone: () => void }) {
  const [libelle, setLibelle] = useState(tache?.libelle ?? '')
  const [description, setDescription] = useState(tache?.description ?? '')
  // A preset, « Aucune » (null) or « Autre », which opens a number field under
  // the chips (Vincent 2026-11-05). A stored value outside the presets opens
  // on « Autre » with it in the field, so the sheet never loses it.
  const stockee = tache?.frequence_jours ?? null
  const [preset, setPreset] = useState<number | null>(stockee !== null && FREQUENCES.includes(stockee) ? stockee : null)
  const [autre, setAutre] = useState(stockee !== null && !FREQUENCES.includes(stockee))
  const [saisie, setSaisie] = useState(autre ? String(stockee) : '')
  // Focus the field only on a tap on « Autre » — opening a task already on
  // « Autre » must not raise the keyboard.
  const [focusAutre, setFocusAutre] = useState(false)
  const frequenceJours = autre ? (saisie === '' ? null : Number(saisie)) : preset
  const frequenceInvalide = autre && (frequenceJours === null || frequenceJours < 1 || frequenceJours > 365)
  const [erreur, setErreur] = useState<string | null>(null)
  const [confirmSuppr, setConfirmSuppr] = useState(false)

  const enregistrer = useMutation({
    mutationFn: async (): Promise<void> => {
      const body = {
        IDbonnetier: moi,
        libelle: libelle.trim(),
        description: description.trim(),
        frequence_jours: frequenceJours,
      }
      if (tache) await modifierTache(tache.id, body)
      else await creerTache(body)
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
    frequenceJours !== tache.frequence_jours
  const empeche = vide
    ? 'Donnez un nom à la tâche.'
    : frequenceInvalide
      ? 'Indiquez une fréquence de 1 à 365 jours.'
      : !modifie
        ? 'Rien à enregistrer.'
        : null

  return (
    <Sheet titre={tache ? 'Modifier la tâche' : 'Nouvelle tâche'} onClose={onClose}>
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-transparent px-5 space-y-3">
        <div className="space-y-1">
          <label htmlFor="tache-libelle" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Tâche
          </label>
          <input
            id="tache-libelle"
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
            maxLength={120}
            placeholder="Ex. : Toiles d'araignées dans le stock"
            className="w-full h-12 rounded-xl border border-border bg-background px-3 text-base focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="tache-description" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Précisions (facultatif)
          </label>
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
        <div className="space-y-1.5 pb-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            À faire tous les… (facultatif)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {FREQUENCES.map((n) => (
              <ChoixFrequence
                key={n}
                actif={!autre && preset === n}
                onClick={() => {
                  setAutre(false)
                  setPreset(n)
                }}
              >
                {n} j
              </ChoixFrequence>
            ))}
            <ChoixFrequence
              actif={autre}
              onClick={() => {
                setAutre(true)
                setFocusAutre(true)
                // Start from the preset that was on, so « Autre » adjusts it.
                if (saisie === '' && preset !== null) setSaisie(String(preset))
              }}
            >
              Autre
            </ChoixFrequence>
            <ChoixFrequence
              actif={!autre && preset === null}
              onClick={() => {
                setAutre(false)
                setPreset(null)
              }}
            >
              Aucune
            </ChoixFrequence>
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
      </div>
      <div className="flex-shrink-0 p-5 pt-3 space-y-2">
        {erreur && (
          <p className="flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>{erreur}</span>
          </p>
        )}
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
        {tache && (
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
