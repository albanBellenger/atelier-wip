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
    is_tool_admin: true,
    created_at: '2026-01-15T12:00:00Z',
    studio_memberships: [
      { studio_id: 's1', studio_name: 'Studio A', role: 'studio_admin' },
    ],
  },
  {
    user_id: 'u2',
    email: 'member@example.com',
    display_name: 'Member User',
    is_tool_admin: false,
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
      is_tool_admin: true,
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
  const putSpy = vi.spyOn(api, 'putAdminUserAdminStatus').mockResolvedValue({
    id: 'u2',
    email: 'member@example.com',
    display_name: 'Member User',
    is_tool_admin: true,
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

  it('grants tool admin and calls the API', async () => {
    const user = userEvent.setup()
    const { putSpy } = renderUsers()
    await screen.findByText('Member User')
    const grantButton = screen.getByRole('button', { name: /grant tool admin/i })
    await user.click(grantButton)
    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith('u2', { is_tool_admin: true })
    })
  })

  it('opens Add to studio and calls addMember with studio, email, and role', async () => {
    const user = userEvent.setup()
    const { addMemberSpy } = renderUsers()
    await screen.findByText('Member User')
    await user.click(screen.getByRole('button', { name: /add to studio/i }))
    const emailField = await screen.findByPlaceholderText('colleague@company.com')
    await user.type(emailField, 'new@example.com')
    const roleSelect = screen.getByRole('combobox', { name: /role in this studio/i })
    await user.selectOptions(roleSelect, 'studio_viewer')
    await user.click(screen.getByRole('button', { name: /grant access/i }))
    await waitFor(() => {
      expect(addMemberSpy).toHaveBeenCalledWith('s1', {
        email: 'new@example.com',
        role: 'studio_viewer',
      })
    })
  })

  it('disables Remove tool admin on the signed-in user', async () => {
    renderUsers()
    await screen.findByText('Admin User')
    const removeSelf = screen.getByRole('button', { name: /remove tool admin/i })
    expect(removeSelf).toBeDisabled()
  })
})

