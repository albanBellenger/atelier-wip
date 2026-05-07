import { expect, test } from '@playwright/test'

import { ProjectWorkOrdersPage } from '../pages/WorkOrdersPage'

/**
 * Work orders De-duping entry point (editor).
 * Requires PLAYWRIGHT_WORK_ORDERS_URL (logged-in builder on the project work orders page).
 */
test('work orders page shows De-duping for editor', async ({ page, baseURL }) => {
  const target = process.env.PLAYWRIGHT_WORK_ORDERS_URL
  test.skip(
    !target,
    'Set PLAYWRIGHT_WORK_ORDERS_URL to /studios/.../projects/.../work-orders (editor session)',
  )

  const wo = new ProjectWorkOrdersPage(page)
  await wo.gotoFromEnv(baseURL)
  await wo.expectDeDupingButtonVisible(20_000)
  await wo.openDeDupingModal()
  await wo.expectDeDupingModalVisible()
  await expect(
    page.getByRole('button', { name: /analyze backlog/i }),
  ).toBeVisible()
})
