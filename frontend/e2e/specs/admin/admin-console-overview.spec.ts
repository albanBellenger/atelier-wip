import { test } from '../../fixtures/auth.fixture'
import { AdminConsolePage } from '../../pages/admin/AdminConsolePage'
import { AdminOverviewPage } from '../../pages/admin/AdminOverviewPage'

test.describe('Admin console — overview', () => {
  test('Studios at a glance Manage navigates to Studios section', async ({ toolAdminPage }) => {
    const console_ = new AdminConsolePage(toolAdminPage)
    const overview = new AdminOverviewPage(toolAdminPage)
    await console_.goto('overview')
    await overview.expectHeadingVisible()
    await overview.expectStudiosAtAGlanceVisible()
    await overview.clickStudiosAtAGlanceManage()
    await overview.expectPathEndsWith('/admin/console/studios')
    await overview.expectHeadingForSection('Studios')
  })

  test('Quick action Connect a provider navigates to LLM section', async ({ toolAdminPage }) => {
    const console_ = new AdminConsolePage(toolAdminPage)
    const overview = new AdminOverviewPage(toolAdminPage)
    await console_.goto('overview')
    await overview.expectHeadingVisible()
    await overview.clickQuickAction('Connect a provider')
    await overview.expectPathEndsWith('/admin/console/llm')
    await overview.expectHeadingForSection('LLM connectivity')
  })

  test('Quick action View studios navigates to Studios section', async ({ toolAdminPage }) => {
    const console_ = new AdminConsolePage(toolAdminPage)
    const overview = new AdminOverviewPage(toolAdminPage)
    await console_.goto('overview')
    await overview.expectHeadingVisible()
    await overview.clickQuickActionViewStudios()
    await overview.expectPathEndsWith('/admin/console/studios')
    await overview.expectHeadingForSection('Studios')
  })

  test('Quick action Reindex embeddings navigates to Embeddings section', async ({
    toolAdminPage,
  }) => {
    const console_ = new AdminConsolePage(toolAdminPage)
    const overview = new AdminOverviewPage(toolAdminPage)
    await console_.goto('overview')
    await overview.expectHeadingVisible()
    await overview.clickQuickActionReindexEmbeddings()
    await overview.expectPathEndsWith('/admin/console/embeddings')
    await overview.expectHeadingForSection('Embeddings')
  })

  test('Studios at a glance row Open navigates to Studios section', async ({ toolAdminPage }) => {
    const console_ = new AdminConsolePage(toolAdminPage)
    const overview = new AdminOverviewPage(toolAdminPage)
    await console_.goto('overview')
    await overview.expectHeadingVisible()
    await overview.expectStudiosAtAGlanceVisible()
    const name = await overview.readFirstStudiosAtAGlanceStudioName()
    await overview.clickStudiosAtAGlanceOpenForStudioName(name)
    await overview.expectPathEndsWith('/admin/console/studios')
    await overview.expectHeadingForSection('Studios')
  })

  test('Overview GET /admin/console/overview 500 shows inline metrics error', async ({
    toolAdminPage,
  }) => {
    const overview = new AdminOverviewPage(toolAdminPage)
    await overview.beginStubAdminConsoleOverviewHttpError(500)
    try {
      const console_ = new AdminConsolePage(toolAdminPage)
      await console_.goto('overview')
      await overview.expectHeadingVisible()
      await overview.expectOverviewMetricsErrorVisible()
      await console_.expectSideNavVisible()
    } finally {
      await overview.endStubAdminConsoleOverview()
    }
  })

  test('platform admin sees overview KPIs', async ({ toolAdminPage }) => {
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
