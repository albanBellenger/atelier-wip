import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import * as api from '../../services/api'
import { ProjectPage } from '../../pages/ProjectPage'

function mockProjectLandingApis(): void {
  vi.spyOn(api, 'listMeNotifications').mockResolvedValue({
    items: [],
    next_cursor: null,
  })
  const softwareRow: api.Software = {
    id: 'sw1',
    studio_id: 's1',
    name: 'SW',
    description: null,
    definition: null,
    git_provider: 'gitlab',
    git_repo_url: null,
    git_branch: 'main',
    git_token_set: false,
    created_at: '',
    updated_at: '',
  }
  vi.spyOn(api, 'getSoftware').mockResolvedValue(softwareRow)
  vi.spyOn(api, 'listSoftware').mockResolvedValue([softwareRow])
  vi.spyOn(api, 'listProjects').mockResolvedValue([
    {
      id: 'p1',
      software_id: 'sw1',
      name: 'Proj',
      description: null,
      publish_folder_slug: 'proj',
      archived: false,
      created_at: '',
      updated_at: '',
      work_orders_done: 0,
      work_orders_total: 0,
      sections_count: 1,
      last_edited_at: null,
      sections: null,
    },
  ])
  vi.spyOn(api, 'getProjectAttention').mockResolvedValue({
    studio_id: 's1',
    software_id: 'sw1',
    project_id: 'p1',
    counts: { all: 0, conflict: 0, drift: 0, gap: 0, update: 0 },
    items: [],
  })
  vi.spyOn(api, 'listWorkOrders').mockResolvedValue([])
  vi.spyOn(api, 'listProjectIssues').mockResolvedValue([])
  vi.spyOn(api, 'getSoftwareActivity').mockResolvedValue({ items: [] })
  vi.spyOn(api, 'listSoftwareArtifacts').mockResolvedValue([])
  vi.spyOn(api, 'listMembers').mockResolvedValue([])
  vi.spyOn(api, 'getMeTokenUsage').mockResolvedValue({
    rows: [],
    totals: {
      input_tokens: 0,
      output_tokens: 0,
      estimated_cost_usd: '0',
    },
  })
}

describe('ProjectPage publish success', () => {
  beforeEach(() => {
    vi.spyOn(window, 'alert').mockImplementation(() => {})
    mockProjectLandingApis()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows toast commit link and does not call window.alert', async () => {
    const user = userEvent.setup()
    const publishSpy = vi.spyOn(api, 'publishProject').mockResolvedValue({
      commit_url: 'https://gitlab.example.com/commit/abc',
      files_committed: 3,
    })
    vi.spyOn(api, 'me').mockResolvedValue({
      user: {
        id: 'u1',
        email: 'a@b.com',
        display_name: 'A',
        is_platform_admin: false,
      },
      studios: [
        { studio_id: 's1', studio_name: 'S', role: 'studio_member' },
      ],
      cross_studio_grants: [],
    })
    vi.spyOn(api, 'getProject').mockResolvedValue({
      id: 'p1',
      software_id: 'sw1',
      name: 'Proj',
      description: null,
      publish_folder_slug: 'proj',
      archived: false,
      created_at: '',
      updated_at: '',
      work_orders_done: 0,
      work_orders_total: 0,
      sections_count: 1,
      last_edited_at: '2026-05-01T12:00:00.000Z',
      sections: [
        {
          id: 'sec1',
          title: 'Intro',
          slug: 'intro',
          order: 0,
          status: 'ready',
          updated_at: '2026-05-01T12:00:00.000Z',
        },
      ],
    })

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <>
        <Toaster />
        <MemoryRouter
          initialEntries={['/studios/s1/software/sw1/projects/p1']}
        >
          <QueryClientProvider client={qc}>
            <Routes>
              <Route
                path="/studios/:studioId/software/:softwareId/projects/:projectId"
                element={<ProjectPage />}
              />
            </Routes>
          </QueryClientProvider>
        </MemoryRouter>
      </>,
    )

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /publish to gitlab/i }),
      ).toBeInTheDocument()
    })

    expect(screen.getByText(/Atelier · Builder workspace/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /publish to gitlab/i }))
    await user.click(
      screen.getByRole('button', { name: 'Confirm publish to GitLab' }),
    )

    await waitFor(() => {
      expect(publishSpy).toHaveBeenCalledWith('p1', { commit_message: null })
    })

    const link = await screen.findByRole('link', { name: /view commit/i })
    expect(link).toHaveAttribute('href', 'https://gitlab.example.com/commit/abc')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noreferrer')

    expect(window.alert).not.toHaveBeenCalled()
  })
})

