import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { EditorBlockHandleOnboardingTooltip } from './EditorBlockHandleOnboardingTooltip'

describe('EditorBlockHandleOnboardingTooltip', () => {
  it('renders onboarding copy as a non-interactive tooltip', () => {
    const anchorRect = new DOMRect(100, 50, 52, 24)
    render(<EditorBlockHandleOnboardingTooltip anchorRect={anchorRect} />)
    const tip = screen.getByTestId('editor-block-onboarding-tooltip')
    expect(tip).toHaveTextContent('Drag to reorder, click + to insert')
    expect(tip).toHaveAttribute('role', 'tooltip')
    expect(tip.className).toContain('pointer-events-none')
  })
})
