import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as api from '../services/api'
import { MeProfilePage } from './MeProfilePage'

describe('MeProfilePage', () => {
  beforeEach(() => {
    vi.spyOn(api, 'listMeNotifications').mockResolvedValue({
      items: [],
      next_cursor: null,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses builder home header crumb and dashboard-style footer', async () => {
    vi.spyOn(api, 'me').mockResolvedValue({
      user: {
        id: 'u1',
        email: 'a@b.com',
        display_name: 'Alex',
        is_platform_admin: false,
      },
      studios: [{ studio_id: 's1', studio_name: 'Studio One', role: 'studio_member' }],
      cross_studio_grants: [],
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <MeProfilePage />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: 'Profile' })).toBeInTheDocument()
    const banner = screen.getByRole('banner')
    expect(within(banner).getByText('Profile')).toBeInTheDocument()
    expect(screen.getByText('Atelier · Builder workspace')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^back to home$/i })).not.toBeInTheDocument()
  })

  it('loads profile and submits PATCH', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'me').mockResolvedValue({
      user: {
        id: 'u1',
        email: 'a@b.com',
        display_name: 'Before',
        is_platform_admin: false,
      },
      studios: [],
      cross_studio_grants: [],
    })
    const patchSpy = vi.spyOn(api, 'patchMeProfile').mockResolvedValue({
      user: {
        id: 'u1',
        email: 'a@b.com',
        display_name: 'After',
        is_platform_admin: false,
      },
      studios: [],
      cross_studio_grants: [],
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <MeProfilePage />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    expect(await screen.findByDisplayValue('Before')).toBeInTheDocument()
    await user.clear(screen.getByLabelText(/display name/i))
    await user.type(screen.getByLabelText(/display name/i), 'After')
    await user.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith({ display_name: 'After' })
    })
  })

  it('lists home studios with friendly role labels', async () => {
    vi.spyOn(api, 'me').mockResolvedValue({
      user: {
        id: 'u1',
        email: 'a@b.com',
        display_name: 'Alex',
        is_platform_admin: false,
      },
      studios: [
        { studio_id: 's-admin', studio_name: 'Acme', role: 'studio_admin' },
        { studio_id: 's-build', studio_name: 'Northwind', role: 'studio_member' },
        { studio_id: 's-view', studio_name: 'Contoso', role: 'studio_viewer' },
        { studio_id: 's-x', studio_name: 'Fabrikam', role: 'viewer' },
      ],
      cross_studio_grants: [],
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <MeProfilePage />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: /your studios/i })).toBeInTheDocument()
    const studiosHeading = screen.getByRole('heading', { name: /your studios/i })
    const studiosSection = studiosHeading.closest('section')
    expect(studiosSection).not.toBeNull()
    const acme = within(studiosSection as HTMLElement).getByRole('link', {
      name: 'Acme',
    })
    expect(acme).toHaveAttribute('href', '/studios/s-admin')
    expect(screen.getByText('Owner')).toBeInTheDocument()
    expect(within(studiosSection as HTMLElement).getByRole('link', { name: 'Northwind' })).toHaveAttribute(
      'href',
      '/studios/s-build',
    )
    expect(screen.getByText('Builder')).toBeInTheDocument()
    expect(
      within(studiosSection as HTMLElement).getByRole('link', { name: 'Contoso' }),
    ).toHaveAttribute('href', '/studios/s-view')
    const viewerLabels = screen.getAllByText('Viewer')
    expect(viewerLabels.length).toBeGreaterThanOrEqual(2)
  })

  it('shows empty home studios state with link to studios', async () => {
    vi.spyOn(api, 'me').mockResolvedValue({
      user: {
        id: 'u1',
        email: 'solo@b.com',
        display_name: 'Solo',
        is_platform_admin: false,
      },
      studios: [],
      cross_studio_grants: [],
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <MeProfilePage />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    expect(
      await screen.findByText(/you're not a member of any studio yet/i),
    ).toBeInTheDocument()
    const browse = screen.getByRole('link', { name: /browse studios/i })
    expect(browse).toHaveAttribute('href', '/studios')
  })

  it('does not show platform admin badge for non-admin users', async () => {
    vi.spyOn(api, 'me').mockResolvedValue({
      user: {
        id: 'u1',
        email: 'm@b.com',
        display_name: 'Member',
        is_platform_admin: false,
      },
      studios: [{ studio_id: 's1', studio_name: 'S', role: 'studio_member' }],
      cross_studio_grants: [],
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <MeProfilePage />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Member')).toBeInTheDocument()
    expect(screen.queryByText('Platform admin')).not.toBeInTheDocument()
  })
})
