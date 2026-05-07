import crypto from 'node:crypto'

import { test as base, expect, request as launchApiRequest } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'

type MeJson = {
  user: { id: string; email: string; display_name: string; is_platform_admin: boolean }
}

async function readMe(api: APIRequestContext): Promise<MeJson> {
  const r = await api.get('/auth/me')
  if (!r.ok()) {
    throw new Error(`/auth/me failed: ${r.status()} ${await r.text()}`)
  }
  return (await r.json()) as MeJson
}

export const test = base.extend<{ toolAdminPage: Page; nonAdminPage: Page }>({
  toolAdminPage: async ({ browser, baseURL, request }, use) => {
    const origin = baseURL ?? 'http://127.0.0.1:5173'
    let storageState: Awaited<ReturnType<APIRequestContext['storageState']>>

    const adminEmail = process.env.PLAYWRIGHT_TOOL_ADMIN_EMAIL?.trim()
    const adminPassword = process.env.PLAYWRIGHT_TOOL_ADMIN_PASSWORD ?? ''

    if (adminEmail && adminPassword) {
      const login = await request.post('/auth/login', {
        data: { email: adminEmail, password: adminPassword },
      })
      if (!login.ok()) {
        throw new Error(
          `Platform admin login failed (${login.status()}). Check PLAYWRIGHT_TOOL_ADMIN_EMAIL / PLAYWRIGHT_TOOL_ADMIN_PASSWORD.`,
        )
      }
      const me = await readMe(request)
      if (!me.user.is_platform_admin) {
        throw new Error(
          `User ${adminEmail} is not a platform admin (is_platform_admin=false). Grant platform admin or use a different account.`,
        )
      }
      storageState = await request.storageState()
    } else {
      const sfx = crypto.randomUUID()
      const email = `e2e-tool-${sfx}@example.com`
      const password = 'E2eSecurePass9!'
      const reg = await request.post('/auth/register', {
        data: { email, password, display_name: 'E2E Tool Candidate' },
      })
      if (!reg.ok()) {
        throw new Error(`Platform admin register failed: ${reg.status()} ${await reg.text()}`)
      }
      const me1 = await readMe(request)
      if (!me1.user.is_platform_admin) {
        throw new Error(
          'Registered user is not platform admin: set PLAYWRIGHT_TOOL_ADMIN_EMAIL and PLAYWRIGHT_TOOL_ADMIN_PASSWORD to a seeded platform-admin account, or use an isolated DB where the first registration becomes platform admin.',
        )
      }
      storageState = await request.storageState()
    }

    const apiSeed = await launchApiRequest.newContext({ baseURL: origin, storageState })
    const studioName = `E2E Admin ${crypto.randomUUID().slice(0, 8)}`
    const cr = await apiSeed.post('/studios', {
      data: { name: studioName, description: 'Playwright admin console seed' },
    })
    if (!cr.ok()) {
      await apiSeed.dispose()
      throw new Error(`Could not seed studio for platform admin: ${cr.status()} ${await cr.text()}`)
    }
    await apiSeed.dispose()

    const ctx = await browser.newContext({ storageState })
    const page = await ctx.newPage()
    try {
      await use(page)
    } finally {
      await ctx.close()
    }
  },

  nonAdminPage: async ({ browser, request }, use) => {
    const sfx = crypto.randomUUID()
    const pass = 'E2eSecurePass9!'
    const emailA = `e2e-na-a-${sfx}@example.com`
    const emailB = `e2e-na-b-${sfx}@example.com`
    const regA = await request.post('/auth/register', {
      data: { email: emailA, password: pass, display_name: 'E2E Bootstrap' },
    })
    if (!regA.ok()) {
      throw new Error(`nonAdmin bootstrap register failed: ${regA.status()} ${await regA.text()}`)
    }
    const regB = await request.post('/auth/register', {
      data: { email: emailB, password: pass, display_name: 'E2E Member' },
    })
    if (!regB.ok()) {
      throw new Error(`nonAdmin register failed: ${regB.status()} ${await regB.text()}`)
    }
    const login = await request.post('/auth/login', {
      data: { email: emailB, password: pass },
    })
    if (!login.ok()) {
      throw new Error(`nonAdmin login failed: ${login.status()} ${await login.text()}`)
    }
    const me = await readMe(request)
    if (me.user.is_platform_admin) {
      throw new Error('nonAdmin fixture user unexpectedly has platform admin role')
    }
    const storageState = await request.storageState()
    const ctx = await browser.newContext({ storageState })
    const page = await ctx.newPage()
    try {
      await use(page)
    } finally {
      await ctx.close()
    }
  },
})

export { expect }
