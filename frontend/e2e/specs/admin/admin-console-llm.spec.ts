import { test } from '../../fixtures/auth.fixture'
import { AdminConsolePage } from '../../pages/admin/AdminConsolePage'
import { AdminLlmPage } from '../../pages/admin/AdminLlmPage'

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

  test('non-admin is denied', async ({ nonAdminPage }) => {
    const console_ = new AdminConsolePage(nonAdminPage)
    await console_.goto('llm')
    await console_.expectAccessDenied()
  })
})
