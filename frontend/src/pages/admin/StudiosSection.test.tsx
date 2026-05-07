import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import * as api from '../../services/api'
import { StudiosSection } from './StudiosSection'

const sampleList: api.StudioOverviewRow[] = [
  {
    studio_id: '11111111-1111-1111-1111-111111111111',
    name: 'Studio Alpha',
    description: 'desc',
    created_at: '2026-01-01T00:00:00Z',
    software_count: 2,
    member_count: 3,
    mtd_spend_usd: '1.50',
    budget_cap_monthly_usd: null,
    budget_overage_action: 'pause_generations',
    budget_status: {
      is_capped: false,
      usage_pct: null,
      remaining_monthly_usd: null,
      severity: 'ok',
      over_cap: false,
      blocks_new_usage: false,
    },
  },
]

const sampleDetail: api.AdminStudioDetail = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Studio Alpha',
  description: 'desc',
  logo_path: null,
  created_at: '2026-01-01T00:00:00Z',
  budget_cap_monthly_usd: null,
  budget_overage_action: 'pause_generations',
  software_count: 2,
  member_count: 3,
  mtd_spend_usd: '1.50',
  gitlab: {
    git_provider: 'gitlab',
    git_repo_url: 'https://gitlab.example.com/g/p.git',
    git_branch: 'main',
    git_publish_strategy: 'Pull Request',
    git_token_set: true,
  },
}

function renderStudios(): {
  detailSpy: ReturnType<typeof vi.spyOn>
  putPolicySpy: ReturnType<typeof vi.spyOn>
} {
  vi.spyOn(api, 'listAdminStudios').mockResolvedValue(sampleList)
  const detailSpy = vi.spyOn(api, 'getAdminStudio').mockResolvedValue(sampleDetail)
  vi.spyOn(api, 'getAdminLlmDeployment').mockResolvedValue({
    has_providers: true,
    providers: [
      {
        id: 'p1',
        provider_key: 'openai',
        display_name: 'OpenAI',
        models: ['gpt-4o-mini'],
        api_base_url: null,
        logo_url: null,
        status: 'connected',
        is_default: true,
        sort_order: 0,
        llm_api_key_set: true,
        llm_api_key_hint: '…abcd',
      },
    ],
  })
  vi.spyOn(api, 'getAdminStudioLlmPolicy').mockResolvedValue([
    { provider_key: 'openai', enabled: false, selected_model: 'gpt-4o-mini' },
  ])
  const putPolicySpy = vi.spyOn(api, 'putAdminStudioLlmPolicy').mockResolvedValue([
    { provider_key: 'openai', enabled: true, selected_model: 'gpt-4o-mini' },
  ])

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <StudiosSection />
      </QueryClientProvider>
    </MemoryRouter>,
  )
  return { detailSpy, putPolicySpy }
}

describe('StudiosSection', () => {
  it('lists studios and loads detail from admin APIs', async () => {
    const { detailSpy } = renderStudios()
    expect(await screen.findByText('Studio Alpha')).toBeInTheDocument()
    expect(screen.getByText('2 software · 3 members')).toBeInTheDocument()
    await waitFor(() => {
      expect(detailSpy).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111')
    })
    expect(
      await screen.findByDisplayValue('https://gitlab.example.com/g/p.git'),
    ).toBeInTheDocument()
  })

  it('creates a studio via postAdminStudio', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'listAdminStudios').mockResolvedValue([])
    const postSpy = vi.spyOn(api, 'postAdminStudio').mockResolvedValue({
      id: '22222222-2222-2222-2222-222222222222',
      name: 'New Studio',
      description: null,
      logo_path: null,
      created_at: '2026-02-01T00:00:00Z',
    })
    vi.spyOn(api, 'getAdminStudio').mockResolvedValue({
      ...sampleDetail,
      id: '22222222-2222-2222-2222-222222222222',
      name: 'New Studio',
    })

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <StudiosSection />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByText(/No studios yet/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /new studio/i }))
    await user.type(screen.getByPlaceholderText('My studio'), 'New Studio')
    await user.click(screen.getByRole('button', { name: /^Create$/i }))

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith({
        name: 'New Studio',
        description: null,
      })
    })
  })

  it('toggles provider and calls putAdminStudioLlmPolicy', async () => {
    const user = userEvent.setup()
    const { putPolicySpy } = renderStudios()
    await screen.findByText('Studio Alpha')
    await screen.findByText('OpenAI')

    const switches = screen.getAllByRole('switch')
    expect(switches.length).toBeGreaterThan(0)
    await user.click(switches[0])

    await waitFor(() => {
      expect(putPolicySpy).toHaveBeenCalled()
    })
    const arg = putPolicySpy.mock.calls[0][1] as { rows: api.StudioLlmPolicyRow[] }
    const openai = arg.rows.find((r) => r.provider_key === 'openai')
    expect(openai?.enabled).toBe(true)
  })

  it('calls deleteAdminStudio when Delete studio is confirmed', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.spyOn(api, 'listAdminStudios').mockResolvedValue(sampleList)
    vi.spyOn(api, 'getAdminStudio').mockResolvedValue(sampleDetail)
    vi.spyOn(api, 'getAdminLlmDeployment').mockResolvedValue({
      has_providers: true,
      providers: [
        {
          id: 'p1',
          provider_key: 'openai',
          display_name: 'OpenAI',
          models: ['gpt-4o-mini'],
          api_base_url: null,
          logo_url: null,
          status: 'connected',
          is_default: true,
          sort_order: 0,
          llm_api_key_set: true,
          llm_api_key_hint: '…abcd',
        },
      ],
    })
    vi.spyOn(api, 'getAdminStudioLlmPolicy').mockResolvedValue([
      { provider_key: 'openai', enabled: false, selected_model: 'gpt-4o-mini' },
    ])
    vi.spyOn(api, 'putAdminStudioLlmPolicy').mockResolvedValue([
      { provider_key: 'openai', enabled: true, selected_model: 'gpt-4o-mini' },
    ])
    const deleteSpy = vi.spyOn(api, 'deleteAdminStudio').mockResolvedValue(undefined)

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <StudiosSection />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await screen.findByText('Studio Alpha')
    const deleteBtn = await screen.findByRole('button', { name: /delete studio/i })
    await user.click(deleteBtn)

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111')
    })
  })
})
