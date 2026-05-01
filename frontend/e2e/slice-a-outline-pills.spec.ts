import { expect, test } from '@playwright/test'

/**
 * Slice A — outline status pills (browser).
 * Requires a running app, valid session, and project URL in env:
 *   PLAYWRIGHT_BASE_URL=http://localhost:5173 PLAYWRIGHT_PROJECT_URL=... npm run test:e2e
 */
test('project outline lists section status pills', async ({ page, baseURL }) => {
  const target = process.env.PLAYWRIGHT_PROJECT_URL
  test.skip(
    !target,
    'Set PLAYWRIGHT_PROJECT_URL to a project page you are logged into (e.g. /studios/.../projects/...)',
  )
  await page.goto(`${baseURL ?? ''}${target}`)
  await expect(page.getByTestId('section-status-pill-ready').first()).toBeVisible({
    timeout: 15_000,
  })
})
