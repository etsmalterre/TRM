import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { router } from './router'
import { BonnetierProvider, useIdentite } from './contexts/BonnetierContext'
import { Accueil } from './pages/Accueil'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Shorter than the ERP's five minutes: this app shows the state of
      // machines that change under the operator while they hold the phone.
      staleTime: 1000 * 30,
      retry: 1,
    },
  },
})

/** §45.4 — identification is a gate, not a field. Nothing in the app renders
 *  until someone has said who they are, so no screen can produce work
 *  attributed to nobody. */
function IdentiteGate({ children }: { children: React.ReactNode }) {
  const { identite } = useIdentite()
  if (!identite) return <Accueil />
  return <>{children}</>
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
