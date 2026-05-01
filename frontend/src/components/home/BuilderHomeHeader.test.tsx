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
      is_tool_admin: false,
    },
    studios: [
      { studio_id: 's-active', studio_name: 'Northwind', role: 'studio_member' },
      { studio_id: 's-other', studio_name: 'Contoso', role: 'viewer' },
    ],
    cross_studio_grants: [],
  }
}

describe('BuilderHomeHeader', () => {
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

    await user.click(screen.getByRole('button', { name: /northwind/i }))

    const northwindRow = screen.getByRole('button', {
      name: /northwindstudio member/i,
    })
    expect(northwindRow).toHaveAttribute('aria-current', 'true')
    expect(within(northwindRow).getByText('studio member')).toBeInTheDocument()
    expect(northwindRow.querySelector('.rounded-full.bg-violet-500')).not.toBeNull()

    const contosoRow = screen.getByRole('button', { name: /contosoviewer/i })
    expect(contosoRow).not.toHaveAttribute('aria-current')
    expect(contosoRow.querySelector('.rounded-full.bg-violet-500')).toBeNull()
  })
})
