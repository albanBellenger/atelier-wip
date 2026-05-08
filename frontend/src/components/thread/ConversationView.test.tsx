import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import type { PatchProposalMeta } from '../../lib/sectionPatchApply'
import type { PrivateThreadMessage } from '../../services/api'
import { ConversationView } from './ConversationView'

const mocks = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  writeText: vi.fn<(text: string) => Promise<void>>(),
}))

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}))

let clipboardWriteSpy: ReturnType<typeof vi.spyOn> | undefined

const noop = (): void => {}

function renderConversation(
  overrides: Partial<Parameters<typeof ConversationView>[0]> = {},
): void {
  const bottomRef = createRef<HTMLDivElement>()
  const base = {
    messages: [] as PrivateThreadMessage[],
    streaming: '',
    threadPending: false,
    patchProposal: null,
    patchPreviewLines: [],
    applyPatchBlocked: null,
    applyErr: null,
    applyPatchEnabled: true,
    findings: [],
    err: null,
    bottomRef,
    onApplyPatch: noop,
    onDismissPatch: noop,
    onViewPatchDiff: noop,
    density: 'compact' as const,
    onInsertSlash: undefined as ((p: string) => void) | undefined,
  }
  render(<ConversationView {...base} {...overrides} />)
}

describe('ConversationView', () => {
  // Clipboard tests use HTMLElement.click(): @testing-library/user-event does not reliably
  // activate these buttons in jsdom; Testing Library's legacy synthetic event helper is disallowed.
  beforeEach(() => {
    mocks.toastSuccess.mockClear()
    mocks.toastError.mockClear()
    mocks.writeText.mockClear()
    mocks.writeText.mockResolvedValue(undefined)
    clipboardWriteSpy?.mockRestore()
    if (!globalThis.navigator.clipboard) {
      Object.defineProperty(globalThis.navigator, 'clipboard', {
        value: { writeText: () => Promise.resolve() },
        configurable: true,
        writable: true,
      })
    }
    clipboardWriteSpy = vi
      .spyOn(globalThis.navigator.clipboard, 'writeText')
      .mockImplementation(mocks.writeText)
  })

  it('renders You and Copilot role labels for user and assistant bubbles', () => {
    const messages: PrivateThreadMessage[] = [
      {
        id: 'u1',
        role: 'user',
        content: 'Hello there',
        created_at: new Date().toISOString(),
      },
      {
        id: 'a1',
        role: 'assistant',
        content: 'Hi back',
        created_at: new Date().toISOString(),
      },
    ]
    renderConversation({ messages })

    expect(screen.getByText('You')).toBeInTheDocument()
    expect(screen.getByText('Copilot')).toBeInTheDocument()
    expect(screen.getByText('Hello there')).toBeInTheDocument()
    expect(screen.getByText('Hi back')).toBeInTheDocument()

    const youLabel = screen.getByText('You')
    expect(youLabel.parentElement).toHaveClass('items-end')

    const hiBack = screen.getByText('Hi back')
    expect(hiBack.closest('.self-start')).not.toBeNull()
  })

  it('renders assistant markdown so bold appears as strong', () => {
    const messages: PrivateThreadMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: 'Hello **bold**',
        created_at: new Date().toISOString(),
      },
    ]
    renderConversation({ messages })
    const el = document.querySelector('strong')
    expect(el?.textContent).toBe('bold')
  })

  it('copies raw assistant markdown when Copy is clicked', async () => {
    const messages: PrivateThreadMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: '## Title\n\nBody **bold**.',
        created_at: new Date().toISOString(),
      },
    ]
    renderConversation({ messages })
    screen.getByLabelText('Copy markdown').click()
    await vi.waitFor(() => {
      expect(mocks.writeText).toHaveBeenCalledWith('## Title\n\nBody **bold**.')
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Markdown copied')
  })

  it('copies streaming assistant markdown', async () => {
    renderConversation({ messages: [], streaming: 'partial **md**' })
    screen.getByLabelText('Copy markdown').click()
    await vi.waitFor(() => {
      expect(mocks.writeText).toHaveBeenCalledWith('partial **md**')
    })
  })

  it('shows error toast when copy fails', async () => {
    mocks.writeText.mockRejectedValueOnce(new Error('denied'))
    const messages: PrivateThreadMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: 'x',
        created_at: new Date().toISOString(),
      },
    ]
    renderConversation({ messages })
    screen.getByLabelText('Copy markdown').click()
    await vi.waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith('Could not copy')
    })
  })

  it('focus density shows Atelier Copilot and self-end user bubble', () => {
    const messages: PrivateThreadMessage[] = [
      {
        id: 'u1',
        role: 'user',
        content: 'Hi',
        created_at: new Date().toISOString(),
      },
      {
        id: 'a1',
        role: 'assistant',
        content: 'There',
        created_at: new Date().toISOString(),
      },
    ]
    renderConversation({ messages, density: 'focus' })
    expect(screen.getByText('Atelier Copilot')).toBeInTheDocument()
    expect(screen.getByText('You')).toBeInTheDocument()
    const userBubble = screen.getByText('Hi').parentElement
    expect(userBubble).toHaveClass('self-end')
    const asstBubble = screen.getByText('There').closest('.self-start')
    expect(asstBubble).not.toBeNull()
  })

  it('shows empty-state hint when there are no messages and not loading or streaming', () => {
    renderConversation({
      messages: [],
      streaming: '',
      threadPending: false,
    })
    expect(
      screen.getByText(/Start a conversation with the copilot/),
    ).toBeInTheDocument()
  })

  it('does not show empty-state hint while thread is loading', () => {
    renderConversation({
      messages: [],
      threadPending: true,
    })
    expect(
      screen.queryByText(/Start a conversation with the copilot/),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Loading thread…')).toBeInTheDocument()
  })

  it('viewer cannot apply patch when applyPatchEnabled is false', () => {
    const patchProposal = {
      intent: 'append' as const,
      markdown_to_append: 'x',
    } satisfies PatchProposalMeta
    const messages: PrivateThreadMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: 'Done',
        created_at: new Date().toISOString(),
      },
    ]
    renderConversation({
      messages,
      patchProposal,
      patchPreviewLines: ['+ x'],
      applyPatchEnabled: false,
    })
    expect(screen.getByRole('button', { name: 'Apply to editor' })).toBeDisabled()
  })

  it('does not show LLM prompt button without outbound payload', () => {
    const messages: PrivateThreadMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: 'Hi',
        created_at: new Date().toISOString(),
      },
    ]
    renderConversation({ messages })
    expect(
      screen.queryByRole('button', { name: 'View LLM prompt' }),
    ).not.toBeInTheDocument()
  })

  it('calls onOpenLlmPrompt when outbound prompt button is clicked', async () => {
    const onOpen = vi.fn()
    const user = userEvent.setup()
    const messages: PrivateThreadMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: 'Hi',
        created_at: new Date().toISOString(),
      },
    ]
    renderConversation({
      messages,
      llmPromptByMessageId: {
        a1: [{ role: 'system', content: 's', tokens: 42 }],
      },
      onOpenLlmPrompt: onOpen,
    })
    expect(screen.getByText('42 tok')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'View LLM prompt' }))
    expect(onOpen).toHaveBeenCalledWith('a1')
  })
})
