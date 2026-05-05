import { expect, type Locator, type Page } from '@playwright/test'

export class AdminUsersPage {
  private readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async expectHeadingVisible(): Promise<void> {
    await expect(
      this.page.getByRole('heading', { name: 'Users & roles', exact: true }),
    ).toBeVisible()
  }

  userRow(email: string): Locator {
    return this.page
      .locator('section')
      .filter({ hasText: 'Directory' })
      .getByText(email, { exact: true })
  }

  async searchUsers(query: string): Promise<void> {
    await this.page.getByLabel('Search users').fill(query)
  }

  async filterTab(tab: 'all' | 'tool' | 'members'): Promise<void> {
    const directory = this.page.locator('section').filter({
      has: this.page.getByRole('heading', { name: 'Directory', exact: true }),
    })
    if (tab === 'all') {
      await directory.getByRole('button', { name: /^All\s+\d+/ }).click()
      return
    }
    if (tab === 'tool') {
      await directory.getByRole('button', { name: /^Tool admins\s+\d+/ }).click()
      return
    }
    await directory.getByRole('button', { name: /^Members\s+\d+/ }).click()
  }

  async expectDirectoryHeadingVisible(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: 'Directory', exact: true })).toBeVisible()
  }

  async expectToolAdminsFilterButtonVisible(): Promise<void> {
    const directory = this.page.locator('section').filter({
      has: this.page.getByRole('heading', { name: 'Directory', exact: true }),
    })
    await expect(directory.getByRole('button', { name: /^Tool admins\s+\d+/ })).toBeVisible()
  }

  async expectLoadingUsersHidden(): Promise<void> {
    await expect(this.page.getByText('Loading users…')).not.toBeVisible({ timeout: 15_000 })
  }

  async expectDirectoryContainsEmailPattern(pattern: RegExp): Promise<void> {
    const directory = this.page.locator('section').filter({
      has: this.page.getByRole('heading', { name: 'Directory', exact: true }),
    })
    await expect(directory.getByText(pattern)).toBeVisible()
  }
}
