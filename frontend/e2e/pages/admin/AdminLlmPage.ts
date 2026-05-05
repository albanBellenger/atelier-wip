import { expect, type Locator, type Page } from '@playwright/test'

export class AdminLlmPage {
  private readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  /** Deterministic stub — E2E must not call a real LLM provider. */
  async stubTestLlmProbe(): Promise<void> {
    await this.page.route('**/admin/test/llm', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue()
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, message: 'stub', detail: null }),
      })
    })
  }

  async expectHeadingVisible(): Promise<void> {
    await expect(
      this.page.getByRole('heading', { name: 'LLM connectivity', exact: true }),
    ).toBeVisible()
  }

  /** Row in the model registry (matches provider key or visible label substring). */
  providerRow(providerKey: string): Locator {
    const deploymentCard = this.page.locator('section').filter({
      has: this.page.getByRole('heading', { name: 'LLM deployment', exact: true }),
    })
    return deploymentCard.locator('div.grid').filter({ hasText: providerKey }).first()
  }

  /** Toggle provider enablement for the selected studio (Per-studio enablement). */
  async enableProviderToggle(providerKey: string): Promise<void> {
    const card = this.page.locator('section').filter({
      has: this.page.getByRole('heading', { name: 'Per-studio enablement', exact: true }),
    })
    const row = card.locator('li').filter({ hasText: providerKey })
    await row.getByRole('switch').click()
  }

  async expectModelRegistrySectionVisible(): Promise<void> {
    await expect(this.page.getByText('Model registry', { exact: true })).toBeVisible()
  }

  async expectRegistryHasRowsOrEmptyMessage(): Promise<void> {
    const empty = this.page.getByText('No rows yet.', { exact: false })
    const providerHeader = this.page.getByText('Provider', { exact: true }).first()
    await expect(empty.or(providerHeader)).toBeVisible({ timeout: 15_000 })
  }
}
