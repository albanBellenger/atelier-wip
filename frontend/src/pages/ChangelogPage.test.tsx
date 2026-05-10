import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as api from '../services/api'
import type { MeResponse } from '../services/api'
import { ChangelogPage } from './ChangelogPage'

afterEach(() => {
  vi.restoreAllMocks()
})

function mockProfile(role: 'studio_member' | 'viewer'): MeResponse {
  return {
    user: {
      id: 'u1',
      email: 'a@b.com',
      display_name: 'Alex',
      is_platform_admin: false,
    },
    studios: [
      { studio_id: 's1', studio_name: 'Studio One', role },
    ],
    cross_studio_grants: [],
  }
}

describe('ChangelogPage', () => {
  it('shows mock releases and builder shell when authenticated', async () => {
    vi.spyOn(api, 'listMeNotifications').mockResolvedValue({
      items: [],
      next_cursor: null,
    })
    vi.spyOn(api, 'me').mockResolvedValue(mockProfile('studio_member'))
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter initialEntries={['/changelog']}>
        <QueryClientProvider client={qc}>
          <Routes>
            <Route path="/changelog" element={<ChangelogPage />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /^changelog$/i }),
      ).toBeInTheDocument()
    })
    expect(screen.getByRole('link', { name: /^atelier$/i })).toHaveAttribute(
      'href',
      '/',
    )
    expect(screen.getByRole('link', { name: /^Studio One$/i })).toHaveAttribute(
      'href',
      '/studios/s1',
    )
    expect(screen.getByRole('banner')).toHaveTextContent('Changelog')
    expect(screen.getByText(/Atelier · Builder workspace/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /back to home/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(/initial builder workspace/i),
    ).toBeInTheDocument()
  })

  it('viewer sees changelog and has no tool-admin entry points on this page', async () => {
    vi.spyOn(api, 'listMeNotifications').mockResolvedValue({
      items: [],
      next_cursor: null,
    })
    vi.spyOn(api, 'me').mockResolvedValue(mockProfile('viewer'))
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter initialEntries={['/changelog']}>
        <QueryClientProvider client={qc}>
          <Routes>
            <Route path="/changelog" element={<ChangelogPage />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: /^changelog$/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /token usage/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /admin settings/i })).not.toBeInTheDocument()
  })
})
