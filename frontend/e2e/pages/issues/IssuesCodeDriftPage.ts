import type { Page } from '@playwright/test'
import { request } from '@playwright/test'

import { ROUTE } from '../../routePatterns'
import { stubStudioCapabilitiesPlatformOwner } from '../../stubs/studioCapabilitiesStub'

/** Issues page + code drift run (network partially stubbed). */
export class IssuesCodeDriftPage {
  constructor(private readonly page: Page) {}

  async gotoIssues(
    studioId: string,
    softwareId: string,
    projectId: string,
  ): Promise<void> {
    await this.page.goto(
      `/studios/${studioId}/software/${softwareId}/projects/${projectId}/issues`,
    )
  }

  async seedStudioSoftwareProject(): Promise<{
    studioId: string
    softwareId: string
    projectId: string
  }> {
    const base = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173'
    const storage = await this.page.context().storageState()
    const api = await request.newContext({ baseURL: base, storageState: storage })
    try {
      const cr = await api.post('/admin/studios', {
        data: { name: `E2E CD ${Date.now()}`, description: 'x' },
      })
      if (!cr.ok()) {
        throw new Error(`seed studio: ${cr.status()} ${await cr.text()}`)
      }
      const studioId = (await cr.json()) as { id: string }
      const sw = await api.post(`/studios/${studioId.id}/software`, {
        data: { name: 'E2E SW', description: '' },
      })
      if (!sw.ok()) {
        throw new Error(`seed software: ${sw.status()} ${await sw.text()}`)
      }
      const softwareId = (await sw.json()) as { id: string }
      const pr = await api.post(`/software/${softwareId.id}/projects`, {
        data: { name: 'E2E Proj', description: '' },
      })
      if (!pr.ok()) {
        throw new Error(`seed project: ${pr.status()} ${await pr.text()}`)
      }
      const projectId = (await pr.json()) as { id: string }
      return {
        studioId: studioId.id,
        softwareId: softwareId.id,
        projectId: projectId.id,
      }
    } finally {
      await api.dispose()
    }
  }

  /**
   * Stubs ready snapshot, code drift POST success, and issues GET that returns
   * one open drift issue after the first GET (simulates refetch after run).
   */
  async stubSnapshotsDriftRunAndIssuesList(issueId: string, softwareId: string): Promise<void> {
    await stubStudioCapabilitiesPlatformOwner(this.page)
    let sawDriftRun = false
    let sawResolve = false
    await this.page.route(ROUTE.softwareCodebaseSnapshots, async (route) => {
      if (route.request().resourceType() === 'document') {
        await route.continue()
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: '00000000-0000-4000-8000-00000000cd01',
            software_id: softwareId,
            commit_sha: 'a'.repeat(40),
            branch: 'main',
            status: 'ready',
            error_message: null,
            created_at: new Date().toISOString(),
            ready_at: new Date().toISOString(),
            file_count: 1,
            chunk_count: 1,
          },
        ]),
      })
    })
    await this.page.route('**/codebase/code-drift/run', async (route) => {
      if (route.request().resourceType() === 'document') {
        await route.continue()
        return
      }
      sawDriftRun = true
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          skipped_reason: null,
          sections_evaluated: 1,
          sections_flagged: 1,
          work_orders_evaluated: 0,
          work_orders_flagged: 0,
        }),
      })
    })
    await this.page.route('**/projects/*/issues', async (route) => {
      if (route.request().resourceType() === 'document') {
        await route.continue()
        return
      }
      const url = route.request().url()
      if (!url.match(/\/projects\/[^/]+\/issues(\?|$)/)) {
        await route.continue()
        return
      }
      if (route.request().method() !== 'GET') {
        await route.continue()
        return
      }
      const openIssue = {
        id: issueId,
        project_id: null,
        software_id: softwareId,
        work_order_id: null,
        kind: 'code_drift_section',
        triggered_by: null,
        section_a_id: '00000000-0000-4000-8000-00000000cd02',
        section_b_id: null,
        description: 'E2E drift stub.',
        status: 'open',
        origin: 'auto',
        run_actor_id: '00000000-0000-4000-8000-00000000cd03',
        payload_json: {
          severity: 'high',
          code_refs: [{ path: 'src/x.py', start_line: 1, end_line: 2 }],
        },
        created_at: new Date().toISOString(),
      }
      const rows = sawResolve ? [] : sawDriftRun ? [openIssue] : []
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(rows),
      })
    })
    await this.page.route('**/projects/*/issues/*', async (route) => {
      if (route.request().resourceType() === 'document') {
        await route.continue()
        return
      }
      if (route.request().method() !== 'PUT') {
        await route.continue()
        return
      }
      sawResolve = true
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: issueId,
          project_id: null,
          software_id: softwareId,
          work_order_id: null,
          kind: 'code_drift_section',
          triggered_by: null,
          section_a_id: '00000000-0000-4000-8000-00000000cd02',
          section_b_id: null,
          description: 'E2E drift stub.',
          status: 'resolved',
          origin: 'auto',
          run_actor_id: null,
          payload_json: { severity: 'high', code_refs: [] },
          created_at: new Date().toISOString(),
        }),
      })
    })
  }

  runCodeDriftButton(): ReturnType<Page['locator']> {
    return this.page.getByRole('button', { name: /run code drift analysis/i })
  }
}
