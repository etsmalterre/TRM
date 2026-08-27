import { createBrowserRouter, Navigate } from 'react-router-dom'
import { ChoixMetier } from '@/pages/ChoixMetier'
import { Poste } from '@/pages/Poste'

// Two screens once you are identified. The picker is not a route — it is the
// gate in main.tsx (§45.4), so there is no URL that reaches the app without an
// identity, and no back-button path that strands the operator on a blank poste.
export const router = createBrowserRouter([
  { path: '/', element: <ChoixMetier /> },
  { path: '/metier/:machineId', element: <Poste /> },
  { path: '*', element: <Navigate to="/" replace /> },
])
