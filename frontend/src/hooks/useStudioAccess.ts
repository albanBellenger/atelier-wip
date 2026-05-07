import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import {
  deriveStudioAccessFromProfile,
  mapStudioCapabilitiesOutToFields,
  studioCapabilitiesOutFromProfile,
} from '../lib/studioAccessDerived'
import type { MeResponse } from '../services/api'
import { getStudioCapabilities } from '../services/api'
import type { StudioAccessFields } from '../lib/studioAccessDerived'

type StudioAccessResult = StudioAccessFields & {
  isLoadingCapabilities: boolean
  capabilitiesError: boolean
}

const denyAll: StudioAccessFields = {
  role: null,
  isMember: false,
  isStudioAdmin: false,
  isStudioEditor: false,
  isPlatformAdmin: false,
  isCrossStudioViewer: false,
  canPublish: false,
  canManageProjectOutline: false,
  canEditSoftwareDefinition: false,
  canCreateProject: false,
  crossGrant: null,
}

/**
 * Studio-scoped permissions; optional ``softwareId`` resolves cross-studio grants on owner-studio URLs.
 *
 * When ``studioId`` is set, flags come from ``GET /studios/{id}/me/capabilities`` (server policy).
 * Without ``studioId``, a client-side fallback matches historical nav behavior.
 *
 * Product language (see ``frontend/src/lib/roleLabels.ts``): home-studio wire roles are
 * ``studio_admin`` (Studio Owner), ``studio_member`` (Studio Builder), ``studio_viewer`` (Studio Viewer).
 */
export function useStudioAccess(
  profile: MeResponse | undefined,
  studioId: string | undefined,
  softwareId?: string,
): StudioAccessResult {
  const roleRow =
    studioId && profile?.studios
      ? profile.studios.find((s) => s.studio_id === studioId)?.role ?? null
      : null
  const grantHint =
    studioId && softwareId && profile?.cross_studio_grants
      ? profile.cross_studio_grants.find(
          (g) =>
            g.owner_studio_id === studioId &&
            g.target_software_id === softwareId,
        )?.access_level ?? ''
      : ''

  const capsQuery = useQuery({
    queryKey: [
      'studioCapabilities',
      studioId ?? '',
      softwareId ?? '',
      profile?.user?.id ?? '',
      profile?.user?.is_platform_admin ?? false,
      roleRow ?? '',
      grantHint,
    ],
    queryFn: () => {
      if (import.meta.env.MODE === 'test') {
        return Promise.resolve(
          studioCapabilitiesOutFromProfile(
            profile as MeResponse,
            studioId!,
            softwareId,
          ),
        )
      }
      return getStudioCapabilities(studioId!, softwareId)
    },
    enabled: Boolean(studioId && profile?.user),
    retry: false,
  })

  return useMemo((): StudioAccessResult => {
    if (!profile?.user) {
      return {
        ...denyAll,
        isLoadingCapabilities: false,
        capabilitiesError: false,
      }
    }

    if (!studioId) {
      const d = deriveStudioAccessFromProfile(profile, studioId, softwareId)
      return {
        ...d,
        isLoadingCapabilities: false,
        capabilitiesError: false,
      }
    }

    if (capsQuery.isPending || capsQuery.isFetching) {
      return {
        ...denyAll,
        isLoadingCapabilities: true,
        capabilitiesError: false,
      }
    }

    if (capsQuery.isError || !capsQuery.data) {
      return {
        ...denyAll,
        isLoadingCapabilities: false,
        capabilitiesError: true,
      }
    }

    return {
      ...mapStudioCapabilitiesOutToFields(capsQuery.data),
      isLoadingCapabilities: false,
      capabilitiesError: false,
    }
  }, [
    profile,
    studioId,
    softwareId,
    capsQuery.data,
    capsQuery.isPending,
    capsQuery.isFetching,
    capsQuery.isError,
  ])
}
