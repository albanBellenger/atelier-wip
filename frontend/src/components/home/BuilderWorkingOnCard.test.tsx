import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { BuilderWorkingOnCard } from './BuilderWorkingOnCard'
import type { Project, Software } from '../../services/api'

function softwareFixture(overrides: Partial<Software> = {}): Software {
  return {
    id: 'sw-1',
    studio_id: 'st-1',
    name: 'Employee Hub',
    description: null,
    definition: 'Spec body',
    git_provider: null,
    git_repo_url: 'https://gitlab.com/org/repo',
    git_branch: 'main',
    git_token_set: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function projectFixture(overrides: Partial<Project> = {}): Project {
  return {
    id: 'pr-1',
    software_id: 'sw-1',
    name: 'Alpha',
    description: null,
    archived: false,
    publish_folder_slug: 'pf',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    sections: null,
    work_orders_done: 0,
    work_orders_total: 0,
    sections_count: 0,
    last_edited_at: null,
    ...overrides,
  }
}

describe('BuilderWorkingOnCard', () => {
  it('links the software title to the software landing page', () => {
    const software = softwareFixture()
    const project = projectFixture()
    render(
      <MemoryRouter>
        <BuilderWorkingOnCard
          studioId="studio-a"
          software={software}
          projects={[project]}
          project={project}
          sectionCount={3}
          sectionId="sec-1"
          onSelectProjectId={() => {}}
          workOrderCount={2}
          workOrdersLoading={false}
          lastPublishRelative="2h ago"
          gitHistoryLoading={false}
          otherProjects={[]}
        />
      </MemoryRouter>,
    )

    const titleLink = screen.getByRole('link', { name: /^employee hub$/i })
    expect(titleLink).toHaveAttribute(
      'href',
      '/studios/studio-a/software/sw-1',
    )
  })

  it('does not surface tool-admin or studio-settings links on this card', () => {
    const software = softwareFixture({ name: 'Acme App' })
    render(
      <MemoryRouter>
        <BuilderWorkingOnCard
          studioId="s"
          software={software}
          projects={[]}
          project={null}
          sectionCount={0}
          sectionId={null}
          onSelectProjectId={() => {}}
          workOrderCount={null}
          workOrdersLoading={false}
          lastPublishRelative={null}
          gitHistoryLoading={false}
          otherProjects={[]}
        />
      </MemoryRouter>,
    )

    expect(
      screen.queryByRole('link', { name: /tool admin settings/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /studio settings/i }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^acme app$/i })).toHaveAttribute(
      'href',
      '/studios/s/software/sw-1',
    )
  })
})
