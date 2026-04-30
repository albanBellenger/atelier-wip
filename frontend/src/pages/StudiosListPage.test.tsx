import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import * as api from '../services/api'
import { StudiosListPage } from './StudiosListPage'

describe('StudiosListPage', () => {
  it('shows empty state when there are no studios', async () => {
    vi.spyOn(api, 'listStudios').mockResolvedValue([])
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <StudiosListPage />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })
    expect(
      screen.getByRole('heading', { name: /no studios yet/i }),
    ).toBeInTheDocument()
  })

  it('viewer cannot see studio-admin-only controls in empty state', async () => {
    vi.spyOn(api, 'listStudios').mockResolvedValue([])
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <StudiosListPage />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /delete studio/i })).toBeNull()
  })
})
