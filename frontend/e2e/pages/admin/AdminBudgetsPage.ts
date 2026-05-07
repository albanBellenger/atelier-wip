import { expect, type Locator, type Page } from '@playwright/test'

export class AdminBudgetsPage {
  private budgetPatchCount = 0

  private readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  /** Intercepts PATCH /admin/studios/:id/budget (fulfills 204) and counts matching requests. */
  async beginCapturePatchBudget(): Promise<void> {
    this.budgetPatchCount = 0
    await this.page.unroute('**/admin/studios/*/budget')
    await this.page.route('**/admin/studios/*/budget', async (route) => {
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
    await this.page.unroute('**/admin/studios/*/budget')
  }

  firstStudioBudgetRow(): Locator {
    const section = this.page.locator('section').filter({
      has: this.page.getByRole('heading', { name: 'Per-studio monthly cap', exact: true }),
    })
    return section.locator('div.grid').nth(1)
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
}
