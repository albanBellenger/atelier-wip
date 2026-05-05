import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ContextPopover } from '../annotations/ContextPopover'

describe('ContextPopover', () => {
  it('shows token budget copy when open', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <ContextPopover
        open
        onClose={onClose}
        tokenUsed={100}
        tokenBudget={8000}
      />,
    )
    expect(screen.getByTestId('context-popover')).toHaveTextContent('8,000')
    await user.click(screen.getByRole('button', { name: /Close/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
