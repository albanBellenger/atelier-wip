import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { commandsCtx, editorViewCtx } from '@milkdown/kit/core'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@milkdown/kit/plugin/slash', () => ({
  slashFactory: vi.fn(() => ({})),
  SlashProvider: class {
    destroy(): void {}
    update(): void {}
  },
}))

import { AiComposerPrefillProvider } from './aiComposerPrefillContext'
import { SlashMenuView } from './SlashMenuView'

const { mockCtx, callSpy, mockView } = vi.hoisted(() => {
  const callSpyInner = vi.fn()
  const mockViewInner = { focus: vi.fn() }
  const mockCtxInner = {
    get: (token: unknown) => {
      if (token === editorViewCtx) {
        return mockViewInner
      }
      if (token === commandsCtx) {
        return { call: callSpyInner }
      }
      return {}
    },
  }
  return {
    mockCtx: mockCtxInner,
    callSpy: callSpyInner,
    mockView: mockViewInner,
  }
})

vi.mock('@milkdown/react', () => ({
  useInstance: () => [
    false,
    (): { action: (fn: (ctx: unknown) => void) => void } => ({
      action: (fn) => {
        fn(mockCtx)
      },
    }),
  ],
}))

vi.mock('@prosemirror-adapter/react', () => ({
  usePluginViewContext: () => ({ view: {}, prevState: {} }),
}))

vi.mock('./slashInputDelete', () => ({
  deleteSlashInputRange: vi.fn(),
}))

describe('SlashMenuView', () => {
  it('renders block group, divider, and Copilot AI group', () => {
    render(
      <AiComposerPrefillProvider value={{}}>
        <SlashMenuView />
      </AiComposerPrefillProvider>,
    )
    expect(screen.getByTestId('editor-slash-block-h1')).toBeInTheDocument()
    expect(screen.getByTestId('editor-slash-group-divider')).toBeInTheDocument()
    expect(screen.getByTestId('editor-slash-ai-ask')).toBeInTheDocument()
  })

  it('clicking a block item runs deleteSlash then Milkdown command', async () => {
    const user = userEvent.setup()
    const { deleteSlashInputRange } = await import('./slashInputDelete')
    vi.mocked(deleteSlashInputRange).mockClear()
    callSpy.mockClear()
    render(
      <AiComposerPrefillProvider value={{}}>
        <SlashMenuView />
      </AiComposerPrefillProvider>,
    )
    await user.click(screen.getByTestId('editor-slash-block-h2'))
    expect(deleteSlashInputRange).toHaveBeenCalledWith(mockView)
    expect(callSpy).toHaveBeenCalled()
    expect(mockView.focus).toHaveBeenCalled()
  })

  it('clicking a prefill AI item calls onAiComposerPrefill with prefix', async () => {
    const user = userEvent.setup()
    const onAiComposerPrefill = vi.fn()
    const { deleteSlashInputRange } = await import('./slashInputDelete')
    vi.mocked(deleteSlashInputRange).mockClear()
    render(
      <AiComposerPrefillProvider value={{ onAiComposerPrefill }}>
        <SlashMenuView />
      </AiComposerPrefillProvider>,
    )
    await user.click(screen.getByTestId('editor-slash-ai-ask'))
    expect(deleteSlashInputRange).toHaveBeenCalled()
    expect(onAiComposerPrefill).toHaveBeenCalledWith('/ask ')
  })

  it('clicking an execute AI item calls onExecuteCopilotSlash with raw line', async () => {
    const user = userEvent.setup()
    const onExecuteCopilotSlash = vi.fn()
    const { deleteSlashInputRange } = await import('./slashInputDelete')
    vi.mocked(deleteSlashInputRange).mockClear()
    render(
      <AiComposerPrefillProvider value={{ onExecuteCopilotSlash }}>
        <SlashMenuView />
      </AiComposerPrefillProvider>,
    )
    await user.click(screen.getByTestId('editor-slash-ai-append'))
    expect(deleteSlashInputRange).toHaveBeenCalled()
    expect(onExecuteCopilotSlash).toHaveBeenCalledWith('/append')
    expect(onExecuteCopilotSlash).not.toHaveBeenCalledWith('/append ')
  })
})
