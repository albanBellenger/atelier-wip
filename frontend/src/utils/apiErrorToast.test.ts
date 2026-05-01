import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}))

vi.mock('./parseApiError', () => ({
  parseApiError: vi.fn(),
}))

import { toast } from 'sonner'

import { showApiError } from './apiErrorToast'
import { parseApiError } from './parseApiError'

describe('showApiError', () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear()
    vi.mocked(parseApiError).mockReset()
  })

  it('shows toast with title and short description', () => {
    vi.mocked(parseApiError).mockReturnValue({
      title: 'Failed',
      message: 'details',
      code: 'HTTP_ERROR',
    })
    showApiError(new Error('x'))
    expect(toast.error).toHaveBeenCalledOnce()
    expect(vi.mocked(toast.error).mock.calls[0][0]).toBe('Failed')
    expect(vi.mocked(toast.error).mock.calls[0][1]).toEqual({
      description: 'details',
    })
  })

  it('truncates long descriptions', () => {
    const long = 'a'.repeat(250)
    vi.mocked(parseApiError).mockReturnValue({
      title: 'T',
      message: long,
      code: 'HTTP_ERROR',
    })
    showApiError(new Error('x'))
    const opts = vi.mocked(toast.error).mock.calls[0][1] as {
      description: string
    }
    expect(opts.description.length).toBe(198)
    expect(opts.description.endsWith('…')).toBe(true)
  })
})
