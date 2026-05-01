import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import * as api from '../services/api'
import { HomePage } from './HomePage'

describe('HomePage', () => {
  it('shows builder workspace when authenticated', async () => {
    vi.spyOn(api, 'listMeNotifications').mockResolvedValue({
      items: [],
      next_cursor: null,
    })
    vi.spyOn(api, 'me').mockResolvedValue({
      user: {
        id: 'u1',
        email: 'a@b.com',
        display_name: 'Alex',
        is_tool_admin: false,
      },
      studios: [
        { studio_id: 's1', studio_name: 'Studio One', role: 'studio_member' },
      ],
      cross_studio_grants: [],
    })
    vi.spyOn(api, 'listSoftware').mockResolvedValue([])
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter initialEntries={['/']}>
        <QueryClientProvider client={qc}>
          <HomePage />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Atelier · Builder workspace')).toBeInTheDocument()
    expect(
      await screen.findByText(/no software in this studio yet/i),
    ).toBeInTheDocument()
  })

  it('viewer without studios sees empty membership state', async () => {
    vi.spyOn(api, 'listMeNotifications').mockResolvedValue({
      items: [],
      next_cursor: null,
    })
    vi.spyOn(api, 'me').mockResolvedValue({
      user: {
        id: 'u2',
        email: 'v@b.com',
        display_name: 'Viewer',
        is_tool_admin: false,
      },
      studios: [],
      cross_studio_grants: [],
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <HomePage />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    expect(
      await screen.findByText(/no studio membership yet/i),
    ).toBeInTheDocument()
  })

  it('shows working-on card when software and project exist', async () => {
    vi.spyOn(api, 'listMeNotifications').mockResolvedValue({
      items: [],
      next_cursor: null,
    })
    vi.spyOn(api, 'me').mockResolvedValue({
      user: {
        id: 'u3',
        email: 'e@b.com',
        display_name: 'Ed',
        is_tool_admin: false,
      },
      studios: [
        { studio_id: 's1', studio_name: 'S', role: 'studio_member' },
      ],
      cross_studio_grants: [],
    })
    vi.spyOn(api, 'listSoftware').mockResolvedValue([
      {
        id: 'sw1',
        studio_id: 's1',
        name: 'Portal',
        description: null,
        definition: 'B2B portal',
        git_provider: 'gitlab',
        git_repo_url: 'https://gitlab.example.com/group/repo',
        git_branch: 'main',
        git_token_set: false,
        created_at: '',
        updated_at: '',
      },
    ])
    vi.spyOn(api, 'listProjects').mockResolvedValue([
      {
        id: 'p1',
        software_id: 'sw1',
        name: 'v2',
        description: null,
        created_at: '',
        updated_at: '',
        sections: null,
      },
      {
        id: 'p2',
        software_id: 'sw1',
        name: 'Other proj',
        description: null,
        created_at: '',
        updated_at: '',
        sections: null,
      },
    ])
    vi.spyOn(api, 'getProject').mockResolvedValue({
      id: 'p1',
      software_id: 'sw1',
      name: 'v2',
      description: null,
      created_at: '',
      updated_at: '',
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
    vi.spyOn(api, 'getMeTokenUsage').mockResolvedValue({
      rows: [],
      totals: {
        input_tokens: 0,
        output_tokens: 0,
        estimated_cost_usd: '0',
      },
    })
    vi.spyOn(api, 'listWorkOrders').mockImplementation((projectId: string) =>
      Promise.resolve(
        projectId === 'p1'
          ? ([{ id: 'w1' }, { id: 'w2' }] as api.WorkOrder[])
          : ([{ id: 'w3' }] as api.WorkOrder[]),
      ),
    )
    vi.spyOn(api, 'getSoftwareGitHistory').mockResolvedValue({
      commits: [{ created_at: '2026-05-01T10:00:00.000Z' }],
    })
    vi.spyOn(api, 'getProjectAttention').mockResolvedValue({
      studio_id: 's1',
      software_id: 'sw1',
      project_id: 'p1',
      counts: { all: 0, conflict: 0, drift: 0, gap: 0, update: 0 },
      items: [],
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <HomePage />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    expect(await screen.findByText(/currently building/i)).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('Portal')).toBeInTheDocument()
    })
  })
})
