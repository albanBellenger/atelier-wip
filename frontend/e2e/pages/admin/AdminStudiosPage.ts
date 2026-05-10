import { expect, type Page } from '@playwright/test'

export class AdminStudiosPage {
  private readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async expectHeadingVisible(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: 'Studios', exact: true })).toBeVisible()
  }

  async expectAtLeastOneStudioCardOrEmptyState(): Promise<void> {
    const empty = this.page.getByText('No studios yet. Create one to get started.', {
      exact: true,
    })
    const listHeading = this.page.getByRole('heading', { name: 'All studios', exact: true })
    await expect(empty.or(listHeading)).toBeVisible()
  }
}
