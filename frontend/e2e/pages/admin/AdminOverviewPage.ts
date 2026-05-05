import { expect, type Locator, type Page } from '@playwright/test'

export class AdminOverviewPage {
  private readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async expectHeadingVisible(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible()
  }

  async expectStudiosAtAGlanceVisible(): Promise<void> {
    await expect(this.page.getByText('Studios at a glance', { exact: true })).toBeVisible()
  }

  studioRow(name: string): Locator {
    return this.page.locator('section').filter({ hasText: 'Studios at a glance' }).getByText(name, {
      exact: true,
    })
  }

  async expectMtdSpendInSideNav(expected: string): Promise<void> {
    const nav = this.page.locator('nav').first()
    await expect(nav.getByText('This month', { exact: true })).toBeVisible()
    await expect(nav.getByText(expected, { exact: false })).toBeVisible()
  }
}
