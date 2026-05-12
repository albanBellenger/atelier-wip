import type { Page } from '@playwright/test'
import { request } from '@playwright/test'

/** Page object: Software tab=docs + backprop outline flow (network stubbed where noted). */
export class SoftwareDocsBackpropPage {
  constructor(private readonly page: Page) {}

  async gotoDocsTab(studioId: string, softwareId: string): Promise<void> {
    await this.page.goto(`/studios/${studioId}/software/${softwareId}?tab=docs`)
  }

  /** Stubs ready snapshot + propose-outline (five sections). Leaves real GET/POST /software/{id}/docs to the API. */
  async stubReadySnapshotProposeOutlineFiveSections(): Promise<void> {
    await this.page.route('**/codebase/snapshots', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: '00000000-0000-4000-8000-000000000001',
            software_id: 'stub',
            commit_sha: 'a'.repeat(40),
            branch: 'main',
            status: 'ready',
            error_message: null,
            created_at: new Date().toISOString(),
            ready_at: new Date().toISOString(),
            file_count: 1,
            chunk_count: 1,
          },
        ]),
      })
    })
    await this.page.route('**/docs/propose-outline', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sections: [
            { title: 'E2E Alpha', slug: 'e2e-alpha', summary: 'S1' },
            { title: 'E2E Beta', slug: 'e2e-beta', summary: 'S2' },
            { title: 'E2E Gamma', slug: 'e2e-gamma', summary: 'S3' },
            { title: 'E2E Delta', slug: 'e2e-delta', summary: 'S4' },
            { title: 'E2E Epsilon', slug: 'e2e-epsilon', summary: 'S5' },
          ],
        }),
      })
    })
  }

  async seedStudioAndSoftware(): Promise<{ studioId: string; softwareId: string }> {
    const base = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173'
    const storage = await this.page.context().storageState()
    const api = await request.newContext({ baseURL: base, storageState: storage })
    try {
      const cr = await api.post('/admin/studios', {
        data: { name: `E2E BP ${Date.now()}`, description: 'seed' },
      })
      if (!cr.ok()) {
        throw new Error(`seed studio failed: ${cr.status()} ${await cr.text()}`)
      }
      const studioId = (await cr.json()) as { id: string }
      const sw = await api.post(`/studios/${studioId.id}/software`, {
        data: { name: 'E2E SW', description: '' },
      })
      if (!sw.ok()) {
        throw new Error(`seed software failed: ${sw.status()} ${await sw.text()}`)
      }
      const softwareId = (await sw.json()) as { id: string }
      return { studioId: studioId.id, softwareId: softwareId.id }
    } finally {
      await api.dispose()
    }
  }

  async inviteStudioMemberByEmail(
    studioId: string,
    adminPage: Page,
    memberEmail: string,
  ): Promise<void> {
    const base = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173'
    const storage = await adminPage.context().storageState()
    const api = await request.newContext({ baseURL: base, storageState: storage })
    try {
      const r = await api.post(`/studios/${studioId}/members`, {
        data: { email: memberEmail, role: 'studio_member' },
      })
      if (!r.ok()) {
        throw new Error(`invite member failed: ${r.status()} ${await r.text()}`)
      }
    } finally {
      await api.dispose()
    }
  }

  async getLoggedInUserEmail(page: Page): Promise<string> {
    const base = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173'
    const storage = await page.context().storageState()
    const api = await request.newContext({ baseURL: base, storageState: storage })
    try {
      const r = await api.get('/auth/me')
      if (!r.ok()) {
        throw new Error(`/auth/me failed: ${r.status()} ${await r.text()}`)
      }
      const body = (await r.json()) as { user: { email: string } }
      return body.user.email
    } finally {
      await api.dispose()
    }
  }

  async stubCodebaseSnapshotsAndProposeDraft(): Promise<void> {
    await SoftwareDocsBackpropPage.stubCodebaseSnapshotsAndProposeDraftOnPage(this.page)
  }

  static async stubCodebaseSnapshotsAndProposeDraftOnPage(page: Page): Promise<void> {
    await page.route('**/codebase/snapshots', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: '00000000-0000-4000-8000-000000000002',
            software_id: 'stub',
            commit_sha: 'a'.repeat(40),
            branch: 'main',
            status: 'ready',
            error_message: null,
            created_at: new Date().toISOString(),
            ready_at: new Date().toISOString(),
            file_count: 1,
            chunk_count: 1,
          },
        ]),
      })
    })
    await page.route('**/propose-draft', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          markdown: '## E2E Draft\nStubbed section body.',
          source_files: ['src/e2e_doc.py'],
        }),
      })
    })
  }

  async gotoDocEditor(
    studioId: string,
    softwareId: string,
    sectionId: string,
  ): Promise<void> {
    await this.page.goto(
      `/studios/${studioId}/software/${softwareId}/docs/${sectionId}`,
    )
  }

  draftOutlineButton(): ReturnType<Page['locator']> {
    return this.page.getByRole('button', { name: /draft outline from codebase/i })
  }

  draftFromCodebaseButton(): ReturnType<Page['locator']> {
    return this.page.getByRole('button', { name: /draft from codebase/i })
  }

  /** Accept proposed sections in returned order (indices refer to checklist order). */
  async acceptProposedSectionsAtIndices(indices: number[]): Promise<void> {
    const ordered = [...indices].sort((a, b) => a - b)
    for (const i of ordered) {
      await this.page.getByRole('checkbox').nth(i).check()
    }
    await this.page.getByRole('button', { name: /accept selected/i }).click()
  }
}
