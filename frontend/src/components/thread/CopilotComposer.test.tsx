import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CopilotComposer } from './CopilotComposer'

function baseProps() {
  return {
    draft: '',
    canSend: true,
    sending: false,
    improving: false,
    replaceBlocked: false,
    includeSelectionInContext: true,
    includeGitHistory: false,
    selectionChars: 0,
    hasSelection: false,
    onDraftChange: vi.fn(),
    onSend: vi.fn(),
    onClearEditorSelection: vi.fn(),
    onToggleSelection: vi.fn(),
    onToggleGitHistory: vi.fn(),
    onInsertSlash: vi.fn(),
  } as const
}

describe('CopilotComposer', () => {
  it('parses slash intent from draft and shows chip for /append', () => {
    render(
      <CopilotComposer
        draft="/append hello"
        canSend
        sending={false}
        improving={false}
        replaceBlocked={false}
        includeSelectionInContext
        includeGitHistory={false}
        selectionChars={0}
        hasSelection={false}
        onDraftChange={vi.fn()}
        onSend={vi.fn()}
        onClearEditorSelection={vi.fn()}
        onToggleSelection={vi.fn()}
        onToggleGitHistory={vi.fn()}
        onInsertSlash={vi.fn()}
      />,
    )
    expect(screen.getByTestId('slash-command-chip')).toHaveTextContent(
      'append',
    )
  })

  it('disables send when /replace without selection', () => {
    render(
      <CopilotComposer
        draft="/replace fix it"
        canSend
        sending={false}
        improving={false}
        replaceBlocked
        replaceBlockedReason="Need selection"
        includeSelectionInContext
        includeGitHistory={false}
        selectionChars={0}
        hasSelection={false}
        onDraftChange={vi.fn()}
        onSend={vi.fn()}
        onClearEditorSelection={vi.fn()}
        onToggleSelection={vi.fn()}
        onToggleGitHistory={vi.fn()}
        onInsertSlash={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })

  it('⌘+Enter submits when valid', () => {
    const onSend = vi.fn()
    render(
      <CopilotComposer
        draft="hello"
        canSend
        sending={false}
        improving={false}
        replaceBlocked={false}
        includeSelectionInContext
        includeGitHistory={false}
        selectionChars={0}
        hasSelection={false}
        onDraftChange={vi.fn()}
        onSend={onSend}
        onClearEditorSelection={vi.fn()}
        onToggleSelection={vi.fn()}
        onToggleGitHistory={vi.fn()}
        onInsertSlash={vi.fn()}
      />,
    )
    const ta = screen.getByPlaceholderText(/copilot/)
    fireEvent.keyDown(ta, { key: 'Enter', metaKey: true })
    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it('viewer cannot send when canSend is false', () => {
    render(
      <CopilotComposer
        {...baseProps()}
        draft="hello"
        canSend={false}
      />,
    )
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })

  it('renders footerLeading on the composer row', () => {
    render(
      <CopilotComposer
        {...baseProps()}
        draft="x"
        footerLeading={<span data-testid="footer-leading">Model line</span>}
      />,
    )
    expect(screen.getByTestId('footer-leading')).toHaveTextContent('Model line')
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
  })
})
