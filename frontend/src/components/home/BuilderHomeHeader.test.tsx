import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { BuilderHomeHeader } from './BuilderHomeHeader'
import * as api from '../../services/api'
import type { MeResponse } from '../../services/api'

function profileTwoStudios(): MeResponse {
  return {
    user: {
      id: 'u1',
      email: 'a@b.com',
      display_name: 'Alex',
      is_platform_admin: false,
    },
    studios: [
      { studio_id: 's-active', studio_name: 'Northwind', role: 'studio_member' },
      { studio_id: 's-other', studio_name: 'Contoso', role: 'viewer' },
    ],
    cross_studio_grants: [],
  }
}

describe('BuilderHomeHeader', () => {
  it('shows Admin console link before notifications for platform admin only', () => {
    vi.spyOn(api, 'listMeNotifications').mockResolvedValue({
      items: [],
      next_cursor: null,
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const toolAdmin: MeResponse = {
      ...profileTwoStudios(),
      user: { ...profileTwoStudios().user, is_platform_admin: true },
    }
    render(
      <MemoryRouter initialEntries={['/']}>
        <QueryClientProvider client={qc}>
          <BuilderHomeHeader profile={toolAdmin} onLogout={vi.fn()} />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    const adminLink = screen.getByRole('link', { name: /admin console/i })
    expect(adminLink).toHaveAttribute('href', '/admin/console')
    expect(adminLink).toHaveTextContent('Admin')
    expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument()
  })

  it('does not show Admin console link for non-tool-admin users', () => {
    vi.spyOn(api, 'listMeNotifications').mockResolvedValue({
      items: [],
      next_cursor: null,
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter initialEntries={['/']}>
        <QueryClientProvider client={qc}>
          <BuilderHomeHeader profile={profileTwoStudios()} onLogout={vi.fn()} />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    expect(
      screen.queryByRole('link', { name: /admin console/i }),
    ).not.toBeInTheDocument()
  })

  it('links current studio name to the studio page when switcher is enabled', () => {
    vi.spyOn(api, 'listMeNotifications').mockResolvedValue({
      items: [],
      next_cursor: null,
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter initialEntries={['/']}>
        <QueryClientProvider client={qc}>
          <BuilderHomeHeader
            profile={profileTwoStudios()}
            studioId="s-active"
            onStudioChange={vi.fn()}
            onLogout={vi.fn()}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /^northwind$/i })).toHaveAttribute(
      'href',
      '/studios/s-active',
    )
  })

  it('links studio name to the studio page when only one studio (no switcher)', () => {
    vi.spyOn(api, 'listMeNotifications').mockResolvedValue({
      items: [],
      next_cursor: null,
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const oneStudio: MeResponse = {
      ...profileTwoStudios(),
      studios: [
        {
          studio_id: 's-solo',
          studio_name: 'Solo Studio',
          role: 'studio_member',
        },
      ],
    }
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <BuilderHomeHeader
            profile={oneStudio}
            studioId="s-solo"
            onLogout={vi.fn()}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /^solo studio$/i })).toHaveAttribute(
      'href',
      '/studios/s-solo',
    )
  })

  it('links the Atelier brand to the landing page', () => {
    vi.spyOn(api, 'listMeNotifications').mockResolvedValue({
      items: [],
      next_cursor: null,
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter initialEntries={['/studios/s-active/software/sw1']}>
        <QueryClientProvider client={qc}>
          <BuilderHomeHeader
            profile={profileTwoStudios()}
            studioId="s-active"
            onStudioChange={vi.fn()}
            onLogout={vi.fn()}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /^atelier$/i })).toHaveAttribute(
      'href',
      '/',
    )
  })

  it('marks only the connected studio row with aria-current and shows a status dot', async () => {
    vi.spyOn(api, 'listMeNotifications').mockResolvedValue({
      items: [],
      next_cursor: null,
    })
    const user = userEvent.setup()
    const onStudioChange = vi.fn()
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <BuilderHomeHeader
            profile={profileTwoStudios()}
            studioId="s-active"
            onStudioChange={onStudioChange}
            onLogout={vi.fn()}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: /switch studio/i }))

    const northwindRow = screen.getByRole('button', {
      name: /northwind.*builder/i,
    })
    expect(northwindRow).toHaveAttribute('aria-current', 'true')
    expect(within(northwindRow).getByText('Builder')).toBeInTheDocument()
    expect(northwindRow.querySelector('.rounded-full.bg-violet-500')).not.toBeNull()

    const contosoRow = screen.getByRole('button', { name: /contosoviewer/i })
    expect(contosoRow).not.toHaveAttribute('aria-current')
    expect(contosoRow.querySelector('.rounded-full.bg-violet-500')).toBeNull()
  })

  it('renders project crumb without software segment when label is omitted', () => {
    vi.spyOn(api, 'listMeNotifications').mockResolvedValue({
      items: [],
      next_cursor: null,
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <BuilderHomeHeader
            profile={profileTwoStudios()}
            studioId="s-active"
            onStudioChange={vi.fn()}
            onLogout={vi.fn()}
            trailingCrumb={{ projectLabel: 'Artifact library' }}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    expect(screen.getByText('Artifact library')).toBeInTheDocument()
    expect(screen.getAllByText('Northwind')).toHaveLength(1)
  })

  it('renders optional trailing software crumb after studio', () => {
    vi.spyOn(api, 'listMeNotifications').mockResolvedValue({
      items: [],
      next_cursor: null,
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <BuilderHomeHeader
            profile={profileTwoStudios()}
            studioId="s-active"
            onStudioChange={vi.fn()}
            onLogout={vi.fn()}
            trailingCrumb={{ label: 'Employee Hub' }}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    expect(screen.getByText('Employee Hub')).toBeInTheDocument()
  })

  it('renders software combo when switcher has multiple options', async () => {
    vi.spyOn(api, 'listMeNotifications').mockResolvedValue({
      items: [],
      next_cursor: null,
    })
    const user = userEvent.setup()
    const onSoftwareSelect = vi.fn()
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <BuilderHomeHeader
            profile={profileTwoStudios()}
            studioId="s-active"
            onStudioChange={vi.fn()}
            onLogout={vi.fn()}
            trailingCrumb={{
              label: 'Employee Hub',
              softwareSwitcher: {
                currentSoftwareId: 'sw-a',
                softwareOptions: [
                  { id: 'sw-a', name: 'Employee Hub' },
                  { id: 'sw-b', name: 'Revenue Hub' },
                ],
                onSoftwareSelect,
              },
            }}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    const employeeHubTriggers = screen.getAllByRole('button', {
      name: /^employee hub$/i,
    })
    await user.click(employeeHubTriggers[0]!)

    expect(screen.getByText('Switch software')).toBeInTheDocument()
    const revenueRow = screen.getByRole('button', { name: /^revenue hub$/i })
    expect(revenueRow).not.toHaveAttribute('aria-current')
    await user.click(revenueRow)
    expect(onSoftwareSelect).toHaveBeenCalledWith('sw-b')
  })

  it('keeps trailing software as text when switcher has only one option', () => {
    vi.spyOn(api, 'listMeNotifications').mockResolvedValue({
      items: [],
      next_cursor: null,
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <BuilderHomeHeader
            profile={profileTwoStudios()}
            studioId="s-active"
            onStudioChange={vi.fn()}
            onLogout={vi.fn()}
            trailingCrumb={{
              label: 'Solo Product',
              softwareSwitcher: {
                currentSoftwareId: 'sw1',
                softwareOptions: [{ id: 'sw1', name: 'Solo Product' }],
                onSoftwareSelect: vi.fn(),
              },
            }}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    expect(screen.getByText('Solo Product')).toBeInTheDocument()
    expect(
      screen.queryAllByRole('button', { name: /solo product/i }),
    ).toHaveLength(0)
  })

  it('renders project combo when project switcher has multiple options', async () => {
    vi.spyOn(api, 'listMeNotifications').mockResolvedValue({
      items: [],
      next_cursor: null,
    })
    const user = userEvent.setup()
    const onProjectSelect = vi.fn()
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <BuilderHomeHeader
            profile={profileTwoStudios()}
            studioId="s-active"
            onStudioChange={vi.fn()}
            onLogout={vi.fn()}
            trailingCrumb={{
              label: 'Employee Hub',
              projectLabel: 'Phase 2',
              projectSwitcher: {
                currentProjectId: 'p-a',
                projectOptions: [
                  { id: 'p-a', name: 'Phase 2' },
                  { id: 'p-b', name: 'Phase 3' },
                ],
                onProjectSelect,
              },
            }}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    const phase2Buttons = screen.getAllByRole('button', { name: /^phase 2$/i })
    await user.click(phase2Buttons[phase2Buttons.length - 1]!)

    expect(screen.getByText('Switch project')).toBeInTheDocument()
    const phase3Row = screen.getByRole('button', { name: /^phase 3$/i })
    expect(phase3Row).not.toHaveAttribute('aria-current')
    await user.click(phase3Row)
    expect(onProjectSelect).toHaveBeenCalledWith('p-b')
  })

  it('keeps trailing project as text when project switcher has only one option', () => {
    vi.spyOn(api, 'listMeNotifications').mockResolvedValue({
      items: [],
      next_cursor: null,
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <BuilderHomeHeader
            profile={profileTwoStudios()}
            studioId="s-active"
            onStudioChange={vi.fn()}
            onLogout={vi.fn()}
            trailingCrumb={{
              label: 'SW',
              projectLabel: 'Only project',
              projectSwitcher: {
                currentProjectId: 'p1',
                projectOptions: [{ id: 'p1', name: 'Only project' }],
                onProjectSelect: vi.fn(),
              },
            }}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    expect(screen.getByText('Only project')).toBeInTheDocument()
    expect(
      screen.queryAllByRole('button', { name: /only project/i }),
    ).toHaveLength(0)
  })
})