describe('ProjectPage outline status pills (Slice A)', () => {
  beforeEach(() => {
    mockProjectLandingApis()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows section status pills when API returns section.status', async () => {
    vi.spyOn(api, 'me').mockResolvedValue({
      user: {
        id: 'u1',
        email: 'a@b.com',
        display_name: 'A',
        is_platform_admin: false,
      },
      studios: [
        { studio_id: 's1', studio_name: 'S', role: 'studio_member' },
      ],
      cross_studio_grants: [],
    })
    vi.spyOn(api, 'getProject').mockResolvedValue({
      id: 'p1',
      software_id: 'sw1',
      name: 'Proj',
      description: null,
      publish_folder_slug: 'proj',
      archived: false,
      created_at: '',
      updated_at: '',
      work_orders_done: 0,
      work_orders_total: 0,
      sections_count: 2,
      last_edited_at: '2026-05-01T12:00:00.000Z',
      sections: [
        {
          id: 'sec1',
          title: 'Intro',
          slug: 'intro',
          order: 0,
          status: 'ready',
          updated_at: '2026-05-01T12:00:00.000Z',
        },
        {
          id: 'sec2',
          title: 'API',
          slug: 'api',
          order: 1,
          status: 'gaps',
          updated_at: '2026-05-01T11:00:00.000Z',
        },
      ],
    })

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <MemoryRouter
        initialEntries={['/studios/s1/software/sw1/projects/p1']}
      >
        <QueryClientProvider client={qc}>
          <Routes>
            <Route
              path="/studios/:studioId/software/:softwareId/projects/:projectId"
              element={<ProjectPage />}
            />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('section-status-pill-ready')).toBeInTheDocument()
    })
    expect(screen.getByTestId('section-status-pill-gaps')).toBeInTheDocument()
  })
})

