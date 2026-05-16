import type { Page } from '@playwright/test'

const STUDIO_CAPABILITIES_URL = /\/studios\/[^/]+\/me\/capabilities(\?|$)/

const PLATFORM_OWNER_CAPS = {
  is_platform_admin: true,
  membership_role: 'studio_admin',
  is_studio_admin: true,
  is_studio_editor: true,
  is_studio_member: true,
  is_studio_viewer: false,
  is_cross_studio_viewer: false,
  can_publish: true,
  can_edit_software_definition: true,
  can_create_project: true,
  can_manage_project_outline: true,
  cross_studio_grant: null,
}

const STUDIO_MEMBER_BUILDER_CAPS = {
  is_platform_admin: false,
  membership_role: 'studio_member',
  is_studio_admin: false,
  is_studio_editor: true,
  is_studio_member: true,
  is_studio_viewer: false,
  is_cross_studio_viewer: false,
  can_publish: true,
  can_edit_software_definition: false,
  can_create_project: true,
  can_manage_project_outline: false,
  cross_studio_grant: null,
}

/** Stub GET /studios/:id/me/capabilities so studio-scoped pages do not flap on real RBAC timing. */
export async function stubStudioCapabilitiesPlatformOwner(page: Page): Promise<void> {
  await page.unroute(STUDIO_CAPABILITIES_URL)
  await page.route(STUDIO_CAPABILITIES_URL, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
      contentType: 'application/json',
      body: JSON.stringify(PLATFORM_OWNER_CAPS),
    })
  })
}

export async function stubStudioCapabilitiesMemberBuilder(page: Page): Promise<void> {
  await page.unroute(STUDIO_CAPABILITIES_URL)
  await page.route(STUDIO_CAPABILITIES_URL, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
      contentType: 'application/json',
      body: JSON.stringify(STUDIO_MEMBER_BUILDER_CAPS),
    })
  })
}

export async function endStubStudioCapabilities(page: Page): Promise<void> {
  await page.unroute(STUDIO_CAPABILITIES_URL)
}
