// « Qui êtes-vous ? » — the face grid.
//
// §45.4: identification is a gate. The whole app sits behind this screen, and
// the answer is a photo because at a shared phone the face is the only real
// check that the name on tonight's production is the right one.
//
// Legacy: FEN_Accueil_Bonnetier, a ZR of circular photos over a full-bleed
// gold ground. Ours is full-bleed navy with gold accents — same gesture, this
// app's charter. Full-bleed on purpose: it is the one screen with no machine
// context, it reads as the lock screen, and there is nothing else to do here.
import { useQuery } from '@tanstack/react-query'
import { Loader2, AlertCircle } from 'lucide-react'
import { fetchBonnetiers, type Bonnetier } from '@/lib/atelier-api'
import { BonnetierPhoto } from '@/components/atelier/BonnetierPhoto'
import { useIdentite } from '@/contexts/BonnetierContext'
import { useState } from 'react'
import { cn } from '@/lib/utils'

export function Accueil() {
  const { choisir } = useIdentite()
  // ⚠️ TEMPORARY, dev-only. The régleur grid must NOT be reachable from a
  // bonnetier's phone — that is the one real security constraint of this
  // project (dossier §1, §3.3), and the rule is meant to be expressed by the
  // grid simply not offering those faces. Until device enrolment exists there
  // is no way to tell the two phones apart, so this switch stands in for it
  // and is compiled out of production builds. Delete it the day enrolment
  // lands; do NOT let it ship as a user-facing toggle.
  const [role, setRole] = useState<'bonnetier' | 'regleur'>('bonnetier')
  const regleur = role === 'regleur'

  const { data, isLoading, isError } = useQuery({
    queryKey: ['atelier', 'bonnetiers', regleur],
    queryFn: () => fetchBonnetiers(regleur),
  })

  return (
    <div className="min-h-full bg-gradient-brand text-white flex flex-col">
      <div style={{ height: 'env(safe-area-inset-top)' }} />

      {/* The Malterre wordmark, and nothing else. No title, no instruction:
          the faces ARE the instruction, and on the one screen with no machine
          context the brand is the only thing worth saying. The white-on-
          transparent PNG is the group mark (shared with ETM — it is Malterre's,
          not one app's), so it sits straight on the navy.
          `alt` carries the page's accessible name now that no heading does. */}
      <header className="pt-12 pb-10 px-6 flex justify-center flex-shrink-0">
        <img src="/logo-full.png" alt="Malterre" className="h-16 w-auto" />
      </header>

      <main className="flex-1 px-5 pb-10">
        {isLoading && (
          <div className="flex justify-center pt-10">
            <Loader2 className="h-8 w-8 animate-spin text-gold" />
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center gap-2 pt-10 text-center text-white/80">
            <AlertCircle className="h-8 w-8 text-gold" />
            <p className="text-sm">
              Impossible de joindre le serveur.
              <br />
              Vérifiez le réseau, puis réessayez.
            </p>
          </div>
        )}

        {data && data.length === 0 && (
          <p className="pt-10 text-center text-sm text-white/70 italic">
            Aucun {regleur ? 'régleur' : 'bonnetier'} enregistré.
          </p>
        )}

        {data && data.length > 0 && (
          <ul className="grid grid-cols-2 gap-x-4 gap-y-6 max-w-md mx-auto">
            {data.map((b) => (
              <FaceTile
                key={b.IDbonnetier}
                b={b}
                onPick={() =>
                  choisir({
                    id: b.IDbonnetier,
                    prenom: b.prenom,
                    nom: b.nom,
                    regleur: b.regleur === 1,
                  })
                }
              />
            ))}
          </ul>
        )}
      </main>

      {import.meta.env.DEV && (
        <div className="flex-shrink-0 px-5 pb-8 text-center">
          <button
            type="button"
            onClick={() => setRole(regleur ? 'bonnetier' : 'regleur')}
            className="text-xs text-white/50 underline underline-offset-4"
          >
            dev · voir la grille {regleur ? 'bonnetier' : 'régleur'}
          </button>
        </div>
      )}
    </div>
  )
}

function FaceTile({ b, onPick }: { b: Bonnetier; onPick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        className={cn(
          'w-full flex flex-col items-center gap-2 rounded-2xl p-3',
          'active:bg-white/10 transition-colors',
        )}
      >
        {/* 104px: a gloved fingertip is ~20mm, and the face has to be
            recognisable at arm's length under workshop lighting. */}
        <BonnetierPhoto id={b.IDbonnetier} nom={`${b.prenom} ${b.nom}`} size={104} />
        <span className="text-lg font-semibold leading-tight text-center">{b.prenom}</span>
      </button>
    </li>
  )
}
