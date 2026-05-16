/**
 * Runs once before all E2E workers. Polls until the Vite app responds so cold Docker
 * backends do not fail the first tests with immediate 502/timeouts.
 *
 * Seeding: set PLAYWRIGHT_TOOL_ADMIN_* / PLAYWRIGHT_NON_ADMIN_* (e.g. via
 * `manage.py create-admin` + second user register) before running tests. This file
 * does not run Docker commands.
 */
import type { FullConfig } from '@playwright/test'

const DEFAULT_ORIGIN = 'http://127.0.0.1:5173'
const MAX_ATTEMPTS = 90
const INTERVAL_MS = 2000

async function waitForOrigin(origin: string): Promise<void> {
  const url = `${origin.replace(/\/$/, '')}/`
  for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
    try {
      const res = await fetch(url, { redirect: 'follow' })
      if (res.ok) {
        return
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS))
  }
  throw new Error(
    `E2E global-setup: ${url} did not return OK within ${(MAX_ATTEMPTS * INTERVAL_MS) / 1000}s. ` +
      'Start the stack (e.g. docker compose up -d) and ensure Vite is listening.',
  )
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const origin = process.env.PLAYWRIGHT_BASE_URL?.trim() || DEFAULT_ORIGIN
  await waitForOrigin(origin)
}
