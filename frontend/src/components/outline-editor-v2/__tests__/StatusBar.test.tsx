import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StatusBar } from '../chrome/StatusBar'

describe('StatusBar', () => {
  it('invokes onSetRawDefault for RAW and WYSIWYG', () => {
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
    fireEvent.click(screen.getByTestId('status-raw-toggle'))
    fireEvent.click(screen.getByTestId('status-wysiwyg-toggle'))
    expect(onSet).toHaveBeenCalledWith(true)
    expect(onSet).toHaveBeenCalledWith(false)
  })
})
