import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '../../services/api'
import { IssuesPage } from '../../pages/IssuesPage'

function mockHeaderNavApis(): void {
  const t = new Date().toISOString()
  vi.spyOn(api, 'getSoftware').mockResolvedValue({
    id: 'sw1',
    studio_id: 's1',
    name: 'SW',
    description: null,
    definition: null,
    git_provider: null,
    git_repo_url: null,
    git_branch: null,
    git_token_set: false,
    created_at: t,
    updated_at: t,
  })
  vi.spyOn(api, 'getProject').mockResolvedValue({
    id: 'p1',
    software_id: 'sw1',
    name: 'P',
    description: null,
    publish_folder_slug: 'pub',
    archived: false,
    created_at: t,
    updated_at: t,
    sections: [],
    work_orders_done: 0,
    work_orders_total: 0,
    sections_count: 0,
    last_edited_at: null,
  })
  vi.spyOn(api, 'listSoftware').mockResolvedValue([
    {
      id: 'sw1',
      studio_id: 's1',
      name: 'SW',
      description: null,
      definition: null,
      git_provider: null,
      git_repo_url: null,
      git_branch: null,
      git_token_set: false,
      created_at: t,
      updated_at: t,
    },
  ])
  vi.spyOn(api, 'listProjects').mockResolvedValue([
    {
      id: 'p1',
      software_id: 'sw1',
      name: 'P',
      description: null,
      publish_folder_slug: 'pub',
      archived: false,
      created_at: t,
      updated_at: t,
      sections: [],
      work_orders_done: 0,
      work_orders_total: 0,
      sections_count: 0,
      last_edited_at: null,
    },
  ])
  vi.spyOn(api, 'logout').mockResolvedValue(undefined)
}

describe('IssuesPage', () => {
  beforeEach(() => {
    mockHeaderNavApis()
    vi.spyOn(api, 'listProjectIssues').mockResolvedValue([])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows Issues title and builder footer', async () => {
    vi.spyOn(api, 'me').mockResolvedValue({
      user: {
        id: 'u1',
        email: 'm@b.com',
        display_name: 'M',
        is_platform_admin: false,
      },
      studios: [
        { studio_id: 's1', studio_name: 'S', role: 'studio_member' },
      ],
    })

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <MemoryRouter
        initialEntries={['/studios/s1/software/sw1/projects/p1/issues']}
      >
        <QueryClientProvider client={qc}>
          <Routes>
            <Route
              path="/studios/:studioId/software/:softwareId/projects/:projectId/issues"
              element={<IssuesPage />}
            />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Issues' })).toBeInTheDocument()
    expect(screen.getByText(/Atelier · Builder workspace/i)).toBeInTheDocument()
  })

  it('viewer cannot see Run analysis', async () => {
    vi.spyOn(api, 'me').mockResolvedValue({
      user: {
        id: 'u1',
        email: 'v@b.com',
        display_name: 'V',
        is_platform_admin: false,
      },
      studios: [
        { studio_id: 's1', studio_name: 'S', role: 'studio_viewer' },
      ],
    })

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <MemoryRouter
        initialEntries={['/studios/s1/software/sw1/projects/p1/issues']}
      >
        <QueryClientProvider client={qc}>
          <Routes>
            <Route
              path="/studios/:studioId/software/:softwareId/projects/:projectId/issues"
              element={<IssuesPage />}
            />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Issues' })).toBeInTheDocument()
    })

    expect(
      screen.queryByRole('button', { name: 'Run analysis' }),
    ).toBeNull()
  })
})
