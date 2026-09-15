import { createBrowserRouter, Navigate } from 'react-router-dom'
import { Accueil } from '@/pages/Accueil'
import { Salarie } from '@/pages/Salarie'

// Two screens behind the enrolment gate (main.tsx): the wall, and one
// salarié's buttons.
export const router = createBrowserRouter([
  { path: '/', element: <Accueil /> },
  { path: '/salarie/:id', element: <Salarie /> },
  { path: '*', element: <Navigate to="/" replace /> },
])
