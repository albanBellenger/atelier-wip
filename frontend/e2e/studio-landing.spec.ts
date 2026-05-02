import { expect, test } from '@playwright/test'

/**
 * Studio landing — software/projects panels.
 * Requires PLAYWRIGHT_STUDIO_URL (e.g. /studios/<uuid> while logged in).
 */
test('studio landing shows Software and Projects', async ({ page, baseURL }) => {
  const target = process.env.PLAYWRIGHT_STUDIO_URL
  test.skip(
    !target,
    'Set PLAYWRIGHT_STUDIO_URL to a studio page you are logged into (e.g. /studios/...)',
  )
  await page.goto(`${baseURL ?? ''}${target}`)
  await expect(page.getByRole('heading', { name: /^Software/i })).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByRole('heading', { name: /^Projects/i })).toBeVisible({
    timeout: 15_000,
  })
})
