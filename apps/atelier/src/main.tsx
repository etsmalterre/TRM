import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { router } from './router'
import { BonnetierProvider, useIdentite } from './contexts/BonnetierContext'
import { POLL_MS } from './lib/rafraichissement'
import { installerMiseAJour } from './lib/mise-a-jour'
import { Accueil } from './pages/Accueil'
import './index.css'

// Dev-only: inside a feature worktree the tooling writes VITE_WORKTREE_LABEL
// (e.g. "logo") to .env.development.local; prefix the tab title so parallel
// worktree tabs are distinguishable. Same snippet as apps/web. No-op in prod.
const worktreeLabel = import.meta.env.VITE_WORKTREE_LABEL
if (import.meta.env.DEV && worktreeLabel) {
  document.title = `${worktreeLabel} · ${document.title}`
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Every screen shows the state of machines that change under the
      // operator while they hold the phone, and under OTHER hands too (the
      // ERP, a régleur's phone, the poste next door). So the app polls: every
      // mounted query re-reads the server on POLL_MS, and again the moment
      // the phone comes back to the foreground or the network returns. The
      // few queries that must not poll (window content, the faces grid) say
      // so themselves with `refetchInterval: false`.
      staleTime: POLL_MS,
      refetchInterval: POLL_MS,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 1,
    },
  },
})

// A deploy reaches the phones on its own: register the worker, check for a
// newer build every minute, reload once it has taken over (lib/mise-a-jour.ts).
installerMiseAJour(queryClient)

/** §45.4 — identification is a gate, not a field. Nothing in the app renders
 *  until someone has said who they are, so no screen can produce work
 *  attributed to nobody. An enrolled régleur's phone answers by itself
 *  (BonnetierContext); a brand-new phone waits for the server's first word
 *  rather than flashing the grid and then swapping it for the régleur list. */
function IdentiteGate({ children }: { children: React.ReactNode }) {
  const { identite, appareil } = useIdentite()
  if (appareil === undefined) return <Attente />
  if (!identite) return <Accueil />
  return <>{children}</>
}

/** The Accueil's ground and mark, without its faces: what a new phone shows
 *  for the second it takes the server to say whether it is enrolled. */
function Attente() {
  return (
    <div className="h-full bg-gradient-brand text-white flex flex-col">
      <div className="flex-shrink-0" style={{ height: 'env(safe-area-inset-top)' }} />
      <header className="pt-6 pb-5 px-6 flex justify-center flex-shrink-0">
        <img src="/logo-full.png" alt="Malterre" className="h-12 w-auto" />
      </header>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BonnetierProvider>
        <IdentiteGate>
          <RouterProvider router={router} />
        </IdentiteGate>
      </BonnetierProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
