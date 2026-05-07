import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { Section } from '../../services/api'
import { reorderSectionIdsAfterDrag, SectionRail } from './SectionRail'

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

describe('reorderSectionIdsAfterDrag', () => {
  it('returns reordered ids when active moves down', () => {
    expect(
      reorderSectionIdsAfterDrag(['a', 'b', 'c'], 'a', 'b'),
    ).toEqual(['b', 'a', 'c'])
  })

  it('returns null when ids are unchanged', () => {
    expect(reorderSectionIdsAfterDrag(['a', 'b'], 'a', 'a')).toBeNull()
  })

  it('returns null when over id is missing from list', () => {
    expect(reorderSectionIdsAfterDrag(['a', 'b'], 'a', 'z')).toBeNull()
  })
})

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
    expect(screen.queryByTestId('section-rail-add-open')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Drag to reorder' }),
    ).not.toBeInTheDocument()
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

  it('opens add form and calls onCreate with title and slug', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn().mockResolvedValue(undefined)
    render(
      wrap(
        <SectionRail
          studioId="st1"
          softwareId="sw1"
          projectId="p1"
          sections={[mk()]}
          activeSectionId="sec-1"
          collapsed={false}
          onToggleCollapsed={vi.fn()}
          addSection={{ onCreate, isPending: false }}
        />,
      ),
    )
    await user.click(screen.getByTestId('section-rail-add-open'))
    await user.type(screen.getByTestId('section-rail-add-title'), 'My doc')
    await user.type(screen.getByTestId('section-rail-add-slug'), 'my-doc')
    await user.click(screen.getByTestId('section-rail-add-create'))
    expect(onCreate).toHaveBeenCalledWith({
      title: 'My doc',
      slug: 'my-doc',
    })
    expect(screen.queryByTestId('section-rail-add-title')).not.toBeInTheDocument()
  })

  it('passes null slug when slug field is blank', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn().mockResolvedValue(undefined)
    render(
      wrap(
        <SectionRail
          studioId="st1"
          softwareId="sw1"
          projectId="p1"
          sections={[mk()]}
          activeSectionId="sec-1"
          collapsed={false}
          onToggleCollapsed={vi.fn()}
          addSection={{ onCreate, isPending: false }}
        />,
      ),
    )
    await user.click(screen.getByTestId('section-rail-add-open'))
    await user.click(screen.getByTestId('section-rail-add-create'))
    expect(onCreate).toHaveBeenCalledWith({ title: 'Untitled', slug: null })
  })

  it('shows error when onCreate rejects', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn().mockRejectedValue(new Error('fail'))
    render(
      wrap(
        <SectionRail
          studioId="st1"
          softwareId="sw1"
          projectId="p1"
          sections={[mk()]}
          activeSectionId="sec-1"
          collapsed={false}
          onToggleCollapsed={vi.fn()}
          addSection={{ onCreate, isPending: false }}
        />,
      ),
    )
    await user.click(screen.getByTestId('section-rail-add-open'))
    await user.click(screen.getByTestId('section-rail-add-create'))
    expect(
      await screen.findByText('Could not create section.'),
    ).toBeInTheDocument()
  })

  it('cancels add form without calling onCreate', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    render(
      wrap(
        <SectionRail
          studioId="st1"
          softwareId="sw1"
          projectId="p1"
          sections={[mk()]}
          activeSectionId="sec-1"
          collapsed={false}
          onToggleCollapsed={vi.fn()}
          addSection={{ onCreate, isPending: false }}
        />,
      ),
    )
    await user.click(screen.getByTestId('section-rail-add-open'))
    await user.type(screen.getByTestId('section-rail-add-title'), 'X')
    await user.click(screen.getByTestId('section-rail-add-cancel'))
    expect(onCreate).not.toHaveBeenCalled()
    expect(screen.getByTestId('section-rail-add-open')).toBeInTheDocument()
  })

  it('shows drag handles when reorderSections is set', () => {
    render(
      wrap(
        <SectionRail
          studioId="st1"
          softwareId="sw1"
          projectId="p1"
          sections={[
            mk({ id: 'a', title: 'One' }),
            mk({ id: 'b', title: 'Two' }),
          ]}
          activeSectionId="a"
          collapsed={false}
          onToggleCollapsed={vi.fn()}
          reorderSections={{
            onReorder: vi.fn(),
            isPending: false,
          }}
        />,
      ),
    )
    expect(
      screen.getAllByRole('button', { name: 'Drag to reorder' }),
    ).toHaveLength(2)
  })

  it('hides add section when rail is collapsed', () => {
    render(
      wrap(
        <SectionRail
          studioId="st1"
          softwareId="sw1"
          projectId="p1"
          sections={[mk()]}
          activeSectionId="sec-1"
          collapsed
          onToggleCollapsed={vi.fn()}
          addSection={{ onCreate: vi.fn(), isPending: false }}
        />,
      ),
    )
    expect(screen.queryByTestId('section-rail-add-open')).not.toBeInTheDocument()
  })
})
