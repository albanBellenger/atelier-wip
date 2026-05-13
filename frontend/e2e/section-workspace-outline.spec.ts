import { expect, test } from '@playwright/test'

import { SectionWorkspacePage } from './pages/SectionWorkspacePage'

/**
 * Outline editor workspace smoke (requires logged-in session + env URL).
 * PLAYWRIGHT_BASE_URL=http://localhost:5173
 * PLAYWRIGHT_SECTION_URL=/studios/.../sections/...
 */
test('section workspace shows outline rail and health strip', async ({
  page,
  baseURL,
}) => {
  const path = process.env.PLAYWRIGHT_SECTION_URL
  test.skip(
    !path,
    'Set PLAYWRIGHT_SECTION_URL to a section deep link (logged-in session).',
  )
  const ws = new SectionWorkspacePage(page)
  await ws.goto(`${baseURL ?? ''}${path}`)
  await expect(ws.sectionOutline()).toBeVisible({ timeout: 20_000 })
  await expect(ws.healthDriftButton()).toBeVisible({ timeout: 20_000 })
})

test('health rail links open Critique tab in copilot', async ({
  page,
  baseURL,
}) => {
  const path = process.env.PLAYWRIGHT_SECTION_URL
  test.skip(
    !path,
    'Set PLAYWRIGHT_SECTION_URL to a section deep link (logged-in session).',
  )
  const ws = new SectionWorkspacePage(page)
  await ws.goto(`${baseURL ?? ''}${path}`)
  await expect(ws.healthDriftButton()).toBeVisible({ timeout: 20_000 })
  await ws.healthDriftButton().click()
  await expect(ws.healthOpenCopilotLink()).toBeVisible({ timeout: 5000 })
  await ws.healthOpenCopilotLink().click()
  await expect(ws.copilotCritiqueTab()).toHaveAttribute('aria-selected', 'true', {
    timeout: 15_000,
  })
})

test('context layout shows kind prefs for editors', async ({
  page,
  baseURL,
}) => {
  const path = process.env.PLAYWRIGHT_SECTION_URL
  test.skip(
    !path,
    'Set PLAYWRIGHT_SECTION_URL to a section deep link (logged-in session).',
  )
  const ws = new SectionWorkspacePage(page)
  await ws.goto(`${baseURL ?? ''}${path}`)
  await expect(ws.sectionOutline()).toBeVisible({ timeout: 20_000 })
  await ws.layoutContextButton().click()
  const prefs = ws.contextKindPrefs()
  await expect(prefs).toBeVisible({ timeout: 15_000 })
  const firstOn = prefs.getByRole('button', { name: 'On' }).first()
  await firstOn.click()
  await expect(firstOn).toHaveText('Off')
})

test('thread append SSE animates markdown into section editor', async ({
  page,
  baseURL,
}) => {
  const path = process.env.PLAYWRIGHT_SECTION_URL
  test.skip(
    !path,
    'Set PLAYWRIGHT_SECTION_URL to a section deep link (logged-in session).',
  )
  const sse =
    `data: ${JSON.stringify({ type: 'token', text: 'ok' })}\n\n` +
    `data: ${JSON.stringify({
      type: 'meta',
      findings: [],
      patch_proposal: {
        intent: 'append',
        markdown_to_append: '\n\n[E2E] appended line',
      },
    })}\n\n`
  await page.route('**/sections/*/thread/messages', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
      },
      body: sse,
    })
  })
  const ws = new SectionWorkspacePage(page)
  await ws.goto(`${baseURL ?? ''}${path}`)
  await expect(ws.sectionOutline()).toBeVisible({ timeout: 20_000 })
  const ta = ws.copilotComposerTextarea()
  await expect(ta).toBeVisible({ timeout: 25_000 })
  await ta.fill('/append E2E stream append')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(ws.crepeHost()).toContainText('[E2E] appended line', {
    timeout: 30_000,
  })
  await expect(ws.patchInlinePreview()).not.toBeVisible({ timeout: 10_000 })
})

test('editor slash AI menu prefills copilot composer', async ({
  page,
  baseURL,
}) => {
  const path = process.env.PLAYWRIGHT_SECTION_URL
  test.skip(
    !path,
    'Set PLAYWRIGHT_SECTION_URL to a section deep link (logged-in session).',
  )
  const ws = new SectionWorkspacePage(page)
  await ws.goto(`${baseURL ?? ''}${path}`)
  await expect(ws.sectionOutline()).toBeVisible({ timeout: 20_000 })
  await ws.crepeProseMirror().click()
  await page.keyboard.type('/')
  const appendBtn = page.getByText('Copilot: append', { exact: true })
  await expect(appendBtn).toBeVisible({ timeout: 15_000 })
  await appendBtn.click()
  const ta = ws.copilotComposerTextarea()
  await expect(ta).toHaveValue('/append ')
})
