import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as api from '../services/api'
import { SoftwareSettingsPage } from './SoftwareSettingsPage'

afterEach(() => {
  vi.restoreAllMocks()
})

const adminMe: api.MeResponse = {
  user: {
    id: 'u1',
    email: 'a@b.com',
    display_name: 'Admin',
    is_tool_admin: false,
  },
  studios: [{ studio_id: 's1', studio_name: 'S', role: 'studio_admin' }],
  cross_studio_grants: [],
}

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

function renderSettings(path = '/studios/s1/software/sw1/settings') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route
            path="/studios/:studioId/software/:softwareId/settings"
            element={<SoftwareSettingsPage />}
          />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('SoftwareSettingsPage', () => {
  it('shows Details and GitLab sections for a studio admin', async () => {
    vi.spyOn(api, 'listMeNotifications').mockResolvedValue({
      items: [],
      next_cursor: null,
    })
    vi.spyOn(api, 'me').mockResolvedValue(adminMe)
    vi.spyOn(api, 'getSoftware').mockResolvedValue({
      id: 'sw1',
      studio_id: 's1',
      name: 'My SW',
      description: 'Desc',
      definition: 'def',
      git_provider: 'gitlab',
      git_repo_url: 'https://gitlab.example.com/g/r',
      git_branch: 'main',
      git_token_set: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    })
    vi.spyOn(api, 'listSoftware').mockResolvedValue([mockSoftwareRow('sw1', 'My SW')])

    renderSettings()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /software settings/i })).toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { name: /^Details$/i })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /self-hosted gitlab integration/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^save$/i }),
    ).toBeInTheDocument()
  })

  it('viewer cannot save software settings', async () => {
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
      studios: [{ studio_id: 's1', studio_name: 'S', role: 'studio_viewer' }],
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
    vi.spyOn(api, 'listSoftware').mockResolvedValue([mockSoftwareRow('sw1', 'SW')])

    renderSettings()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /^Details$/i })).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument()
  })
})
