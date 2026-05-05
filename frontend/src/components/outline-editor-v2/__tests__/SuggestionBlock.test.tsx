import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SuggestionBlock } from '../canvas/SuggestionBlock'

describe('SuggestionBlock', () => {
  it('Accept triggers onApply; Reject calls onDismiss', () => {
    const onApply = vi.fn()
    const onDismiss = vi.fn()
    render(
      <SuggestionBlock
        overlay={{
          mergedMarkdown: '## New',
          canApply: true,
          blockedReason: null,
          onApply,
          onDismiss,
        }}
      />,
    )
    fireEvent.click(screen.getByTestId('suggestion-apply'))
    fireEvent.click(screen.getByTestId('suggestion-dismiss'))
    expect(onApply).toHaveBeenCalledTimes(1)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('returns null when overlay is null', () => {
    const { container } = render(<SuggestionBlock overlay={null} />)
    expect(container.querySelector('[data-testid="ai-suggestion-block"]')).toBeNull()
  })
})
