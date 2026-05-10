import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '../services/api'
import type { MeResponse, StudioListItem } from '../services/api'
import { StudiosListPage } from './StudiosListPage'

afterEach(() => {
  vi.restoreAllMocks()
})

beforeEach(() => {
  vi.spyOn(api, 'listMeNotifications').mockResolvedValue({
    items: [],
    next_cursor: null,
  })
})

function mockProfile(
  role: 'studio_member' | 'viewer',
  opts?: { isPlatformAdmin?: boolean },
): MeResponse {
  return {
    user: {
      id: 'u1',
      email: 'a@b.com',
      display_name: 'Alex',
      is_platform_admin: opts?.isPlatformAdmin ?? false,
    },
    studios: [
      { studio_id: 's1', studio_name: 'Studio One', role },
    ],
    cross_studio_grants: [],
  }
}

function studioRow(
  overrides: Partial<StudioListItem> & Pick<StudioListItem, 'id' | 'name'>,
): StudioListItem {
  return {
    id: overrides.id,
    name: overrides.name,
    description: overrides.description ?? null,
    logo_path: overrides.logo_path ?? null,
    software_count: overrides.software_count ?? 0,
    project_count: overrides.project_count ?? 0,
    member_count: overrides.member_count ?? 0,
    created_at: overrides.created_at ?? '2024-01-01T00:00:00Z',
  }
}

describe('StudiosListPage', () => {
  it('shows empty state when there are no studios', async () => {
    vi.spyOn(api, 'me').mockResolvedValue(mockProfile('studio_member'))
    vi.spyOn(api, 'listStudios').mockResolvedValue([])
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <MemoryRouter initialEntries={['/studios']}>
        <QueryClientProvider client={qc}>
          <Routes>
            <Route path="/studios" element={<StudiosListPage />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })
    expect(
      screen.getByRole('heading', { name: /no studios yet/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /open admin console/i }),
    ).not.toBeInTheDocument()
  })

  it('platform admin empty state links to Admin console Studios', async () => {
    vi.spyOn(api, 'me').mockResolvedValue(
      mockProfile('studio_member', { isPlatformAdmin: true }),
    )
    vi.spyOn(api, 'listStudios').mockResolvedValue([])
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <MemoryRouter initialEntries={['/studios']}>
        <QueryClientProvider client={qc}>
          <Routes>
            <Route path="/studios" element={<StudiosListPage />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })
    expect(
      screen.getByRole('link', { name: /open admin console/i }),
    ).toHaveAttribute('href', '/admin/console/studios')
  })

  it('search filters cards by name or description', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'me').mockResolvedValue(mockProfile('studio_member'))
    vi.spyOn(api, 'listStudios').mockResolvedValue([
      studioRow({
        id: 's-alpha',
        name: 'Alpha Lab',
        description: 'Widgets',
        software_count: 1,
        project_count: 2,
        member_count: 3,
      }),
      studioRow({
        id: 's-beta',
        name: 'Beta Works',
        description: 'Gadgets',
        software_count: 0,
        project_count: 0,
        member_count: 1,
      }),
    ])
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <MemoryRouter initialEntries={['/studios']}>
        <QueryClientProvider client={qc}>
          <Routes>
            <Route path="/studios" element={<StudiosListPage />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /alpha lab/i })).toBeInTheDocument()
    })
    expect(screen.getByRole('link', { name: /beta works/i })).toBeInTheDocument()

    await user.type(screen.getByRole('searchbox'), 'gadget')

    await waitFor(() => {
      expect(
        screen.queryByRole('link', { name: /alpha lab/i }),
      ).not.toBeInTheDocument()
    })
    expect(screen.getByRole('link', { name: /beta works/i })).toBeInTheDocument()
  })

  it('viewer cannot see privileged admin entry or create controls', async () => {
    vi.spyOn(api, 'me').mockResolvedValue(mockProfile('viewer'))
    vi.spyOn(api, 'listStudios').mockResolvedValue([])
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <MemoryRouter initialEntries={['/studios']}>
        <QueryClientProvider client={qc}>
          <Routes>
            <Route path="/studios" element={<StudiosListPage />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /delete studio/i })).toBeNull()
    expect(
      screen.queryByRole('link', { name: /open admin console/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /create studio/i }),
    ).not.toBeInTheDocument()
  })
})
