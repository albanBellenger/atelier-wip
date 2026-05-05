import { test, expect } from '../../fixtures/auth.fixture'
import type { AdminConsoleSection } from '../../../src/lib/adminConsoleNav'
import { AdminConsolePage } from '../../pages/admin/AdminConsolePage'

const SECTIONS: AdminConsoleSection[] = [
  'overview',
  'studios',
  'llm',
  'budgets',
  'embeddings',
  'users',
]

test.describe('Admin console — access control', () => {
  for (const section of SECTIONS) {
    test(`non-admin is denied on ${section}`, async ({ nonAdminPage }) => {
      const console_ = new AdminConsolePage(nonAdminPage)
      await console_.goto(section)
      await console_.expectAccessDenied()
      await expect(console_.sideNavLink('overview')).toHaveCount(0)
    })
  }
})
