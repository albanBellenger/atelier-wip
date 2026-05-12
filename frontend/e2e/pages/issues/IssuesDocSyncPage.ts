import type { Page } from '@playwright/test'
import { request } from '@playwright/test'

/** Doc sync E2E helpers. */
export class IssuesDocSyncPage {
  constructor(private readonly page: Page) {}

  async gotoIssues(
    studioId: string,
    softwareId: string,
    projectId: string,
  ): Promise<void> {
    await this.page.goto(
      `/studios/${studioId}/software/${softwareId}/projects/${projectId}/issues`,
    )
  }

  async seedStudioSoftwareProject(): Promise<{
    studioId: string
    softwareId: string
    projectId: string
  }> {
    const base = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173'
    const storage = await this.page.context().storageState()
    const api = await request.newContext({ baseURL: base, storageState: storage })
    try {
      const cr = await api.post('/admin/studios', {
        data: { name: `E2E DS ${Date.now()}`, description: 'x' },
      })
      if (!cr.ok()) {
        throw new Error(`seed studio: ${cr.status()} ${await cr.text()}`)
      }
      const studioId = (await cr.json()) as { id: string }
      const sw = await api.post(`/studios/${studioId.id}/software`, {
        data: { name: 'E2E SW DS', description: '' },
      })
      if (!sw.ok()) {
        throw new Error(`seed software: ${sw.status()} ${await sw.text()}`)
      }
      const softwareId = (await sw.json()) as { id: string }
      const pr = await api.post(`/software/${softwareId.id}/projects`, {
        data: { name: 'E2E Proj DS', description: '' },
      })
      if (!pr.ok()) {
        throw new Error(`seed project: ${pr.status()} ${await pr.text()}`)
      }
      const projectId = (await pr.json()) as { id: string }
      return {
        studioId: studioId.id,
        softwareId: softwareId.id,
        projectId: projectId.id,
      }
    } finally {
      await api.dispose()
    }
  }
}
