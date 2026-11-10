// « Bravo » strip after a « Fait » (Vincent 2026-11-10): a done ponctuelle
// leaves every list at once — an empty list is the reward — and a done
// récurrente goes back to green. A wrong tap is undone HERE, for DUREE_MS,
// instead of from a card left behind (design system §45.5: destructive
// actions get an undo strip, not a dialog).
//
// FaitSheet publishes the réalisation it just declared (`publierFait`); the
// strip is mounted on the Tâches screen and on the métier list (the red-task
// gate also declares from there), so it follows the user across the two.
import { useEffect, useState, useSyncExternalStore } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2, Undo2 } from 'lucide-react'
import { annulerRealisation } from '@/lib/atelier-api'
import { erreurTache } from '@/components/atelier/TacheSheets'

const DUREE_MS = 8000

interface FaitRecent {
  tacheId: number
  realisationId: number
  libelle: string
  moi: number
  jusqua: number
}

let courant: FaitRecent | null = null
const abonnes = new Set<() => void>()
function emettre() {
  for (const f of abonnes) f()
}

export function publierFait(f: Omit<FaitRecent, 'jusqua'>) {
  courant = { ...f, jusqua: Date.now() + DUREE_MS }
  emettre()
}

function effacer() {
  courant = null
  emettre()
}

function useFaitRecent(): FaitRecent | null {
  return useSyncExternalStore(
    (f) => {
      abonnes.add(f)
      return () => abonnes.delete(f)
    },
    () => courant,
  )
}

export function BandeauFait() {
  const queryClient = useQueryClient()
  const fait = useFaitRecent()
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    if (!fait) return
    setErreur(null)
    const timer = setTimeout(effacer, Math.max(0, fait.jusqua - Date.now()))
    return () => clearTimeout(timer)
  }, [fait])

  const annuler = useMutation({
    mutationFn: (f: FaitRecent) => annulerRealisation(f.tacheId, f.realisationId, f.moi),
    onSuccess: () => {
      effacer()
      queryClient.invalidateQueries({ queryKey: ['atelier', 'taches'] })
    },
    onError: (e) => setErreur(erreurTache(e)),
  })

  if (!fait) return null
  return (
    <div className="fixed inset-x-3 bottom-24 z-40 animate-slide-up" role="status">
      <div className="rounded-xl bg-zinc-900 text-white shadow-lg px-4 py-3 flex items-center gap-3">
        <CheckCircle2 className="h-6 w-6 flex-shrink-0 text-success" />
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold">Bravo, c’est fait !</p>
          <p className="text-sm text-white/70 truncate">{erreur ?? fait.libelle}</p>
        </div>
        <button
          type="button"
          onClick={() => annuler.mutate(fait)}
          disabled={annuler.isPending}
          className="flex-shrink-0 h-11 px-3 rounded-lg text-base font-semibold text-gold flex items-center gap-1.5 active:bg-white/10 disabled:opacity-50"
        >
          {annuler.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Undo2 className="h-5 w-5" />}
          Annuler
        </button>
      </div>
    </div>
  )
}
