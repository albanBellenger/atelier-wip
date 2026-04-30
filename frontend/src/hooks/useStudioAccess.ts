import { useMemo } from 'react'
import type { MeResponse } from '../services/api'

/** Studio-scoped permissions from /auth/me membership row + tool-admin override. */
export function useStudioAccess(
  profile: MeResponse | undefined,
  studioId: string | undefined,
): {
  role: string | null
  isMember: boolean
  isStudioAdmin: boolean
  isStudioEditor: boolean
  isToolAdmin: boolean
} {
  return useMemo(() => {
    const isToolAdmin = profile?.user.is_tool_admin ?? false
    const row = profile?.studios.find((s) => s.studio_id === studioId)
    const role = row?.role ?? null
    const isMember = isToolAdmin || Boolean(row)
    const isStudioAdmin = isToolAdmin || role === 'studio_admin'
    const isStudioEditor =
      isToolAdmin ||
      role === 'studio_admin' ||
      role === 'studio_member'
    return {
      role,
      isMember,
      isStudioAdmin,
      isStudioEditor,
      isToolAdmin,
    }
  }, [profile, studioId])
}
