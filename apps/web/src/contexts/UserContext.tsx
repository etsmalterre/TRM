// The user context is ETM's, shared through `@etm` since password login
// (2026-09-30): one login, one session cookie, one context for both apps.
// This module re-exports it so the TRM code keeps importing
// '@/contexts/UserContext' — and every importer gets the SAME context object.
export * from '@etm/contexts/UserContext'
