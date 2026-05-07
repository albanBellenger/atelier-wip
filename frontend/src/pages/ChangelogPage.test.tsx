import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import * as api from '../services/api'
import type { MeResponse } from '../services/api'
import { ChangelogPage } from './ChangelogPage'

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
  it('shows mock releases and back link when authenticated', async () => {
    vi.spyOn(api, 'me').mockResolvedValue(mockProfile('studio_member'))
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ChangelogPage />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: /^changelog$/i })).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /back to home/i }),
    ).toHaveAttribute('href', '/')
    expect(
      screen.getByText(/initial builder workspace/i),
    ).toBeInTheDocument()
  })

  it('viewer sees changelog and has no tool-admin entry points on this page', async () => {
    vi.spyOn(api, 'me').mockResolvedValue(mockProfile('viewer'))
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ChangelogPage />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: /^changelog$/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /token usage/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /admin settings/i })).not.toBeInTheDocument()
  })
})
