import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as api from '../services/api'
import { ProjectSettingsPage } from './ProjectSettingsPage'

afterEach(() => {
  vi.restoreAllMocks()
})

const adminMe: api.MeResponse = {
  user: {
    id: 'u1',
    email: 'a@b.com',
    display_name: 'Admin',
    is_platform_admin: false,
  },
  studios: [{ studio_id: 's1', studio_name: 'S', role: 'studio_admin' }],
  cross_studio_grants: [],
}

const softwareRow: api.Software = {
  id: 'sw1',
  studio_id: 's1',
  name: 'SW',
  description: null,
  definition: null,
  git_provider: 'gitlab',
  git_repo_url: null,
  git_branch: 'main',
  git_token_set: false,
  created_at: '',
  updated_at: '',
}

function mockListProjectsNav(projects: api.Project[]): void {
  vi.spyOn(api, 'listProjects').mockResolvedValue(projects)
}

function renderPage(
  path = '/studios/s1/software/sw1/projects/p1/settings',
): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route
            path="/studios/:studioId/software/:softwareId/projects/:projectId/settings"
            element={<ProjectSettingsPage />}
          />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('ProjectSettingsPage', () => {
  it('shows project name and description for a Studio Owner and saves', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'listMeNotifications').mockResolvedValue({
      items: [],
      next_cursor: null,
    })
    vi.spyOn(api, 'me').mockResolvedValue(adminMe)
    vi.spyOn(api, 'getSoftware').mockResolvedValue(softwareRow)
    vi.spyOn(api, 'listSoftware').mockResolvedValue([softwareRow])
    mockListProjectsNav([
      {
        id: 'p1',
        software_id: 'sw1',
        name: 'My project',
        description: null,
        publish_folder_slug: 'my-project',
        archived: false,
        created_at: '',
        updated_at: '',
        sections: null,
        work_orders_done: 0,
        work_orders_total: 0,
        sections_count: 0,
        last_edited_at: null,
      },
    ])
    vi.spyOn(api, 'getProject').mockResolvedValue({
      id: 'p1',
      software_id: 'sw1',
      name: 'My project',
      description: 'Hello',
      publish_folder_slug: 'my-project',
      archived: false,
      created_at: '',
      updated_at: '2026-01-02T00:00:00Z',
      work_orders_done: 0,
      work_orders_total: 0,
      sections_count: 0,
      last_edited_at: null,
      sections: [],
    })
    vi.spyOn(api, 'listSoftwareArtifacts').mockResolvedValue([])
    const updateSpy = vi.spyOn(api, 'updateProject').mockResolvedValue({
      id: 'p1',
      software_id: 'sw1',
      name: 'My project X',
      description: 'Hello',
      publish_folder_slug: 'my-project',
      archived: false,
      created_at: '',
      updated_at: '2026-01-03T00:00:00Z',
      work_orders_done: 0,
      work_orders_total: 0,
      sections_count: 0,
      last_edited_at: null,
      sections: [],
    })

    renderPage()

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /project settings/i }),
      ).toBeInTheDocument()
    })

    const nameInput = screen.getByRole('textbox', { name: /project name/i })
    expect(nameInput).toHaveValue('My project')
    await user.clear(nameInput)
    await user.type(nameInput, 'My project X')

    await user.click(screen.getByRole('button', { name: /save project/i }))

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith('sw1', 'p1', {
        name: 'My project X',
        description: 'Hello',
        publish_folder_slug: 'my-project',
      })
    })
  })

  it('viewer cannot save project settings', async () => {
    vi.spyOn(api, 'listMeNotifications').mockResolvedValue({
      items: [],
      next_cursor: null,
    })
    vi.spyOn(api, 'me').mockResolvedValue({
      user: {
        id: 'u2',
        email: 'v@b.com',
        display_name: 'Viewer',
        is_platform_admin: false,
      },
      studios: [{ studio_id: 's1', studio_name: 'S', role: 'studio_viewer' }],
      cross_studio_grants: [],
    })
    vi.spyOn(api, 'getSoftware').mockResolvedValue(softwareRow)
    vi.spyOn(api, 'listSoftware').mockResolvedValue([softwareRow])
    mockListProjectsNav([
      {
        id: 'p1',
        software_id: 'sw1',
        name: 'P',
        description: null,
        publish_folder_slug: 'p',
        archived: false,
        created_at: '',
        updated_at: '',
        sections: null,
        work_orders_done: 0,
        work_orders_total: 0,
        sections_count: 0,
        last_edited_at: null,
      },
    ])
    vi.spyOn(api, 'getProject').mockResolvedValue({
      id: 'p1',
      software_id: 'sw1',
      name: 'P',
      description: null,
      publish_folder_slug: 'p',
      archived: false,
      created_at: '',
      updated_at: '',
      work_orders_done: 0,
      work_orders_total: 0,
      sections_count: 0,
      last_edited_at: null,
      sections: [],
    })
    vi.spyOn(api, 'listSoftwareArtifacts').mockResolvedValue([
      {
        id: 'a1',
        project_id: 'p1',
        project_name: 'P',
        name: 'Doc',
        file_type: 'md',
        size_bytes: 5,
        uploaded_by: 'u2',
        uploaded_by_display: 'Viewer',
        created_at: '2026-01-01T00:00:00Z',
        scope_level: 'project',
        excluded_at_software: null,
        excluded_at_project: null,
      },
    ])

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /^Details$/i })).toBeInTheDocument()
    })
    expect(
      screen.queryByRole('button', { name: /save project/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('switch', { name: /exclude doc from project context/i }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /archive project/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /restore project/i })).not.toBeInTheDocument()
  })

  it('Builder can archive project after confirm', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.spyOn(api, 'listMeNotifications').mockResolvedValue({
      items: [],
      next_cursor: null,
    })
    vi.spyOn(api, 'me').mockResolvedValue({
      user: {
        id: 'um',
        email: 'm@b.com',
        display_name: 'Member',
        is_platform_admin: false,
      },
      studios: [{ studio_id: 's1', studio_name: 'S', role: 'studio_member' }],
      cross_studio_grants: [],
    })
    vi.spyOn(api, 'getSoftware').mockResolvedValue(softwareRow)
    vi.spyOn(api, 'listSoftware').mockResolvedValue([softwareRow])
    mockListProjectsNav([
      {
        id: 'p1',
        software_id: 'sw1',
        name: 'P',
        description: null,
        publish_folder_slug: 'p',
        archived: false,
        created_at: '',
        updated_at: '',
        sections: null,
        work_orders_done: 0,
        work_orders_total: 0,
        sections_count: 0,
        last_edited_at: null,
      },
    ])
    const activeProj = {
      id: 'p1',
      software_id: 'sw1',
      name: 'P',
      description: null,
      publish_folder_slug: 'p',
      archived: false,
      created_at: '',
      updated_at: '',
      work_orders_done: 0,
      work_orders_total: 0,
      sections_count: 0,
      last_edited_at: null,
      sections: [],
    }
    const archivedProj = { ...activeProj, archived: true }
    vi.spyOn(api, 'getProject')
      .mockResolvedValueOnce(activeProj)
      .mockResolvedValue(archivedProj)
    vi.spyOn(api, 'listSoftwareArtifacts').mockResolvedValue([])
    const archiveSpy = vi.spyOn(api, 'patchProjectArchived').mockResolvedValue(archivedProj)

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /archive project/i })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /archive project/i }))

    await waitFor(() => {
      expect(archiveSpy).toHaveBeenCalledWith('sw1', 'p1', true)
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /restore project/i })).toBeInTheDocument()
    })
  })

  it('Builder can toggle project-scope artifact exclusion', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'listMeNotifications').mockResolvedValue({
      items: [],
      next_cursor: null,
    })
    vi.spyOn(api, 'me').mockResolvedValue({
      user: {
        id: 'um',
        email: 'm@b.com',
        display_name: 'Member',
        is_platform_admin: false,
      },
      studios: [{ studio_id: 's1', studio_name: 'S', role: 'studio_member' }],
      cross_studio_grants: [],
    })
    vi.spyOn(api, 'getSoftware').mockResolvedValue(softwareRow)
    vi.spyOn(api, 'listSoftware').mockResolvedValue([softwareRow])
    mockListProjectsNav([
      {
        id: 'p1',
        software_id: 'sw1',
        name: 'P',
        description: null,
        publish_folder_slug: 'p',
        archived: false,
        created_at: '',
        updated_at: '',
        sections: null,
        work_orders_done: 0,
        work_orders_total: 0,
        sections_count: 0,
        last_edited_at: null,
      },
    ])
    vi.spyOn(api, 'getProject').mockResolvedValue({
      id: 'p1',
      software_id: 'sw1',
      name: 'P',
      description: null,
      publish_folder_slug: 'p',
      archived: false,
      created_at: '',
      updated_at: '',
      work_orders_done: 0,
      work_orders_total: 0,
      sections_count: 0,
      last_edited_at: null,
      sections: [],
    })
    vi.spyOn(api, 'listSoftwareArtifacts').mockResolvedValue([
      {
        id: 'a1',
        project_id: 'p1',
        project_name: 'P',
        name: 'Doc',
        file_type: 'md',
        size_bytes: 8,
        uploaded_by: 'um',
        uploaded_by_display: 'Member',
        created_at: '2026-01-01T00:00:00Z',
        scope_level: 'project',
        excluded_at_software: null,
        excluded_at_project: null,
      },
    ])
    const patchSpy = vi.spyOn(api, 'patchProjectArtifactExclusion').mockResolvedValue({
      artifact_id: 'a1',
      excluded: true,
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Doc')).toBeInTheDocument()
    })
    const sw = screen.getByRole('switch', {
      name: /exclude doc from project context/i,
    })
    await user.click(sw)

    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith('s1', 'sw1', 'p1', {
        artifact_id: 'a1',
        excluded: true,
      })
    })
  })
})
