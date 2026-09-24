// One salarié at the pointeuse — port of FEN_PointageSalarié, as a §45 Poste.
//
// The context is imposed (the face just tapped), and what commits is one of
// the one or two buttons the SERVER offers for his open line (API
// lib/pointage-etat.ts): « Début du travail », « Début de la pause », « Fin de
// la pause », « Fin du travail », « Fin de la pause et fin du travail », or
// « Commencer aujourd'hui » past a shift left open. Each press sends the line
// the screen showed; a stale screen or a double tap is refused (409) and the
// screen re-reads.
//
// Like the legacy: no confirmation, and back to the faces after every pointage
// — here after a large « enregistré à HH:MM » that the salarié can read from a
// step back. Left alone, the screen returns to the faces by itself
// (INACTIVITE_MS): the next person must never find someone else's buttons.
//
// Deliberate deviation from §45.3: TWO commit buttons, because the legacy
// offers two gestures at every state — the first gold, the second navy.
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, ArrowLeft, CheckCircle2, Coffee, Loader2, LogIn, LogOut, Play, type LucideIcon,
} from 'lucide-react'
import {
  fetchEtat, pointer, type ActionOfferte, type ActionPointage, type Ligne,
} from '@/lib/pointage-api'
import type { ApiError } from '@/lib/api'
import { messagePourErreur } from '@/lib/erreurs'
import { CONFIRMATION_MS, INACTIVITE_MS } from '@/lib/rafraichissement'
import { heure, heuresMinutes, jourLong, phraseStatut, soldeClasse, soldeSigne } from '@/lib/heures'
import { Horloge } from '@/components/Horloge'
import { SalariePhoto } from '@/components/SalariePhoto'
import { DerniersJours } from '@/components/DerniersJours'
import { cn } from '@/lib/utils'

const ICONE: Record<ActionPointage, LucideIcon> = {
  debut_travail: LogIn,
  debut_pause: Coffee,
  fin_pause: Play,
  fin_travail: LogOut,
  fin_pause_fin_travail: LogOut,
}

/** Back to the faces after `delaiMs` without a touch. */
function useRetourAccueil(delaiMs: number) {
  const navigate = useNavigate()
  useEffect(() => {
    const aller = () => navigate('/', { replace: true })
    let t = window.setTimeout(aller, delaiMs)
    const relancer = () => {
      window.clearTimeout(t)
      t = window.setTimeout(aller, delaiMs)
    }
    window.addEventListener('pointerdown', relancer)
    window.addEventListener('keydown', relancer)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('pointerdown', relancer)
      window.removeEventListener('keydown', relancer)
    }
  }, [delaiMs, navigate])
}

