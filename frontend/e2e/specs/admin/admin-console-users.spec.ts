import crypto from 'node:crypto'

import { expect, test } from '../../fixtures/auth.fixture'
import { AdminConsolePage } from '../../pages/admin/AdminConsolePage'
import { AdminUsersPage } from '../../pages/admin/AdminUsersPage'

test.describe('Admin console — users', () => {
  test('platform admin sees directory, filters, and search', async ({ toolAdminPage }) => {
    const console_ = new AdminConsolePage(toolAdminPage)
    const users = new AdminUsersPage(toolAdminPage)
    await console_.goto('users')
    await users.expectHeadingVisible()
    await users.expectLoadingUsersHidden()
    await users.expectDirectoryHeadingVisible()

    await users.filterTab('platform')
    await users.expectPlatformAdminsFilterButtonVisible()

    await users.filterTab('members')
    await users.filterTab('all')

    await users.searchUsers('example.com')
    await users.expectDirectoryContainsEmailPattern(/example\.com/i)
  })

  test('Add to studio flow closes on stubbed membership POST', async ({ toolAdminPage }) => {
    const email = `e2e-add-studio-${crypto.randomUUID()}@example.com`
    let captured: Record<string, unknown> | null = null
    let postUrl = ''
    await toolAdminPage.route('**/studios/*/members', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue()
        return
      }
      postUrl = route.request().url()
      try {
        captured = JSON.parse(route.request().postData() || '{}') as Record<string, unknown>
      } catch {
        captured = null
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user_id: '00000000-0000-4000-8000-00000000e2e1',
          email,
          display_name: 'E2E Stub Member',
          role: 'studio_member',
          joined_at: new Date().toISOString(),
        }),
      })
    })
    try {
      const console_ = new AdminConsolePage(toolAdminPage)
      const users = new AdminUsersPage(toolAdminPage)
      await console_.goto('users')
      await users.expectHeadingVisible()
      await users.expectLoadingUsersHidden()
      await users.openCreateUserDialog()
      await users.fillCreateUserForm({
        email,
        password: 'E2eSecurePass9!',
        displayName: 'E2E Add Studio User',
      })
      await users.submitCreateUserAccount()
      await users.searchUsers(email)
      await users.expectUserEmailVisibleInDirectory(email)

      await users.openAddToStudioDialog()
      await users.selectFirstStudioInGrantDialog()
      await users.pickUserInGrantDialogList(email)
      await users.selectRoleInGrantDialog('studio_member')
      await users.submitGrantStudioAccess()
      await users.expectGrantStudioDialogHidden()
      expect(captured).not.toBeNull()
      expect(captured).toMatchObject({
        email: email.toLowerCase(),
        role: 'studio_member',
      })
      expect(postUrl).toMatch(/\/studios\/[^/]+\/members$/)
    } finally {
      await toolAdminPage.unroute('**/studios/*/members')
    }
  })

  test('grants then revokes platform admin on disposable user', async ({ toolAdminPage }) => {
    const console_ = new AdminConsolePage(toolAdminPage)
    const users = new AdminUsersPage(toolAdminPage)
    const email = `e2e-plat-${crypto.randomUUID()}@example.com`
    await console_.goto('users')
    await users.expectHeadingVisible()
    await users.expectLoadingUsersHidden()
    await users.openCreateUserDialog()
    await users.fillCreateUserForm({
      email,
      password: 'E2eSecurePass9!',
      displayName: 'E2E Platform Toggle',
    })
    await users.submitCreateUserAccount()
    await users.searchUsers(email)
    await users.expectUserEmailVisibleInDirectory(email)

    await users.clickGrantPlatformAdminForUser(email)
    await users.expectUserRowShowsPlatformAdminPill(email)

    await users.clickRemovePlatformAdminForUser(email)
    await users.expectUserRowShowsGrantPlatformAdmin(email)
  })

  test('Create user: submit disabled until password length and required fields', async ({
    toolAdminPage,
  }) => {
    const console_ = new AdminConsolePage(toolAdminPage)
    const users = new AdminUsersPage(toolAdminPage)
    await console_.goto('users')
    await users.expectHeadingVisible()
    await users.expectLoadingUsersHidden()
    await users.openCreateUserDialog()
    await users.fillCreateUserRequiredExceptPassword({
      email: `e2e-val-${crypto.randomUUID()}@example.com`,
      displayName: 'Validation User',
    })
    await users.fillCreateUserPasswordOnly('short')
    await users.expectCreateAccountButtonDisabled()
    await users.fillCreateUserPasswordOnly('E2eLong8')
    await users.expectCreateAccountButtonEnabled()
  })

  test('Create user dialog shows API error when POST /admin/users returns 422', async ({
    toolAdminPage,
  }) => {
    await toolAdminPage.route('**/admin/users', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue()
        return
      }
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'E2E stub: invalid payload' }),
      })
    })
    try {
      const console_ = new AdminConsolePage(toolAdminPage)
      const users = new AdminUsersPage(toolAdminPage)
      await console_.goto('users')
      await users.expectHeadingVisible()
      await users.expectLoadingUsersHidden()
      await users.openCreateUserDialog()
      await users.fillCreateUserForm({
        email: `e2e-422-${crypto.randomUUID()}@example.com`,
        password: 'E2eSecurePass9!',
        displayName: 'E2E 422 User',
      })
      await users.clickCreateAccountButton()
      await users.expectCreateUserDialogStillOpen()
      await users.expectCreateUserDialogErrorContains('E2E stub: invalid payload')
    } finally {
      await toolAdminPage.unroute('**/admin/users')
    }
  })

  test('creates a user via dialog', async ({ toolAdminPage }) => {
    const console_ = new AdminConsolePage(toolAdminPage)
    const users = new AdminUsersPage(toolAdminPage)
    const email = `e2e-create-${crypto.randomUUID()}@example.com`
    await console_.goto('users')
    await users.expectHeadingVisible()
    await users.expectLoadingUsersHidden()
    await users.openCreateUserDialog()
    await users.fillCreateUserForm({
      email,
      password: 'E2eSecurePass9!',
      displayName: 'E2E Created User',
    })
    await users.submitCreateUserAccount()
    await users.searchUsers(email)
    await users.expectUserEmailVisibleInDirectory(email)
    // No platform-admin DELETE /admin/users in API — user remains for shared DBs; email is unique per run.
  })

  test('non-admin is denied', async ({ nonAdminPage }) => {
    const console_ = new AdminConsolePage(nonAdminPage)
    await console_.goto('users')
    await console_.expectAccessDenied()
  })

  test('Remove user from studio (not offered in UsersSection UI)', async () => {
    test.skip(
      true,
      'UsersSection directory has no per-row remove-from-studio action; memberships are managed via Add to studio only.',
    )
  })

  test('Change studio role from directory row (not offered in UI)', async () => {
    test.skip(
      true,
      'UsersSection shows studio roles read-only per user; no in-row role editor beyond Add to studio.',
    )
  })

  test('Directory pagination / load more', async () => {
    test.skip(
      true,
      'UsersSection loads a single page (limit 500) with no load-more or pagination controls.',
    )
  })
})
