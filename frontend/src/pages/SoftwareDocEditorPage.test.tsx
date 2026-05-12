import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as api from '../services/api'
import { SoftwareDocEditorPage } from './SoftwareDocEditorPage'

vi.mock('../hooks/useStudioAccess', () => ({
  useStudioAccess: () => ({
    role: 'studio_viewer',
    isMember: true,
    isStudioAdmin: false,
    isStudioEditor: false,
    isPlatformAdmin: false,
    isCrossStudioViewer: false,
    canPublish: false,
    canManageProjectOutline: false,
    canEditSoftwareDefinition: false,
    canCreateProject: false,
    isLoadingCapabilities: false,
    capabilitiesError: false,
    crossGrant: null,
  }),
}))

const viewerMe: api.MeResponse = {
  user: {
    id: 'u-v',
    email: 'v@v.com',
    display_name: 'Viewer',
    is_platform_admin: false,
  },
  studios: [{ studio_id: 's1', studio_name: 'S', role: 'studio_viewer' }],
  cross_studio_grants: [],
}

function wrap(path: string): ReactElement {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route
            path="/studios/:studioId/software/:softwareId/docs/:sectionId"
            element={<SoftwareDocEditorPage />}
          />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  )
}

describe('SoftwareDocEditorPage backprop controls', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not render Draft from codebase for viewers', async () => {
    vi.spyOn(api, 'me').mockResolvedValue(viewerMe)
    vi.spyOn(api, 'getSoftwareDocsSection').mockResolvedValue({
      id: 'sec1',
      project_id: null,
      software_id: 'sw1',
      title: 'T',
      slug: 't',
      order: 0,
      content: 'Hi',
      status: 'ready',
      open_issue_count: 0,
      outline_health: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    })
    vi.spyOn(api, 'listCodebaseSnapshots').mockResolvedValue([
      {
        id: '1',
        software_id: 'sw1',
        commit_sha: 'a'.repeat(40),
        branch: 'main',
        status: 'ready',
        error_message: null,
        created_at: '2026-01-01T00:00:00Z',
        ready_at: '2026-01-01T00:00:00Z',
        file_count: 1,
        chunk_count: 1,
      },
    ])
    vi.spyOn(api, 'getSoftware').mockResolvedValue({
      id: 'sw1',
      studio_id: 's1',
      name: 'SW',
      description: null,
      definition: null,
      git_provider: 'gitlab',
      git_repo_url: null,
      git_branch: 'main',
      git_token_set: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    })
    vi.spyOn(api, 'listSoftware').mockResolvedValue([])

    render(wrap('/studios/s1/software/sw1/docs/sec1'))
    await screen.findByRole('heading', { level: 1, name: 'T' })
    expect(screen.queryByRole('button', { name: /draft from codebase/i })).toBeNull()
  })
})
