import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { SoftwareDefinitionPreviewCard } from './SoftwareDefinitionPreviewCard'

function wrap(ui: ReactElement): ReturnType<typeof render> {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('SoftwareDefinitionPreviewCard', () => {
  it('renders header, badge, caption, and monospace body', () => {
    wrap(
      <SoftwareDefinitionPreviewCard
        definition={'Line one\nLine two'}
        showEditLink
        settingsPath="/studios/s1/software/sw1/settings"
      />,
    )

    expect(
      screen.getByRole('heading', { name: /^software definition$/i }),
    ).toBeInTheDocument()
    expect(screen.getByText('system prompt')).toBeInTheDocument()
    expect(
      screen.getByText(/injected into every llm call in this software/i),
    ).toBeInTheDocument()
    const edit = screen.getByRole('link', { name: /^edit$/i })
    expect(edit).toHaveAttribute('href', '/studios/s1/software/sw1/settings')
    const pre = screen
      .getByRole('heading', { name: /^software definition$/i })
      .closest('section')
      ?.querySelector('pre')
    expect(pre).toHaveTextContent('Line one')
    expect(pre).toHaveTextContent('Line two')
  })

  it('omits Edit when showEditLink is false', () => {
    wrap(
      <SoftwareDefinitionPreviewCard
        definition="x"
        showEditLink={false}
        settingsPath="/studios/s1/software/sw1/settings"
      />,
    )

    expect(screen.queryByRole('link', { name: /^edit$/i })).not.toBeInTheDocument()
  })

  it('truncates by line and expands on control', async () => {
    const user = userEvent.setup()
    const lines = Array.from({ length: 12 }, (_, i) => `L${i + 1}`).join('\n')
    wrap(
      <SoftwareDefinitionPreviewCard
        definition={lines}
        showEditLink={false}
        settingsPath="/x"
      />,
    )

    const section = screen.getByRole('heading', {
      name: /^software definition$/i,
    }).closest('section')
    const pre = section?.querySelector('pre')
    expect(pre?.textContent).not.toContain('L6')
    expect(pre?.textContent).toContain('L5')
    await user.click(screen.getByRole('button', { name: /show all 12 lines/i }))
    expect(section?.querySelector('pre')?.textContent).toContain('L12')
    await user.click(screen.getByRole('button', { name: /show less/i }))
    expect(section?.querySelector('pre')?.textContent).not.toContain('L12')
  })

  it('shows empty state when definition is blank', () => {
    wrap(
      <SoftwareDefinitionPreviewCard
        definition={null}
        showEditLink={false}
        settingsPath="/x"
      />,
    )

    expect(
      screen.getByText(/no software definition yet/i),
    ).toBeInTheDocument()
  })
})
