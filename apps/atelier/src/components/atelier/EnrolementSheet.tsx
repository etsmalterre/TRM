// « Enrôler ce téléphone » — the one-time code, typed once.
//
// The admin generates a six-digit code in Paramètres › Utilisateurs (TRM ERP);
// the phone posts it here and receives its own cookie. From then on the
// server knows the phone — and if it was enrolled as a régleur's, the app
// opens as him (BonnetierContext). Same bottom sheet as every confirmation of
// the app (ConfirmSheet), because this is the same gesture: one decision,
// station-scale targets, thumb reach.
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Loader2, Smartphone } from 'lucide-react'
import { enrolerAppareil } from '@/lib/atelier-api'
import { useRafraichirAppareil } from '@/contexts/BonnetierContext'
import { messagePourErreur } from '@/lib/erreurs'
import { cn } from '@/lib/utils'

export function EnrolementSheet({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState('')
  const rafraichir = useRafraichirAppareil()

  const mut = useMutation({
    mutationFn: (c: string) => enrolerAppareil(c),
    onSuccess: async () => {
      await rafraichir()
      onClose()
    },
  })

  const pret = /^\d{6}$/.test(code) && !mut.isPending

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-end"
      onClick={() => !mut.isPending && onClose()}
      role="presentation"
    >
      <form
        className="w-full bg-card text-foreground rounded-t-2xl p-5 pb-8 space-y-4 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          if (pret) mut.mutate(code)
        }}
      >
        <div>
          <h2 className="text-xl font-heading font-bold tracking-tight flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-gold" />
            Enrôler ce téléphone
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Saisissez le code à six chiffres affiché dans Paramètres › Utilisateurs.
          </p>
        </div>

        {/* One field, digits only, the numeric keyboard: six boxes would be
            six taps to correct. The tracking makes the six digits read as
            the code on the admin's screen, not as a number. */}
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          autoFocus
          maxLength={6}
          value={code}
          onChange={(e) => {
            setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
            mut.reset()
          }}
          disabled={mut.isPending}
          aria-label="Code d’enrôlement"
          className={cn(
            'w-full h-16 rounded-xl border border-border bg-background text-center',
            'text-3xl font-heading font-bold tracking-[0.4em] tabular-nums',
            'focus:outline-none focus:ring-2 focus:ring-gold',
            mut.isError && 'border-destructive',
          )}
        />

        {mut.isError && (
          <p className="text-sm text-destructive" role="alert">
            {messagePourErreur(mut.error as Error)}
          </p>
        )}

        <div className="space-y-2">
          <button
            type="submit"
            disabled={!pret}
            className="w-full h-16 rounded-xl bg-gold text-gold-foreground text-lg font-semibold flex items-center justify-center gap-2 active:opacity-90 disabled:opacity-40"
          >
            {mut.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Smartphone className="h-5 w-5" />}
            Enrôler
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={mut.isPending}
            className="w-full h-16 rounded-xl border border-border bg-background text-lg font-semibold active:bg-muted disabled:opacity-40"
          >
            Annuler
          </button>
        </div>
      </form>
    </div>
  )
}
