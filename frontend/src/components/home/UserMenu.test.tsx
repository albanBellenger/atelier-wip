import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { UserMenu, userCanSeeMeTokenUsage } from './UserMenu'
import type { MeResponse } from '../../services/api'

function baseProfile(over: Partial<MeResponse> = {}): MeResponse {
  return {
    user: {
      id: 'u1',
      email: 'a@b.com',
      display_name: 'Alex Builder',
      is_tool_admin: false,
    },
    studios: [{ studio_id: 's1', studio_name: 'S', role: 'studio_member' }],
    cross_studio_grants: [],
    ...over,
  }
}

describe('userCanSeeMeTokenUsage', () => {
  it('is true when user has studio memberships', () => {
    expect(userCanSeeMeTokenUsage(baseProfile())).toBe(true)
  })

  it('is true for tool admin without studios', () => {
    expect(
      userCanSeeMeTokenUsage(
        baseProfile({ studios: [], user: { ...baseProfile().user, is_tool_admin: true } }),
      ),
    ).toBe(true)
  })

  it('is false with no studios and not tool admin', () => {
    expect(userCanSeeMeTokenUsage(baseProfile({ studios: [] }))).toBe(false)
  })
})

describe('UserMenu', () => {
  it('renders Profile and Token usage when allowed', async () => {
    const user = userEvent.setup()
    const onLogout = vi.fn()
    render(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient()}>
          <UserMenu profile={baseProfile()} onLogout={onLogout} />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    await user.click(
      screen.getByRole('button', { name: /open menu for alex builder/i }),
    )
    expect(screen.getByRole('link', { name: /profile/i })).toHaveAttribute(
      'href',
      '/me/profile',
    )
    expect(screen.getByRole('link', { name: /documentation/i })).toHaveAttribute(
      'href',
      '/docs/builder',
    )
    expect(screen.getByRole('link', { name: /token usage/i })).toHaveAttribute(
      'href',
      '/llm-usage',
    )
  })

  it('viewer without token access does not show Token usage link', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient()}>
          <UserMenu profile={baseProfile({ studios: [] })} onLogout={vi.fn()} />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    await user.click(
      screen.getByRole('button', { name: /open menu for alex builder/i }),
    )
    expect(screen.queryByRole('link', { name: /^token usage$/i })).toBeNull()
    expect(screen.getByRole('link', { name: /documentation/i })).toHaveAttribute(
      'href',
      '/docs/builder',
    )
  })

  it('calls onLogout when Logout pressed', async () => {
    const user = userEvent.setup()
    const onLogout = vi.fn()
    render(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient()}>
          <UserMenu profile={baseProfile()} onLogout={onLogout} />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    await user.click(
      screen.getByRole('button', { name: /open menu for alex builder/i }),
    )
    await user.click(screen.getByRole('button', { name: /^logout$/i }))
    expect(onLogout).toHaveBeenCalled()
  })
})
