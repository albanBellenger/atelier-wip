import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as api from '../../services/api'
import { ProjectChatRagPreview } from './ProjectChatRagPreview'

describe('ProjectChatRagPreview', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lists context blocks from project chat RAG preview API', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'getProjectChatRagPreview').mockResolvedValue({
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
      debug_raw_rag_text: null,
    })

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ProjectChatRagPreview projectId="p1" />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('context-block-kind-software_def')).toBeInTheDocument()
    })
    expect(screen.getByTestId('context-block-kind-outline')).toBeInTheDocument()

    await user.clear(screen.getByPlaceholderText(/Same text you would send/))
    await user.type(screen.getByPlaceholderText(/Same text you would send/), 'q1')

    await waitFor(() => {
      expect(api.getProjectChatRagPreview).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ q: 'q1' }),
      )
    })
  })

  it('requests git history and debug raw flags when enabled', async () => {
    const user = userEvent.setup()
    const spy = vi.spyOn(api, 'getProjectChatRagPreview').mockResolvedValue({
      blocks: [
        {
          label: 'Software definition',
          kind: 'software_def',
          tokens: 1,
          relevance: null,
          truncated: false,
          body: '## Software definition\nx',
        },
      ],
      total_tokens: 1,
      budget_tokens: 6000,
      overflow_strategy_applied: null,
      debug_raw_rag_text: 'RAW',
    })

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ProjectChatRagPreview projectId="p1" />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(spy).toHaveBeenCalled()
    })

    await user.click(screen.getByRole('checkbox', { name: /Include recent git history/ }))
    await user.click(screen.getByRole('checkbox', { name: /Include raw RAG string/ }))

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({
          includeGitHistory: true,
          debugRawRag: true,
        }),
      )
    })
  })

  it('shows error when preview API fails', async () => {
    vi.spyOn(api, 'getProjectChatRagPreview').mockRejectedValue(new Error('fail'))

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ProjectChatRagPreview projectId="p1" />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('project-chat-rag-error')).toBeInTheDocument()
    })
  })
})
