import { test, expect } from '../../fixtures/auth.fixture'
import { IssuesDocSyncPage } from '../../pages/issues/IssuesDocSyncPage'

test.describe('Issues — doc sync apply navigation', () => {
  test('Apply opens software doc editor with docSyncIssue query (stubbed APIs)', async ({
    toolAdminPage,
  }) => {
    const p = new IssuesDocSyncPage(toolAdminPage)
    const ids = await p.seedStudioSoftwareProject()
    const issueId = '00000000-0000-4000-8000-00000000d501'
    const sectionId = '00000000-0000-4000-8000-00000000d502'
    const workOrderId = '00000000-0000-4000-8000-00000000d503'

    await toolAdminPage.route('**/projects/*/issues', async (route) => {
      const url = route.request().url()
      if (!url.match(/\/projects\/[^/]+\/issues(\?|$)/)) {
        await route.continue()
        return
      }
      if (route.request().method() !== 'GET') {
        await route.continue()
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: issueId,
            project_id: null,
            software_id: ids.softwareId,
            work_order_id: workOrderId,
            kind: 'doc_update_suggested',
            triggered_by: null,
            section_a_id: sectionId,
            section_b_id: null,
            description: 'E2E doc sync.',
            status: 'open',
            origin: 'auto',
            run_actor_id: '00000000-0000-4000-8000-00000000cd03',
            payload_json: { replacement_markdown: 'E2E body' },
            resolution_reason: null,
            created_at: new Date().toISOString(),
          },
        ]),
      })
    })

    await toolAdminPage.route(
      `**/software/${ids.softwareId}/docs/${sectionId}`,
      async (route) => {
        if (route.request().method() !== 'GET') {
          await route.continue()
          return
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: sectionId,
            project_id: null,
            software_id: ids.softwareId,
            title: 'E2E Doc',
            slug: 'e2e-doc',
            order: 0,
            content: 'Old',
            status: 'ready',
            open_issue_count: 0,
            outline_health: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }),
        })
      },
    )

    await p.gotoIssues(ids.studioId, ids.softwareId, ids.projectId)
    await toolAdminPage.getByRole('button', { name: /suggested doc update/i }).click()
    await toolAdminPage.getByRole('button', { name: /^Apply$/i }).click()

    await expect(toolAdminPage).toHaveURL(new RegExp(`/docs/${sectionId}`))
    await expect(toolAdminPage).toHaveURL(/docSyncIssue=/)
  })
})
