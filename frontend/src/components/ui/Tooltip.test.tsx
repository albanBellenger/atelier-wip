import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { Tooltip } from './Tooltip'

describe('Tooltip', () => {
  it('renders children', () => {
    render(
      <Tooltip content="Help text">
        <span>Label</span>
      </Tooltip>,
    )
    expect(screen.getByText('Label')).toBeInTheDocument()
  })

  it('shows tooltip content on hover and hides on unhover', async () => {
    const user = userEvent.setup()
    render(
      <Tooltip content="Expanded help for editors">
        <span>Label</span>
      </Tooltip>,
    )
    const trigger = screen.getByText('Label')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    await user.hover(trigger)
    expect(screen.getByRole('tooltip', { name: /expanded help for editors/i })).toBeInTheDocument()

    await user.unhover(trigger)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('shows tooltip when a static trigger receives keyboard focus', async () => {
    const user = userEvent.setup()
    render(
      <Tooltip content="Keyboard-visible help">
        <span>Label only</span>
      </Tooltip>,
    )
    await user.tab()
    const label = screen.getByText('Label only')
    expect(label.parentElement).toHaveFocus()
    expect(screen.getByRole('tooltip', { name: /keyboard-visible help/i })).toBeInTheDocument()
  })

  it('shows tooltip when a nested button is focused (accessibleTrigger=false)', async () => {
    const user = userEvent.setup()
    render(
      <Tooltip content="Action help" accessibleTrigger={false}>
        <button type="button">Open</button>
      </Tooltip>,
    )
    await user.tab()
    expect(screen.getByRole('button', { name: /open/i })).toHaveFocus()
    expect(screen.getByRole('tooltip', { name: /action help/i })).toBeInTheDocument()
  })

  it('does not expose tooltip chrome when disabled (viewer-style)', async () => {
    const user = userEvent.setup()
    render(
      <Tooltip content="Privileged breakdown" disabled>
        <span>Summary</span>
      </Tooltip>,
    )
    const trigger = screen.getByText('Summary')
    await user.hover(trigger)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(screen.queryByText(/privileged breakdown/i)).not.toBeInTheDocument()
  })

  it('allows links in the panel when interactive', async () => {
    const user = userEvent.setup()
    render(
      <Tooltip
        interactive
        accessibleTrigger={false}
        content={
          <a href="https://example.com/docs" className="text-violet-400">
            Doc link
          </a>
        }
      >
        <button type="button">Trigger</button>
      </Tooltip>,
    )
    await user.hover(screen.getByRole('button', { name: /trigger/i }))
    const tip = await screen.findByRole('tooltip')
    expect(within(tip).getByRole('link', { name: /doc link/i })).toHaveAttribute(
      'href',
      'https://example.com/docs',
    )
  })
})
