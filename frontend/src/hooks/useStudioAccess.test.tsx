import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { MeResponse } from '../services/api'
import { useStudioAccess } from './useStudioAccess'

function profile(partial: Partial<MeResponse> & Pick<MeResponse, 'user' | 'studios'>): MeResponse {
  return {
    ...partial,
    cross_studio_grants: partial.cross_studio_grants ?? [],
  }
}

describe('useStudioAccess', () => {
  const studioId = 'st1'
  const softwareId = 'sw1'

  it('canEditSoftwareDefinition: studio_admin is true', () => {
    const p = profile({
      user: {
        id: 'u1',
        email: 'a@b.com',
        display_name: 'A',
        is_tool_admin: false,
      },
      studios: [{ studio_id: studioId, studio_name: 'S', role: 'studio_admin' }],
    })
    const { result } = renderHook(() =>
      useStudioAccess(p, studioId, softwareId),
    )
    expect(result.current.canEditSoftwareDefinition).toBe(true)
  })

  it('canEditSoftwareDefinition: studio_member is false', () => {
    const p = profile({
      user: {
        id: 'u1',
        email: 'a@b.com',
        display_name: 'A',
        is_tool_admin: false,
      },
      studios: [{ studio_id: studioId, studio_name: 'S', role: 'studio_member' }],
    })
    const { result } = renderHook(() =>
      useStudioAccess(p, studioId, softwareId),
    )
    expect(result.current.canEditSoftwareDefinition).toBe(false)
  })

  it('canEditSoftwareDefinition: studio_viewer is false', () => {
    const p = profile({
      user: {
        id: 'u1',
        email: 'a@b.com',
        display_name: 'A',
        is_tool_admin: false,
      },
      studios: [{ studio_id: studioId, studio_name: 'S', role: 'studio_viewer' }],
    })
    const { result } = renderHook(() =>
      useStudioAccess(p, studioId, softwareId),
    )
    expect(result.current.canEditSoftwareDefinition).toBe(false)
  })

  it('canEditSoftwareDefinition: tool admin is true', () => {
    const p = profile({
      user: {
        id: 'u1',
        email: 'a@b.com',
        display_name: 'A',
        is_tool_admin: true,
      },
      studios: [],
    })
    const { result } = renderHook(() =>
      useStudioAccess(p, studioId, softwareId),
    )
    expect(result.current.canEditSoftwareDefinition).toBe(true)
  })

  it('canEditSoftwareDefinition: cross-studio external_editor grant is false', () => {
    const p = profile({
      user: {
        id: 'u1',
        email: 'a@b.com',
        display_name: 'A',
        is_tool_admin: false,
      },
      studios: [],
      cross_studio_grants: [
        {
          grant_id: 'g1',
          target_software_id: softwareId,
          owner_studio_id: studioId,
          owner_studio_name: 'Owner S',
          software_name: 'SW',
          access_level: 'external_editor',
        },
      ],
    })
    const { result } = renderHook(() =>
      useStudioAccess(p, studioId, softwareId),
    )
    expect(result.current.canEditSoftwareDefinition).toBe(false)
  })
})
