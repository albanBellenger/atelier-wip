import { expect, type Page } from '@playwright/test'

export class AdminEmbeddingsPage {
  private readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async expectHeadingVisible(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: 'Embeddings', exact: true })).toBeVisible()
  }

  async expectModelRegistryVisible(): Promise<void> {
    await expect(
      this.page.getByRole('heading', { name: 'Embedding models', exact: true }),
    ).toBeVisible()
  }

  async expectLibraryTableVisible(): Promise<void> {
    const card = this.page.locator('section').filter({
      has: this.page.getByRole('heading', { name: 'Artifact library (by studio)', exact: true }),
    })
    await expect(card.getByText('Studio', { exact: true }).first()).toBeVisible()
  }
}
