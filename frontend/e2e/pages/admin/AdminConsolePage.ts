import { expect, type Locator, type Page } from '@playwright/test'

import { adminConsolePath, type AdminConsoleSection } from '../../../src/lib/adminConsoleNav'

const SIDE_NAV_LINK: Record<AdminConsoleSection, RegExp> = {
  overview: /Overview/i,
  studios: /Studios/i,
  llm: /LLM connectivity/i,
  budgets: /Budgets/i,
  embeddings: /Embeddings/i,
  users: /^Users$/i,
}

export class AdminConsolePage {
  private readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async goto(section: AdminConsoleSection): Promise<void> {
    await this.page.goto(adminConsolePath(section))
  }

  sideNavLink(section: AdminConsoleSection): Locator {
    return this.page.locator('nav').getByRole('link', { name: SIDE_NAV_LINK[section] })
  }

  async expectSideNavVisible(): Promise<void> {
    await expect(this.page.locator('nav').first()).toBeVisible()
    await expect(this.sideNavLink('overview')).toBeVisible()
  }

  async expectAccessDenied(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: 'Access denied' })).toBeVisible()
    await expect(this.page.locator('nav')).toHaveCount(0)
    await expect(this.sideNavLink('overview')).toHaveCount(0)
  }

  async clickSideNav(section: AdminConsoleSection): Promise<void> {
    await this.sideNavLink(section).click()
  }

  /** Header link back to the builder app (`/`). */
  async clickBuilderWorkspaceLink(): Promise<void> {
    await this.page.getByRole('link', { name: '← Builder workspace' }).click()
  }

  async expectSideNavLinkAriaCurrent(
    section: AdminConsoleSection,
    expected: 'page' | null,
  ): Promise<void> {
    const link = this.sideNavLink(section)
    if (expected === null) {
      await expect(link).not.toHaveAttribute('aria-current', 'page')
      return
    }
    await expect(link).toHaveAttribute('aria-current', 'page')
  }
}