describe('ProjectPage landing layout', () => {
  beforeEach(() => {
    mockProjectLandingApis()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows project hero title and software/project breadcrumbs', async () => {
    vi.spyOn(api, 'me').mockResolvedValue({
      user: {
        id: 'u1',
        email: 'a@b.com',
        display_name: 'A',
        is_platform_admin: false,
      },
      studios: [
        { studio_id: 's1', studio_name: 'Northwind', role: 'studio_member' },
      ],
      cross_studio_grants: [],
    })
    vi.spyOn(api, 'getProject').mockResolvedValue({
      id: 'p1',
      software_id: 'sw1',
      name: 'v2.0 Redesign',
      description: 'Ship the new portal.',
      archived: false,
      publish_folder_slug: 'v2',
      created_at: '',
      updated_at: '',
      work_orders_done: 1,
      work_orders_total: 3,
      sections_count: 1,
      last_edited_at: null,
      sections: [
        {
          id: 'sec1',
          title: 'Intro',
          slug: 'intro',
          order: 0,
          status: 'ready',
          updated_at: '',
        },
      ],
    })

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <MemoryRouter
        initialEntries={['/studios/s1/software/sw1/projects/p1']}
      >
        <QueryClientProvider client={qc}>
          <Routes>
            <Route
              path="/studios/:studioId/software/:softwareId/projects/:projectId"
              element={<ProjectPage />}
            />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: 'v2.0 Redesign' }),
      ).toBeInTheDocument()
    })

    const header = screen.getByRole('banner')
    expect(within(header).getByText('SW')).toBeInTheDocument()
    expect(within(header).getByText('v2.0 Redesign')).toBeInTheDocument()
    expect(screen.getByText('Ship the new portal.')).toBeInTheDocument()
  })

  it('does not show publish for studio viewers', async () => {
    vi.spyOn(api, 'me').mockResolvedValue({
      user: {
        id: 'u1',
        email: 'a@b.com',
        display_name: 'A',
        is_platform_admin: false,
      },
      studios: [
        { studio_id: 's1', studio_name: 'S', role: 'studio_viewer' },
      ],
      cross_studio_grants: [],
    })
    vi.spyOn(api, 'getProject').mockResolvedValue({
      id: 'p1',
      software_id: 'sw1',
      name: 'Proj',
      description: null,
      publish_folder_slug: 'proj',
      archived: false,
      created_at: '',
      updated_at: '',
      work_orders_done: 0,
      work_orders_total: 0,
      sections_count: 0,
      last_edited_at: null,
      sections: [],
    })

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <MemoryRouter
        initialEntries={['/studios/s1/software/sw1/projects/p1']}
      >
        <QueryClientProvider client={qc}>
          <Routes>
            <Route
              path="/studios/:studioId/software/:softwareId/projects/:projectId"
              element={<ProjectPage />}
            />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Proj' })).toBeInTheDocument()
    })

    expect(
      screen.queryByRole('button', { name: /publish to gitlab/i }),
    ).toBeNull()
  })

  it('shows Project settings link for a Studio Owner', async () => {
    vi.spyOn(api, 'me').mockResolvedValue({
      user: {
        id: 'u1',
        email: 'a@b.com',
        display_name: 'A',
        is_platform_admin: false,
      },
      studios: [
        { studio_id: 's1', studio_name: 'S', role: 'studio_admin' },
      ],
      cross_studio_grants: [],
    })
    vi.spyOn(api, 'getProject').mockResolvedValue({
      id: 'p1',
      software_id: 'sw1',
      name: 'Proj',
      description: null,
      publish_folder_slug: 'proj',
      archived: false,
      created_at: '',
      updated_at: '',
      work_orders_done: 0,
      work_orders_total: 0,
      sections_count: 0,
      last_edited_at: null,
      sections: [],
    })

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <MemoryRouter
        initialEntries={['/studios/s1/software/sw1/projects/p1']}
      >
        <QueryClientProvider client={qc}>
          <Routes>
            <Route
              path="/studios/:studioId/software/:softwareId/projects/:projectId"
              element={<ProjectPage />}
            />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Proj' })).toBeInTheDocument()
    })

    const settings = screen.getByRole('link', { name: 'Open project settings' })
    expect(settings).toHaveAttribute(
      'href',
      '/studios/s1/software/sw1/projects/p1/settings',
    )
  })

  it('does not show Project settings link for a Builder', async () => {
    vi.spyOn(api, 'me').mockResolvedValue({
      user: {
        id: 'u1',
        email: 'a@b.com',
        display_name: 'A',
        is_platform_admin: false,
      },
      studios: [
        { studio_id: 's1', studio_name: 'S', role: 'studio_member' },
      ],
      cross_studio_grants: [],
    })
    vi.spyOn(api, 'getProject').mockResolvedValue({
      id: 'p1',
      software_id: 'sw1',
      name: 'Proj',
      description: null,
      publish_folder_slug: 'proj',
      archived: false,
      created_at: '',
      updated_at: '',
      work_orders_done: 0,
      work_orders_total: 0,
      sections_count: 0,
      last_edited_at: null,
      sections: [],
    })

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <MemoryRouter
        initialEntries={['/studios/s1/software/sw1/projects/p1']}
      >
        <QueryClientProvider client={qc}>
          <Routes>
            <Route
              path="/studios/:studioId/software/:softwareId/projects/:projectId"
              element={<ProjectPage />}
            />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Proj' })).toBeInTheDocument()
    })

    expect(
      screen.queryByRole('link', { name: 'Open project settings' }),
    ).not.toBeInTheDocument()
  })
})

