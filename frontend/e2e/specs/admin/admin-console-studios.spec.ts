import crypto from 'node:crypto'

import { request, type BrowserContext } from '@playwright/test'

import { expect, test } from '../../fixtures/auth.fixture'
import { AdminConsolePage } from '../../pages/admin/AdminConsolePage'
import { AdminLlmPage } from '../../pages/admin/AdminLlmPage'
import { AdminStudiosPage } from '../../pages/admin/AdminStudiosPage'

async function deleteStudioWithAdminSession(
  origin: string,
  storageState: Awaited<ReturnType<BrowserContext['storageState']>>,
  studioId: string,
): Promise<void> {
  const api = await request.newContext({ baseURL: origin, storageState })
  try {
    const del = await api.delete(`/admin/studios/${studioId}`)
    if (!del.ok() && del.status() !== 404) {
      throw new Error(`DELETE /admin/studios/${studioId} failed: ${del.status()} ${await del.text()}`)
    }
  } finally {
    await api.dispose()
  }
}

test.describe('Admin console — studios', () => {
  test('platform admin sees studios section', async ({ toolAdminPage }) => {
    const console_ = new AdminConsolePage(toolAdminPage)
    const studios = new AdminStudiosPage(toolAdminPage)
    await console_.goto('studios')
    await studios.expectHeadingVisible()
    await studios.expectAtLeastOneStudioCardOrEmptyState()
  })

  test('creates a studio via New studio dialog and tears down via API', async ({ toolAdminPage }) => {
    const origin = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173'
    const console_ = new AdminConsolePage(toolAdminPage)
    const studios = new AdminStudiosPage(toolAdminPage)
    const uniqueName = `E2E Studio ${crypto.randomUUID().slice(0, 8)}`
    let createdId: string | null = null
    try {
      await console_.goto('studios')
      await studios.expectHeadingVisible()
      await studios.openNewStudioDialog()
      await studios.fillNewStudioForm(uniqueName)
      await studios.submitNewStudioDialog()
      await studios.expectStudioListed(uniqueName)
      createdId = await studios.readStudioIdFromDetail(uniqueName)

      const sidebarNames = await studios.listSidebarStudioNames()
      if (sidebarNames.length >= 2) {
        const other = sidebarNames.find((n) => n !== uniqueName)
        if (other) {
          await studios.selectStudioFromSidebar(other)
          await expect(toolAdminPage.getByRole('heading', { name: other, exact: true })).toBeVisible()
          await studios.selectStudioFromSidebar(uniqueName)
          await expect(toolAdminPage.getByRole('heading', { name: uniqueName, exact: true })).toBeVisible()
        }
      }
    } finally {
      if (createdId) {
        await deleteStudioWithAdminSession(origin, await toolAdminPage.context().storageState(), createdId)
      }
    }
  })

  test('deletes E2E-created studio via UI confirm', async ({ toolAdminPage }) => {
    const origin = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173'
    const console_ = new AdminConsolePage(toolAdminPage)
    const studios = new AdminStudiosPage(toolAdminPage)
    const uniqueName = `E2E Delete ${crypto.randomUUID().slice(0, 8)}`
    let createdId: string | null = null
    try {
      await console_.goto('studios')
      await studios.expectHeadingVisible()
      await studios.openNewStudioDialog()
      await studios.fillNewStudioForm(uniqueName)
      await studios.submitNewStudioDialog()
      await studios.expectStudioListed(uniqueName)
      createdId = await studios.readStudioIdFromDetail(uniqueName)

      await studios.acceptConfirmAndDeleteSelectedStudio()
      await studios.expectStudioNotListed(uniqueName)
      createdId = null
    } finally {
      if (createdId) {
        await deleteStudioWithAdminSession(origin, await toolAdminPage.context().storageState(), createdId)
      }
    }
  })

  test('second studio create shows error when POST /admin/studios is stubbed to fail', async ({
    toolAdminPage,
  }) => {
    let postN = 0
    await toolAdminPage.route('**/admin/studios', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue()
        return
      }
      postN += 1
      if (postN === 1) {
        await route.continue()
        return
      }
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'E2E stub: duplicate studio name' }),
      })
    })
    try {
      const console_ = new AdminConsolePage(toolAdminPage)
      const studios = new AdminStudiosPage(toolAdminPage)
      const uniqueName = `E2E StudioErr ${crypto.randomUUID().slice(0, 8)}`
      const origin = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173'
      let createdId: string | null = null
      try {
        await console_.goto('studios')
        await studios.expectHeadingVisible()
        await studios.openNewStudioDialog()
        await studios.fillNewStudioForm(uniqueName)
        await studios.submitNewStudioDialog()
        await studios.expectStudioListed(uniqueName)
        createdId = await studios.readStudioIdFromDetail(uniqueName)

        await studios.openNewStudioDialog()
        await studios.fillNewStudioForm(`${uniqueName}-second`)
        await studios.clickNewStudioCreateExpectingError()
        await studios.expectNewStudioDialogErrorContains('E2E stub: duplicate studio name')
        await studios.cancelNewStudioDialog()
      } finally {
        if (createdId) {
          await deleteStudioWithAdminSession(origin, await toolAdminPage.context().storageState(), createdId)
        }
      }
    } finally {
      await toolAdminPage.unroute('**/admin/studios')
    }
  })

  test('GitLab connectivity card shows stubbed repo labels when GET studio detail is stubbed', async ({
    toolAdminPage,
  }) => {
    const console_ = new AdminConsolePage(toolAdminPage)
    const studios = new AdminStudiosPage(toolAdminPage)
    await studios.beginStubAdminStudioDetailWithGitlab()
    try {
      await console_.goto('studios')
      await studios.expectHeadingVisible()
      await studios.expectGitLabCardShowsRepoAndBranch()
    } finally {
      await studios.endStubAdminStudioDetail()
    }
  })

  test('Allowed providers toggle issues PUT when deployment + policy are stubbed', async ({
    toolAdminPage,
  }) => {
    const console_ = new AdminConsolePage(toolAdminPage)
    const studios = new AdminStudiosPage(toolAdminPage)
    const llm = new AdminLlmPage(toolAdminPage)
    const providerId = `e2estudios${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`
    const modelId = 'stub-model-studio'
    await llm.beginStubPerStudioLlmPolicy({ providerId, modelId })
    try {
      await console_.goto('studios')
      await studios.expectHeadingVisible()
      await studios.expectAllowedProvidersToggleFor(providerId)
      await studios.expectAllowedProviderSwitchAriaChecked(providerId, 'true')
      await studios.toggleAllowedProviderSwitch(providerId)
      await studios.expectAllowedProviderSwitchAriaChecked(providerId, 'false')
    } finally {
      await llm.endStubPerStudioLlmPolicyRoutes()
    }
  })

  test('non-admin is denied', async ({ nonAdminPage }) => {
    const console_ = new AdminConsolePage(nonAdminPage)
    await console_.goto('studios')
    await console_.expectAccessDenied()
  })
})
