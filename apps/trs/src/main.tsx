import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Atelier } from './pages/Atelier'
import './index.css'

// Dev-only: inside a feature worktree the tooling writes VITE_WORKTREE_LABEL
// (e.g. "logo") to .env.development.local; prefix the tab title so parallel
// worktree tabs are distinguishable. Same snippet as apps/web. No-op in prod.
const worktreeLabel = import.meta.env.VITE_WORKTREE_LABEL
if (import.meta.env.DEV && worktreeLabel) {
  document.title = `${worktreeLabel} · ${document.title}`
}

// One screen, no router, no identity: a wall display (CLAUDE.md § TRS).
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The page polls; a failed poll must not blank the plan, so the last
      // good payload stays on screen and the footer says it is stale.
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <Atelier />
    </QueryClientProvider>
  </React.StrictMode>,
)
