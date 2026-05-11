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

  async clickStudiosAtAGlanceManage(): Promise<void> {
    const card = this.page.locator('section').filter({
      has: this.page.getByText('Studios at a glance', { exact: true }),
    })
    await card.getByRole('button', { name: 'Manage →' }).click()
  }

  async clickQuickAction(label: string): Promise<void> {
    await this.page
      .getByRole('button', { name: new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })
      .click()
  }

  async clickQuickActionViewStudios(): Promise<void> {
    await this.clickQuickAction('View studios')
  }

  async clickQuickActionReindexEmbeddings(): Promise<void> {
    await this.clickQuickAction('Reindex embeddings')
  }

  /**
   * Clicks the per-row `Open` control in Studios at a glance for the row whose studio name cell matches.
   */
  async clickStudiosAtAGlanceOpenForStudioName(studioName: string): Promise<void> {
    const card = this.page.locator('section').filter({
      has: this.page.getByText('Studios at a glance', { exact: true }),
    })
    const row = card.locator('div.grid').filter({ hasText: studioName }).first()
    await row.getByRole('button', { name: 'Open', exact: true }).click()
  }

  async expectOverviewMetricsErrorVisible(): Promise<void> {
    await expect(
      this.page.getByText('Could not load overview metrics.', { exact: false }),
    ).toBeVisible()
  }

  /** First data row studio name in the Studios at a glance table (header is `nth(0)`). */
  async readFirstStudiosAtAGlanceStudioName(): Promise<string> {
    const card = this.page.locator('section').filter({
      has: this.page.getByText('Studios at a glance', { exact: true }),
    })
    const firstRow = card.locator('div.grid').nth(1)
    await expect(firstRow).toBeVisible({ timeout: 15_000 })
    const cell = firstRow.locator('span').first()
    const t = (await cell.textContent())?.trim() ?? ''
    if (!t) {
      throw new Error('Could not read studio name from first Studios at a glance row')
    }
    return t
  }

  async expectPathEndsWith(pathSuffix: string): Promise<void> {
    await expect.poll(() => {
      const { pathname } = new URL(this.page.url())
      return pathname === pathSuffix || pathname.endsWith(pathSuffix)
    }).toBe(true)
  }

  async expectHeadingForSection(
    name: 'Overview' | 'Studios' | 'LLM connectivity' | 'Budgets' | 'Embeddings' | 'Users & roles',
  ): Promise<void> {
    await expect(this.page.getByRole('heading', { name, exact: true })).toBeVisible()
  }

  async expectMtdSpendInSideNav(expected: string): Promise<void> {
    const nav = this.page.locator('nav').first()
    await expect(nav.getByText('This month', { exact: true })).toBeVisible()
    await expect(nav.getByText(expected, { exact: false })).toBeVisible()
  }

  async beginStubAdminConsoleOverviewHttpError(status: number): Promise<void> {
    await this.page.unroute('**/admin/console/overview')
    await this.page.route('**/admin/console/overview', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue()
        return
      }
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'E2E stub overview failure' }),
      })
    })
  }

  async endStubAdminConsoleOverview(): Promise<void> {
    await this.page.unroute('**/admin/console/overview')
  }
}
