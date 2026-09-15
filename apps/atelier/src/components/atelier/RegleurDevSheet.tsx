// « Régleur login » — DEV SERVER ONLY.
//
// On a real phone a régleur is his enrolled phone (BonnetierContext): the app
// opens as him and no grid ever offers his face. On the dev server that means
// enrolling a browser just to look at the régleur screens, so this sheet lets
// the developer pick a régleur instead. Accueil renders it only under
// `import.meta.env.DEV`, and the context refuses `regleur: true` outside dev,
// so a production bundle carries neither.
//
// ⚠️ Navigation only. The API's write gate (`gateSaisie`) still wants an
// enrolled phone: « Lancer OF », the consigne and messages answer « Ce
// téléphone n'est pas enrôlé » unless this browser also carries a régleur
// `mps_appareil` cookie.
import { useQuery } from '@tanstack/react-query'
import { Loader2, Wrench } from 'lucide-react'
import { fetchBonnetiers } from '@/lib/atelier-api'
import { BonnetierPhoto } from '@/components/atelier/BonnetierPhoto'
import { useIdentite } from '@/contexts/BonnetierContext'
import { messagePourErreur } from '@/lib/erreurs'

export function RegleurDevSheet({ onClose }: { onClose: () => void }) {
  const { choisir } = useIdentite()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['atelier', 'bonnetiers', true],
    queryFn: () => fetchBonnetiers(true),
    refetchInterval: false,
  })

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end" onClick={onClose} role="presentation">
      <div
        className="w-full bg-card text-foreground rounded-t-2xl p-5 pb-8 space-y-4 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-xl font-heading font-bold tracking-tight flex items-center gap-2">
            <Wrench className="h-5 w-5 text-gold" />
            Régleur login
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Serveur de dev uniquement : les écrans régleur sans enrôler ce navigateur. Les écritures restent
            refusées par l’API.
          </p>
        </div>

        {isLoading && (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-gold" />
          </div>
        )}
        {isError && (
          <p className="text-sm text-destructive" role="alert">
            {messagePourErreur(error as Error)}
          </p>
        )}
        {data && data.length === 0 && (
          <p className="text-sm text-muted-foreground italic">Aucun régleur enregistré.</p>
        )}

        {data && data.length > 0 && (
          <ul className="space-y-2">
            {data.map((b) => (
              <li key={b.IDbonnetier}>
                <button
                  type="button"
                  onClick={() => {
                    choisir({ id: b.IDbonnetier, prenom: b.prenom, nom: b.nom, regleur: true })
                    onClose()
                  }}
                  className="w-full h-16 rounded-xl border border-border bg-background px-3 flex items-center gap-3 text-lg font-semibold active:bg-muted"
                >
                  <BonnetierPhoto id={b.IDbonnetier} nom={`${b.prenom} ${b.nom}`} size={44} />
                  {b.prenom} {b.nom}
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full h-16 rounded-xl border border-border bg-background text-lg font-semibold active:bg-muted"
        >
          Annuler
        </button>
      </div>
    </div>
  )
}
