import { request as pwRequest } from '@playwright/test'

import { test, expect } from '../../fixtures/auth.fixture'
import { SoftwareDocsBackpropPage } from '../../pages/software/SoftwareDocsBackpropPage'
import {
  stubStudioCapabilitiesMemberBuilder,
  stubStudioCapabilitiesPlatformOwner,
} from '../../stubs/studioCapabilitiesStub'

test.describe('Software docs — backprop (outline + section)', () => {
  test('owner accepts three of five outline sections; builder inserts drafted markdown and persists', async ({
    toolAdminPage,
    nonAdminPage,
  }) => {
    const ownerPo = new SoftwareDocsBackpropPage(toolAdminPage)
    const { studioId, softwareId } = await ownerPo.seedStudioAndSoftware()

    await stubStudioCapabilitiesPlatformOwner(toolAdminPage)

    const builderEmail = await ownerPo.getLoggedInUserEmail(nonAdminPage)
    await ownerPo.inviteStudioMemberByEmail(studioId, toolAdminPage, builderEmail)

    await ownerPo.stubReadySnapshotProposeOutlineFiveSections()
    await ownerPo.gotoDocsTab(studioId, softwareId)
    await expect(ownerPo.draftOutlineButton()).toBeVisible()
    await ownerPo.draftOutlineButton().click()
    await expect(toolAdminPage.getByRole('dialog')).toBeVisible()
    await toolAdminPage.getByRole('button', { name: /propose outline/i }).click()
    await expect(toolAdminPage.getByText('E2E Alpha')).toBeVisible()
    await expect(toolAdminPage.getByText('E2E Epsilon')).toBeVisible()

    await ownerPo.acceptProposedSectionsAtIndices([0, 2, 4])
    await expect(toolAdminPage.getByRole('link', { name: /E2E Alpha/i })).toBeVisible()
    await expect(toolAdminPage.getByRole('link', { name: /E2E Gamma/i })).toBeVisible()
    await expect(toolAdminPage.getByRole('link', { name: /E2E Epsilon/i })).toBeVisible()
    await expect(toolAdminPage.getByRole('link', { name: /E2E Beta/i })).toHaveCount(0)

    const alpha = toolAdminPage.getByRole('link', { name: /E2E Alpha/i }).first()
    const href = await alpha.getAttribute('href')
    expect(href).toMatch(/\/docs\/[0-9a-f-]{36}/i)
    const sectionId = href!.match(/\/docs\/([0-9a-f-]{36})/i)?.[1]
    expect(sectionId).toBeTruthy()

    await SoftwareDocsBackpropPage.stubCodebaseSnapshotsAndProposeDraftOnPage(nonAdminPage)
    await stubStudioCapabilitiesMemberBuilder(nonAdminPage)
    const builderPo = new SoftwareDocsBackpropPage(nonAdminPage)
    await builderPo.gotoDocEditor(studioId, softwareId, sectionId!)

    await expect(builderPo.draftFromCodebaseButton()).toBeVisible()
    await builderPo.draftFromCodebaseButton().click()
    await expect(nonAdminPage.getByRole('dialog')).toBeVisible()
    await nonAdminPage.getByRole('button', { name: /generate draft/i }).click()
    await expect(nonAdminPage.getByText('E2E Draft')).toBeVisible()
    await nonAdminPage.getByRole('button', { name: /insert into editor/i }).click()
    await expect(nonAdminPage.getByRole('dialog')).toBeHidden()

    await expect(nonAdminPage.getByText(/^Saved$/)).toBeVisible({ timeout: 30_000 })

    const base = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173'
    const storage = await nonAdminPage.context().storageState()
    const api = await pwRequest.newContext({ baseURL: base, storageState: storage })
    try {
      // Collab persists `sections.content` from debounced `markdown_snapshot` frames;
      // allow a short window for the server to commit after the editor reports Saved.
      await expect
        .poll(async () => {
          const r = await api.get(`/software/${softwareId}/docs/${sectionId}`)
          if (!r.ok()) {
            return ''
          }
          const row = (await r.json()) as { content?: string }
          return row.content ?? ''
        }, { timeout: 20_000 })
        .toContain('Stubbed section body')
    } finally {
      await api.dispose()
    }
  })
})
