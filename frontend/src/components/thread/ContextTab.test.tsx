import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as api from '../../services/api'
import { ContextTab } from './ContextTab'

describe('ContextTab', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    vi.spyOn(api, 'getSectionContextPreferences').mockResolvedValue({
      excluded_kinds: [],
      pinned_artifact_ids: [],
      pinned_section_ids: [],
      pinned_work_order_ids: [],
      extra_urls: [],
    })
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
      debug_raw_rag_text: null,
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

  it('requests debug raw RAG when checkbox is enabled', async () => {
    const user = userEvent.setup()
    const spy = vi.spyOn(api, 'getContextPreview').mockResolvedValue({
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
      debug_raw_rag_text: 'RAW_SNIPPET',
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
      expect(spy).toHaveBeenCalled()
    })
    await user.click(
      screen.getByRole('checkbox', {
        name: /include raw rag string/i,
      }),
    )
    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith(
        'p1',
        'sec1',
        expect.objectContaining({ debugRawRag: true }),
      )
    })
    expect(await screen.findByTestId('context-debug-raw-rag')).toHaveTextContent(
      'RAW_SNIPPET',
    )
  })

  it('has no apply-to-editor or send controls (read-only surface)', () => {
    vi.spyOn(api, 'getContextPreview').mockResolvedValue({
      blocks: [],
      total_tokens: 0,
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

  it('viewer does not see kind preference toggles', async () => {
    vi.spyOn(api, 'getContextPreview').mockResolvedValue({
      blocks: [
        {
          label: 'Git',
          kind: 'git_history',
          tokens: 3,
          relevance: null,
          truncated: false,
          body: 'x',
        },
      ],
      total_tokens: 3,
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
          <ContextTab
            projectId="p1"
            sectionId="sec1"
            ragQuery=""
            includeGitHistory={false}
            canEditContext={false}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('context-block-kind-git_history')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('context-kind-prefs')).not.toBeInTheDocument()
  })

  it('editor toggling a block kind calls PATCH context preferences', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'getContextPreview').mockResolvedValue({
      blocks: [
        {
          label: 'Git',
          kind: 'git_history',
          tokens: 3,
          relevance: null,
          truncated: false,
          body: 'x',
        },
      ],
      total_tokens: 3,
      budget_tokens: 6000,
      overflow_strategy_applied: null,
      debug_raw_rag_text: null,
    })
    const patchSpy = vi
      .spyOn(api, 'patchSectionContextPreferences')
      .mockResolvedValue({
        excluded_kinds: ['git_history'],
        pinned_artifact_ids: [],
        pinned_section_ids: [],
        pinned_work_order_ids: [],
        extra_urls: [],
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
            canEditContext
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('context-kind-prefs')).toBeInTheDocument()
    })
    const prefsPanel = screen.getByTestId('context-kind-prefs')
    await user.click(within(prefsPanel).getByRole('button', { name: 'On' }))
    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith('p1', 'sec1', {
        excluded_kinds: ['git_history'],
      })
    })
  })
})
