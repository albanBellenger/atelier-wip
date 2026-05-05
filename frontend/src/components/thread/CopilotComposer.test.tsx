import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  it('Ctrl+Enter submits when valid', async () => {
    const user = userEvent.setup()
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
    const ta = screen.getByTestId('copilot-composer-textarea')
    await user.click(ta)
    await user.keyboard('{Control>}{Enter}{/Control}')
    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it('slash chip inserts command with trailing space', async () => {
    const user = userEvent.setup()
    const onInsert = vi.fn()
    render(
      <CopilotComposer
        {...baseProps()}
        onInsertSlash={onInsert}
      />,
    )
    await user.click(
      within(screen.getByTestId('copilot-slash-chips')).getByRole('button', {
        name: '/ask',
      }),
    )
    expect(onInsert).toHaveBeenCalledWith('/ask ')
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

  it('compact layout shows scope summary and choose scope control', () => {
    render(
      <CopilotComposer
        {...baseProps()}
        onScopeSection={vi.fn()}
        onScopeSelection={vi.fn()}
      />,
    )
    expect(
      screen.getByText(/No selection — copilot operates on the whole section/),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Choose scope →' }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('copilot-composer-compact')).toBeInTheDocument()
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
