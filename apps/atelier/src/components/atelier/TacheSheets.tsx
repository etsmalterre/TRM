// The bottom sheets of the Tâches screen, shared with the red-task gate of the
// métier list (TachesRougesGate): « Fait » (who did it with you), the due date
// of a ponctuelle (first date, or a postponement with its motif) and
// « Abandonner » (with its motif). Rules on the API, lib/taches-atelier.ts.
import { useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertTriangle, CalendarClock, Check, Loader2, XCircle, X } from 'lucide-react'
import { BonnetierPhoto } from '@/components/atelier/BonnetierPhoto'
import { publierFait } from '@/components/atelier/BandeauFait'
import {
  abandonnerTache,
  declarerTacheFaite,
  echeanceTache,
  fetchEquipeTaches,
  MOTIFS_ABANDON,
  MOTIFS_REPORT,
  type MembreEquipe,
  type Tache,
} from '@/lib/atelier-api'
import type { ApiError } from '@/lib/api'
import { messagePourErreur } from '@/lib/erreurs'
import { vibrer } from '@/lib/vibration'
import { cn } from '@/lib/utils'

/** The server's own sentence when it sent one (task refusals carry a precise
 *  French message), else the app-wide mapper. */
export function erreurTache(e: unknown): string {
  const err = e as ApiError
  if (err.detail && err.code && err.code !== 'appareil_non_enrole') return err.detail
  return messagePourErreur(err)
}

export const heure = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' })

export function nomsEquipe(equipe: MembreEquipe[]): string {
  return equipe.map((m) => m.prenom || '—').join(' + ')
}

// ── Dates of a ponctuelle (ISO days, the phone's local calendar) ──

export function aujourdhuiIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function plusJoursIso(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const jourCourt = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  day: 'numeric',
  month: 'numeric',
  timeZone: 'UTC',
})

/** « mar. 12/11 » */
export function formatJour(iso: string): string {
  return jourCourt.format(new Date(`${iso}T12:00:00Z`))
}

/** The due-date choices, in days from today (API max 30). */
const CHOIX_ECHEANCE: { jours: number; label: string }[] = [
  { jours: 0, label: 'Aujourd’hui' },
  { jours: 1, label: 'Demain' },
  { jours: 3, label: '3 jours' },
  { jours: 7, label: '1 semaine' },
  { jours: 14, label: '2 semaines' },
  { jours: 30, label: '1 mois' },
]

