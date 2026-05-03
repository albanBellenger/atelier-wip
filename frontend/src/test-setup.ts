import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

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
