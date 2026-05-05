import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, type Page } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE = path.join(__dirname, '../fixtures/rag-sample.md')

/**
 * Project artifacts list + upload (path under studio/software/project).
 * Specs should set ``PLAYWRIGHT_ARTIFACTS_URL`` to a logged-in editor page, e.g.
 * ``/studios/<sid>/software/<swid>/projects/<pid>/artifacts``.
 */
export class ProjectArtifactsPage {
  private readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async gotoFromEnv(baseURL: string | undefined): Promise<void> {
    const target = process.env.PLAYWRIGHT_ARTIFACTS_URL
    if (!target || target.trim() === '') {
      throw new Error('PLAYWRIGHT_ARTIFACTS_URL is not set')
    }
    const prefix = baseURL ?? ''
    await this.page.goto(`${prefix}${target}`)
  }

  async uploadRagSampleMarkdown(): Promise<void> {
    const fileInput = this.page.locator('section input[type="file"]').first()
    await fileInput.setInputFiles(FIXTURE)
  }

  async expectIndexedWithChunksVisible(timeoutMs: number): Promise<void> {
    const row = this.page
      .getByText('rag-sample.md', { exact: false })
      .locator('xpath=ancestor::*[@role="button"][1]')
    const indexedPill = row.getByText('Indexed', { exact: true })
    await expect(indexedPill).toBeVisible({
      timeout: timeoutMs,
    })
    await expect(indexedPill).toHaveAttribute('title', /[1-9]\d* chunk/)
  }
}
