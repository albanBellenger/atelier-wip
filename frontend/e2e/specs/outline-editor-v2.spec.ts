import { expect, test } from '@playwright/test'

import { SectionWorkspacePage } from '../pages/SectionWorkspacePage'

/**
 * Outline Editor V2 smoke (logged-in session + PLAYWRIGHT_SECTION_URL).
 * Enable V2 from Profile — checkbox data-testid pref-outline-editor-v2.
 */
test.describe('outline editor v2', () => {
  test('canvas, margin dot, copilot ⌘K, composer message, Esc close; prefs toggle', async ({
    page,
    baseURL,
  }) => {
    const path = process.env.PLAYWRIGHT_SECTION_URL
    test.skip(
      !path,
      'Set PLAYWRIGHT_SECTION_URL to a section deep link (logged-in session).',
    )
    const ws = new SectionWorkspacePage(page)
    await ws.goto(`${baseURL ?? ''}/me/profile`)
    const v2box = page.getByTestId('pref-outline-editor-v2')
    await expect(v2box).toBeVisible({ timeout: 15_000 })
    await v2box.setChecked(true)

    await ws.goto(`${baseURL ?? ''}${path}`)
    await expect(page.getByTestId('doc-canvas')).toBeVisible({
      timeout: 25_000,
    })
    await expect(page.getByTestId('margin-dot').first()).toBeVisible({
      timeout: 15_000,
    })

    await page.keyboard.press('Meta+K')
    await expect(page.getByTestId('copilot-overlay')).toBeVisible({
      timeout: 10_000,
    })

    await ws.copilotComposerTextarea().fill('Hello from v2 e2e')
    await page.keyboard.press('Enter')

    await expect(page.getByText(/Hello from v2 e2e/)).toBeVisible({
      timeout: 90_000,
    })

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('copilot-overlay')).not.toBeVisible({
      timeout: 8000,
    })

    await ws.goto(`${baseURL ?? ''}/me/profile`)
    await expect(page.getByTestId('pref-outline-editor-v2')).toBeChecked()
  })
})
