import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { editorViewCtx } from '@milkdown/kit/core'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@milkdown/kit/plugin/tooltip', () => ({
  tooltipFactory: vi.fn(() => ({})),
  TooltipProvider: class {
    destroy(): void {}
    update(): void {}
  },
}))

import { AiComposerPrefillProvider } from './aiComposerPrefillContext'
import { BubbleMenuView } from './BubbleMenuView'

const { mockCtx, focus } = vi.hoisted(() => {
  const focusInner = vi.fn()
  const mockCtxInner = {
    get: (token: unknown) => {
      if (token === editorViewCtx) {
        return { focus: focusInner }
      }
      return {}
    },
  }
  return { mockCtx: mockCtxInner, focus: focusInner }
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

describe('BubbleMenuView', () => {
  it('prefill AI item calls onAiComposerPrefill', async () => {
    const user = userEvent.setup()
    const onAiComposerPrefill = vi.fn()
    render(
      <AiComposerPrefillProvider value={{ onAiComposerPrefill }}>
        <BubbleMenuView />
      </AiComposerPrefillProvider>,
    )
    await user.click(screen.getByTestId('editor-bubble-ai-ask'))
    expect(focus).toHaveBeenCalled()
    expect(onAiComposerPrefill).toHaveBeenCalledWith('/ask ')
  })

  it('execute AI item calls onExecuteCopilotSlash', async () => {
    const user = userEvent.setup()
    const onExecuteCopilotSlash = vi.fn()
    const onAiComposerPrefill = vi.fn()
    render(
      <AiComposerPrefillProvider
        value={{ onAiComposerPrefill, onExecuteCopilotSlash }}
      >
        <BubbleMenuView />
      </AiComposerPrefillProvider>,
    )
    await user.click(screen.getByTestId('editor-bubble-ai-critique'))
    expect(focus).toHaveBeenCalled()
    expect(onExecuteCopilotSlash).toHaveBeenCalledWith('/critique')
    expect(onAiComposerPrefill).not.toHaveBeenCalled()
  })
})
