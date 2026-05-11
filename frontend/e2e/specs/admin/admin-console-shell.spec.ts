import { expect, test } from '../../fixtures/auth.fixture'
import { AdminConsolePage } from '../../pages/admin/AdminConsolePage'

test.describe('Admin console — shell', () => {
  test('Builder workspace header link navigates to `/`', async ({ toolAdminPage }) => {
    const console_ = new AdminConsolePage(toolAdminPage)
    await console_.goto('overview')
    await console_.expectSideNavVisible()
    await console_.clickBuilderWorkspaceLink()
    await expect.poll(() => new URL(toolAdminPage.url()).pathname).toBe('/')
  })

  test('Deep link `/admin/console/budgets` shows heading and active Budgets nav', async ({
    toolAdminPage,
  }) => {
    const console_ = new AdminConsolePage(toolAdminPage)
    await console_.goto('budgets')
    await expect(toolAdminPage.getByRole('heading', { name: 'Budgets', exact: true })).toBeVisible()
    await console_.expectSideNavLinkAriaCurrent('budgets', 'page')
  })

  test('Deep link `/admin/console/llm` shows heading and active LLM nav', async ({
    toolAdminPage,
  }) => {
    const console_ = new AdminConsolePage(toolAdminPage)
    await console_.goto('llm')
    await expect(
      toolAdminPage.getByRole('heading', { name: 'LLM connectivity', exact: true }),
    ).toBeVisible()
    await console_.expectSideNavLinkAriaCurrent('llm', 'page')
  })

  test('Unauthenticated client hitting admin overview is redirected to `/auth`', async ({
    browser,
    baseURL,
  }) => {
    const origin = baseURL ?? 'http://127.0.0.1:5173'
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    try {
      await page.goto(`${origin}/admin/console/overview`)
      await expect.poll(() => new URL(page.url()).pathname).toMatch(/^\/auth/)
    } finally {
      await ctx.close()
    }
  })
})
