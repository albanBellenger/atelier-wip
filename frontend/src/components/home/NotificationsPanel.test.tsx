import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import * as api from '../../services/api'
import { NotificationsPanel } from './NotificationsPanel'

const unreadRow = {
  id: 'n1',
  kind: 'system',
  title: 'Hello',
  body: 'World',
  read_at: null as string | null,
  created_at: '2026-05-01T10:00:00Z',
}

function qc(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

describe('NotificationsPanel', () => {
  it('marks all read', async () => {
    const user = userEvent.setup()
    const listSpy = vi.spyOn(api, 'listMeNotifications').mockResolvedValue({
      items: [{ ...unreadRow }],
      next_cursor: null,
    })
    const markAllSpy = vi
      .spyOn(api, 'postMeNotificationsMarkAllRead')
      .mockResolvedValue({ updated: 1 })

    const client = qc()
    render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <NotificationsPanel open onClose={vi.fn()} />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    await waitFor(() => expect(listSpy).toHaveBeenCalled())
    expect(await screen.findByText('Hello')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /mark all read/i }))
    await waitFor(() => expect(markAllSpy).toHaveBeenCalled())
  })

  it('shows empty state when no notifications', async () => {
    vi.spyOn(api, 'listMeNotifications').mockResolvedValue({
      items: [],
      next_cursor: null,
    })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc()}>
          <NotificationsPanel open onClose={vi.fn()} />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    expect(
      await screen.findByText(/no notifications yet/i),
    ).toBeInTheDocument()
  })

  it('marks one notification read', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'listMeNotifications').mockResolvedValue({
      items: [
        {
          id: 'n2',
          kind: 'gap',
          title: 'Gap',
          body: 'Detail',
          read_at: null,
          created_at: '2026-05-01T10:00:00Z',
        },
      ],
      next_cursor: null,
    })
    const patchSpy = vi.spyOn(api, 'patchMeNotificationRead').mockResolvedValue({
      id: 'n2',
      kind: 'gap',
      title: 'Gap',
      body: 'Detail',
      read_at: '2026-05-01T12:00:00Z',
      created_at: '2026-05-01T10:00:00Z',
    })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc()}>
          <NotificationsPanel open onClose={vi.fn()} />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    await user.click(await screen.findByRole('button', { name: /^mark read$/i }))
    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith('n2', true)
    })
  })
})
