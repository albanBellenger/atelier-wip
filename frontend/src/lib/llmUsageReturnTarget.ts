import type { MeResponse, Software, StudioProjectRow } from '../services/api'
import type { ReturnNavPayload } from './returnNavigation'
import {
  parseReturnNavFromLocationState,
  readReturnNavFromSearchParams,
} from './returnNavigation'

function readMulti(sp: URLSearchParams, key: string): string[] {
  const raw = sp.getAll(key).map((x) => x.trim()).filter(Boolean)
  return [...new Set(raw)]
}

export function readLlmUsageFilterIdsFromSearch(sp: URLSearchParams): {
  studioIds: string[]
  softwareIds: string[]
  projectIds: string[]
} {
  return {
    studioIds: readMulti(sp, 'studio_id'),
    softwareIds: readMulti(sp, 'software_id'),
    projectIds: readMulti(sp, 'project_id'),
  }
}

export function resolveExplicitLlmUsageReturn(
  locationState: unknown,
  sp: URLSearchParams,
): ReturnNavPayload | null {
  return (
    parseReturnNavFromLocationState(locationState) ??
    readReturnNavFromSearchParams(sp)
  )
}

export function resolveDerivedLlmUsageReturnNav(props: {
  profile: MeResponse
  searchParams: URLSearchParams
  headerStudioId: string | null
  studioProjects: StudioProjectRow[] | undefined
  softwareList: Software[] | undefined
}): ReturnNavPayload | null {
  const { profile, searchParams, headerStudioId, studioProjects, softwareList } =
    props
  const { studioIds, softwareIds, projectIds } =
    readLlmUsageFilterIdsFromSearch(searchParams)

  const studioForQueries =
    studioIds.length === 1 ? studioIds[0] : (headerStudioId ?? '')

  if (projectIds.length === 1 && studioForQueries) {
    if (!studioProjects) return null
    const row = studioProjects.find((p) => p.id === projectIds[0])
    if (row) {
      return {
        path: `/studios/${studioForQueries}/software/${row.software_id}/projects/${row.id}`,
        label: row.name,
      }
    }
  }

  if (softwareIds.length === 1 && studioForQueries) {
    if (!softwareList) return null
    const sw = softwareList.find((s) => s.id === softwareIds[0])
    if (sw) {
      return {
        path: `/studios/${studioForQueries}/software/${sw.id}`,
        label: sw.name,
      }
    }
  }

  if (
    studioIds.length === 1 &&
    softwareIds.length === 0 &&
    projectIds.length === 0
  ) {
    const sid = studioIds[0]
    if (sid === headerStudioId) return null
    const name =
      profile.studios.find((s) => s.studio_id === sid)?.studio_name ?? 'Studio'
    return { path: `/studios/${sid}`, label: name }
  }

  return null
}

export function resolveLlmUsageReturnNav(props: {
  profile: MeResponse
  searchParams: URLSearchParams
  locationState: unknown
  headerStudioId: string | null
  studioProjects: StudioProjectRow[] | undefined
  softwareList: Software[] | undefined
}): ReturnNavPayload | null {
  const explicit = resolveExplicitLlmUsageReturn(
    props.locationState,
    props.searchParams,
  )
  if (explicit) return explicit
  return resolveDerivedLlmUsageReturnNav({
    profile: props.profile,
    searchParams: props.searchParams,
    headerStudioId: props.headerStudioId,
    studioProjects: props.studioProjects,
    softwareList: props.softwareList,
  })
}
