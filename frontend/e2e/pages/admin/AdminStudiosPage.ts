import { expect, type Locator, type Page } from '@playwright/test'

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

  private newStudioDialog(): ReturnType<Page['getByRole']> {
    return this.page.getByRole('dialog', { name: 'New studio' })
  }

  async openNewStudioDialog(): Promise<void> {
    await this.page.getByRole('button', { name: /^\+\s*New/ }).click()
  }

  async fillNewStudioForm(name: string, description?: string): Promise<void> {
    const dlg = this.newStudioDialog()
    await dlg.getByPlaceholder('My studio').fill(name)
    if (description !== undefined && description.length > 0) {
      await dlg.locator('textarea').fill(description)
    }
  }

  async submitNewStudioDialog(): Promise<void> {
    await this.newStudioDialog().getByRole('button', { name: 'Create', exact: true }).click()
    await expect(this.newStudioDialog()).not.toBeVisible({ timeout: 15_000 })
  }

  async clickNewStudioCreateExpectingError(): Promise<void> {
    await this.newStudioDialog().getByRole('button', { name: 'Create', exact: true }).click()
  }

  async cancelNewStudioDialog(): Promise<void> {
    await this.newStudioDialog().getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(this.newStudioDialog()).not.toBeVisible()
  }

  async expectStudioListed(displayName: string): Promise<void> {
    const list = this.page.locator('section').filter({
      has: this.page.getByRole('heading', { name: 'All studios', exact: true }),
    })
    await expect(list.getByRole('button', { name: new RegExp(displayName) })).toBeVisible()
  }

  async listSidebarStudioNames(): Promise<string[]> {
    const list = this.page.locator('section').filter({
      has: this.page.getByRole('heading', { name: 'All studios', exact: true }),
    })
    const texts = await list.locator('li button span.truncate').allTextContents()
    return texts.map((t) => t.trim()).filter(Boolean)
  }

  async selectStudioFromSidebar(displayName: string): Promise<void> {
    const list = this.page.locator('section').filter({
      has: this.page.getByRole('heading', { name: 'All studios', exact: true }),
    })
    await list.getByRole('button', { name: new RegExp(displayName) }).click()
  }

  /** Reads the Studio ID field from the detail card whose title matches `studioDisplayName`. */
  async readStudioIdFromDetail(studioDisplayName: string): Promise<string> {
    const card = this.page.locator('section').filter({
      has: this.page.getByRole('heading', { name: studioDisplayName, exact: true }),
    })
    // Do not use a broad `div` filter with "Studio ID" — the grid container matches and
    // `input.first()` becomes Display name. Studio ID is the only mono input on this card.
    const input = card.locator('input.font-mono').first()
    await expect(input).toBeVisible({ timeout: 15_000 })
    const v = (await input.inputValue()).trim()
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRe.test(v)) {
      throw new Error(`Expected UUID in Studio ID field for "${studioDisplayName}", got "${v}"`)
    }
    return v
  }

  deleteStudioButton(): Locator {
    return this.page.getByRole('button', { name: 'Delete studio', exact: true })
  }

  /**
   * Confirms the native `confirm()` then clicks Delete studio.
   * Must be called while the target studio detail card is visible.
   */
  async acceptConfirmAndDeleteSelectedStudio(): Promise<void> {
    this.page.once('dialog', (d) => {
      d.accept()
    })
    await this.deleteStudioButton().click()
  }

  async expectStudioNotListed(displayName: string): Promise<void> {
    const list = this.page.locator('section').filter({
      has: this.page.getByRole('heading', { name: 'All studios', exact: true }),
    })
    await expect(list.getByRole('button', { name: new RegExp(displayName) })).toHaveCount(0, {
      timeout: 15_000,
    })
  }

  async expectNewStudioDialogErrorVisible(): Promise<void> {
    await expect(this.newStudioDialog().getByRole('alert')).toBeVisible()
  }

  async expectNewStudioDialogErrorContains(text: string): Promise<void> {
    await expect(this.newStudioDialog().getByRole('alert')).toContainText(text)
  }

  /**
   * Stubs `GET /admin/studios/:id` only (list `GET /admin/studios` still goes to the backend).
   * Use to assert GitLab connectivity labels without relying on seeded Git state.
   */
  async beginStubAdminStudioDetailWithGitlab(args?: {
    git_repo_url?: string
    git_branch?: string
    git_token_set?: boolean
  }): Promise<void> {
    await this.page.unroute('**/admin/studios/*')
    await this.page.route('**/admin/studios/*', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue()
        return
      }
      const u = new URL(route.request().url())
      const parts = u.pathname.split('/').filter(Boolean)
      if (parts.length !== 3 || parts[0] !== 'admin' || parts[1] !== 'studios') {
        await route.continue()
        return
      }
      const id = parts[2] ?? 'unknown'
      const detail = {
        id,
        name: `E2E GitLab Studio`,
        description: null,
        logo_path: null,
        created_at: new Date().toISOString(),
        budget_cap_monthly_usd: null,
        budget_overage_action: 'pause_generations',
        software_count: 0,
        member_count: 1,
        mtd_spend_usd: '0.00',
        gitlab: {
          git_provider: 'gitlab',
          git_repo_url: args?.git_repo_url ?? 'https://gitlab.example.com/acme/docs.git',
          git_branch: args?.git_branch ?? 'main',
          git_publish_strategy: 'branch',
          git_token_set: args?.git_token_set ?? true,
        },
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(detail),
      })
    })
  }

  async endStubAdminStudioDetail(): Promise<void> {
    await this.page.unroute('**/admin/studios/*')
  }

  async expectGitLabCardShowsRepoAndBranch(): Promise<void> {
    const card = this.page.locator('section').filter({
      has: this.page.getByRole('heading', { name: 'GitLab connectivity', exact: true }),
    })
    await expect(card.getByText('Repository URL', { exact: true })).toBeVisible()
    const repoInput = card
      .locator('div')
      .filter({ has: card.getByText('Repository URL', { exact: true }) })
      .locator('input')
    await expect(repoInput).toHaveValue(/gitlab\.example\.com/)
    await expect(card.getByText('Default branch', { exact: true })).toBeVisible()
    const branchInput = card
      .locator('div')
      .filter({ has: card.getByText('Default branch', { exact: true }) })
      .locator('input')
    await expect(branchInput).toHaveValue('main')
    await expect(card.getByText('Deploy token', { exact: true })).toBeVisible()
    const tokenInput = card
      .locator('div')
      .filter({ has: card.getByText('Deploy token', { exact: true }) })
      .locator('input')
    await expect(tokenInput).toHaveValue('set')
  }

  allowedProvidersSection(): ReturnType<Page['locator']> {
    return this.page.locator('section').filter({
      has: this.page.getByRole('heading', { name: 'Allowed providers (this studio)', exact: true }),
    })
  }

  async expectAllowedProvidersToggleFor(providerId: string): Promise<void> {
    const sec = this.allowedProvidersSection()
    const row = sec.locator('li').filter({ hasText: providerId })
    await expect(row.getByRole('switch')).toBeVisible()
  }

  async toggleAllowedProviderSwitch(providerId: string): Promise<void> {
    const row = this.allowedProvidersSection().locator('li').filter({ hasText: providerId })
    await row.getByRole('switch').click()
  }

  async expectAllowedProviderSwitchAriaChecked(
    providerId: string,
    expected: 'true' | 'false',
  ): Promise<void> {
    const row = this.allowedProvidersSection().locator('li').filter({ hasText: providerId })
    await expect(row.getByRole('switch')).toHaveAttribute('aria-checked', expected)
  }
}
