import type { MeResponse } from '../services/api'

/**
 * Chooses which token-usage API to call from ``/llm-usage`` filters + profile (RBAC).
 * - Exactly one ``studio_id`` in filters + user has wire role ``studio_admin`` for that studio
 *   (and is not only a cross-studio grantee for that studio) → studio-scoped admin endpoint.
 * - Otherwise → ``/me/token-usage`` (rows are always the caller’s for non-admin paths
 *   when using ``me``; studio route allows user filter).
 *
 * Platform-wide ``/admin/token-usage`` was removed; platform admins use the same paths as builders.
 */

export type LlmUsageReportMode = 'studio' | 'me'

export function deriveLlmUsageReportMode(
  profile: MeResponse,
  studioIds: readonly string[],
): { mode: LlmUsageReportMode; studioId: string | null } {
  if (
    studioIds.length === 1 &&
    profile.studios.some(
      (s) => s.studio_id === studioIds[0] && s.role === 'studio_admin',
    )
  ) {
    return { mode: 'studio', studioId: studioIds[0] ?? null }
  }
  return { mode: 'me', studioId: null }
}
