import { expect, type Locator, type Page } from '@playwright/test'

export class AdminUsersPage {
  private readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  private directorySection(): Locator {
    return this.page.locator('section').filter({
      has: this.page.getByRole('heading', { name: 'Directory', exact: true }),
    })
  }

  /** Grid row in the Directory table that contains the given email. */
  userRowGrid(email: string): Locator {
    return this.directorySection().locator('div.grid').filter({
      has: this.page.getByText(email, { exact: true }),
    })
  }

  async expectHeadingVisible(): Promise<void> {
    await expect(
      this.page.getByRole('heading', { name: 'Users & roles', exact: true }),
    ).toBeVisible()
  }

  userRow(email: string): Locator {
    return this.directorySection().getByText(email, { exact: true })
  }

  async searchUsers(query: string): Promise<void> {
    await this.page.getByLabel('Search users').fill(query)
  }

  async filterTab(tab: 'all' | 'platform' | 'members'): Promise<void> {
    const directory = this.page.locator('section').filter({
      has: this.page.getByRole('heading', { name: 'Directory', exact: true }),
    })
    if (tab === 'all') {
      await directory.getByRole('button', { name: /^All\s+\d+/ }).click()
      return
    }
    if (tab === 'platform') {
      await directory.getByRole('button', { name: /^Platform admins\s+\d+/ }).click()
      return
    }
    await directory.getByRole('button', { name: /^Members\s+\d+/ }).click()
  }

