import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import * as api from '../services/api'
import { MeProfilePage } from './MeProfilePage'

describe('MeProfilePage', () => {
  it('loads profile and submits PATCH', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'me').mockResolvedValue({
      user: {
        id: 'u1',
        email: 'a@b.com',
        display_name: 'Before',
        is_tool_admin: false,
      },
      studios: [],
      cross_studio_grants: [],
    })
    const patchSpy = vi.spyOn(api, 'patchMeProfile').mockResolvedValue({
      user: {
        id: 'u1',
        email: 'a@b.com',
        display_name: 'After',
        is_tool_admin: false,
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
})
