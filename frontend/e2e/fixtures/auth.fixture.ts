import crypto from 'node:crypto'

import { test as base, expect, request as launchApiRequest } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'

type MeJson = {
  user: { id: string; email: string; display_name: string; is_platform_admin: boolean }
}

/** POST /admin/studios response shape (subset). */
type AdminStudioCreateResponse = {
  id: string
}

async function readMe(api: APIRequestContext): Promise<MeJson> {
  const r = await api.get('/auth/me')
  if (!r.ok()) {
    throw new Error(`/auth/me failed: ${r.status()} ${await r.text()}`)
  }
  return (await r.json()) as MeJson
}

type AuthTestFixtures = {
  toolAdminPage: Page
  nonAdminPage: Page
}

/** One login (or register) per worker — avoids `/auth/login` rate limits across many admin tests. */
type AuthWorkerFixtures = {
  _toolAdminStorageState: Awaited<ReturnType<APIRequestContext['storageState']>>
  _nonAdminStorageState: Awaited<ReturnType<APIRequestContext['storageState']>>
}

export const test = base.extend<AuthTestFixtures, AuthWorkerFixtures>({
  _toolAdminStorageState: [
    async ({}, use) => {
      const origin = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173'
      const api = await launchApiRequest.newContext({ baseURL: origin })
      try {
        const adminEmail = process.env.PLAYWRIGHT_TOOL_ADMIN_EMAIL?.trim()
        const adminPassword = process.env.PLAYWRIGHT_TOOL_ADMIN_PASSWORD ?? ''

        if (adminEmail && adminPassword) {
          const login = await api.post('/auth/login', {
            data: { email: adminEmail, password: adminPassword },
          })
          if (!login.ok()) {
            throw new Error(
              `Platform admin login failed (${login.status()}). Check PLAYWRIGHT_TOOL_ADMIN_EMAIL / PLAYWRIGHT_TOOL_ADMIN_PASSWORD.`,
            )
          }
          const me = await readMe(api)
          if (!me.user.is_platform_admin) {
            throw new Error(
              `User ${adminEmail} is not a platform admin (is_platform_admin=false). Grant platform admin or use a different account.`,
            )
          }
        } else {
          const sfx = crypto.randomUUID()
          const email = `e2e-tool-${sfx}@example.com`
          const password = 'E2eSecurePass9!'
          const reg = await api.post('/auth/register', {
            data: { email, password, display_name: 'E2E Tool Candidate' },
          })
          if (!reg.ok()) {
            throw new Error(`Platform admin register failed: ${reg.status()} ${await reg.text()}`)
          }
          const me1 = await readMe(api)
          if (!me1.user.is_platform_admin) {
            throw new Error(
              'Registered user is not platform admin: set PLAYWRIGHT_TOOL_ADMIN_EMAIL and PLAYWRIGHT_TOOL_ADMIN_PASSWORD to a seeded platform-admin account, or use an isolated DB where the first registration becomes platform admin.',
            )
          }
        }

        await use(await api.storageState())
      } finally {
        await api.dispose()
      }
    },
    { scope: 'worker' },
  ],

  toolAdminPage: async ({ browser, baseURL, _toolAdminStorageState }, use) => {
    const origin = baseURL ?? 'http://127.0.0.1:5173'
    const storageState = _toolAdminStorageState

    // One studio per test so budgets (per-studio cap table) has a row; tear down so shared DBs do not accumulate junk.
    let seededStudioId: string | null = null
    const apiSeed = await launchApiRequest.newContext({ baseURL: origin, storageState })
    try {
      const studioName = `E2E Admin ${crypto.randomUUID().slice(0, 8)}`
      const cr = await apiSeed.post('/admin/studios', {
        data: { name: studioName, description: 'Playwright admin console seed' },
      })
      if (!cr.ok()) {
        throw new Error(`Could not seed studio for platform admin: ${cr.status()} ${await cr.text()}`)
      }
      const created = (await cr.json()) as AdminStudioCreateResponse
      if (!created.id) {
        throw new Error('Seed studio response missing id')
      }
      seededStudioId = created.id
    } finally {
      await apiSeed.dispose()
    }

    const ctx = await browser.newContext({ storageState })
    const page = await ctx.newPage()
    try {
      await use(page)
    } finally {
      if (seededStudioId !== null) {
        const cleanupApi = await launchApiRequest.newContext({ baseURL: origin, storageState })
        try {
          const del = await cleanupApi.delete(`/admin/studios/${seededStudioId}`)
          if (!del.ok() && del.status() !== 404) {
            throw new Error(
              `E2E fixture teardown: DELETE /admin/studios/${seededStudioId} failed: ${del.status()} ${await del.text()}`,
            )
          }
        } finally {
          await cleanupApi.dispose()
        }
      }
      await ctx.close()
    }
  },

  _nonAdminStorageState: [
    async ({}, use) => {
      const origin = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173'
      const api = await launchApiRequest.newContext({ baseURL: origin })
      try {
        const naEmail = process.env.PLAYWRIGHT_NON_ADMIN_EMAIL?.trim()
        const naPassword = process.env.PLAYWRIGHT_NON_ADMIN_PASSWORD ?? ''

        if (naEmail && naPassword) {
          const login = await api.post('/auth/login', {
            data: { email: naEmail, password: naPassword },
          })
          if (!login.ok()) {
            throw new Error(
              `Non-admin login failed (${login.status()}). Check PLAYWRIGHT_NON_ADMIN_EMAIL / PLAYWRIGHT_NON_ADMIN_PASSWORD.`,
            )
          }
          const me = await readMe(api)
          if (me.user.is_platform_admin) {
            throw new Error(
              `User ${naEmail} is a platform admin (is_platform_admin=true). Use a non-admin account or omit credentials to bootstrap.`,
            )
          }
        } else {
          const sfx = crypto.randomUUID()
          const pass = 'E2eSecurePass9!'
          const emailA = `e2e-na-a-${sfx}@example.com`
          const emailB = `e2e-na-b-${sfx}@example.com`
          const regA = await api.post('/auth/register', {
            data: { email: emailA, password: pass, display_name: 'E2E Bootstrap' },
          })
          if (!regA.ok()) {
            throw new Error(`nonAdmin bootstrap register failed: ${regA.status()} ${await regA.text()}`)
          }
          const regB = await api.post('/auth/register', {
            data: { email: emailB, password: pass, display_name: 'E2E Member' },
          })
          if (!regB.ok()) {
            throw new Error(`nonAdmin register failed: ${regB.status()} ${await regB.text()}`)
          }
          const login = await api.post('/auth/login', {
            data: { email: emailB, password: pass },
          })
          if (!login.ok()) {
            throw new Error(`nonAdmin login failed: ${login.status()} ${await login.text()}`)
          }
          const me = await readMe(api)
          if (me.user.is_platform_admin) {
            throw new Error(
              'Registered user is platform admin: set PLAYWRIGHT_NON_ADMIN_EMAIL and PLAYWRIGHT_NON_ADMIN_PASSWORD to a seeded non-admin account, or use an isolated DB where the second registration is not platform admin.',
            )
          }
        }

        const storageState = await api.storageState()
        await use(storageState)
      } finally {
        await api.dispose()
      }
    },
    { scope: 'worker' },
  ],

  nonAdminPage: async ({ browser, _nonAdminStorageState }, use) => {
    const ctx = await browser.newContext({ storageState: _nonAdminStorageState })
    const page = await ctx.newPage()
    try {
      await use(page)
    } finally {
      await ctx.close()
    }
  },
})

export { expect }
