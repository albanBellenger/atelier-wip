import { test } from '../../fixtures/auth.fixture'
import { AdminConsolePage } from '../../pages/admin/AdminConsolePage'
import { AdminOverviewPage } from '../../pages/admin/AdminOverviewPage'

test.describe('Admin console — overview', () => {
  test('tool admin sees overview KPIs', async ({ toolAdminPage }) => {
    const console_ = new AdminConsolePage(toolAdminPage)
    const overview = new AdminOverviewPage(toolAdminPage)
    await console_.goto('overview')
    await overview.expectHeadingVisible()
    await overview.expectStudiosAtAGlanceVisible()
    await console_.expectSideNavVisible()
    await overview.expectMtdSpendInSideNav('$')
  })

  test('non-admin is denied', async ({ nonAdminPage }) => {
    const console_ = new AdminConsolePage(nonAdminPage)
    await console_.goto('overview')
    await console_.expectAccessDenied()
  })
})
