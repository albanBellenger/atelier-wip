import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { SectionHealth } from '../../services/api'
import { HealthRail } from './HealthRail'

const baseHealth: SectionHealth = {
  drift_count: 1,
  gap_count: 0,
  token_used: 100,
  token_budget: 6000,
  citations_resolved: 2,
  citations_missing: 0,
  drawer_drift: 'Drift detail text.',
  drawer_gap: null,
  drawer_tokens: null,
  drawer_sources: null,
}

describe('HealthRail', () => {
  it('shows drawer and calls onOpenInCopilot with critique for drift', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    render(
      <HealthRail
        health={baseHealth}
        openKey="drift"
        onToggle={vi.fn()}
        onOpenInCopilot={onOpen}
      />,
    )
    expect(screen.getByTestId('health-rail-drawer')).toBeInTheDocument()
    await user.click(screen.getByTestId('health-rail-open-copilot'))
    expect(onOpen).toHaveBeenCalledWith('critique')
  })

  it('maps tokens row to context tab', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    render(
      <HealthRail
        health={baseHealth}
        openKey="tok"
        onToggle={vi.fn()}
        onOpenInCopilot={onOpen}
      />,
    )
    await user.click(screen.getByTestId('health-rail-open-copilot'))
    expect(onOpen).toHaveBeenCalledWith('context')
  })

  it('maps sources row to sources tab', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    render(
      <HealthRail
        health={baseHealth}
        openKey="src"
        onToggle={vi.fn()}
        onOpenInCopilot={onOpen}
      />,
    )
    await user.click(screen.getByTestId('health-rail-open-copilot'))
    expect(onOpen).toHaveBeenCalledWith('sources')
  })

  it('fills drawer from counts when drawer_* is null or blank', () => {
    const h: SectionHealth = {
      drift_count: 0,
      gap_count: 2,
      token_used: 900,
      token_budget: 6000,
      citations_resolved: 1,
      citations_missing: 3,
      drawer_drift: null,
      drawer_gap: null,
      drawer_tokens: '   ',
      drawer_sources: null,
    }
    const { rerender } = render(
      <HealthRail health={h} openKey="gap" onToggle={vi.fn()} />,
    )
    expect(screen.getByTestId('health-rail-drawer')).toHaveTextContent(
      '2 open section-scoped issue',
    )
    rerender(<HealthRail health={h} openKey="tok" onToggle={vi.fn()} />)
    expect(screen.getByTestId('health-rail-drawer')).toHaveTextContent('900')
    expect(screen.getByTestId('health-rail-drawer')).toHaveTextContent('6,000')
  })
})
