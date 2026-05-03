import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as api from '../services/api'
import { ArtifactLibraryPage } from './ArtifactLibraryPage'

afterEach(() => {
  vi.restoreAllMocks()
})

const editorMe: api.MeResponse = {
  user: {
    id: 'u1',
    email: 'e@b.com',
    display_name: 'Editor',
    is_tool_admin: false,
  },
  studios: [{ studio_id: 's1', studio_name: 'S', role: 'studio_member' }],
  cross_studio_grants: [],
}

const viewerMe: api.MeResponse = {
  user: {
    id: 'u2',
    email: 'v@b.com',
    display_name: 'Viewer',
    is_tool_admin: false,
  },
  studios: [{ studio_id: 's1', studio_name: 'S', role: 'studio_viewer' }],
  cross_studio_grants: [],
}

function renderLibrary(path = '/studios/s1/artifact-library') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route
            path="/studios/:studioId/artifact-library"
            element={<ArtifactLibraryPage />}
          />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('ArtifactLibraryPage', () => {
  it('lists rows from the artifact library API', async () => {
    vi.spyOn(api, 'me').mockResolvedValue(editorMe)
    vi.spyOn(api, 'getStudio').mockResolvedValue({
      id: 's1',
      name: 'Studio One',
      description: null,
      logo_path: null,
      created_at: '2026-01-01T00:00:00Z',
    })
    vi.spyOn(api, 'listSoftware').mockResolvedValue([])
    vi.spyOn(api, 'listStudioProjects').mockResolvedValue([])
    vi.spyOn(api, 'listArtifactLibrary').mockResolvedValue([
      {
        id: 'a1',
        project_id: 'p1',
        project_name: 'P1',
        name: 'Spec.pdf',
        file_type: 'pdf',
        size_bytes: 1200,
        uploaded_by: 'u1',
        uploaded_by_display: 'Editor',
        created_at: '2026-01-02T00:00:00Z',
        scope_level: 'project',
        excluded_at_software: null,
        excluded_at_project: null,
        software_id: 'sw1',
        software_name: 'SW',
      },
    ])

    renderLibrary()

    await waitFor(() => {
      expect(screen.getByText('Spec.pdf')).toBeInTheDocument()
    })
    expect(api.listArtifactLibrary).toHaveBeenCalledWith('s1', {
      softwareId: undefined,
    })
  })

  it('passes softwareId from the query string to the library API', async () => {
    vi.spyOn(api, 'me').mockResolvedValue(editorMe)
    vi.spyOn(api, 'getStudio').mockResolvedValue({
      id: 's1',
      name: 'Studio One',
      description: null,
      logo_path: null,
      created_at: '2026-01-01T00:00:00Z',
    })
    vi.spyOn(api, 'listSoftware').mockResolvedValue([
      {
        id: 'sw9',
        studio_id: 's1',
        name: 'SW9',
        description: null,
        definition: null,
        git_provider: 'gitlab',
        git_repo_url: null,
        git_branch: 'main',
        git_token_set: false,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ])
    vi.spyOn(api, 'listStudioProjects').mockResolvedValue([])
    vi.spyOn(api, 'listArtifactLibrary').mockResolvedValue([])

    renderLibrary('/studios/s1/artifact-library?softwareId=sw9')

    await waitFor(() => {
      expect(api.listArtifactLibrary).toHaveBeenCalledWith('s1', {
        softwareId: 'sw9',
      })
    })
  })

  it('does not show upload controls for a studio viewer', async () => {
    vi.spyOn(api, 'me').mockResolvedValue(viewerMe)
    vi.spyOn(api, 'getStudio').mockResolvedValue({
      id: 's1',
      name: 'Studio One',
      description: null,
      logo_path: null,
      created_at: '2026-01-01T00:00:00Z',
    })
    vi.spyOn(api, 'listSoftware').mockResolvedValue([])
    vi.spyOn(api, 'listStudioProjects').mockResolvedValue([])
    vi.spyOn(api, 'listArtifactLibrary').mockResolvedValue([])

    renderLibrary()

    await waitFor(() => {
      expect(
        screen.getByText(/view only — uploads require studio editor access/i),
      ).toBeInTheDocument()
    })
    expect(screen.queryByRole('heading', { name: /^upload$/i })).not.toBeInTheDocument()
  })
})
