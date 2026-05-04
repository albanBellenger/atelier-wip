import '@testing-library/jest-dom/vitest'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll } from 'vitest'

/** Empty handler list — each test file installs handlers via `server.use(...)`. */
export const mswServer = setupServer()

beforeAll(() =>
  mswServer.listen({
    // Many integration-style component tests call real `fetch` via React Query without MSW
    // handlers; strict `error` breaks those runs. Service-layer tests register handlers for
    // `http://api.test` via `vi.stubEnv` + `server.use(...)`.
    onUnhandledRequest: 'warn',
  }),
)

afterEach(() => {
  mswServer.resetHandlers()
})

afterAll(() => {
  mswServer.close()
})

function captureScrollIntoView(): PropertyDescriptor {
  const existing = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'scrollIntoView',
  )
  if (existing) return existing
  const noop = function noopScrollIntoView(this: HTMLElement): void {
    void this
  }
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value: noop,
  })
  return Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'scrollIntoView',
  ) as PropertyDescriptor
}

const scrollIntoViewDesc = captureScrollIntoView()

// Thread/copilot tests assign HTMLElement.prototype.scrollIntoView mocks; restore so
// other suites (RTL, layout) are not affected when Vitest runs files sequentially.
afterEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollIntoViewDesc)
})
