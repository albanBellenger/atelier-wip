import userEvent from '@testing-library/user-event'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StatusBar } from '../chrome/StatusBar'

describe('StatusBar', () => {
  it('invokes onSetRawDefault for RAW and WYSIWYG', async () => {
    const user = userEvent.setup()
    const onSet = vi.fn()
    render(
      <StatusBar
        driftCount={0}
        gapCount={0}
        tokenUsed={1}
        tokenBudget={2}
        citationsResolved={0}
        citationsMissing={0}
        wordCount={3}
        filename="x.md"
        rawMode={false}
        onSetRawDefault={onSet}
      />,
    )
    await user.click(screen.getByTestId('status-raw-toggle'))
    await user.click(screen.getByTestId('status-wysiwyg-toggle'))
    expect(onSet).toHaveBeenCalledWith(true)
    expect(onSet).toHaveBeenCalledWith(false)
  })

  it('opens Markdown shortcuts popover from footer link', async () => {
    const user = userEvent.setup()
    render(
      <StatusBar
        driftCount={0}
        gapCount={0}
        tokenUsed={1}
        tokenBudget={2}
        citationsResolved={0}
        citationsMissing={0}
        wordCount={3}
        filename="x.md"
        rawMode={false}
        onSetRawDefault={vi.fn()}
      />,
    )
    await user.click(
      screen.getByRole('button', { name: /Markdown shortcuts/i }),
    )
    expect(screen.getByTestId('markdown-shortcuts-popover')).toBeVisible()
  })

  it('does not show Markdown shortcuts control when help is disabled', () => {
    render(
      <StatusBar
        driftCount={0}
        gapCount={0}
        tokenUsed={1}
        tokenBudget={2}
        citationsResolved={0}
        citationsMissing={0}
        wordCount={3}
        filename="x.md"
        rawMode={false}
        onSetRawDefault={vi.fn()}
        markdownShortcutsHelp={false}
      />,
    )
    expect(
      screen.queryByRole('button', { name: /Markdown shortcuts/i }),
    ).not.toBeInTheDocument()
  })
})
