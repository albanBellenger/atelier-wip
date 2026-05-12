import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import * as api from '../../services/api'
import { IssuesPanel } from './IssuesPanel'
import type { IssueRow } from '../../services/api'

const driftSectionIssue: IssueRow = {
  id: 'i1',
  project_id: null,
  software_id: 'sw1',
  work_order_id: null,
  kind: 'code_drift_section',
  triggered_by: null,
  section_a_id: 'doc-1',
  section_b_id: null,
  description: 'Spec says X.',
  status: 'open',
  origin: 'auto',
  run_actor_id: 'u1',
  payload_json: {
    severity: 'high',
    code_refs: [{ path: 'a.py', start_line: 1, end_line: 2 }],
  },
  resolution_reason: null,
  created_at: '2026-01-01T00:00:00Z',
}

const driftWoIssue: IssueRow = {
  id: 'i2',
  project_id: 'p1',
  software_id: 'sw1',
  work_order_id: 'wo-9',
  kind: 'code_drift_work_order',
  triggered_by: null,
  section_a_id: null,
  section_b_id: null,
  description: 'WO incomplete.',
  status: 'open',
  origin: 'auto',
  run_actor_id: 'u1',
  payload_json: {
    verdict: 'partial',
    code_refs: [{ path: 'b.py', start_line: 3, end_line: 4 }],
  },
  resolution_reason: null,
  created_at: '2026-01-01T00:00:00Z',
}

const docSyncIssue: IssueRow = {
  id: 'i-doc',
  project_id: null,
  software_id: 'sw1',
  work_order_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  kind: 'doc_update_suggested',
  triggered_by: null,
  section_a_id: 'doc-sec-1',
  section_b_id: null,
  description: 'Rationale text.',
  status: 'open',
  origin: 'auto',
  run_actor_id: 'u1',
  payload_json: { replacement_markdown: 'Line one\nLine two' },
  resolution_reason: null,
  created_at: '2026-01-01T00:00:00Z',
}

function wrap(ui: ReactElement): ReactElement {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('IssuesPanel (code drift)', () => {
  it('does not render run code drift for viewers', () => {
    render(
      wrap(
        <IssuesPanel
          studioId="st"
          softwareId="sw1"
          projectId="p1"
          issues={[driftSectionIssue]}
          canRunAnalysis={false}
          canRunCodeDrift={false}
          canManageIssues={false}
          codeDriftDisabledReason={null}
          analyzePending={false}
          codeDriftPending={false}
          resolvePending={false}
          onRunAnalysis={() => undefined}
          onRunCodeDrift={() => undefined}
          onResolve={() => undefined}
        />,
      ),
    )
    expect(screen.queryByRole('button', { name: /run code drift analysis/i })).toBeNull()
  })

  it('renders code drift kinds with payload and software-doc navigation', async () => {
    const user = userEvent.setup()
    render(
      wrap(
        <IssuesPanel
          studioId="st"
          softwareId="sw1"
          projectId="p1"
          issues={[driftSectionIssue, driftWoIssue]}
          canRunAnalysis
          canRunCodeDrift
          canManageIssues
          codeDriftDisabledReason={null}
          analyzePending={false}
          codeDriftPending={false}
          resolvePending={false}
          onRunAnalysis={() => undefined}
          onRunCodeDrift={() => undefined}
          onResolve={() => undefined}
        />,
      ),
    )
    expect(screen.getByText(/code drift · section/i)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /spec says x\./i }))
    expect(screen.getByText('high')).toBeTruthy()
    expect(screen.getByText(/a\.py:1-2/)).toBeTruthy()
    const docLink = screen.getByRole('link', { name: /open software doc section/i })
    expect(docLink.getAttribute('href')).toContain('/docs/doc-1')

    await user.click(screen.getByRole('button', { name: /wo incomplete/i }))
    const woLink = screen.getByRole('link', { name: /open work order/i })
    expect(woLink.getAttribute('href')).toContain('wo=wo-9')
    expect(screen.getByText('partial')).toBeTruthy()
  })
})

describe('IssuesPanel (doc sync)', () => {
  it('loads section markdown and shows a diff preview for doc_update_suggested', async () => {
    vi.spyOn(api, 'getSoftwareDocsSection').mockResolvedValue({
      id: 'doc-sec-1',
      project_id: null,
      software_id: 'sw1',
      title: 'T',
      slug: 't',
      order: 0,
      content: 'Line one\nOld',
      status: 'ready',
      open_issue_count: 0,
      outline_health: null,
      created_at: '',
      updated_at: '',
    })
    const user = userEvent.setup()
    render(
      wrap(
        <IssuesPanel
          studioId="st"
          softwareId="sw1"
          projectId="p1"
          issues={[docSyncIssue]}
          canRunAnalysis={false}
          canRunCodeDrift={false}
          canManageIssues
          codeDriftDisabledReason={null}
          analyzePending={false}
          codeDriftPending={false}
          resolvePending={false}
          onRunAnalysis={() => undefined}
          onRunCodeDrift={() => undefined}
          onResolve={() => undefined}
        />,
      ),
    )
    await user.click(screen.getByRole('button', { name: /suggested doc update/i }))
    await waitFor(() => {
      expect(screen.getByTestId('doc-sync-diff')).toBeTruthy()
    })
    expect(screen.getByTestId('doc-sync-diff').textContent).toMatch(/Old/)
    expect(screen.getByTestId('doc-sync-diff').textContent).toMatch(/Line two/)
  })

  it('viewer does not see Apply / Dismiss for doc sync issues', () => {
    render(
      wrap(
        <IssuesPanel
          studioId="st"
          softwareId="sw1"
          projectId="p1"
          issues={[docSyncIssue]}
          canRunAnalysis={false}
          canRunCodeDrift={false}
          canManageIssues={false}
          codeDriftDisabledReason={null}
          analyzePending={false}
          codeDriftPending={false}
          resolvePending={false}
          onRunAnalysis={() => undefined}
          onRunCodeDrift={() => undefined}
          onResolve={() => undefined}
        />,
      ),
    )
    expect(screen.queryByRole('button', { name: /^Apply$/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Dismiss/i })).toBeNull()
  })
})
