import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as api from '../services/api'
import { SoftwarePage } from './SoftwarePage'

afterEach(() => {
  vi.restoreAllMocks()
})

function mockSoftwareRow(id: string, name: string): api.Software {
  return {
    id,
    studio_id: 's1',
    name,
    description: null,
    definition: null,
    git_provider: 'gitlab',
    git_repo_url: null,
    git_branch: 'main',
    git_token_set: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

const memberMe: api.MeResponse = {
  user: {
    id: 'u1',
    email: 'm@b.com',
    display_name: 'Member',
    is_platform_admin: false,
  },
  studios: [{ studio_id: 's1', studio_name: 'S', role: 'studio_member' }],
  cross_studio_grants: [],
}

function renderSoftware(path = '/studios/s1/software/sw1') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route
            path="/studios/:studioId/software/:softwareId"
            element={<SoftwarePage />}
          />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
  return qc
}

describe('SoftwarePage', () => {
  it('shows Commit to GitLab and workspace panels for a Builder', async () => {
    vi.spyOn(api, 'listMeNotifications').mockResolvedValue({
      items: [],
      next_cursor: null,
    })
    vi.spyOn(api, 'listSoftwareArtifacts').mockResolvedValue([])
    vi.spyOn(api, 'listStudioArtifacts').mockResolvedValue([])
    vi.spyOn(api, 'me').mockResolvedValue(memberMe)
    vi.spyOn(api, 'getSoftware').mockResolvedValue({
      id: 'sw1',
      studio_id: 's1',
      name: 'My SW',
      description: 'Desc',
      definition: '# Context\nYou are assisting.',
      git_provider: 'gitlab',
      git_repo_url: 'https://gitlab.example.com/g/r',
      git_branch: 'main',
      git_token_set: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    })
    vi.spyOn(api, 'listProjects').mockResolvedValue([
      {
        id: 'p1',
        software_id: 'sw1',
        name: 'P1',
        description: null,
        publish_folder_slug: 'p1',
        archived: false,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        sections: null,
        work_orders_done: 0,
        work_orders_total: 0,
        sections_count: 0,
        last_edited_at: null,
      },
    ])
    vi.spyOn(api, 'getSoftwareAttention').mockResolvedValue({
      studio_id: 's1',
      software_id: 'sw1',
      counts: { all: 0, conflict: 0, drift: 0, gap: 0, update: 0 },
      items: [],
    })
    vi.spyOn(api, 'getSoftwareActivity').mockResolvedValue({ items: [] })
    vi.spyOn(api, 'getMeTokenUsage').mockResolvedValue({
      rows: [],
      totals: {
        input_tokens: 1000,
        output_tokens: 500,
        estimated_cost_usd: '0.01',
      },
    })
    vi.spyOn(api, 'getSoftwareGitHistory').mockResolvedValue({ commits: [] })
    vi.spyOn(api, 'listMembers').mockResolvedValue([])
    vi.spyOn(api, 'listSoftware').mockResolvedValue([mockSoftwareRow('sw1', 'My SW')])

    renderSoftware()

    await waitFor(
      () => {
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
          'My SW',
        )
      },
      { timeout: 8000 },
    )
    expect(
      await screen.findByText('Atelier · Builder workspace'),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: /commit to gitlab/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^token usage$/i })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /software artifacts/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /studio artifacts/i }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^upload file$/i }).length).toBe(
      2,
    )
    expect(screen.getAllByRole('button', { name: /^new markdown$/i }).length).toBe(
      2,
    )
    const openLibraryLinks = screen.getAllByRole('link', {
      name: /open library/i,
    })
    expect(openLibraryLinks).toHaveLength(2)
    expect(openLibraryLinks[0]).toHaveAttribute(
      'href',
      '/studios/s1/artifact-library?softwareId=sw1',
    )
    expect(openLibraryLinks[1]).toHaveAttribute(
      'href',
      '/studios/s1/artifact-library',
    )
    expect(
      screen.queryByRole('link', { name: /software settings/i }),
    ).not.toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: /^projects$/i }),
    ).toBeInTheDocument()
    expect(screen.getByText('1 of 1')).toBeInTheDocument()
    expect(screen.getByText('current')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /building this software/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /^software definition$/i }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^edit$/i })).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^software chat$/i }),
    ).toBeInTheDocument()
    const defPre = screen
      .getByRole('heading', { name: /^software definition$/i })
      .closest('section')
      ?.querySelector('pre')
    expect(defPre?.textContent).toContain('# Context')
  })

  it('shows Software settings link for a Studio Owner', async () => {
    vi.spyOn(api, 'listMeNotifications').mockResolvedValue({
      items: [],
      next_cursor: null,
    })
    vi.spyOn(api, 'listSoftwareArtifacts').mockResolvedValue([])
    vi.spyOn(api, 'listStudioArtifacts').mockResolvedValue([])
    vi.spyOn(api, 'me').mockResolvedValue({
      user: {
        id: 'u3',
        email: 'adm@b.com',
        display_name: 'Admin',
        is_platform_admin: false,
      },
      studios: [{ studio_id: 's1', studio_name: 'S', role: 'studio_admin' }],
      cross_studio_grants: [],
    })
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
    vi.spyOn(api, 'listProjects').mockResolvedValue([
      {
        id: 'p1',
        software_id: 'sw1',
        name: 'P1',
        description: null,
        publish_folder_slug: 'p1',
        archived: false,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        sections: null,
        work_orders_done: 0,
        work_orders_total: 0,
        sections_count: 0,
        last_edited_at: null,
      },
    ])
    vi.spyOn(api, 'getSoftwareAttention').mockResolvedValue({
      studio_id: 's1',
      software_id: 'sw1',
      counts: { all: 0, conflict: 0, drift: 0, gap: 0, update: 0 },
      items: [],
    })
    vi.spyOn(api, 'getSoftwareActivity').mockResolvedValue({ items: [] })
    vi.spyOn(api, 'getSoftwareGitHistory').mockResolvedValue({ commits: [] })
    vi.spyOn(api, 'getMeTokenUsage').mockResolvedValue({
      rows: [],
      totals: {
        input_tokens: 0,
        output_tokens: 0,
        estimated_cost_usd: '0',
      },
    })
    vi.spyOn(api, 'listMembers').mockResolvedValue([])
    vi.spyOn(api, 'listSoftware').mockResolvedValue([mockSoftwareRow('sw1', 'SW')])

    renderSoftware()

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('SW')
    })
    expect(
      screen.getByRole('link', { name: /^manage →$/i }),
    ).toHaveAttribute('href', '/studios/s1/settings')
    expect(
      screen.getByRole('link', { name: /^edit$/i }),
    ).toHaveAttribute('href', '/studios/s1/software/sw1/settings')
    const settings = screen.getByRole('link', { name: /software settings/i })
    expect(settings).toHaveAttribute(
      'href',
      '/studios/s1/software/sw1/settings',
    )
  })

  it('lists archived projects when Show archived is toggled on', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'listMeNotifications').mockResolvedValue({
      items: [],
      next_cursor: null,
    })
    vi.spyOn(api, 'listSoftwareArtifacts').mockResolvedValue([])
    vi.spyOn(api, 'listStudioArtifacts').mockResolvedValue([])
    vi.spyOn(api, 'me').mockResolvedValue(memberMe)
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
    vi.spyOn(api, 'listProjects').mockResolvedValue([
      {
        id: 'p-active',
        software_id: 'sw1',
        name: 'Active only',
        description: 'Still going',
        publish_folder_slug: 'active-only',
        archived: false,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        sections: null,
        work_orders_done: 1,
        work_orders_total: 4,
        sections_count: 2,
        last_edited_at: '2026-01-02T00:00:00Z',
      },
      {
        id: 'p-arch',
        software_id: 'sw1',
        name: 'Z archived',
        description: 'Old',
        publish_folder_slug: 'z-archived',
        archived: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        sections: null,
        work_orders_done: 0,
        work_orders_total: 0,
        sections_count: 0,
        last_edited_at: null,
      },
    ])
    vi.spyOn(api, 'getSoftwareAttention').mockResolvedValue({
      studio_id: 's1',
      software_id: 'sw1',
      counts: { all: 0, conflict: 0, drift: 0, gap: 0, update: 0 },
      items: [],
    })
    vi.spyOn(api, 'getSoftwareActivity').mockResolvedValue({ items: [] })
    vi.spyOn(api, 'getMeTokenUsage').mockResolvedValue({
      rows: [],
      totals: {
        input_tokens: 0,
        output_tokens: 0,
        estimated_cost_usd: '0',
      },
    })
    vi.spyOn(api, 'getSoftwareGitHistory').mockResolvedValue({ commits: [] })
    vi.spyOn(api, 'listMembers').mockResolvedValue([])
    vi.spyOn(api, 'listSoftware').mockResolvedValue([mockSoftwareRow('sw1', 'SW')])

    renderSoftware()

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('SW')
    })
    expect(screen.getByText('1 of 2')).toBeInTheDocument()
    expect(screen.getByText('Active only')).toBeInTheDocument()
    expect(screen.queryByText('Z archived')).not.toBeInTheDocument()

    const toggle = screen.getByRole('switch', { name: /show archived/i })
    await user.click(toggle)

    expect(await screen.findByText('Z archived')).toBeInTheDocument()
  })

  it('omits Commit to GitLab when user cannot publish', async () => {
    vi.spyOn(api, 'listMeNotifications').mockResolvedValue({
      items: [],
      next_cursor: null,
    })
    vi.spyOn(api, 'listSoftwareArtifacts').mockResolvedValue([])
    vi.spyOn(api, 'listStudioArtifacts').mockResolvedValue([])
    vi.spyOn(api, 'me').mockResolvedValue({
      user: {
        id: 'u2',
        email: 'v@b.com',
        display_name: 'Viewer',
        is_platform_admin: false,
      },
      studios: [{ studio_id: 's1', studio_name: 'S', role: 'studio_viewer' }],
      cross_studio_grants: [],
    })
    vi.spyOn(api, 'getSoftware').mockResolvedValue({
      id: 'sw1',
      studio_id: 's1',
      name: 'SW',
      description: null,
      definition: 'Read-only definition body.',
      git_provider: 'gitlab',
      git_repo_url: null,
      git_branch: 'main',
      git_token_set: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    })
    vi.spyOn(api, 'listProjects').mockResolvedValue([
      {
        id: 'p1',
        software_id: 'sw1',
        name: 'P1',
        description: null,
        publish_folder_slug: 'p1',
        archived: false,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        sections: null,
        work_orders_done: 0,
        work_orders_total: 0,
        sections_count: 0,
        last_edited_at: null,
      },
    ])
    vi.spyOn(api, 'getSoftwareAttention').mockResolvedValue({
      studio_id: 's1',
      software_id: 'sw1',
      counts: { all: 0, conflict: 0, drift: 0, gap: 0, update: 0 },
      items: [],
    })
    vi.spyOn(api, 'getSoftwareActivity').mockResolvedValue({ items: [] })
    vi.spyOn(api, 'getSoftwareGitHistory').mockResolvedValue({ commits: [] })
    vi.spyOn(api, 'getMeTokenUsage').mockResolvedValue({
      rows: [],
      totals: {
        input_tokens: 0,
        output_tokens: 0,
        estimated_cost_usd: '0',
      },
    })
    vi.spyOn(api, 'listMembers').mockResolvedValue([
      {
        user_id: 'u2',
        email: 'v@b.com',
        display_name: 'Viewer',
        role: 'studio_viewer',
        joined_at: '2026-01-01T00:00:00Z',
      },
    ])
    vi.spyOn(api, 'listSoftware').mockResolvedValue([mockSoftwareRow('sw1', 'SW')])

    renderSoftware()

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('SW')
    })
    expect(
      screen.queryByRole('link', { name: /^manage →$/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /building this software/i }),
    ).toBeInTheDocument()
    expect(screen.getByText('v@b.com').closest('li')).toHaveTextContent('Viewer')
    expect(screen.getByText('v@b.com').closest('li')).toHaveTextContent('(you)')
    expect(
      screen.getByRole('heading', { name: /^software definition$/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /^edit$/i }),
    ).not.toBeInTheDocument()
    const viewerDefPre = screen
      .getByRole('heading', { name: /^software definition$/i })
      .closest('section')
      ?.querySelector('pre')
    expect(viewerDefPre?.textContent).toContain('Read-only definition')
    expect(
      screen.queryByRole('button', { name: /commit to gitlab/i }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^token usage$/i })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /software artifacts/i }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^upload file$/i })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /^new markdown$/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /software settings/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /\+ new project/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(/Activity is available to members who can manage projects/i),
    ).toBeInTheDocument()
  })

  it('shows artifact scope badge on software artifacts list', async () => {
    vi.spyOn(api, 'listMeNotifications').mockResolvedValue({
      items: [],
      next_cursor: null,
    })
    vi.spyOn(api, 'listSoftwareArtifacts').mockResolvedValue([
      {
        id: 'a1',
        project_id: 'p1',
        project_name: 'P1',
        name: 'Handbook',
        file_type: 'pdf',
        size_bytes: 100,
        uploaded_by: 'u1',
        uploaded_by_display: 'Member',
        created_at: '2026-01-01T00:00:00Z',
        scope_level: 'software',
        excluded_at_software: null,
        excluded_at_project: null,
      },
    ])
    vi.spyOn(api, 'listStudioArtifacts').mockResolvedValue([])
    vi.spyOn(api, 'me').mockResolvedValue(memberMe)
    vi.spyOn(api, 'getSoftware').mockResolvedValue({
      id: 'sw1',
      studio_id: 's1',
      name: 'My SW',
      description: 'Desc',
      definition: '# Context\nYou are assisting.',
      git_provider: 'gitlab',
      git_repo_url: 'https://gitlab.example.com/g/r',
      git_branch: 'main',
      git_token_set: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    })
    vi.spyOn(api, 'listProjects').mockResolvedValue([
      {
        id: 'p1',
        software_id: 'sw1',
        name: 'P1',
        description: null,
        publish_folder_slug: 'p1',
        archived: false,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        sections: null,
        work_orders_done: 0,
        work_orders_total: 0,
        sections_count: 0,
        last_edited_at: null,
      },
    ])
    vi.spyOn(api, 'getSoftwareAttention').mockResolvedValue({
      studio_id: 's1',
      software_id: 'sw1',
      counts: { all: 0, conflict: 0, drift: 0, gap: 0, update: 0 },
      items: [],
    })
    vi.spyOn(api, 'getSoftwareActivity').mockResolvedValue({ items: [] })
    vi.spyOn(api, 'getMeTokenUsage').mockResolvedValue({
      rows: [],
      totals: {
        input_tokens: 1000,
        output_tokens: 500,
        estimated_cost_usd: '0.01',
      },
    })
    vi.spyOn(api, 'getSoftwareGitHistory').mockResolvedValue({ commits: [] })
    vi.spyOn(api, 'listMembers').mockResolvedValue([])
    vi.spyOn(api, 'listSoftware').mockResolvedValue([mockSoftwareRow('sw1', 'My SW')])

    renderSoftware()

    await waitFor(() => {
      expect(screen.getByText('Handbook')).toBeInTheDocument()
    })
    const row = screen.getByText('Handbook').closest('li')
    expect(row?.innerHTML).toContain('border-violet-500/40')
  })
})
