import { expect, test } from '../../fixtures/auth.fixture'
import { AdminConsolePage } from '../../pages/admin/AdminConsolePage'
import { AdminEmbeddingsPage } from '../../pages/admin/AdminEmbeddingsPage'

test.describe('Admin console — embeddings', () => {
  test('platform admin sees embeddings sections', async ({ toolAdminPage }) => {
    const console_ = new AdminConsolePage(toolAdminPage)
    const emb = new AdminEmbeddingsPage(toolAdminPage)
    await console_.goto('embeddings')
    await emb.expectHeadingVisible()
    await emb.expectReindexPolicyVisible()
    await emb.expectLibraryTableVisible()
  })

  test('Test embedding API shows stub result', async ({ toolAdminPage }) => {
    const console_ = new AdminConsolePage(toolAdminPage)
    const emb = new AdminEmbeddingsPage(toolAdminPage)
    await emb.stubTestEmbeddingProbe('e2e stub embedding')
    await console_.goto('embeddings')
    await emb.expectHeadingVisible()
    await emb.clickTestEmbeddingApi()
    await emb.expectEmbeddingTestResultContains('e2e stub embedding')
  })

  test('Save policy completes when PATCH is stubbed', async ({ toolAdminPage }) => {
    const console_ = new AdminConsolePage(toolAdminPage)
    const emb = new AdminEmbeddingsPage(toolAdminPage)
    await emb.stubPatchReindexPolicy()
    await console_.goto('embeddings')
    await emb.expectReindexPolicyVisible()
    await emb.bumpDebounceSecondsAndSavePolicy()
    await emb.expectSavePolicyCompleted()
  })

  test('Artifact library empty state when GET library returns []', async ({ toolAdminPage }) => {
    const console_ = new AdminConsolePage(toolAdminPage)
    const emb = new AdminEmbeddingsPage(toolAdminPage)
    await emb.beginStubEmbeddingLibrary([])
    try {
      await console_.goto('embeddings')
      await emb.expectHeadingVisible()
      await emb.expectArtifactLibraryEmptyStateVisible()
    } finally {
      await emb.endStubEmbeddingLibrary()
    }
  })

  test('Artifact library row Open library navigates to studio artifact library', async ({
    toolAdminPage,
  }) => {
    const sid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    const console_ = new AdminConsolePage(toolAdminPage)
    const emb = new AdminEmbeddingsPage(toolAdminPage)
    await emb.beginStubEmbeddingLibrary([
      {
        studio_id: sid,
        studio_name: 'E2E Library Studio',
        artifact_count: 1,
        embedded_artifact_count: 0,
        artifact_vector_chunks: 0,
        section_vector_chunks: 0,
      },
    ])
    try {
      await console_.goto('embeddings')
      await emb.expectHeadingVisible()
      await emb.expectLibraryTableVisible()
      await emb.clickOpenLibraryForStudioNamed('E2E Library Studio')
      await expect.poll(() => new URL(toolAdminPage.url()).pathname).toBe(
        `/studios/${encodeURIComponent(sid)}/artifact-library`,
      )
    } finally {
      await emb.endStubEmbeddingLibrary()
    }
  })

  test('Test embedding API shows inline error when POST returns 422', async ({ toolAdminPage }) => {
    const console_ = new AdminConsolePage(toolAdminPage)
    const emb = new AdminEmbeddingsPage(toolAdminPage)
    await emb.stubTestEmbeddingProbeError(422, 'E2E stub embedding failure')
    try {
      await console_.goto('embeddings')
      await emb.expectHeadingVisible()
      await emb.clickTestEmbeddingApi()
      await expect(
        toolAdminPage.getByRole('main').getByText('E2E stub embedding failure', { exact: false }),
      ).toBeVisible()
    } finally {
      await emb.endStubTestEmbeddingProbe()
    }
  })

  test('Save policy shows inline error when PATCH returns 500', async ({ toolAdminPage }) => {
    const console_ = new AdminConsolePage(toolAdminPage)
    const emb = new AdminEmbeddingsPage(toolAdminPage)
    await emb.stubPatchReindexPolicyError(500, 'E2E stub policy save failure')
    try {
      await console_.goto('embeddings')
      await emb.expectReindexPolicyVisible()
      await emb.bumpDebounceSecondsAndSavePolicy()
      await emb.expectReindexPolicyInlineErrorContains('E2E stub policy save failure')
    } finally {
      await emb.endStubPatchReindexPolicy()
    }
  })

  test('non-admin is denied', async ({ nonAdminPage }) => {
    const console_ = new AdminConsolePage(nonAdminPage)
    await console_.goto('embeddings')
    await console_.expectAccessDenied()
  })
})
