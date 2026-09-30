import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { router } from './router'
import { installAutofillBlocker } from './lib/disable-autofill'
import { UserProvider } from './contexts/UserContext'
import { PermissionsProvider } from './contexts/PermissionsContext'
import { UserPickerGate } from './components/auth/UserPickerGate'
import './index.css'

// Strip Dashlane/LastPass/1Password/Bitwarden autofill from every form control
installAutofillBlocker()

// Dev-only: when running inside a feature worktree the tooling sets
// VITE_WORKTREE_LABEL (e.g. "planning"); prefix the tab title so parallel
// worktree dev tabs are distinguishable in the browser. No-op in prod builds.
const worktreeLabel = import.meta.env.VITE_WORKTREE_LABEL
if (import.meta.env.DEV && worktreeLabel) {
  document.title = `${worktreeLabel} · ${document.title}`
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1
    }
  }
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <UserProvider>
        <PermissionsProvider>
          <UserPickerGate app="trm">
            <RouterProvider router={router} />
          </UserPickerGate>
        </PermissionsProvider>
      </UserProvider>
    </QueryClientProvider>
  </React.StrictMode>
)
