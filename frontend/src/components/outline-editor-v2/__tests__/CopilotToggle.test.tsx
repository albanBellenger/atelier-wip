import userEvent from '@testing-library/user-event'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CopilotToggle } from '../chrome/CopilotToggle'

describe('CopilotToggle', () => {
  it('calls onToggle when clicked', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(<CopilotToggle open={false} onToggle={onToggle} />)
    await user.click(screen.getByTestId('copilot-header-toggle'))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('shows badge when badgeCount > 0', () => {
    render(<CopilotToggle open={false} onToggle={() => {}} badgeCount={3} />)
    expect(screen.getByTestId('copilot-toggle-badge')).toHaveTextContent('3')
  })

  it('does not show badge when badgeCount is 0', () => {
    render(<CopilotToggle open={false} onToggle={() => {}} badgeCount={0} />)
    expect(screen.queryByTestId('copilot-toggle-badge')).not.toBeInTheDocument()
  })

  it('reflects open state in aria-pressed and aria-expanded', () => {
    const { rerender } = render(<CopilotToggle open={false} onToggle={() => {}} />)
    const btn = screen.getByTestId('copilot-header-toggle')
    expect(btn).toHaveAttribute('aria-pressed', 'false')
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    rerender(<CopilotToggle open onToggle={() => {}} />)
    expect(btn).toHaveAttribute('aria-pressed', 'true')
    expect(btn).toHaveAttribute('aria-expanded', 'true')
  })
})
