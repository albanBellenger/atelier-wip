import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import type { RefObject } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MilkdownEditorApi } from '../editor/MilkdownEditor'
import * as api from '../../services/api'
import { CopilotPanel } from './CopilotPanel'

const { streamSpy } = vi.hoisted(() => ({
  streamSpy: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../hooks/useStream', () => ({
  useStream: () => ({ streamPrivateThread: streamSpy }),
}))

function mkEditorRef(): RefObject<MilkdownEditorApi | null> {
  return {
    current: {
      getEditorView: () => null,
      getMarkdown: () => '',
      replaceFullMarkdown: () => {},
      applyPatch: () => ({ ok: false, reason: 'noop' }),
      animateAppendFromMarkdown: () => Promise.resolve(),
    },
  }
}

describe('CopilotPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    streamSpy.mockReset()
    streamSpy.mockResolvedValue(undefined)
  })

  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn()
    vi.spyOn(api, 'improveSection').mockResolvedValue({
      improved_markdown: '## Proposed\n',
    })
    vi.spyOn(api, 'listWorkOrders').mockResolvedValue([])
    vi.spyOn(api, 'listProjectIssues').mockResolvedValue([])
    vi.spyOn(api, 'getContextPreview').mockResolvedValue({
      blocks: [],
      total_tokens: 0,
      budget_tokens: 8000,
      overflow_strategy_applied: null,
    })
    vi.spyOn(api, 'getLlmRuntimeInfo').mockResolvedValue({
      llm_provider: 'openai',
      llm_model: 'gpt-4o-mini',
    })
    vi.spyOn(api, 'getStudioChatLlmModels').mockResolvedValue({
      effective_model: null,
      workspace_default_model: null,
      allowed_models: [],
    })
    vi.spyOn(api, 'getPrivateThread').mockResolvedValue({
      thread_id: 'th-1',
      messages: [],
    })
    vi.spyOn(api, 'getSectionContextPreferences').mockResolvedValue({
      excluded_kinds: [],
      pinned_artifact_ids: [],
      pinned_section_ids: [],
      pinned_work_order_ids: [],
      extra_urls: [],
    })
  })

  it('onRegisterCopilotDraftSetter receives setDraft used by the composer', async () => {
    let registered: ((value: string) => void) | null = null
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <CopilotPanel
            studioId="s1"
            projectId="p1"
            sectionId="sec1"
            projectHref="/studios/s1/software/sw1/projects/p1"
            collab={null}
            sectionEditorApiRef={mkEditorRef()}
            editorSelection={null}
            onClearEditorSelection={() => {}}
            onRegisterCopilotDraftSetter={(fn) => {
              registered = fn
            }}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(registered).not.toBeNull()
    })
    const ta = screen.getByTestId('copilot-composer-textarea')
    await act(async () => {
      registered?.('/append ')
    })
    expect(ta).toHaveValue('/append ')
  })

  it('viewer cannot see context kind prefs when canEditContext is false', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'getContextPreview').mockResolvedValue({
      blocks: [
        {
          kind: 'current_section',
          label: 'Section',
          tokens: 10,
          relevance: 0.9,
          truncated: false,
          body: 'x',
        },
      ],
      total_tokens: 10,
      budget_tokens: 8000,
      overflow_strategy_applied: null,
    })
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <CopilotPanel
            studioId="s1"
            projectId="p1"
            sectionId="sec1"
            projectHref="/studios/s1/software/sw1/projects/p1"
            collab={null}
            sectionEditorApiRef={mkEditorRef()}
            editorSelection={null}
            onClearEditorSelection={() => {}}
            canEditContext={false}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    await user.click(await screen.findByRole('tab', { name: 'Context' }))
    await waitFor(() => {
      expect(screen.getByTestId('context-block-kind-current_section')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('context-kind-prefs')).not.toBeInTheDocument()
  })
})
