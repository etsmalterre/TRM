// « Qui êtes-vous ? » — the face grid of a SHARED phone.
//
// §45.4: identification is a gate. The whole app sits behind this screen, and
// the answer is a photo because at a shared phone the face is the only real
// check that the name on tonight's production is the right one.
//
// Only bonnetiers are offered here, ever. A régleur is his own phone: enrolled
// with a fixed identity (BonnetierContext), his app never shows this screen.
// That is the plan's §3.3 rule expressed in UX — there is nothing to tap —
// and the API enforces the same rule on every write.
//
// Legacy: FEN_Accueil_Bonnetier, a ZR of circular photos over a full-bleed
// gold ground. Ours is full-bleed navy with gold accents — same gesture, this
// app's charter. Full-bleed on purpose: it is the one screen with no machine
// context, it reads as the lock screen, and there is nothing else to do here.
import { useQuery } from '@tanstack/react-query'
import { Loader2, AlertCircle, Smartphone, Wrench } from 'lucide-react'
import { fetchBonnetiers, fetchEnrolementEnAttente, type Bonnetier } from '@/lib/atelier-api'
import { BonnetierPhoto } from '@/components/atelier/BonnetierPhoto'
import { EnrolementSheet } from '@/components/atelier/EnrolementSheet'
import { RegleurDevSheet } from '@/components/atelier/RegleurDevSheet'
import { useIdentite } from '@/contexts/BonnetierContext'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { vibrer } from '@/lib/vibration'

export function Accueil() {
  const { choisir, appareil } = useIdentite()
  const [enroler, setEnroler] = useState(false)
  const [regleurDev, setRegleurDev] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['atelier', 'bonnetiers', false],
    queryFn: () => fetchBonnetiers(false),
    // The faces grid is not workshop state: a new bonnetier is a rare ERP
    // event, and the phone re-reads it on focus anyway. Polling it would
    // only tax the API from every idle phone left on the gate.
    refetchInterval: false,
    staleTime: 5 * 60_000,
  })

  // « Enrôler ce téléphone » is offered only while an admin has a code
  // pending (2026-09-15): on a shared phone left on the gate, a link nobody
  // may use is only an invitation to tap it. Rides the app's 10 s poll, and
  // only while this phone is not enrolled. FAILS OPEN: an API that does not
  // know the route yet (deploy order) or a network hiccup shows the link —
  // hiding the only way in would lock the phone out.
  const attente = useQuery({
    queryKey: ['atelier', 'enrolement-en-attente'],
    queryFn: fetchEnrolementEnAttente,
    enabled: !appareil,
  })
  const offrirEnrolement = attente.isError || attente.data?.enAttente === true

  return (
    // `h-full overflow-y-auto`, not `min-h-full`: #root is locked to 100dvh
    // and hides its overflow (index.css), so this screen must own its scroll
    // like every other one. Without it the grid was simply clipped — on a
    // 360×720 phone the fifth face was half visible and nothing below it
    // (a sixth bonnetier, the footer link) could ever be tapped (2026-09-14).
    <div className="h-full overflow-y-auto scrollbar-transparent bg-gradient-brand text-white flex flex-col">
      <div className="safe-top" />

      {/* The Malterre wordmark, and nothing else. No title, no instruction:
          the faces ARE the instruction, and on the one screen with no machine
          context the brand is the only thing worth saying. The white-on-
          transparent PNG is the group mark (shared with ETM — it is Malterre's,
          not one app's), so it sits straight on the navy.
          `alt` carries the page's accessible name now that no heading does.
          Kept compact: the budget is six faces (three rows) plus the footer
          below them, all visible at once on a 360×720 phone. */}
      <header className="pt-6 pb-5 px-6 flex justify-center flex-shrink-0">
        <img src="/logo-full.png" alt="Malterre" className="h-12 w-auto" />
      </header>

      <main className="flex-1 px-5 pb-4">
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
          <p className="pt-10 text-center text-sm text-white/70 italic">Aucun bonnetier enregistré.</p>
        )}

        {data && data.length > 0 && (
          <ul className="grid grid-cols-2 gap-x-4 gap-y-3 max-w-md mx-auto">
            {data.map((b) => (
              <FaceTile
                key={b.IDbonnetier}
                b={b}
                onPick={() => {
                  // The legacy buzzed on a face; a light tick keeps the habit.
                  vibrer('tick')
                  choisir({
                    id: b.IDbonnetier,
                    prenom: b.prenom,
                    nom: b.nom,
                    regleur: false,
                  })
                }}
              />
            ))}
          </ul>
        )}
      </main>

      {/* The phone's own line. Enrolled: its label, so a phone found on a
          bench can be told apart from the next one. An enrolled phone always
          records, so there is no « consultation seule » state any more
          (2026-09-15). Not enrolled: the one way in, deliberately discreet —
          it is an admin's gesture, done once — and shown only while a code
          is pending (above). An open sheet stays open if the code expires
          under it: its own error says so. */}
      <div className="flex-shrink-0 px-5 pb-6 text-center">
        {appareil ? (
          <p className="text-xs text-white/50 flex items-center justify-center gap-1.5">
            <Smartphone className="h-3.5 w-3.5" />
            {appareil.libelle}
          </p>
        ) : offrirEnrolement ? (
          <button
            type="button"
            onClick={() => setEnroler(true)}
            className="text-xs text-white/50 underline underline-offset-4"
          >
            Enrôler ce téléphone
          </button>
        ) : null}
        {/* The atelier's OWN version (apps/atelier/package.json, never the ERP's
            root number), fainter than the phone line: it answers « which build
            is this phone running? » when a fix is meant to have landed, and
            nothing else. Same wording as the ERP's profile menu. */}
        <p className="mt-2 text-[10px] leading-none text-white/35 tabular-nums">Version {__APP_VERSION__}</p>
        {/* Dev server only — compiled out of production builds. See
            RegleurDevSheet for why, and for what it does NOT unlock. */}
        {import.meta.env.DEV && (
          <button
            type="button"
            onClick={() => setRegleurDev(true)}
            className="mt-4 inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-dashed border-gold/60 text-xs text-gold active:bg-white/10"
          >
            <Wrench className="h-3.5 w-3.5" />
            dev · Régleur login
          </button>
        )}
      </div>

      {enroler && <EnrolementSheet onClose={() => setEnroler(false)} />}
      {import.meta.env.DEV && regleurDev && <RegleurDevSheet onClose={() => setRegleurDev(false)} />}
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
          'w-full flex flex-col items-center gap-1.5 rounded-2xl px-3 py-2',
          'active:bg-white/10 transition-colors',
        )}
      >
        {/* 96px (~17mm on a 360px-wide phone): a gloved fingertip is ~20mm
            and the whole tile is the target, and the face has to be
            recognisable at arm's length under workshop lighting. Was 104
            until 2026-09-14; the 8px were what kept the third row off a
            720px-tall screen. */}
        <BonnetierPhoto id={b.IDbonnetier} nom={`${b.prenom} ${b.nom}`} size={96} />
        <span className="text-lg font-semibold leading-tight text-center">{b.prenom}</span>
      </button>
    </li>
  )
}
