import { createBrowserRouter, Navigate } from 'react-router-dom'
import { ChoixMetier } from '@/pages/ChoixMetier'
import { Poste } from '@/pages/Poste'
import { ReglageMachine } from '@/pages/ReglageMachine'
import { Consigne } from '@/pages/Consigne'

// Four screens once you are identified. The picker is not a route — it is the
// gate in main.tsx (§45.4), so there is no URL that reaches the app without an
// identity, and no back-button path that strands the operator on a blank poste.
//
// Every screen is keyed by the MÉTIER, not the OF: the phone is standing at a
// machine, and the machine decides the OF (§45.1). The consigne and réglage
// screens resolve the OF the same way the poste does.
export const router = createBrowserRouter([
  { path: '/', element: <ChoixMetier /> },
  { path: '/metier/:machineId', element: <Poste /> },
  { path: '/metier/:machineId/consigne', element: <Consigne /> },
  { path: '/metier/:machineId/reglage', element: <ReglageMachine /> },
  { path: '*', element: <Navigate to="/" replace /> },
])
