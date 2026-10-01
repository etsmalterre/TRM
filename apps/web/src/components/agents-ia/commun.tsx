// Agents IA's shared pieces live in ETM (components/agents-ia/commun.tsx).
// The two screens are imported from ETM (`@etm/pages/AgentsIa`,
// `@etm/pages/Automates`) and reach this module through `@/…`, which resolves
// to THIS app's src — keep it a one-line shim so both apps run the same code.
export * from '@etm/components/agents-ia/commun'
