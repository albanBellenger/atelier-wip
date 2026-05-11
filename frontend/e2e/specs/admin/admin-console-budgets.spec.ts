import { test, expect } from '../../fixtures/auth.fixture'
import { AdminBudgetsPage } from '../../pages/admin/AdminBudgetsPage'
import { AdminConsolePage } from '../../pages/admin/AdminConsolePage'

test.describe('Admin console — budgets', () => {
  test('platform admin decrements studio cap and issues PATCH', async ({ toolAdminPage }) => {
    const console_ = new AdminConsolePage(toolAdminPage)
    const budgets = new AdminBudgetsPage(toolAdminPage)
    await budgets.beginCapturePatchBudget()
    try {
      await console_.goto('budgets')
      await budgets.expectHeadingVisible()
      await budgets.expectBudgetTableLoaded()
      await expect(budgets.firstStudioBudgetRow()).toBeVisible()
      const name = await budgets.firstPerStudioBudgetStudioName()
      await budgets.incrementCap(name)
      await budgets.decrementCap(name)
      await budgets.expectBudgetPatchCountAtLeast(2)
    } finally {
      await budgets.endCapturePatchBudget()
    }
  })

  test('platform admin changes studio overage action and issues PATCH', async ({ toolAdminPage }) => {
    const console_ = new AdminConsolePage(toolAdminPage)
    const budgets = new AdminBudgetsPage(toolAdminPage)
    await budgets.beginCapturePatchBudget()
    try {
      await console_.goto('budgets')
      await budgets.expectHeadingVisible()
      await budgets.expectBudgetTableLoaded()
      await expect(budgets.firstStudioBudgetRow()).toBeVisible()
      await budgets.firstStudioOverageSelect().selectOption({ label: 'Allow + alert Studio Owners' })
      await budgets.expectBudgetPatchCountAtLeast(1)
      await budgets.firstStudioOverageSelect().selectOption({ label: 'Pause generations (hard stop)' })
      await budgets.expectBudgetPatchCountAtLeast(2)
    } finally {
      await budgets.endCapturePatchBudget()
    }
  })

  test('platform admin adjusts studio cap and issues PATCH', async ({ toolAdminPage }) => {
    const console_ = new AdminConsolePage(toolAdminPage)
    const budgets = new AdminBudgetsPage(toolAdminPage)
    await budgets.beginCapturePatchBudget()
    try {
      await console_.goto('budgets')
      await budgets.expectHeadingVisible()
      await budgets.expectBudgetTableLoaded()
      await expect(budgets.firstStudioBudgetRow()).toBeVisible()
      await budgets.incrementFirstStudioCap()
      await budgets.expectBudgetPatchCountAtLeast(1)
    } finally {
      await budgets.endCapturePatchBudget()
    }
  })

  test('non-admin is denied', async ({ nonAdminPage }) => {
    const console_ = new AdminConsolePage(nonAdminPage)
    await console_.goto('budgets')
    await console_.expectAccessDenied()
  })

  test('Per-studio budgets shows empty copy when overview has zero studios (stubbed)', async ({
    toolAdminPage,
  }) => {
    const console_ = new AdminConsolePage(toolAdminPage)
    const budgets = new AdminBudgetsPage(toolAdminPage)
    await budgets.beginStubAdminConsoleOverviewEmptyStudios()
    try {
      await console_.goto('budgets')
      await budgets.expectHeadingVisible()
      await budgets.expectBudgetTableLoaded()
      await budgets.expectPerStudioBudgetEmptyStateNoStudios()
    } finally {
      await budgets.endStubAdminConsoleOverview()
    }
  })
})
