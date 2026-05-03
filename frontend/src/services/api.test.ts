import { describe, expect, it } from 'vitest'

import { throwIfNotOk } from './api'

describe('throwIfNotOk', () => {
  it('does not throw when response is ok', async () => {
    const r = new Response('ignored', { status: 200 })
    await expect(throwIfNotOk(r)).resolves.toBeUndefined()
  })

  it('throws parsed JSON AuthErrorBody', async () => {
    const r = new Response(JSON.stringify({ detail: 'bad', code: 'FORBIDDEN' }), {
      status: 403,
      statusText: 'Forbidden',
    })
    await expect(throwIfNotOk(r)).rejects.toEqual({
      detail: 'bad',
      code: 'FORBIDDEN',
    })
  })

  it('throws plain-text detail when body is not JSON', async () => {
    const r = new Response('plain error', {
      status: 500,
      statusText: 'Server Error',
    })
    await expect(throwIfNotOk(r)).rejects.toEqual({
      detail: 'plain error',
      code: 'HTTP_ERROR',
    })
  })

  it('uses statusText when error body is empty', async () => {
    const r = new Response('', {
      status: 502,
      statusText: 'Bad Gateway',
    })
    await expect(throwIfNotOk(r)).rejects.toEqual({
      detail: 'Bad Gateway',
      code: 'HTTP_ERROR',
    })
  })
})
