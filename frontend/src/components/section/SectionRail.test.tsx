import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { Section } from '../../services/api'
import { SectionRail } from './SectionRail'

const mk = (over: Partial<Section> = {}): Section => ({
  id: 'sec-1',
  project_id: 'p1',
  title: 'Alpha',
  slug: 'alpha',
  order: 0,
  content: '',
  status: 'ready',
  open_issue_count: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...over,
})

function wrap(ui: ReactElement): ReactElement {
  return <MemoryRouter>{ui}</MemoryRouter>
}

describe('SectionRail', () => {
  it('lists sections and highlights active link', () => {
    render(
      wrap(
        <SectionRail
          studioId="st1"
          softwareId="sw1"
          projectId="p1"
          sections={[mk({ id: 'a', title: 'One' }), mk({ id: 'b', title: 'Two' })]}
          activeSectionId="b"
          collapsed={false}
          onToggleCollapsed={vi.fn()}
        />,
      ),
    )
    expect(screen.getByLabelText('Section outline')).toBeInTheDocument()
    const two = screen.getByRole('link', { name: /Two/i })
    expect(two).toHaveAttribute(
      'href',
      '/studios/st1/software/sw1/projects/p1/sections/b',
    )
  })

  it('shows outline health in link title when present', () => {
    render(
      wrap(
        <SectionRail
          studioId="st1"
          softwareId="sw1"
          projectId="p1"
          sections={[
            mk({
              id: 'a',
              title: 'One',
              outline_health: {
                drift_count: 1,
                gap_count: 0,
                token_used: 100,
                token_budget: 6000,
                citation_scan_pending: true,
              },
            }),
          ]}
          activeSectionId="a"
          collapsed={false}
          onToggleCollapsed={vi.fn()}
        />,
      ),
    )
    const link = screen.getByRole('link', { name: /One/i })
    expect(link.getAttribute('title')).toContain('Drift 1')
  })

  it('collapses to control only and hides list', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(
      wrap(
        <SectionRail
          studioId="st1"
          softwareId="sw1"
          projectId="p1"
          sections={[mk()]}
          activeSectionId="sec-1"
          collapsed
          onToggleCollapsed={onToggle}
        />,
      ),
    )
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Expand outline' }),
    )
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})