export function Salarie() {
  const params = useParams()
  const id = Number(params.id)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const cle = ['pointage', 'etat', id] as const
  const [succes, setSucces] = useState<{ libelle: string; instantMs: number } | null>(null)
  // A tap is one write: isPending arrives a render late, a ref does not.
  const enCours = useRef(false)

  const etat = useQuery({ queryKey: cle, queryFn: () => fetchEtat(id), enabled: Number.isInteger(id) && id > 0 })

  useRetourAccueil(succes ? CONFIRMATION_MS : INACTIVITE_MS)

  const mut = useMutation({
    mutationFn: (a: ActionOfferte & { ligneId: number | null }) => pointer(id, { action: a.action, ligneId: a.ligneId }),
    onSuccess: (r, a) => {
      qc.setQueryData(cle, r.etat)
      setSucces({ libelle: a.libelle, instantMs: r.resultat.instantMs })
      void qc.invalidateQueries({ queryKey: ['pointage', 'salaries'] })
      void qc.invalidateQueries({ queryKey: ['pointage', 'en-poste'] })
    },
    onError: () => {
      void qc.invalidateQueries({ queryKey: cle })
    },
    onSettled: () => {
      enCours.current = false
    },
  })

  const e = etat.data

  if (etat.isLoading) {
    return (
      <Cadre onRetour={() => navigate('/')}>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-gold" />
        </div>
      </Cadre>
    )
  }
  if (!e) {
    return (
      <Cadre onRetour={() => navigate('/')}>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
          <AlertTriangle className="h-10 w-10 text-destructive" />
          <p className="text-xl">{etat.error ? messagePourErreur(etat.error as ApiError) : 'Salarié introuvable.'}</p>
        </div>
      </Cadre>
    )
  }

  if (succes) {
    return (
      <button
        type="button"
        onClick={() => navigate('/', { replace: true })}
        className="h-full w-full bg-gradient-brand text-white flex flex-col items-center justify-center gap-6 text-center animate-fade-in"
      >
        <CheckCircle2 className="h-28 w-28 text-gold" strokeWidth={1.5} />
        <p className="text-5xl font-heading font-bold tracking-tight">{succes.libelle}</p>
        <p className="text-3xl text-white/80">
          {e.salarie.prenom}, enregistré à <span className="font-semibold text-white tabular-nums">{heure(succes.instantMs)}</span>
        </p>
        <p className="text-base text-white/40">Touchez l’écran pour revenir</p>
      </button>
    )
  }

  const presser = (a: ActionOfferte) => {
    if (enCours.current) return
    enCours.current = true
    mut.mutate({ ...a, ligneId: e.ligne?.id ?? null })
  }

  return (
    <Cadre onRetour={() => navigate('/')}>
      <main className="flex-1 min-h-0 grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-6 p-6">
        <div className="min-h-0 flex flex-col gap-4 overflow-y-auto scrollbar-transparent">
          <div className="rounded-2xl border border-border bg-white shadow-sm p-5 flex items-center gap-5">
            <SalariePhoto salarie={e.salarie} size={120} />
            <div className="min-w-0">
              <p className="text-3xl font-heading font-bold text-primary leading-tight truncate">{e.salarie.prenom}</p>
              <p className="text-xl text-foreground/80 leading-tight truncate">{e.salarie.nom}</p>
              {/* Legacy SAI_Semaine / SAI_Cumul: last week's hours and the
                  annualised-hours balance (« Solde annuel » — Vincent, 2026-09-21:
                  « Cumul » said nothing; the sign and colour say credit or debt);
                  both hidden when the legacy hides them. */}
              {e.semaine && (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-muted-foreground">
                  <span>
                    Semaine {e.semaine.numero} :{' '}
                    <span className="font-semibold text-foreground tabular-nums">{heuresMinutes(e.semaine.semaineMin)}</span>
                  </span>
                  <span>
                    Solde annuel :{' '}
                    <span className={cn('font-semibold tabular-nums', soldeClasse(e.semaine.cumulMin))}>
                      {soldeSigne(e.semaine.cumulMin)}
                    </span>
                  </span>
                </div>
              )}
            </div>
          </div>

          <div
            className={cn(
              'rounded-xl px-4 py-3 text-lg font-semibold',
              e.statut === 'au_travail' && 'bg-success/10 text-success',
              e.statut === 'en_pause' && 'bg-warning/15 text-amber-800',
              e.statut === 'hors_poste' && 'bg-muted text-muted-foreground',
            )}
          >
            {phraseStatut(e.statut, e.ligne)}
          </div>

          {e.ligne && <Recap ligne={e.ligne} />}

          {/* No « Temps hors prod du jour » (legacy COMBO_Temps_hors_prod_du_jour):
              it fed a productivity measure the company no longer uses — dropped
              on Vincent's decision, 2026-09-21. */}

          {e.messages.length > 0 && (
            <div className="flex-shrink-0 rounded-xl border border-border bg-white shadow-sm overflow-hidden">
              <div className="px-4 py-2 bg-sand border-b border-border">
                <span className="text-xs font-semibold uppercase tracking-wide text-accent">Messages</span>
              </div>
              <div className="divide-y divide-border">
                {e.messages.map((m) => (
                  <p key={m.id} className="px-4 py-3 text-base whitespace-pre-line">{m.texte}</p>
                ))}
              </div>
            </div>
          )}

          <DerniersJours idSalarie={e.salarie.id} />
        </div>

        <div className="min-h-0 flex flex-col gap-4">
          {e.posteNonFerme && <PosteNonFerme ligne={e.posteNonFerme} />}

          <div className="flex-1 min-h-0 flex flex-col gap-4">
            {e.actions.map((a, i) => {
              const Icone = ICONE[a.action]
              const presse = mut.isPending && mut.variables?.action === a.action
              return (
                <button
                  key={a.action}
                  type="button"
                  disabled={mut.isPending}
                  onClick={() => presser(a)}
                  className={cn(
                    'flex-1 min-h-[7rem] max-h-72 rounded-2xl px-6 shadow-md',
                    'flex items-center justify-center gap-4 text-3xl font-heading font-bold tracking-tight',
                    'active:scale-[0.99] transition disabled:opacity-60',
                    i === 0 ? 'bg-gold text-gold-foreground' : 'bg-primary text-primary-foreground',
                  )}
                >
                  {presse ? <Loader2 className="h-9 w-9 animate-spin" /> : <Icone className="h-9 w-9" />}
                  {a.libelle}
                </button>
              )
            })}
          </div>

          {mut.isError && (
            <p className="flex-shrink-0 text-lg text-destructive font-medium" role="alert">
              {messagePourErreur(mut.error as ApiError)}
            </p>
          )}
        </div>
      </main>
    </Cadre>
  )
}

