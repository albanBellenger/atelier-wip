import { expect, type Locator, type Page } from '@playwright/test'

import type { LlmProviderRegistryRow } from '../../../src/services/api'

export class AdminLlmPage {
  private readonly page: Page

  private routingPutHits = 0

  private mutableRegistryProviders: LlmProviderRegistryRow[] = []

  private lastRecordedLlmProbePostBody: unknown = null

  constructor(page: Page) {
    this.page = page
  }

  /** Deterministic stub — E2E must not call a real LLM provider. */
  async stubTestLlmProbe(): Promise<void> {
    await this.page.unroute('**/admin/test/llm')
    await this.page.route('**/admin/test/llm', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue()
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, message: 'stub', detail: null }),
      })
    })
  }

  /** Like {@link stubTestLlmProbe} but stores the last POST JSON body on `this` for assertions. */
  async stubTestLlmProbeRecordingPostBody(): Promise<void> {
    this.lastRecordedLlmProbePostBody = null
    await this.page.unroute('**/admin/test/llm')
    await this.page.route('**/admin/test/llm', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue()
        return
      }
      try {
        this.lastRecordedLlmProbePostBody = JSON.parse(route.request().postData() || '{}')
      } catch {
        this.lastRecordedLlmProbePostBody = null
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, message: 'stub-row', detail: null }),
      })
    })
  }

  lastLlmProbePostBody(): unknown {
    return this.lastRecordedLlmProbePostBody
  }

  async endStubTestLlmProbe(): Promise<void> {
    await this.page.unroute('**/admin/test/llm')
  }

  /**
   * Isolated registry: empty deployment until a matching `PUT /admin/llm/providers/:id`,
   * then the stubbed row appears on refetch. Other tests should `endStubRegistryDeployment()` in `finally`.
   */
  async beginStubRegistryDeploymentForProvider(providerId: string): Promise<void> {
    let providers: LlmProviderRegistryRow[] = []
    await this.page.unroute('**/admin/llm/deployment')
    await this.page.route('**/admin/llm/deployment', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue()
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ has_providers: providers.length > 0, providers }),
      })
    })
    const escaped = providerId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    await this.page.route(new RegExp(`/admin/llm/providers/${escaped}$`), async (route) => {
      if (route.request().method() !== 'PUT') {
        await route.continue()
        return
      }
      const body = JSON.parse(route.request().postData() || '{}') as {
        models: LlmProviderRegistryRow['models']
      }
      const row: LlmProviderRegistryRow = {
        id: '11111111-1111-4111-8111-111111111111',
        provider_id: providerId,
        models: body.models ?? [],
        api_base_url: null,
        logo_url: null,
        status: 'not_connected',
        is_default: false,
        sort_order: 0,
        llm_api_key_set: false,
        llm_api_key_hint: null,
        litellm_provider_slug: null,
      }
      providers = [row]
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(row),
      })
    })
  }

  async endStubRegistryDeployment(): Promise<void> {
    await this.page.unroute('**/admin/llm/deployment')
    await this.page.unroute(/\/admin\/llm\/providers\/[^/?]+$/)
  }

  registerProviderDialog(): Locator {
    return this.page.getByRole('dialog', { name: 'Register LLM provider' })
  }

  async fillRegisterProviderForm(args: { providerId: string; modelIds: string }): Promise<void> {
    const dlg = this.registerProviderDialog()
    await dlg.locator('#llm-provider-modal-create-provider-id').fill(args.providerId)
    await dlg.locator('#llm-provider-modal-create-provider-models').fill(args.modelIds)
  }

  async submitRegisterProviderModal(): Promise<void> {
    await this.registerProviderDialog().getByRole('button', { name: 'Register provider', exact: true }).click()
  }

  async expectRegisterProviderDialogHidden(): Promise<void> {
    await expect(
      this.page.getByRole('dialog', { name: 'Register LLM provider' }),
    ).not.toBeVisible()
  }

  async beginStubRoutingListBucketsAndCapturePut(): Promise<void> {
    this.routingPutHits = 0
    await this.page.unroute('**/admin/llm/routing')
    await this.page.unroute('**/admin/llm/routing/buckets')
    await this.page.route('**/admin/llm/routing/buckets', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue()
        return
      }
      const payload = {
        bucket_order: ['chat', 'code_gen', 'classification', 'embeddings'],
        buckets: [
          { use_case: 'chat', call_sources: ['chat_thread'] },
          { use_case: 'code_gen', call_sources: [] },
          { use_case: 'classification', call_sources: [] },
          { use_case: 'embeddings', call_sources: [] },
        ],
        embeddings_match: 'substring',
        embeddings_substring: '',
        embeddings_routing_note: '',
        chat_default_note: '',
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(payload),
      })
    })
    await this.page.route('**/admin/llm/routing', async (route) => {
      const m = route.request().method()
      if (m === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: '[]',
        })
        return
      }
      if (m === 'PUT') {
        this.routingPutHits += 1
        const raw = route.request().postData() || '{"rules":[]}'
        const parsed = JSON.parse(raw) as { rules: unknown[] }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(parsed.rules ?? []),
        })
        return
      }
      await route.continue()
    })
  }

  async endStubRouting(): Promise<void> {
    await this.page.unroute('**/admin/llm/routing')
    await this.page.unroute('**/admin/llm/routing/buckets')
  }

  async expectRoutingPutHitsAtLeast(n: number): Promise<void> {
    await expect.poll(() => this.routingPutHits).toBeGreaterThanOrEqual(n)
  }

  async openAddRoutingModal(): Promise<void> {
    // Btn uses aria-label="Add routing rule" (visible text is "+ Add routing"); a11y name is the label.
    const btn = this.page.getByRole('button', { name: 'Add routing rule' })
    await btn.scrollIntoViewIfNeeded()
    await btn.click()
    await expect(this.page.getByRole('dialog', { name: 'Add routing rule' })).toBeVisible()
  }

  async fillAddRoutingPrimaryModel(modelId: string): Promise<void> {
    await this.page.locator('#llm-add-routing-primary').fill(modelId)
  }

  async submitAddRoutingRule(): Promise<void> {
    await this.page.getByRole('dialog', { name: 'Add routing rule' }).getByRole('button', { name: 'Add rule', exact: true }).click()
    await expect(this.page.getByRole('dialog', { name: 'Add routing rule' })).not.toBeVisible()
  }

  async clickSaveRouting(): Promise<void> {
    await this.page.getByRole('button', { name: 'Save routing', exact: true }).click()
  }

  /**
   * Forces one “connected” registry row + policy rows so Per-studio toggles render without a real probe.
   * GET/PUT `/admin/studios/:id/llm-policy` share mutable `rows` so a toggle persists for the session.
   * Tear down with `endStubPerStudioLlmPolicyRoutes()` in `finally`.
   */
  async beginStubPerStudioLlmPolicy(args: { providerId: string; modelId: string }): Promise<void> {
    let policyRows: { provider_id: string; enabled: boolean; selected_model: string | null }[] = [
      {
        provider_id: args.providerId,
        enabled: true,
        selected_model: args.modelId,
      },
    ]
    const deploymentBody = {
      has_providers: true,
      providers: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          provider_id: args.providerId,
          models: [{ id: args.modelId, kind: 'chat' }],
          api_base_url: null,
          logo_url: null,
          status: 'connected',
          is_default: false,
          sort_order: 0,
          llm_api_key_set: true,
          llm_api_key_hint: 'stub',
          litellm_provider_slug: args.providerId,
        },
      ],
    }
    await this.page.unroute('**/admin/llm/deployment')
    await this.page.route('**/admin/llm/deployment', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue()
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(deploymentBody),
      })
    })
    await this.page.route('**/admin/studios/*/llm-policy', async (route) => {
      const m = route.request().method()
      if (m === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(policyRows),
        })
        return
      }
      if (m === 'PUT') {
        const raw = JSON.parse(route.request().postData() || '{"rows":[]}') as {
          rows: typeof policyRows
        }
        policyRows = raw.rows ?? policyRows
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(policyRows),
        })
        return
      }
      await route.continue()
    })
  }

  async endStubPerStudioLlmPolicyRoutes(): Promise<void> {
    await this.page.unroute('**/admin/llm/deployment')
    await this.page.unroute('**/admin/studios/*/llm-policy')
  }

  async expectHeadingVisible(): Promise<void> {
    await expect(
      this.page.getByRole('heading', { name: 'LLM connectivity', exact: true }),
    ).toBeVisible()
  }

  /** Row in the model registry (matches provider ID or visible label substring). */
  providerRow(providerId: string): Locator {
    const deploymentCard = this.page.locator('section').filter({
      has: this.page.getByRole('heading', { name: 'LLM deployment', exact: true }),
    })
    return deploymentCard.locator('div.grid').filter({ hasText: providerId }).first()
  }

  /** Toggle provider enablement for the selected studio (Per-studio enablement). */
  async enableProviderToggle(providerId: string): Promise<void> {
    const card = this.page.locator('section').filter({
      has: this.page.getByRole('heading', { name: 'Per-studio enablement', exact: true }),
    })
    const row = card.locator('li').filter({ hasText: providerId })
    await row.getByRole('switch').click()
  }

  async expectPerStudioProviderSwitchAriaChecked(
    providerId: string,
    expected: 'true' | 'false',
  ): Promise<void> {
    const card = this.page.locator('section').filter({
      has: this.page.getByRole('heading', { name: 'Per-studio enablement', exact: true }),
    })
    const row = card.locator('li').filter({ hasText: providerId })
    await expect(row.getByRole('switch')).toHaveAttribute('aria-checked', expected)
  }

  async expectPerStudioEmptyStateVisible(): Promise<void> {
    await expect(
      this.page.getByText('Select a studio with at least one connected LLM provider', {
        exact: false,
      }),
    ).toBeVisible()
  }

  async expectModelRegistrySectionVisible(): Promise<void> {
    await expect(this.page.getByText('Model registry', { exact: true })).toBeVisible()
  }

  async expectRegistryHasRowsOrEmptyMessage(): Promise<void> {
    const empty = this.page.getByText('No rows yet.', { exact: false })
    const providerHeader = this.page.getByText('Provider', { exact: true }).first()
    await expect(empty.or(providerHeader)).toBeVisible({ timeout: 15_000 })
  }

  async openAddProviderModal(): Promise<void> {
    await this.page.getByRole('button', { name: 'Add provider' }).click()
  }

  async expectRegisterProviderDialogVisible(): Promise<void> {
    await expect(
      this.page.getByRole('dialog', { name: 'Register LLM provider' }),
    ).toBeVisible()
  }

  async cancelAddProviderModal(): Promise<void> {
    await this.page
      .getByRole('dialog', { name: 'Register LLM provider' })
      .getByRole('button', { name: 'Cancel', exact: true })
      .click()
  }

  editProviderDialog(): Locator {
    return this.page.getByRole('dialog', { name: 'Edit LLM provider' })
  }

  async clickEditOnProviderRow(providerId: string): Promise<void> {
    const row = this.providerRow(providerId)
    await row.getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(this.editProviderDialog()).toBeVisible()
  }

  async fillEditProviderModelIdsCsv(text: string): Promise<void> {
    await this.page.locator('#llm-provider-modal-edit-provider-models').fill(text)
  }

  async saveEditProviderModal(): Promise<void> {
    await this.editProviderDialog().getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(this.editProviderDialog()).not.toBeVisible({ timeout: 15_000 })
  }

  async deleteProviderFromEditModalWithoutConnectedConfirm(): Promise<void> {
    await this.editProviderDialog().getByRole('button', { name: 'Delete provider', exact: true }).click()
    await expect(this.editProviderDialog()).not.toBeVisible({ timeout: 15_000 })
  }

  /**
   * In-memory registry + PUT/DELETE handlers for `/admin/llm/providers/:id`.
   * Tear down with {@link endStubMutableRegistryDeployment}.
   */
  async beginStubMutableRegistryDeployment(initial: LlmProviderRegistryRow): Promise<void> {
    this.mutableRegistryProviders = [initial]
    await this.page.unroute('**/admin/llm/deployment')
    await this.page.unroute(/\/admin\/llm\/providers\/[^/?]+$/)
    await this.page.route('**/admin/llm/deployment', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue()
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          has_providers: this.mutableRegistryProviders.length > 0,
          providers: this.mutableRegistryProviders,
        }),
      })
    })
    await this.page.route(/\/admin\/llm\/providers\/[^/?]+$/, async (route) => {
      const m = route.request().method()
      const url = route.request().url()
      const key = decodeURIComponent(url.split('/').pop() ?? '')
      if (m === 'PUT') {
        const body = JSON.parse(route.request().postData() || '{}') as {
          models?: LlmProviderRegistryRow['models']
          api_base_url?: string | null
          is_default?: boolean
          sort_order?: number
          litellm_provider_slug?: string | null
          disabled?: boolean
        }
        const cur = this.mutableRegistryProviders.find((p) => p.provider_id === key)
        if (!cur) {
          await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
          return
        }
        const next: LlmProviderRegistryRow = {
          ...cur,
          models: body.models ?? cur.models,
          api_base_url:
            body.api_base_url !== undefined ? body.api_base_url : cur.api_base_url,
          is_default: body.is_default ?? cur.is_default,
          sort_order: body.sort_order ?? cur.sort_order,
          litellm_provider_slug:
            body.litellm_provider_slug !== undefined
              ? body.litellm_provider_slug
              : cur.litellm_provider_slug,
        }
        if (body.disabled !== undefined) {
          next.status = body.disabled ? 'disabled' : cur.status
        }
        this.mutableRegistryProviders = this.mutableRegistryProviders.map((p) =>
          p.provider_id === key ? next : p,
        )
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...next, save_warnings: [] as string[] }),
        })
        return
      }
      if (m === 'DELETE') {
        this.mutableRegistryProviders = this.mutableRegistryProviders.filter((p) => p.provider_id !== key)
        await route.fulfill({ status: 204 })
        return
      }
      await route.continue()
    })
  }

  async endStubMutableRegistryDeployment(): Promise<void> {
    await this.page.unroute('**/admin/llm/deployment')
    await this.page.unroute(/\/admin\/llm\/providers\/[^/?]+$/)
  }

  async expectProviderRowContainsModelSnippet(providerId: string, snippet: string): Promise<void> {
    await expect(this.providerRow(providerId)).toContainText(snippet, { timeout: 15_000 })
  }

  async clickTestChatOnProviderRow(providerId: string): Promise<void> {
    const row = this.providerRow(providerId)
    await row.getByRole('button', { name: 'Test chat', exact: true }).click()
  }

  routingRegistryScopeSelect(): Locator {
    return this.page.locator('label').filter({ hasText: 'Registry scope' }).locator('select')
  }

  async selectRoutingRegistryScope(value: string): Promise<void> {
    await this.routingRegistryScopeSelect().selectOption(value)
  }

  async expectRoutingRegistryScopeValue(expected: string): Promise<void> {
    await expect(this.routingRegistryScopeSelect()).toHaveValue(expected)
  }

  /**
   * Stubs routing GET with one saved rule so the row can be edited or removed locally.
   */
  async beginStubRoutingBucketsWithSeedRuleAndCapturePut(
    seed: { use_case: string; primary_model: string; fallback_model: string | null },
  ): Promise<void> {
    this.routingPutHits = 0
    await this.page.unroute('**/admin/llm/routing')
    await this.page.unroute('**/admin/llm/routing/buckets')
    await this.page.route('**/admin/llm/routing/buckets', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue()
        return
      }
      const payload = {
        bucket_order: ['chat', 'code_gen', 'classification', 'embeddings'],
        buckets: [
          { use_case: 'chat', call_sources: ['chat_thread'] },
          { use_case: 'code_gen', call_sources: [] },
          { use_case: 'classification', call_sources: [] },
          { use_case: 'embeddings', call_sources: [] },
        ],
        embeddings_match: 'substring',
        embeddings_substring: '',
        embeddings_routing_note: '',
        chat_default_note: '',
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(payload),
      })
    })
    await this.page.route('**/admin/llm/routing', async (route) => {
      const m = route.request().method()
      if (m === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([seed]),
        })
        return
      }
      if (m === 'PUT') {
        this.routingPutHits += 1
        const raw = route.request().postData() || '{"rules":[]}'
        const parsed = JSON.parse(raw) as { rules: unknown[] }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(parsed.rules ?? []),
        })
        return
      }
      await route.continue()
    })
  }

  async clickFirstRoutingRemove(): Promise<void> {
    const card = this.page.locator('section').filter({
      has: this.page.getByRole('heading', { name: 'Routing & fallback policy', exact: true }),
    })
    await card.getByRole('button', { name: 'Remove', exact: true }).first().click()
  }

  async fillRoutingPrimaryForUseCase(useCase: string, value: string): Promise<void> {
    await this.page.locator(`#llm-routing-primary-${useCase}`).fill(value)
  }

  /**
   * Two connected providers with distinct LiteLLM slugs so Routing → Registry scope populates options.
   */
  async beginStubDeploymentTwoSlugsForRoutingScope(): Promise<void> {
    const a: LlmProviderRegistryRow = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      provider_id: 'e2e_scope_a',
      models: [{ id: 'chat-a', kind: 'chat' }],
      api_base_url: null,
      logo_url: null,
      status: 'connected',
      is_default: false,
      sort_order: 0,
      llm_api_key_set: true,
      llm_api_key_hint: 'stub',
      litellm_provider_slug: 'scope_slug_a',
    }
    const b: LlmProviderRegistryRow = {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      provider_id: 'e2e_scope_b',
      models: [{ id: 'chat-b', kind: 'chat' }],
      api_base_url: null,
      logo_url: null,
      status: 'connected',
      is_default: false,
      sort_order: 1,
      llm_api_key_set: true,
      llm_api_key_hint: 'stub',
      litellm_provider_slug: 'scope_slug_b',
    }
    await this.page.unroute('**/admin/llm/deployment')
    await this.page.route('**/admin/llm/deployment', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue()
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ has_providers: true, providers: [a, b] }),
      })
    })
  }

  async endStubDeploymentTwoSlugs(): Promise<void> {
    await this.page.unroute('**/admin/llm/deployment')
  }
}
