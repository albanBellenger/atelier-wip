import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import * as api from '../../services/api'
import { UsersSection } from './UsersSection'

const sampleUsers: api.AdminUserDirectoryRow[] = [
  {
    user_id: 'u1',
    email: 'admin@example.com',
    display_name: 'Admin User',
    is_platform_admin: true,
    created_at: '2026-01-15T12:00:00Z',
    studio_memberships: [
      { studio_id: 's1', studio_name: 'Studio A', role: 'studio_admin' },
    ],
  },
  {
    user_id: 'u2',
    email: 'member@example.com',
    display_name: 'Member User',
    is_platform_admin: false,
    created_at: '2026-02-01T08:00:00Z',
    studio_memberships: [
      { studio_id: 's1', studio_name: 'Studio A', role: 'studio_member' },
    ],
  },
]

function renderUsers(): {
  putSpy: ReturnType<typeof vi.spyOn>
  addMemberSpy: ReturnType<typeof vi.spyOn>
} {
  vi.spyOn(api, 'me').mockResolvedValue({
    user: {
      id: 'u1',
      email: 'admin@example.com',
      display_name: 'Admin User',
      is_platform_admin: true,
    },
    studios: [],
    cross_studio_grants: [],
  })
  vi.spyOn(api, 'getAdminUsers').mockResolvedValue(sampleUsers)
  vi.spyOn(api, 'listStudios').mockResolvedValue([
    { id: 's1', name: 'Studio A', description: null, logo_path: null, created_at: '2026-01-01' },
  ])
  const addMemberSpy = vi.spyOn(api, 'addMember').mockResolvedValue({
    user_id: 'u3',
    email: 'new@example.com',
    display_name: 'New',
    role: 'studio_member',
    joined_at: '2026-01-20T00:00:00Z',
  })
  const putSpy = vi.spyOn(api, 'putAdminUserPlatformAdminStatus').mockResolvedValue({
    id: 'u2',
    email: 'member@example.com',
    display_name: 'Member User',
    is_platform_admin: true,
  })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <UsersSection />
      </QueryClientProvider>
    </MemoryRouter>,
  )
  return { putSpy, addMemberSpy }
}

describe('UsersSection', () => {
  it('lists users from the admin directory API', async () => {
    renderUsers()
    expect(await screen.findByText('Member User')).toBeInTheDocument()
    expect(screen.getByText('admin@example.com')).toBeInTheDocument()
    expect(screen.getByText('member@example.com')).toBeInTheDocument()
  })

  it('grants platform admin and calls the API', async () => {
    const user = userEvent.setup()
    const { putSpy } = renderUsers()
    await screen.findByText('Member User')
    const grantButton = screen.getByRole('button', { name: /grant platform admin/i })
    await user.click(grantButton)
    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith('u2', { is_platform_admin: true })
    })
  })

  it('opens Add to studio and calls addMember with studio, email, and role', async () => {
    const user = userEvent.setup()
    const { addMemberSpy } = renderUsers()
    await screen.findByText('Member User')
    await user.click(screen.getByRole('button', { name: /add to studio/i }))
    const manualField = screen.getByLabelText(/^Or enter email$/i)
    await user.type(manualField, 'new@example.com')
    const roleSelect = screen.getByRole('combobox', {
      name: /Studio role: Owner, Builder, or Viewer/i,
    })
    await user.selectOptions(roleSelect, 'studio_viewer')
    await user.click(screen.getByRole('button', { name: /grant access/i }))
    await waitFor(() => {
      expect(addMemberSpy).toHaveBeenCalledWith('s1', {
        email: 'new@example.com',
        role: 'studio_viewer',
      })
    })
  })

  it('opens Create user and calls postAdminCreateUser', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'me').mockResolvedValue({
      user: {
        id: 'u1',
        email: 'admin@example.com',
        display_name: 'Admin User',
        is_platform_admin: true,
      },
      studios: [],
      cross_studio_grants: [],
    })
    vi.spyOn(api, 'getAdminUsers').mockResolvedValue(sampleUsers)
    vi.spyOn(api, 'listStudios').mockResolvedValue([
      { id: 's1', name: 'Studio A', description: null, logo_path: null, created_at: '2026-01-01' },
    ])
    const createSpy = vi.spyOn(api, 'postAdminCreateUser').mockResolvedValue({
      id: 'u-new',
      email: 'brandnew@example.com',
      display_name: 'Brand New',
      is_platform_admin: false,
    })
    vi.spyOn(api, 'addMember').mockResolvedValue({
      user_id: 'u3',
      email: 'new@example.com',
      display_name: 'New',
      role: 'studio_member',
      joined_at: '2026-01-20T00:00:00Z',
    })
    vi.spyOn(api, 'putAdminUserPlatformAdminStatus').mockResolvedValue({
      id: 'u2',
      email: 'member@example.com',
      display_name: 'Member User',
      is_platform_admin: true,
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <UsersSection />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    await screen.findByText('Member User')
    await user.click(screen.getByRole('button', { name: /^Create user$/i }))
    await user.type(screen.getByLabelText(/^Email$/i), 'brandnew@example.com')
    await user.type(screen.getByLabelText(/^Display name$/i), 'Brand New')
    await user.type(screen.getByLabelText('Initial password'), 'longpass123')
    await user.click(screen.getByRole('button', { name: /^Create account$/i }))
    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith({
        email: 'brandnew@example.com',
        password: 'longpass123',
        display_name: 'Brand New',
      })
    })
  })

  it('disables Remove platform admin on the signed-in user', async () => {
    renderUsers()
    await screen.findByText('Admin User')
    const removeSelf = screen.getByRole('button', { name: /remove platform admin/i })
    expect(removeSelf).toBeDisabled()
  })
})

