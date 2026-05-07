import type { MeResponse } from '../services/api'

/** Matches ``BuilderHomeDashboard`` — persisted selected studio for the builder home page. */
export const HOME_STUDIO_ID_LS_KEY = 'atelier:home:studioId'

export function resolveHomeStudioId(profile: MeResponse): string | null {
  if (!profile.studios.length) return null
  const saved = localStorage.getItem(HOME_STUDIO_ID_LS_KEY)
  if (saved && profile.studios.some((s) => s.studio_id === saved)) {
    return saved
  }
  return profile.studios[0]?.studio_id ?? null
}

/**
 * Studio shown in ``BuilderHomeHeader`` on ``/llm-usage``: explicit filter wins, else home preference.
 */
export function resolveLlmUsageHeaderStudioId(
  profile: MeResponse,
  searchParams: URLSearchParams,
): string | null {
  const ids = [
    ...new Set(
      searchParams
        .getAll('studio_id')
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  ]
  if (
    ids.length === 1 &&
    profile.studios.some((s) => s.studio_id === ids[0])
  ) {
    return ids[0]!
  }
  return resolveHomeStudioId(profile)
}
