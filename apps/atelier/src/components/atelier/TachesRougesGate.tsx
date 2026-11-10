// The red ponctuelles must be handled (Vincent 2026-11-10): when someone is
// on the métier list — his face picked on a shared phone, or a régleur's own
// phone — every ponctuelle that is red FOR HIM and that he can move (its
// creator for a task to the bonnetiers, the régleurs for one to them) comes up in a sheet that has no close button: Fait, Repousser
// (new date + motif), Abandonner (motif), or « Fixer l'échéance » on a
// bonnetier's request to the régleurs. One sheet per task, the next one
// follows once the list refreshes.
//
// It never blocks production: « Plus tard » hides it PLUS_TARD_MS for that
// person (a bonnetier who came to declare a fin de pièce does that first),
// then it comes back. The snooze is in memory only, nothing is recorded.
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Clock } from 'lucide-react'
import { FeuillesPonctuelle, Sheet, type FeuillePonctuelle } from '@/components/atelier/TacheSheets'
import { useIdentite } from '@/contexts/BonnetierContext'
import { ActionsPonctuelle, LigneDemande, TACHES_QUERY_KEY, TagEcheance, useTaches } from '@/pages/Taches'

const PLUS_TARD_MS = 30 * 60 * 1000
/** IDbonnetier → snoozed until (ms). Survives navigation, not a reload. */
const plusTard = new Map<number, number>()

export function TachesRougesGate() {
  const queryClient = useQueryClient()
  const { identite, fixe } = useIdentite()
  const { data: taches } = useTaches()
  const [feuille, setFeuille] = useState<FeuillePonctuelle | null>(null)
  // Re-render after a snooze (the Map is not state).
  const [, setTick] = useState(0)
  const reveil = identite ? (plusTard.get(identite.id) ?? 0) : 0
  useEffect(() => {
    const reste = reveil - Date.now()
    if (reste <= 0) return
    const timer = setTimeout(() => setTick((n) => n + 1), reste + 1000)
    return () => clearTimeout(timer)
  }, [reveil])

  if (!identite) return null
  // The dev server's « Régleur login » is a régleur without his enrolled
  // phone: the API refuses all his writes, so imposing a sheet he cannot act
  // on would lock the screen (2026-11-10). In production a régleur always
  // has a fixed identity, so this never hides anything there.
  if (identite.regleur && !fixe) return null
  if ((plusTard.get(identite.id) ?? 0) > Date.now()) return null
  const rouges = (taches ?? []).filter(
    // Imposed only on who can move it (API `doitTraiterRouge`): its creator
    // for a task to the bonnetiers, the régleurs for one to them. The others
    // see the red card and may still do it.
    (t) =>
      t.categorie === 'ponctuelle' &&
      t.cloture === null &&
      t.niveau === 'rouge' &&
      (t.actions.includes('reporter') || t.actions.includes('echeance')),
  )
  const t = rouges[0]
  if (!t) return null

  const terminer = () => {
    setFeuille(null)
    queryClient.invalidateQueries({ queryKey: TACHES_QUERY_KEY })
  }

  return (
    <>
      <Sheet
        titre={t.echeance === null ? 'Demande à dater' : 'Tâche en retard'}
        detail={rouges.length > 1 ? `1 sur ${rouges.length} à traiter` : 'À traiter maintenant'}
      >
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-transparent px-5 space-y-3 pb-1">
          <div className="rounded-xl border border-destructive/50 bg-destructive/5 p-3.5 space-y-2">
            <p className="text-lg font-semibold leading-snug">{t.libelle}</p>
            {t.description && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{t.description}</p>}
            <LigneDemande t={t} />
            <div className="flex">
              <TagEcheance t={t} />
            </div>
          </div>
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-destructive" />
            <span>
              {t.echeance === null
                ? 'Fixez quand elle sera faite, faites-la tout de suite, ou abandonnez-la en disant pourquoi.'
                : 'Faites-la, repoussez-la ou abandonnez-la. Une raison est demandée : elle nous aide à améliorer l’organisation.'}
            </span>
          </p>
        </div>
        <div className="flex-shrink-0 p-5 pt-3 space-y-3">
          <ActionsPonctuelle t={t} onFeuille={setFeuille} />
          <button
            type="button"
            onClick={() => {
              plusTard.set(identite.id, Date.now() + PLUS_TARD_MS)
              setTick((n) => n + 1)
            }}
            className="w-full h-10 flex items-center justify-center gap-1.5 text-sm text-muted-foreground active:text-foreground"
          >
            <Clock className="h-4 w-4" />
            Plus tard — j’ai d’abord une saisie à faire
          </button>
          <div style={{ height: 'env(safe-area-inset-bottom)' }} />
        </div>
      </Sheet>
      {feuille && (
        <FeuillesPonctuelle
          tache={t}
          moi={identite.id}
          feuille={feuille}
          onClose={() => setFeuille(null)}
          onDone={terminer}
        />
      )}
    </>
  )
}
