import crypto from 'node:crypto'

import { expect, test } from '../../fixtures/auth.fixture'
import { AdminConsolePage } from '../../pages/admin/AdminConsolePage'
import { AdminLlmPage } from '../../pages/admin/AdminLlmPage'
import type { LlmProviderRegistryRow } from '../../../src/services/api'

test.describe('Admin console — LLM', () => {
  test('platform admin sees LLM registry', async ({ toolAdminPage }) => {
    const console_ = new AdminConsolePage(toolAdminPage)
    const llm = new AdminLlmPage(toolAdminPage)
    await llm.stubTestLlmProbe()
    await console_.goto('llm')
    await llm.expectHeadingVisible()
    await llm.expectModelRegistrySectionVisible()
    await llm.expectRegistryHasRowsOrEmptyMessage()
  })

  test('opens Add provider modal and closes without saving', async ({ toolAdminPage }) => {
    const console_ = new AdminConsolePage(toolAdminPage)
    const llm = new AdminLlmPage(toolAdminPage)
    await llm.stubTestLlmProbe()
    await console_.goto('llm')
    await llm.expectHeadingVisible()
    await llm.openAddProviderModal()
    await llm.expectRegisterProviderDialogVisible()
    await llm.cancelAddProviderModal()
    await llm.expectRegisterProviderDialogHidden()
  })

  test('registers a provider row with stubbed PUT + deployment refetch', async ({ toolAdminPage }) => {
    const pid = `e2ereg${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
    const console_ = new AdminConsolePage(toolAdminPage)
    const llm = new AdminLlmPage(toolAdminPage)
    await llm.stubTestLlmProbe()
    await llm.beginStubRegistryDeploymentForProvider(pid)
    try {
      await console_.goto('llm')
      await llm.expectHeadingVisible()
      await llm.openAddProviderModal()
      await llm.expectRegisterProviderDialogVisible()
      await llm.fillRegisterProviderForm({ providerId: pid, modelIds: 'stub-chat-model' })
      await llm.submitRegisterProviderModal()
      await llm.expectRegisterProviderDialogHidden()
      await expect(llm.providerRow(pid)).toBeVisible({ timeout: 15_000 })
    } finally {
      await llm.endStubRegistryDeployment()
    }
  })

  test('adds a routing rule and saves via stubbed PUT /admin/llm/routing', async ({ toolAdminPage }) => {
    const console_ = new AdminConsolePage(toolAdminPage)
    const llm = new AdminLlmPage(toolAdminPage)
    await llm.stubTestLlmProbe()
    await llm.beginStubRoutingListBucketsAndCapturePut()
    try {
      await console_.goto('llm')
      await llm.expectHeadingVisible()
      await llm.expectModelRegistrySectionVisible()
      await llm.openAddRoutingModal()
      await llm.fillAddRoutingPrimaryModel('stub-routing-primary')
      await llm.submitAddRoutingRule()
      await llm.clickSaveRouting()
      await llm.expectRoutingPutHitsAtLeast(1)
    } finally {
      await llm.endStubRouting()
    }
  })

  test('per-studio provider toggle issues PUT llm-policy (stubbed deployment + policy)', async ({
    toolAdminPage,
  }) => {
    const console_ = new AdminConsolePage(toolAdminPage)
    const llm = new AdminLlmPage(toolAdminPage)
    const providerId = `e2epolicy${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`
    const modelId = 'stub-model-1'
    await llm.stubTestLlmProbe()
    await llm.beginStubPerStudioLlmPolicy({ providerId, modelId })
    try {
      await console_.goto('llm')
      await llm.expectHeadingVisible()
      await llm.expectPerStudioProviderSwitchAriaChecked(providerId, 'true')
      await llm.enableProviderToggle(providerId)
      await llm.expectPerStudioProviderSwitchAriaChecked(providerId, 'false')
    } finally {
      await llm.endStubPerStudioLlmPolicyRoutes()
    }
  })

  test('registry row: edit saves via stubbed PUT then delete clears row', async ({ toolAdminPage }) => {
    const pid = `e2eedit${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`
    const initial: LlmProviderRegistryRow = {
      id: '33333333-3333-4333-8333-333333333333',
      provider_id: pid,
      models: [{ id: 'chat-m1', kind: 'chat' }],
      api_base_url: null,
      logo_url: null,
      status: 'not_connected',
      is_default: false,
      sort_order: 0,
      llm_api_key_set: false,
      llm_api_key_hint: null,
      litellm_provider_slug: null,
    }
    const console_ = new AdminConsolePage(toolAdminPage)
    const llm = new AdminLlmPage(toolAdminPage)
    await llm.stubTestLlmProbe()
    await llm.beginStubMutableRegistryDeployment(initial)
    try {
      await console_.goto('llm')
      await llm.expectHeadingVisible()
      await expect(llm.providerRow(pid)).toBeVisible({ timeout: 15_000 })
      await llm.clickEditOnProviderRow(pid)
      await llm.fillEditProviderModelIdsCsv('chat-m1, chat-m2')
      await llm.saveEditProviderModal()
      await llm.expectProviderRowContainsModelSnippet(pid, 'chat-m2')
      await llm.clickEditOnProviderRow(pid)
      await llm.deleteProviderFromEditModalWithoutConnectedConfirm()
      await expect(llm.providerRow(pid)).not.toBeVisible({ timeout: 15_000 })
    } finally {
      await llm.endStubMutableRegistryDeployment()
    }
  })

  test('Test chat on registry row sends provider-scoped POST body (stubbed)', async ({
    toolAdminPage,
  }) => {
    const pid = `e2eprobe${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`
    const initial: LlmProviderRegistryRow = {
      id: '44444444-4444-4444-8444-444444444444',
      provider_id: pid,
      models: [{ id: 'probe-model', kind: 'chat' }],
      api_base_url: 'https://api.example.test/v1',
      logo_url: null,
      status: 'not_connected',
      is_default: false,
      sort_order: 0,
      llm_api_key_set: false,
      llm_api_key_hint: null,
      litellm_provider_slug: null,
    }
    const console_ = new AdminConsolePage(toolAdminPage)
    const llm = new AdminLlmPage(toolAdminPage)
    await llm.stubTestLlmProbeRecordingPostBody()
    await llm.beginStubMutableRegistryDeployment(initial)
    try {
      await console_.goto('llm')
      await llm.expectHeadingVisible()
      await llm.clickTestChatOnProviderRow(pid)
      const body = llm.lastLlmProbePostBody() as Record<string, unknown>
      expect(body.provider_id).toBe(pid)
      expect(body.model).toBe('probe-model')
      expect(body.api_base_url).toBe('https://api.example.test/v1')
    } finally {
      await llm.endStubMutableRegistryDeployment()
      await llm.endStubTestLlmProbe()
    }
  })

  test('routing: remove seeded rule and save issues stubbed PUT', async ({ toolAdminPage }) => {
    const console_ = new AdminConsolePage(toolAdminPage)
    const llm = new AdminLlmPage(toolAdminPage)
    await llm.stubTestLlmProbe()
    await llm.beginStubRoutingBucketsWithSeedRuleAndCapturePut({
      use_case: 'chat',
      primary_model: 'seed-model',
      fallback_model: null,
    })
    try {
      await console_.goto('llm')
      await llm.expectHeadingVisible()
      await llm.clickFirstRoutingRemove()
      await llm.clickSaveRouting()
      await llm.expectRoutingPutHitsAtLeast(1)
    } finally {
      await llm.endStubRouting()
    }
  })

  test('routing: edit seeded primary model and save issues stubbed PUT', async ({ toolAdminPage }) => {
    const console_ = new AdminConsolePage(toolAdminPage)
    const llm = new AdminLlmPage(toolAdminPage)
    await llm.stubTestLlmProbe()
    await llm.beginStubRoutingBucketsWithSeedRuleAndCapturePut({
      use_case: 'chat',
      primary_model: 'before-model',
      fallback_model: null,
    })
    try {
      await console_.goto('llm')
      await llm.expectHeadingVisible()
      await llm.fillRoutingPrimaryForUseCase('chat', 'after-model')
      await llm.clickSaveRouting()
      await llm.expectRoutingPutHitsAtLeast(1)
    } finally {
      await llm.endStubRouting()
    }
  })

  test('routing Registry scope select persists chosen slug', async ({ toolAdminPage }) => {
    const console_ = new AdminConsolePage(toolAdminPage)
    const llm = new AdminLlmPage(toolAdminPage)
    await llm.stubTestLlmProbe()
    await llm.beginStubRoutingListBucketsAndCapturePut()
    await llm.beginStubDeploymentTwoSlugsForRoutingScope()
    try {
      await console_.goto('llm')
      await llm.expectHeadingVisible()
      await llm.selectRoutingRegistryScope('scope_slug_b')
      await llm.expectRoutingRegistryScopeValue('scope_slug_b')
    } finally {
      await llm.endStubRouting()
      await llm.endStubDeploymentTwoSlugs()
    }
  })

  test('non-admin is denied', async ({ nonAdminPage }) => {
    const console_ = new AdminConsolePage(nonAdminPage)
    await console_.goto('llm')
    await console_.expectAccessDenied()
  })
})
