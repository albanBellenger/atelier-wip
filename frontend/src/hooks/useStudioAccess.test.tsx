import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { MeResponse } from '../services/api'
import { useStudioAccess } from './useStudioAccess'

function wrapper(qc: QueryClient) {
  return function W({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

function profile(partial: Partial<MeResponse> & Pick<MeResponse, 'user' | 'studios'>): MeResponse {
  return {
    ...partial,
    cross_studio_grants: partial.cross_studio_grants ?? [],
  }
}

describe('useStudioAccess', () => {
  const studioId = 'st1'
  const softwareId = 'sw1'

  it('canEditSoftwareDefinition: studio_admin is true', async () => {
    const p = profile({
      user: {
        id: 'u1',
        email: 'a@b.com',
        display_name: 'A',
        is_platform_admin: false,
      },
      studios: [{ studio_id: studioId, studio_name: 'S', role: 'studio_admin' }],
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result } = renderHook(() =>
      useStudioAccess(p, studioId, softwareId),
      { wrapper: wrapper(qc) },
    )
    await waitFor(() => {
      expect(result.current.isLoadingCapabilities).toBe(false)
      expect(result.current.canEditSoftwareDefinition).toBe(true)
    })
  })

  it('canEditSoftwareDefinition: studio_member is false', async () => {
    const p = profile({
      user: {
        id: 'u1',
        email: 'a@b.com',
        display_name: 'A',
        is_platform_admin: false,
      },
      studios: [{ studio_id: studioId, studio_name: 'S', role: 'studio_member' }],
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result } = renderHook(() =>
      useStudioAccess(p, studioId, softwareId),
      { wrapper: wrapper(qc) },
    )
    await waitFor(() => {
      expect(result.current.isLoadingCapabilities).toBe(false)
      expect(result.current.canEditSoftwareDefinition).toBe(false)
      expect(result.current.isStudioViewer).toBe(false)
    })
  })

  it('canEditSoftwareDefinition: studio_viewer is false', async () => {
    const p = profile({
      user: {
        id: 'u1',
        email: 'a@b.com',
        display_name: 'A',
        is_platform_admin: false,
      },
      studios: [{ studio_id: studioId, studio_name: 'S', role: 'studio_viewer' }],
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result } = renderHook(() =>
      useStudioAccess(p, studioId, softwareId),
      { wrapper: wrapper(qc) },
    )
    await waitFor(() => {
      expect(result.current.isLoadingCapabilities).toBe(false)
      expect(result.current.canEditSoftwareDefinition).toBe(false)
      expect(result.current.isStudioViewer).toBe(true)
    })
  })

  it('canEditSoftwareDefinition: platform admin is true', async () => {
    const p = profile({
      user: {
        id: 'u1',
        email: 'a@b.com',
        display_name: 'A',
        is_platform_admin: true,
      },
      studios: [],
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result } = renderHook(() =>
      useStudioAccess(p, studioId, softwareId),
      { wrapper: wrapper(qc) },
    )
    await waitFor(() => {
      expect(result.current.isLoadingCapabilities).toBe(false)
      expect(result.current.canEditSoftwareDefinition).toBe(true)
    })
  })

  it('canEditSoftwareDefinition: cross-studio external_editor grant is false', async () => {
    const p = profile({
      user: {
        id: 'u1',
        email: 'a@b.com',
        display_name: 'A',
        is_platform_admin: false,
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
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result } = renderHook(() =>
      useStudioAccess(p, studioId, softwareId),
      { wrapper: wrapper(qc) },
    )
    await waitFor(() => {
      expect(result.current.isLoadingCapabilities).toBe(false)
      expect(result.current.canEditSoftwareDefinition).toBe(false)
    })
  })
})
