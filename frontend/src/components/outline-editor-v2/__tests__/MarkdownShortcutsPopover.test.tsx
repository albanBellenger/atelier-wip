import userEvent from '@testing-library/user-event'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { MarkdownShortcutsPopover } from '../chrome/MarkdownShortcutsPopover'

describe('MarkdownShortcutsPopover', () => {
  it('is absent from the DOM when closed', () => {
    render(<MarkdownShortcutsPopover open={false} onClose={() => {}} />)
    expect(screen.queryByTestId('markdown-shortcuts-popover')).not.toBeInTheDocument()
  })

  it('lists CommonMark-style triggers when open', () => {
    render(<MarkdownShortcutsPopover open onClose={() => {}} />)
    const dialog = screen.getByTestId('markdown-shortcuts-popover')
    expect(dialog).toHaveTextContent('Heading')
    expect(dialog).toHaveTextContent('Bold')
    expect(dialog).toHaveTextContent('**')
  })

  it('calls onClose when Close is activated', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<MarkdownShortcutsPopover open onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: /Close/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('does not offer section administration actions', () => {
    render(<MarkdownShortcutsPopover open onClose={() => {}} />)
    expect(
      screen.queryByRole('button', { name: /delete section|archive|invite/i }),
    ).not.toBeInTheDocument()
  })
})
