import type { MeResponse } from '../services/api'

/**
 * Chooses which token-usage API to call from ``/llm-usage`` filters + profile (RBAC).
 * - Tool admin → global admin endpoint.
 * - Exactly one ``studio_id`` in filters + user is ``studio_admin`` for that studio
 *   (and not only cross-studio grantee for that studio) → studio admin endpoint.
 * - Otherwise → ``/me/token-usage`` (rows are always the caller’s for non-admin paths
 *   when using ``me``; studio route allows user filter).
 */

export type LlmUsageReportMode = 'admin' | 'studio' | 'me'

export function deriveLlmUsageReportMode(
  profile: MeResponse,
  studioIds: readonly string[],
): { mode: LlmUsageReportMode; studioId: string | null } {
  if (profile.user.is_tool_admin) {
    return { mode: 'admin', studioId: null }
  }
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
