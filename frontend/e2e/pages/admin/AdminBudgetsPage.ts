import { expect, type Locator, type Page } from '@playwright/test'

import { ROUTE } from '../../routePatterns'

export class AdminBudgetsPage {
  private budgetPatchCount = 0

  private readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  /**
   * Intercepts PATCH /studios/:id/budget (fulfills 204) and counts matching requests.
   * Must stay aligned with `patchStudioBudget` in `src/services/api.ts`.
   */
  async beginCapturePatchBudget(): Promise<void> {
    this.budgetPatchCount = 0
    await this.page.unroute('**/studios/*/budget')
    await this.page.route('**/studios/*/budget', async (route) => {
      if (route.request().method() !== 'PATCH') {
        await route.continue()
        return
      }
      this.budgetPatchCount += 1
      await route.fulfill({ status: 204 })
    })
  }

  async expectBudgetPatchCountAtLeast(n: number): Promise<void> {
    await expect.poll(() => this.budgetPatchCount).toBeGreaterThanOrEqual(n)
  }

  async endCapturePatchBudget(): Promise<void> {
    await this.page.unroute('**/studios/*/budget')
  }

  firstStudioBudgetRow(): Locator {
    const section = this.page.locator('section').filter({
      has: this.page.getByRole('heading', { name: 'Per-studio monthly cap', exact: true }),
    })
    // header row is first grid; data rows follow
    return section.locator('div.grid').nth(1)
  }

  /**
   * Visible studio name from the first data row under Per-studio monthly cap.
   */
  async firstPerStudioBudgetStudioName(): Promise<string> {
    const row = this.firstStudioBudgetRow()
    const firstCell = row.locator('span').first()
    const t = (await firstCell.textContent())?.trim() ?? ''
    if (!t) {
      throw new Error('Could not read studio name from first budget row')
    }
    return t
  }

  firstStudioOverageSelect(): Locator {
    return this.firstStudioBudgetRow().locator('select').first()
  }


  async incrementFirstStudioCap(): Promise<void> {
    await this.firstStudioBudgetRow().getByRole('button', { name: '+' }).click()
  }

  async expectHeadingVisible(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: 'Budgets', exact: true })).toBeVisible()
  }

  async expectBudgetTableLoaded(): Promise<void> {
    await expect(this.page.getByText('Loading studios…', { exact: true })).not.toBeVisible({
      timeout: 15_000,
    })
  }

  studioBudgetRow(name: string): Locator {
    const section = this.page.locator('section').filter({
      has: this.page.getByRole('heading', { name: 'Per-studio monthly cap', exact: true }),
    })
    return section.locator('div.grid').filter({ hasText: name }).first()
  }

  async incrementCap(studioName: string): Promise<void> {
    const row = this.studioBudgetRow(studioName)
    await row.getByRole('button', { name: '+' }).click()
  }

  async decrementCap(studioName: string): Promise<void> {
    const row = this.studioBudgetRow(studioName)
    await row.getByRole('button', { name: '−' }).click()
  }

  async expectPerStudioBudgetEmptyStateNoStudios(): Promise<void> {
    const section = this.page.locator('section').filter({
      has: this.page.getByRole('heading', { name: 'Per-studio monthly cap', exact: true }),
    })
    await expect(section.getByText('No studios yet.', { exact: true })).toBeVisible()
  }

  async beginStubAdminConsoleOverviewEmptyStudios(): Promise<void> {
    await this.page.unroute(ROUTE.adminConsoleOverview)
    await this.page.route(ROUTE.adminConsoleOverview, async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue()
        return
      }
      if (route.request().resourceType() === 'document') {
        await route.continue()
        return
      }
      await route.fulfill({
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
        contentType: 'application/json',
        body: JSON.stringify({
          studios: [],
          active_builders_count: 0,
          embedding_collection_count: 0,
          recent_activity: [],
        }),
      })
    })
  }

  async endStubAdminConsoleOverview(): Promise<void> {
    await this.page.unroute(ROUTE.adminConsoleOverview)
  }
}
