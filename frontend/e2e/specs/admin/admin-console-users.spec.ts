import { test } from '../../fixtures/auth.fixture'
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
    await users.expectDirectoryContainsEmailPattern(/@/)
  })

  test('non-admin is denied', async ({ nonAdminPage }) => {
    const console_ = new AdminConsolePage(nonAdminPage)
    await console_.goto('users')
    await console_.expectAccessDenied()
  })
})