/** The navy band with « Retour » and the clock, around any state of the screen. */
function Cadre({ onRetour, children }: { onRetour: () => void; children: React.ReactNode }) {
  return (
    <div className="h-full flex flex-col">
      <header className="flex-shrink-0 bg-gradient-brand text-white">
        <div className="safe-top" />
        <div className="px-6 py-3 grid grid-cols-[10rem_1fr_10rem] items-center">
          <button
            type="button"
            onClick={onRetour}
            className="h-14 px-5 rounded-full bg-white/10 active:bg-white/20 text-lg font-semibold flex items-center gap-2 justify-self-start"
          >
            <ArrowLeft className="h-6 w-6" />
            Retour
          </button>
          <Horloge taille="compacte" />
          <img src="/logo-m.png" alt="" className="h-10 w-auto justify-self-end" />
        </div>
      </header>
      {children}
    </div>
  )
}

function Recap({ ligne }: { ligne: Ligne }) {
  const cases: Array<[string, string]> = [['Arrivée', heure(ligne.debutMs)]]
  if (ligne.debutPause1Ms) cases.push(['Pause 1', `${heure(ligne.debutPause1Ms)} – ${ligne.finPause1Ms ? heure(ligne.finPause1Ms) : '…'}`])
  if (ligne.debutPause2Ms) cases.push(['Pause 2', `${heure(ligne.debutPause2Ms)} – ${ligne.finPause2Ms ? heure(ligne.finPause2Ms) : '…'}`])
  return (
    <div className="rounded-xl border border-border bg-white shadow-sm grid grid-cols-3 divide-x divide-border">
      {cases.map(([label, valeur]) => (
        <div key={label} className="px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold tabular-nums">{valeur}</p>
        </div>
      ))}
    </div>
  )
}

function PosteNonFerme({ ligne }: { ligne: Ligne }) {
  return (
    <div className="flex-shrink-0 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex gap-3">
      <AlertTriangle className="h-6 w-6 text-amber-600 flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-lg font-semibold text-amber-900">
          Votre poste du {jourLong(ligne.jour)} (arrivée {heure(ligne.debutMs)}) n’a pas été fermé.
        </p>
        <p className="text-base text-amber-800">Prévenez le bureau : il sera corrigé dans Admin Pointage.</p>
      </div>
    </div>
  )
}
