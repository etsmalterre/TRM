// Shared API fetch helper. Centralized so every page sends cookies via
// `credentials: 'include'` (required for cross-origin cookie auth) and so we
// have one place to add global auth-error handling in the future.

// Points at the shared ETM API (this app has no API of its own — see CLAUDE.md).
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api'

/** What a failed call throws: the status, plus the API's machine-readable
 *  `error` code and its French `message` when the body carried them — the
 *  atelier routes refuse with codes (`appareil_non_enrole`, `regleur_requis`…)
 *  that lib/erreurs.ts turns into a sentence for the operator. */
export interface ApiError extends Error {
  status?: number
  code?: string
  detail?: string
}

// Default return type is `any` so existing call sites that rely on implicit
// typing (from the previous per-page apiFetch) keep working. Call with an
// explicit type parameter (`apiFetch<Foo>(...)`) when you want proper typing.
export async function apiFetch<T = any>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  if (!res.ok) {
    // Surface a machine-readable error so callers can distinguish
    // "not authenticated" (401) from generic failure.
    const err: ApiError = new Error(`API ${res.status}`)
    err.status = res.status
    try {
      const body = (await res.json()) as { error?: unknown; message?: unknown }
      if (typeof body?.error === 'string') err.code = body.error
      if (typeof body?.message === 'string') err.detail = body.message
    } catch {
      // No JSON body — the status is all we know.
    }
    throw err
  }
  // Some endpoints (logout) return 204 No Content, which has no body.
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}
