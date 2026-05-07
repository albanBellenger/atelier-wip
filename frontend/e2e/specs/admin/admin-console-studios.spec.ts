import { test } from '../../fixtures/auth.fixture'
import { AdminConsolePage } from '../../pages/admin/AdminConsolePage'
import { AdminStudiosPage } from '../../pages/admin/AdminStudiosPage'

test.describe('Admin console — studios', () => {
  test('platform admin sees studios section', async ({ toolAdminPage }) => {
    const console_ = new AdminConsolePage(toolAdminPage)
    const studios = new AdminStudiosPage(toolAdminPage)
    await console_.goto('studios')
    await studios.expectHeadingVisible()
    await studios.expectAtLeastOneStudioCardOrEmptyState()
  })

  test('non-admin is denied', async ({ nonAdminPage }) => {
    const console_ = new AdminConsolePage(nonAdminPage)
    await console_.goto('studios')
    await console_.expectAccessDenied()
  })
})
