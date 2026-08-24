// Layout resolution + persistence of the tableau de bord — shared verbatim
// with ETM. Inside it, `@/components/dashboard/registry` resolves to THIS
// app's registry (TRM's widgets, `DASHBOARD_APP = 'trm'`), which is how one
// hook serves two catalogs and two per-app layout stores.
export * from '@etm/components/dashboard/useDashboardLayout'
