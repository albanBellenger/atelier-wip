import userEvent from '@testing-library/user-event'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CopilotOverlay } from './CopilotOverlay'

describe('CopilotOverlay', () => {
  it('does not render panel or actions when closed', () => {
    render(
      <CopilotOverlay open={false} onClose={vi.fn()}>
        <span>child</span>
      </CopilotOverlay>,
    )
    expect(screen.queryByTestId('copilot-overlay')).not.toBeInTheDocument()
    expect(screen.queryByTestId('copilot-expand')).not.toBeInTheDocument()
    expect(screen.queryByTestId('copilot-close')).not.toBeInTheDocument()
  })

  it('renders Expand before Close and toggles panel width', async () => {
    const user = userEvent.setup()
    render(
      <CopilotOverlay open onClose={vi.fn()}>
        <span>child</span>
      </CopilotOverlay>,
    )
    const aside = screen.getByTestId('copilot-overlay')
    const expand = screen.getByTestId('copilot-expand')
    const close = screen.getByTestId('copilot-close')
    expect(expand.compareDocumentPosition(close)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)

    expect(aside).toHaveClass('w-[min(460px,100vw)]')
    await user.click(expand)
    expect(aside).toHaveClass('w-[min(720px,100vw)]')
    expect(expand).toHaveTextContent('Collapse')
    await user.click(expand)
    expect(aside).toHaveClass('w-[min(460px,100vw)]')
    expect(expand).toHaveTextContent('Expand')
  })

  it('resets expanded width when overlay closes and reopens', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <CopilotOverlay open onClose={vi.fn()}>
        <span>child</span>
      </CopilotOverlay>,
    )
    const expand = screen.getByTestId('copilot-expand')
    await user.click(expand)
    expect(screen.getByTestId('copilot-overlay')).toHaveClass('w-[min(720px,100vw)]')

    rerender(
      <CopilotOverlay open={false} onClose={vi.fn()}>
        <span>child</span>
      </CopilotOverlay>,
    )
    rerender(
      <CopilotOverlay open onClose={vi.fn()}>
        <span>child</span>
      </CopilotOverlay>,
    )
    expect(screen.getByTestId('copilot-overlay')).toHaveClass('w-[min(460px,100vw)]')
    expect(screen.getByTestId('copilot-expand')).toHaveTextContent('Expand')
  })
})
