import { test } from '../../fixtures/auth.fixture'
import { AdminCodebasePage } from '../../pages/admin/AdminCodebasePage'
import { AdminConsolePage } from '../../pages/admin/AdminConsolePage'

test.describe('Admin console — codebase', () => {
  test('platform admin sees codebase section', async ({ toolAdminPage }) => {
    const console_ = new AdminConsolePage(toolAdminPage)
    const cb = new AdminCodebasePage(toolAdminPage)
    await cb.beginStubCodebaseOverview([
      {
        studio_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        studio_name: 'E2E Codebase Studio',
        software: [
          {
            software_id: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
            software_name: 'E2E Product',
            git_configured: true,
            ready_file_count: 1,
            ready_chunk_count: 2,
            ready_symbol_count: 0,
            commit_sha: 'abcdef0123456789abcdef0123456789abcdef01',
            branch: 'main',
            ready_at: '2026-01-01T00:00:00Z',
            newest_snapshot_status: 'ready',
          },
        ],
      },
    ])
    try {
      await console_.goto('codebase')
      await cb.expectHeadingVisible()
      await cb.expectStudioCardTitle('E2E Codebase Studio')
    } finally {
      await cb.endStubCodebaseOverview()
    }
  })

  test('non-admin is denied', async ({ nonAdminPage }) => {
    const console_ = new AdminConsolePage(nonAdminPage)
    await console_.goto('codebase')
    await console_.expectAccessDenied()
  })
})
