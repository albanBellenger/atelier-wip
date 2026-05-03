import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as api from '../services/api'
import { StudioPage } from './StudioPage'

afterEach(() => {
  vi.restoreAllMocks()
})

const memberMe: api.MeResponse = {
  user: {
    id: 'u1',
    email: 'm@b.com',
    display_name: 'Member',
    is_tool_admin: false,
  },
  studios: [{ studio_id: 's1', studio_name: 'S', role: 'studio_member' }],
  cross_studio_grants: [],
}

const viewerMe: api.MeResponse = {
  user: {
    id: 'u-v',
    email: 'v@b.com',
    display_name: 'Viewer',
    is_tool_admin: false,
  },
  studios: [{ studio_id: 's1', studio_name: 'S', role: 'studio_viewer' }],
  cross_studio_grants: [],
}

function renderStudio(path = '/studios/s1') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route path="/studios/:studioId" element={<StudioPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
  return qc
}

function stubCommonApis(meRes: api.MeResponse) {
  vi.spyOn(api, 'listMeNotifications').mockResolvedValue({
    items: [],
    next_cursor: null,
  })
  vi.spyOn(api, 'me').mockResolvedValue(meRes)
  vi.spyOn(api, 'getStudio').mockResolvedValue({
    id: 's1',
    name: 'Studio One',
    description: 'About this studio',
    logo_path: null,
    created_at: '2026-01-01T00:00:00Z',
  })
  vi.spyOn(api, 'listSoftware').mockResolvedValue([
    {
      id: 'sw1',
      studio_id: 's1',
      name: 'SW1',
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
  vi.spyOn(api, 'listStudioProjects').mockResolvedValue([
    {
      id: 'p1',
      software_id: 'sw1',
      software_name: 'SW1',
      name: 'Proj A',
      description: null,
      publish_folder_slug: 'proj-a',
      archived: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      sections: null,
      work_orders_done: 0,
      work_orders_total: 3,
      sections_count: 1,
      last_edited_at: null,
    },
  ])
  vi.spyOn(api, 'getStudioActivity').mockResolvedValue({ items: [] })
  vi.spyOn(api, 'listStudioArtifacts').mockResolvedValue([])
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
      user_id: 'u1',
      email: 'm@b.com',
      display_name: 'Member',
      role: 'studio_member',
      joined_at: '2026-01-01T00:00:00Z',
    },
  ])
}

describe('StudioPage', () => {
  it('shows studio hero, software, projects, and no New project control', async () => {
    stubCommonApis(memberMe)

    renderStudio()

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'Studio One',
      )
    })

    expect(screen.getByText('About this studio')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^Software/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^Projects/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /new project/i })).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /studio artifacts/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^upload file$/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^new markdown$/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /studio llm usage/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /building this studio/i })).toBeInTheDocument()
  })

  it('viewer does not see studio settings or add software', async () => {
    stubCommonApis(viewerMe)

    renderStudio()

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'Studio One',
      )
    })

    expect(
      screen.queryByRole('link', { name: /studio settings/i }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add software/i })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /^upload file$/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /^new markdown$/i }),
    ).not.toBeInTheDocument()
  })
})
