import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as api from '../../services/api'
import { ContextTab } from './ContextTab'

describe('ContextTab', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lists context block kinds from the API', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'getContextPreview').mockResolvedValue({
      blocks: [
        {
          label: 'Software definition',
          kind: 'software_def',
          tokens: 10,
          relevance: null,
          truncated: false,
          body: '## Software definition\nx',
        },
        {
          label: 'Project outline',
          kind: 'outline',
          tokens: 2,
          relevance: null,
          truncated: false,
          body: '## Project outline\n- a',
        },
      ],
      total_tokens: 12,
      budget_tokens: 6000,
      overflow_strategy_applied: null,
    })

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ContextTab
            projectId="p1"
            sectionId="sec1"
            ragQuery=""
            includeGitHistory={false}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('context-block-kind-software_def')).toBeInTheDocument()
    })
    expect(screen.getByTestId('context-block-kind-outline')).toBeInTheDocument()

    await user.clear(screen.getByPlaceholderText(/Matches private-thread/))
    await user.type(screen.getByPlaceholderText(/Matches private-thread/), 'hi')

    await waitFor(() => {
      expect(api.getContextPreview).toHaveBeenCalledWith(
        'p1',
        'sec1',
        expect.objectContaining({ q: 'hi' }),
      )
    })
  })

  it('has no apply-to-editor or send controls (read-only surface)', () => {
    vi.spyOn(api, 'getContextPreview').mockResolvedValue({
      blocks: [],
      total_tokens: 0,
      budget_tokens: 6000,
      overflow_strategy_applied: null,
    })

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ContextTab
            projectId="p1"
            sectionId="sec1"
            ragQuery=""
            includeGitHistory={false}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    expect(screen.queryByRole('button', { name: 'Apply to editor' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
  })
})