describe('ProjectPage aggregated artifacts', () => {
  beforeEach(() => {
    mockProjectLandingApis()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('requests software artifacts with forProjectId and lists a row', async () => {
    vi.spyOn(api, 'me').mockResolvedValue({
      user: {
        id: 'u1',
        email: 'a@b.com',
        display_name: 'A',
        is_platform_admin: false,
      },
      studios: [
        { studio_id: 's1', studio_name: 'S', role: 'studio_member' },
      ],
      cross_studio_grants: [],
    })
    vi.spyOn(api, 'getProject').mockResolvedValue({
      id: 'p1',
      software_id: 'sw1',
      name: 'Proj',
      description: null,
      publish_folder_slug: 'proj',
      archived: false,
      created_at: '',
      updated_at: '',
      work_orders_done: 0,
      work_orders_total: 0,
      sections_count: 1,
      last_edited_at: null,
      sections: [
        {
          id: 'sec1',
          title: 'Intro',
          slug: 'intro',
          order: 0,
          status: 'ready',
          updated_at: '',
        },
      ],
    })

    const listSpy = vi.mocked(api.listSoftwareArtifacts)
    listSpy.mockResolvedValue([
      {
        id: 'a1',
        project_id: 'p1',
        project_name: 'Proj',
        name: 'Handbook.pdf',
        file_type: 'pdf',
        size_bytes: 2048,
        uploaded_by: 'u1',
        uploaded_by_display: 'A',
        created_at: '2026-01-01T00:00:00Z',
        scope_level: 'software',
        excluded_at_software: null,
        excluded_at_project: null,
      },
    ])

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <MemoryRouter
        initialEntries={['/studios/s1/software/sw1/projects/p1']}
      >
        <QueryClientProvider client={qc}>
          <Routes>
            <Route
              path="/studios/:studioId/software/:softwareId/projects/:projectId"
              element={<ProjectPage />}
            />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledWith('sw1', { forProjectId: 'p1' })
    })

    await waitFor(() => {
      expect(screen.getByText('Handbook.pdf')).toBeInTheDocument()
    })

    expect(
      screen.getByRole('heading', { name: /^artifacts$/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^upload file$/i }),
    ).toBeInTheDocument()
  })

  it('does not show upload for studio viewers', async () => {
    vi.spyOn(api, 'me').mockResolvedValue({
      user: {
        id: 'u1',
        email: 'a@b.com',
        display_name: 'A',
        is_platform_admin: false,
      },
      studios: [
        { studio_id: 's1', studio_name: 'S', role: 'studio_viewer' },
      ],
      cross_studio_grants: [],
    })
    vi.spyOn(api, 'getProject').mockResolvedValue({
      id: 'p1',
      software_id: 'sw1',
      name: 'Proj',
      description: null,
      publish_folder_slug: 'proj',
      archived: false,
      created_at: '',
      updated_at: '',
      work_orders_done: 0,
      work_orders_total: 0,
      sections_count: 0,
      last_edited_at: null,
      sections: [],
    })

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <MemoryRouter
        initialEntries={['/studios/s1/software/sw1/projects/p1']}
      >
        <QueryClientProvider client={qc}>
          <Routes>
            <Route
              path="/studios/:studioId/software/:softwareId/projects/:projectId"
              element={<ProjectPage />}
            />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /^artifacts$/i }),
      ).toBeInTheDocument()
    })

    expect(
      screen.queryByRole('button', { name: /^upload file$/i }),
    ).not.toBeInTheDocument()
  })
})
