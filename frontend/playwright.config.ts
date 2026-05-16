/**
 * Playwright E2E — runs against an already-running stack (see docs/atelier-technical-architecture.md §17.6).
 * Preconditions: backend reachable (e.g. http://127.0.0.1:8000 via Vite proxy), frontend dev server
 * at PLAYWRIGHT_BASE_URL (default http://127.0.0.1:5173). Do not add webServer here.
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  globalSetup: './e2e/global-setup.ts',
  testDir: 'e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  expect: { timeout: 10_000 },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    actionTimeout: 10_000,
    testIdAttribute: 'data-testid',
  },
})
