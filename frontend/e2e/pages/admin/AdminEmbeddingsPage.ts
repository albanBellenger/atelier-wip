import { expect, type Page } from '@playwright/test'

export class AdminEmbeddingsPage {
  private readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  /** Deterministic stub — E2E must not call a real embedding provider. */
  async stubTestEmbeddingProbe(message = 'e2e stub embedding'): Promise<void> {
    await this.page.unroute('**/admin/test/embedding')
    await this.page.route('**/admin/test/embedding', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue()
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, message, detail: null }),
      })
    })
  }

  /**
   * Stubs PATCH reindex policy with a JSON body merged from the request (stable Save policy UI test).
   */
  async stubPatchReindexPolicy(): Promise<void> {
    await this.page.unroute('**/admin/embeddings/reindex-policy')
    await this.page.route('**/admin/embeddings/reindex-policy', async (route) => {
      if (route.request().method() !== 'PATCH') {
        await route.continue()
        return
      }
      let patch: Record<string, unknown> = {}
      try {
        const raw = route.request().postData()
        if (raw) {
          patch = JSON.parse(raw) as Record<string, unknown>
        }
      } catch {
        patch = {}
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 1,
          auto_reindex_trigger:
            typeof patch.auto_reindex_trigger === 'string'
              ? patch.auto_reindex_trigger
              : 'on_document_change',
          debounce_seconds:
            typeof patch.debounce_seconds === 'number' ? patch.debounce_seconds : 60,
          drift_threshold_pct:
            typeof patch.drift_threshold_pct === 'string' ? patch.drift_threshold_pct : '10',
          retention_days: typeof patch.retention_days === 'number' ? patch.retention_days : 30,
        }),
      })
    })
  }

  async clickTestEmbeddingApi(): Promise<void> {
    await this.page.getByRole('button', { name: /Test embedding API/i }).click()
  }

  async expectEmbeddingTestResultContains(text: string): Promise<void> {
    await expect(this.page.getByText(text, { exact: false }).first()).toBeVisible()
  }

  async bumpDebounceSecondsAndSavePolicy(): Promise<void> {
    const card = this.page.locator('section').filter({
      has: this.page.getByRole('heading', { name: 'Reindex policy', exact: true }),
    })
    const debounce = card.getByLabel('Debounce (seconds)')
    const cur = Number.parseInt((await debounce.inputValue()) || '0', 10)
    await debounce.fill(String(Number.isFinite(cur) ? cur + 1 : 1))
    await card.getByRole('button', { name: 'Save policy', exact: true }).click()
  }

  async expectSavePolicyCompleted(): Promise<void> {
    const card = this.page.locator('section').filter({
      has: this.page.getByRole('heading', { name: 'Reindex policy', exact: true }),
    })
    await expect(card.getByRole('button', { name: 'Save policy', exact: true })).not.toHaveText(
      'Saving…',
      { timeout: 15_000 },
    )
  }

  async expectHeadingVisible(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: 'Embeddings', exact: true })).toBeVisible()
  }

  async expectReindexPolicyVisible(): Promise<void> {
    await expect(
      this.page.getByRole('heading', { name: 'Reindex policy', exact: true }),
    ).toBeVisible()
  }

  async expectLibraryTableVisible(): Promise<void> {
    const card = this.page.locator('section').filter({
      has: this.page.getByRole('heading', { name: 'Artifact library (by studio)', exact: true }),
    })
    await expect(card.getByText('Studio', { exact: true }).first()).toBeVisible()
  }

  async expectArtifactLibraryEmptyStateVisible(): Promise<void> {
    const card = this.page.locator('section').filter({
      has: this.page.getByRole('heading', { name: 'Artifact library (by studio)', exact: true }),
    })
    await expect(
      card.getByText('No studios yet — create a studio to populate the shared artifact library.', {
        exact: true,
      }),
    ).toBeVisible()
  }

  async clickOpenLibraryForStudioNamed(studioName: string): Promise<void> {
    const card = this.page.locator('section').filter({
      has: this.page.getByRole('heading', { name: 'Artifact library (by studio)', exact: true }),
    })
    const row = card.locator('div.grid').filter({ hasText: studioName }).first()
    await row.getByRole('link', { name: 'Open library', exact: true }).click()
  }

  /**
   * Stub `GET /admin/embeddings/library` (tear down with {@link endStubEmbeddingLibrary}).
   */
  async beginStubEmbeddingLibrary(rows: unknown[]): Promise<void> {
    await this.page.unroute('**/admin/embeddings/library')
    await this.page.route('**/admin/embeddings/library', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue()
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(rows),
      })
    })
  }

  async endStubEmbeddingLibrary(): Promise<void> {
    await this.page.unroute('**/admin/embeddings/library')
  }

  async stubPatchReindexPolicyError(status: number, detail: string): Promise<void> {
    await this.page.unroute('**/admin/embeddings/reindex-policy')
    await this.page.route('**/admin/embeddings/reindex-policy', async (route) => {
      if (route.request().method() !== 'PATCH') {
        await route.continue()
        return
      }
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ detail }),
      })
    })
  }

  async stubTestEmbeddingProbeError(status: number, detail: string): Promise<void> {
    await this.page.unroute('**/admin/test/embedding')
    await this.page.route('**/admin/test/embedding', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue()
        return
      }
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ detail }),
      })
    })
  }

  async endStubTestEmbeddingProbe(): Promise<void> {
    await this.page.unroute('**/admin/test/embedding')
  }

  async endStubPatchReindexPolicy(): Promise<void> {
    await this.page.unroute('**/admin/embeddings/reindex-policy')
  }

  async expectReindexPolicyInlineErrorContains(text: string): Promise<void> {
    const card = this.page.locator('section').filter({
      has: this.page.getByRole('heading', { name: 'Reindex policy', exact: true }),
    })
    await expect(card.getByText(text, { exact: false }).first()).toBeVisible()
  }
}
