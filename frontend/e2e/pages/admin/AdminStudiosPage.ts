import { expect, type Locator, type Page } from '@playwright/test'

export class AdminStudiosPage {
  private readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async expectHeadingVisible(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: 'Studios', exact: true })).toBeVisible()
  }

  /** Studio entry in the left "All studios" list (interactive row). */
  studioCard(name: string): Locator {
    const section = this.page.locator('section').filter({
      has: this.page.getByRole('heading', { name: 'All studios', exact: true }),
    })
    return section.getByRole('button', {
      name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    })
  }

  async expectAtLeastOneStudioCardOrEmptyState(): Promise<void> {
    const empty = this.page.getByText('No studios in demo data.', { exact: true })
    const northwind = this.studioCard('Northwind Atelier')
    await expect(empty.or(northwind)).toBeVisible()
  }
}
