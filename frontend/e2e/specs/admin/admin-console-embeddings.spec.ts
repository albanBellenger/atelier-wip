import { test } from '../../fixtures/auth.fixture'
import { AdminConsolePage } from '../../pages/admin/AdminConsolePage'
import { AdminEmbeddingsPage } from '../../pages/admin/AdminEmbeddingsPage'

test.describe('Admin console — embeddings', () => {
  test('platform admin sees embeddings sections', async ({ toolAdminPage }) => {
    const console_ = new AdminConsolePage(toolAdminPage)
    const emb = new AdminEmbeddingsPage(toolAdminPage)
    await console_.goto('embeddings')
    await emb.expectHeadingVisible()
    await emb.expectModelRegistryVisible()
    await emb.expectLibraryTableVisible()
  })

  test('non-admin is denied', async ({ nonAdminPage }) => {
    const console_ = new AdminConsolePage(nonAdminPage)
    await console_.goto('embeddings')
    await console_.expectAccessDenied()
  })
})
