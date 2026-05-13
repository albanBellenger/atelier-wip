import type { Page } from '@playwright/test'

/** Section editor + copilot workspace (outline rail, health, thread). */
export class SectionWorkspacePage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async goto(path: string): Promise<void> {
    await this.page.goto(path)
  }

  sectionOutline(): ReturnType<Page['getByLabel']> {
    return this.page.getByLabel('Section outline')
  }

  /** Primary health rail drift control (main column). */
  healthDriftButton(): ReturnType<Page['getByRole']> {
    return this.page.getByRole('button', { name: /^Drift\b/i }).first()
  }

  healthOpenCopilotLink(): ReturnType<Page['getByTestId']> {
    return this.page.getByTestId('health-rail-open-copilot')
  }

  copilotCritiqueTab(): ReturnType<Page['getByRole']> {
    return this.page.getByRole('tab', { name: 'Critique' })
  }

  layoutContextButton(): ReturnType<Page['getByRole']> {
    return this.page
      .getByTestId('section-layout-switcher')
      .getByRole('tab', { name: 'Context' })
  }

  contextKindPrefs(): ReturnType<Page['getByTestId']> {
    return this.page.getByTestId('context-kind-prefs')
  }

  copilotComposerTextarea(): ReturnType<Page['getByTestId']> {
    return this.page.getByTestId('copilot-composer-textarea')
  }

  patchInlinePreview(): ReturnType<Page['getByTestId']> {
    return this.page.getByTestId('patch-inline-preview')
  }

  crepeHost(): ReturnType<Page['getByTestId']> {
    return this.page.getByTestId('crepe-host')
  }

  crepeProseMirror(): ReturnType<Page['locator']> {
    return this.page.locator('[data-testid="crepe-host"] .ProseMirror').first()
  }

  sectionLayoutSwitcher(): ReturnType<Page['getByTestId']> {
    return this.page.getByTestId('section-layout-switcher')
  }
}
