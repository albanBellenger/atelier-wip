import { expect, type Page } from '@playwright/test'

/**
 * Project work orders (Kanban / list).
 * Set ``PLAYWRIGHT_WORK_ORDERS_URL`` to a logged-in editor URL, e.g.
 * ``/studios/<sid>/software/<swid>/projects/<pid>/work-orders``.
 */
export class ProjectWorkOrdersPage {
  private readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async gotoFromEnv(baseURL: string | undefined): Promise<void> {
    const target = process.env.PLAYWRIGHT_WORK_ORDERS_URL
    if (!target || target.trim() === '') {
      throw new Error('PLAYWRIGHT_WORK_ORDERS_URL is not set')
    }
    const prefix = baseURL ?? ''
    await this.page.goto(`${prefix}${target}`)
  }

  async expectDeDupingButtonVisible(timeoutMs: number): Promise<void> {
    await expect(
      this.page.getByRole('button', { name: 'De-duping' }),
    ).toBeVisible({ timeout: timeoutMs })
  }

  async openDeDupingModal(): Promise<void> {
    await this.page.getByRole('button', { name: 'De-duping' }).click()
  }

  async expectDeDupingModalVisible(): Promise<void> {
    await expect(
      this.page.getByRole('heading', { name: 'Backlog de-dupe' }),
    ).toBeVisible()
  }
}
