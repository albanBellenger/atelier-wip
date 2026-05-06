import { expect, test } from '@playwright/test'

import { ProjectArtifactsPage } from './pages/ArtifactsPage'

/**
 * Phase 1 — RAG visibility: upload a small Markdown file and poll until the row
 * shows Indexed with a non-zero chunk count (tooltip). Requires a logged-in
 * Studio Owner or Builder at ``PLAYWRIGHT_ARTIFACTS_URL`` and stubbed/successful embedding
 * in the target environment.
 */
test('project artifacts: upload md then row shows Indexed with chunks', async ({
  page,
  baseURL,
}) => {
  test.skip(
    !process.env.PLAYWRIGHT_ARTIFACTS_URL?.trim(),
    'Set PLAYWRIGHT_ARTIFACTS_URL to /studios/.../projects/.../artifacts (logged in as editor)',
  )

  const artifacts = new ProjectArtifactsPage(page)
  await artifacts.gotoFromEnv(baseURL)
  await expect(page.getByRole('heading', { name: /^artifacts$/i })).toBeVisible({
    timeout: 20_000,
  })
  await artifacts.uploadRagSampleMarkdown()
  await artifacts.expectIndexedWithChunksVisible(120_000)
})
