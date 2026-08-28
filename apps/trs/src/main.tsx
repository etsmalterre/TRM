import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Atelier } from './pages/Atelier'
import './index.css'

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