  async expectDirectoryHeadingVisible(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: 'Directory', exact: true })).toBeVisible()
  }

  async expectPlatformAdminsFilterButtonVisible(): Promise<void> {
    const directory = this.page.locator('section').filter({
      has: this.page.getByRole('heading', { name: 'Directory', exact: true }),
    })
    await expect(
      directory.getByRole('button', { name: /^Platform admins\s+\d+/ }),
    ).toBeVisible()
  }

  async expectLoadingUsersHidden(): Promise<void> {
    await expect(this.page.getByText('Loading users…')).not.toBeVisible({ timeout: 15_000 })
  }

  async expectDirectoryContainsEmailPattern(pattern: RegExp): Promise<void> {
    const directory = this.page.locator('section').filter({
      has: this.page.getByRole('heading', { name: 'Directory', exact: true }),
    })
    // Directory lists many emails; getByText(pattern) can match many nodes — strict mode requires one target.
    await expect(directory.getByText(pattern).first()).toBeVisible()
  }

  private createUserDialog(): Locator {
    return this.page.getByRole('dialog', { name: 'Create user' })
  }

  async openCreateUserDialog(): Promise<void> {
    await this.page.getByRole('button', { name: 'Create user', exact: true }).click()
    await expect(this.createUserDialog()).toBeVisible()
  }

  async fillCreateUserForm(args: {
    email: string
    password: string
    displayName: string
  }): Promise<void> {
    const dlg = this.createUserDialog()
    await dlg.getByLabel('Email').fill(args.email)
    await dlg.getByLabel('Display name').fill(args.displayName)
    await dlg.getByLabel('Initial password').fill(args.password)
  }

  async submitCreateUserAccount(): Promise<void> {
    await this.createUserDialog().getByRole('button', { name: 'Create account', exact: true }).click()
    await expect(this.createUserDialog()).not.toBeVisible({ timeout: 15_000 })
  }

  async clickCreateAccountButton(): Promise<void> {
    await this.createUserDialog().getByRole('button', { name: 'Create account', exact: true }).click()
  }

  async expectUserEmailVisibleInDirectory(email: string): Promise<void> {
    const directory = this.page.locator('section').filter({
      has: this.page.getByRole('heading', { name: 'Directory', exact: true }),
    })
    await expect(directory.getByText(email, { exact: true }).first()).toBeVisible()
  }

  grantStudioAccessDialog(): Locator {
    return this.page.getByRole('dialog', { name: 'Grant studio access' })
  }

  async openAddToStudioDialog(): Promise<void> {
    await this.page.getByRole('button', { name: 'Add to studio', exact: true }).click()
    await expect(this.grantStudioAccessDialog()).toBeVisible()
  }

  async expectGrantStudioDialogHidden(): Promise<void> {
    await expect(this.grantStudioAccessDialog()).not.toBeVisible({ timeout: 15_000 })
  }

  /** First studio option in Grant studio access (fixture seeds `E2E Admin …`). */
  async selectFirstStudioInGrantDialog(): Promise<void> {
    const dlg = this.grantStudioAccessDialog()
    const select = dlg.getByRole('combobox').first()
    const opts = await select.locator('option').all()
    const values = (
      await Promise.all(
        opts.map(async (o) => {
          const v = await o.getAttribute('value')
          const t = (await o.textContent())?.trim() ?? ''
          return { v, t }
        }),
      )
    ).filter((x) => x.v && x.v.length > 0 && !x.t.includes('No studios'))
    if (values.length === 0) {
      throw new Error('No studio options in Grant studio access dialog')
    }
    await select.selectOption(values[0].v as string)
  }

  /** @deprecated Prefer {@link selectFirstStudioInGrantDialog}. */
  async selectStudioInGrantDialogByName(studioNameSubstring: string): Promise<void> {
    const dlg = this.grantStudioAccessDialog()
    const select = dlg.getByRole('combobox').first()
    await select.selectOption({ label: studioNameSubstring })
  }

  async pickUserInGrantDialogList(email: string): Promise<void> {
    const dlg = this.grantStudioAccessDialog()
    await dlg.getByRole('listbox', { name: 'Matching users' }).getByText(email, { exact: true }).click()
  }

  async selectRoleInGrantDialog(roleWire: 'studio_admin' | 'studio_member' | 'studio_viewer'): Promise<void> {
    await this.grantStudioAccessDialog()
      .getByLabel('Studio role: Owner, Builder, or Viewer')
      .selectOption({ value: roleWire })
  }

  async submitGrantStudioAccess(): Promise<void> {
    await this.grantStudioAccessDialog().getByRole('button', { name: 'Grant access', exact: true }).click()
  }

  async expectCreateAccountButtonDisabled(): Promise<void> {
    await expect(this.createUserDialog().getByRole('button', { name: 'Create account', exact: true })).toBeDisabled()
  }

  async expectCreateAccountButtonEnabled(): Promise<void> {
    await expect(this.createUserDialog().getByRole('button', { name: 'Create account', exact: true })).toBeEnabled()
  }

  async fillCreateUserPasswordOnly(password: string): Promise<void> {
    await this.createUserDialog().getByLabel('Initial password').fill(password)
  }

  async fillCreateUserRequiredExceptPassword(args: { email: string; displayName: string }): Promise<void> {
    const dlg = this.createUserDialog()
    await dlg.getByLabel('Email').fill(args.email)
    await dlg.getByLabel('Display name').fill(args.displayName)
  }

  async expectCreateUserDialogErrorContains(text: string): Promise<void> {
    await expect(this.createUserDialog().getByRole('alert')).toContainText(text)
  }

  async expectCreateUserDialogStillOpen(): Promise<void> {
    await expect(this.createUserDialog()).toBeVisible()
  }

  async clickGrantPlatformAdminForUser(email: string): Promise<void> {
    await this.userRowGrid(email).getByRole('button', { name: 'Grant platform admin', exact: true }).click()
  }

  async clickRemovePlatformAdminForUser(email: string): Promise<void> {
    await this.userRowGrid(email).getByRole('button', { name: 'Remove platform admin', exact: true }).click()
  }

  async expectUserRowShowsPlatformAdminPill(email: string): Promise<void> {
    await expect(this.userRowGrid(email).getByText('Platform admin', { exact: true })).toBeVisible({
      timeout: 15_000,
    })
  }

  async expectUserRowShowsGrantPlatformAdmin(email: string): Promise<void> {
    await expect(
      this.userRowGrid(email).getByRole('button', { name: 'Grant platform admin', exact: true }),
    ).toBeVisible({ timeout: 15_000 })
  }
}
