import { test, expect } from '../../fixtures/auth.fixture'
import { IssuesCodeDriftPage } from '../../pages/issues/IssuesCodeDriftPage'

test.describe('Issues — code drift UI', () => {
  test('run drift then resolve removes open issue (stubbed APIs)', async ({
    toolAdminPage,
  }) => {
    const p = new IssuesCodeDriftPage(toolAdminPage)
    const ids = await p.seedStudioSoftwareProject()
    const issueId = '00000000-0000-4000-8000-00000000cd99'
    await p.stubSnapshotsDriftRunAndIssuesList(issueId, ids.softwareId)
    await p.gotoIssues(ids.studioId, ids.softwareId, ids.projectId)

    await expect(p.runCodeDriftButton()).toBeEnabled()
    await p.runCodeDriftButton().click()
    await expect(toolAdminPage.getByText(/E2E drift stub/i)).toBeVisible()

    await toolAdminPage.getByRole('button', { name: /e2e drift stub/i }).click()
    await toolAdminPage.getByRole('button', { name: /mark resolved/i }).click()

    await expect(toolAdminPage.locator('li').filter({ hasText: 'E2E drift stub' })).toHaveCount(0, {
      timeout: 15_000,
    })
  })
})