export function Puce({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: ReactNode }) {
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

/** The due-date chips; `exclure` = the current date (a postponement must move it). */
export function ChoixEcheance({
  valeur,
  onChange,
  exclure,
}: {
  valeur: string | null
  onChange: (iso: string) => void
  exclure?: string | null
}) {
  const today = aujourdhuiIso()
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {CHOIX_ECHEANCE.map((c) => {
          const iso = plusJoursIso(today, c.jours)
          if (iso === exclure) return null
          return (
            <Puce key={c.jours} actif={valeur === iso} onClick={() => onChange(iso)}>
              {c.label}
            </Puce>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {valeur ? `À faire au plus tard le ${formatJour(valeur)} — rouge le lendemain.` : 'Choisissez une échéance.'}
      </p>
    </div>
  )
}

/** Bottom-sheet shell — the same frame as ConfirmSheet, with a scrolling body.
 *  Without `onClose` it cannot be dismissed (the red-task gate). */
export function Sheet({
  titre,
  detail,
  onClose,
  children,
}: {
  titre: string
  detail?: string
  onClose?: () => void
  children: ReactNode
}) {
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
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Fermer"
              className="flex-shrink-0 h-10 w-10 -mr-2 -mt-1 rounded-full flex items-center justify-center text-muted-foreground active:bg-muted"
            >
              <X className="h-6 w-6" />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}

export function ErreurLigne({ erreur }: { erreur: string | null }) {
  if (!erreur) return null
  return (
    <p className="flex items-start gap-2 text-sm text-destructive">
      <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
      <span>{erreur}</span>
    </p>
  )
}

const champ =
  'w-full rounded-xl border border-border bg-background p-3 text-base leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-ring'
const bouton =
  'w-full h-16 rounded-xl text-lg font-semibold flex items-center justify-center gap-2 active:opacity-90 disabled:opacity-40'

/** « Fait » — who did it with you. Every live bonnetier is offered, régleurs
 *  included; none is fine (you did it alone). On a ponctuelle it closes it. */
export function FaitSheet({
  tache,
  moi,
  onClose,
  onFait,
}: {
  tache: Tache
  moi: number
  onClose: () => void
  onFait: () => void
}) {
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
    onSuccess: (r) => {
      // The « Bravo » strip carries the undo (BandeauFait).
      publierFait({ tacheId: tache.id, realisationId: r.id, libelle: tache.libelle, moi })
      onFait()
    },
    onError: (e) => setErreur(erreurTache(e)),
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
        <ErreurLigne erreur={erreur} />
        <button
          type="button"
          onClick={() => declarer.mutate()}
          disabled={declarer.isPending}
          className={cn(bouton, 'bg-gold text-gold-foreground')}
        >
          {declarer.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
          {n === 0 ? 'Faite seul' : `Faite avec ${n} coéquipier${n > 1 ? 's' : ''}`}
        </button>
        <div style={{ height: 'env(safe-area-inset-bottom)' }} />
      </div>
    </Sheet>
  )
}

/** The motif chips + a text, required when « Autre ». */
function ChoixMotif({
  codes,
  code,
  texte,
  onCode,
  onTexte,
}: {
  codes: Record<string, string>
  code: string | null
  texte: string
  onCode: (c: string) => void
  onTexte: (t: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pourquoi ?</p>
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(codes).map(([c, label]) => (
          <Puce key={c} actif={code === c} onClick={() => onCode(c)}>
            {label}
          </Puce>
        ))}
      </div>
      <textarea
        value={texte}
        onChange={(e) => onTexte(e.target.value)}
        rows={2}
        maxLength={500}
        aria-label="Explication"
        placeholder={code === 'autre' ? 'Expliquez (obligatoire)' : 'Une précision ? (facultatif)'}
        className={champ}
      />
    </div>
  )
}

function motifIncomplet(code: string | null, texte: string): string | null {
  if (!code) return 'Choisissez une raison.'
  if (code === 'autre' && !texte.trim()) return 'Expliquez la raison.'
  return null
}

/** First date of an undated request (régleur, no motif) or a postponement
 *  (new date + motif, kept on the server to improve the system). */
export function EcheanceSheet({
  tache,
  moi,
  onClose,
  onDone,
}: {
  tache: Tache
  moi: number
  onClose: () => void
  onDone: () => void
}) {
  const premiere = tache.echeance === null
  const [date, setDate] = useState<string | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [texte, setTexte] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const envoyer = useMutation({
    mutationFn: () =>
      echeanceTache(tache.id, {
        IDbonnetier: moi,
        echeance: date!,
        motif_code: premiere ? null : code,
        motif: premiere ? '' : texte.trim(),
      }),
    onSuccess: onDone,
    onError: (e) => setErreur(erreurTache(e)),
  })
  const empeche = !date ? 'Choisissez une date.' : premiere ? null : motifIncomplet(code, texte)
  return (
    <Sheet
      titre={premiere ? 'Fixer l’échéance' : 'Repousser'}
      detail={premiere ? tache.libelle : `${tache.libelle} — prévue le ${formatJour(tache.echeance!)}`}
      onClose={onClose}
    >
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-transparent px-5 space-y-4 pb-1">
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {premiere ? 'À faire au plus tard' : 'Nouvelle échéance'}
          </p>
          <ChoixEcheance valeur={date} onChange={setDate} exclure={tache.echeance} />
        </div>
        {!premiere && (
          <ChoixMotif codes={MOTIFS_REPORT} code={code} texte={texte} onCode={setCode} onTexte={setTexte} />
        )}
      </div>
      <div className="flex-shrink-0 p-5 pt-3 space-y-2">
        <ErreurLigne erreur={erreur} />
        <button
          type="button"
          onClick={() => envoyer.mutate()}
          disabled={!!empeche || envoyer.isPending}
          title={empeche ?? undefined}
          className={cn(bouton, 'bg-gold text-gold-foreground')}
        >
          {envoyer.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <CalendarClock className="h-5 w-5" />}
          {premiere ? 'Fixer l’échéance' : 'Repousser'}
        </button>
        <div style={{ height: 'env(safe-area-inset-bottom)' }} />
      </div>
    </Sheet>
  )
}

export function AbandonSheet({
  tache,
  moi,
  onClose,
  onDone,
}: {
  tache: Tache
  moi: number
  onClose: () => void
  onDone: () => void
}) {
  const [code, setCode] = useState<string | null>(null)
  const [texte, setTexte] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const envoyer = useMutation({
    mutationFn: () => abandonnerTache(tache.id, { IDbonnetier: moi, motif_code: code!, motif: texte.trim() }),
    onSuccess: onDone,
    onError: (e) => setErreur(erreurTache(e)),
  })
  const empeche = motifIncomplet(code, texte)
  return (
    <Sheet titre="Abandonner la tâche" detail={tache.libelle} onClose={onClose}>
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-transparent px-5 pb-1">
        <ChoixMotif codes={MOTIFS_ABANDON} code={code} texte={texte} onCode={setCode} onTexte={setTexte} />
      </div>
      <div className="flex-shrink-0 p-5 pt-3 space-y-2">
        <ErreurLigne erreur={erreur} />
        <button
          type="button"
          onClick={() => envoyer.mutate()}
          disabled={!!empeche || envoyer.isPending}
          title={empeche ?? undefined}
          className={cn(bouton, 'bg-destructive text-destructive-foreground')}
        >
          {envoyer.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <XCircle className="h-5 w-5" />}
          Abandonner
        </button>
        <div style={{ height: 'env(safe-area-inset-bottom)' }} />
      </div>
    </Sheet>
  )
}

/** One open ponctuelle's actions, as the sheets they open. Used by the card
 *  (Taches) and the red-task gate (ChoixMetier). */
export type FeuillePonctuelle = 'fait' | 'echeance' | 'abandon'

export function FeuillesPonctuelle({
  tache,
  moi,
  feuille,
  onClose,
  onDone,
}: {
  tache: Tache
  moi: number
  feuille: FeuillePonctuelle
  onClose: () => void
  onDone: () => void
}) {
  if (feuille === 'fait') return <FaitSheet tache={tache} moi={moi} onClose={onClose} onFait={onDone} />
  if (feuille === 'echeance') return <EcheanceSheet tache={tache} moi={moi} onClose={onClose} onDone={onDone} />
  return <AbandonSheet tache={tache} moi={moi} onClose={onClose} onDone={onDone} />
}
