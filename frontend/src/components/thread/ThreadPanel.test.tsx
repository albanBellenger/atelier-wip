import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, afterEach } from 'vitest'

import * as api from '../../services/api'
import { ThreadPanel } from './ThreadPanel'

describe('ThreadPanel new thread', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('New thread calls reset, refetches empty messages', async () => {
    const user = userEvent.setup()
    const scroll = vi.fn()
    // jsdom: scrollIntoView is not implemented
    HTMLElement.prototype.scrollIntoView = scroll
    let fetchN = 0
    vi.spyOn(api, 'getPrivateThread').mockImplementation(async () => {
      fetchN += 1
      if (fetchN === 1) {
        return {
          thread_id: 'th-1',
          messages: [
            {
              id: 'm1',
              role: 'user',
              content: 'first',
              created_at: new Date().toISOString(),
            },
            {
              id: 'm2',
              role: 'assistant',
              content: 'second',
              created_at: new Date().toISOString(),
            },
          ],
        }
      }
      return { thread_id: 'th-2', messages: [] }
    })
    const resetSpy = vi
      .spyOn(api, 'resetPrivateThread')
      .mockResolvedValue(undefined)

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={qc}>
        <ThreadPanel projectId="p1" sectionId="sec1" />
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('first')).toBeInTheDocument()
    })
    expect(screen.getByText('second')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'New thread' }))

    await waitFor(() => {
      expect(resetSpy).toHaveBeenCalledWith('p1', 'sec1')
    })
    await waitFor(() => {
      expect(screen.queryByText('first')).not.toBeInTheDocument()
    })
  })
})
