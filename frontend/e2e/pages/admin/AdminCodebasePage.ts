import { expect, type Page } from '@playwright/test'

export class AdminCodebasePage {
  private readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async expectHeadingVisible(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: 'Codebase', exact: true })).toBeVisible()
  }

  async beginStubCodebaseOverview(rows: unknown[]): Promise<void> {
    await this.page.unroute('**/admin/codebase/overview')
    await this.page.route('**/admin/codebase/overview', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue()
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(rows),
      })
    })
  }

  async endStubCodebaseOverview(): Promise<void> {
    await this.page.unroute('**/admin/codebase/overview')
  }

  async expectStudioCardTitle(studioName: string): Promise<void> {
    await expect(
      this.page.locator('section').filter({
        has: this.page.getByRole('heading', { name: studioName, exact: true }),
      }),
    ).toBeVisible()
  }
}
