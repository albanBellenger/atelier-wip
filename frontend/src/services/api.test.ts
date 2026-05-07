import { HttpResponse, http } from 'msw'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { PrivateThreadStreamMeta } from './privateThreadSse'
import { apiCoverageHandlers, invokeThinApiCoverage } from './api.test.fixtures'
import { mswServer } from '../test-setup'
import type { TokenUsageQueryParams, WorkOrderListFilters } from './api'
import * as api from './api'
import { throwIfNotOk } from './api'

describe.sequential('services/api (MSW)', () => {
  beforeAll(() => {
  vi.stubEnv('VITE_API_BASE_URL', 'http://api.test')
})

afterAll(() => {
  vi.unstubAllEnvs()
})

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

function emptyTokenUsageReport(): api.TokenUsageReport {
  return {
    rows: [],
    totals: {
      input_tokens: 0,
      output_tokens: 0,
      estimated_cost_usd: '0',
    },
  }
}

describe('request — JSON happy path', () => {
  it('parses a JSON body on 200', async () => {
    mswServer.use(
      http.get('http://api.test/auth/me', () =>
        HttpResponse.json({
          user: {
            id: 'u1',
            email: 'a@b.com',
            display_name: 'A',
            is_platform_admin: false,
          },
          studios: [],
        }),
      ),
    )
    const me = await api.me()
    expect(me.user.email).toBe('a@b.com')
  })
})

describe('request — empty 204 body', () => {
  it('returns undefined when body is empty', async () => {
    mswServer.use(
      http.delete('http://api.test/studios/s1', () =>
        new HttpResponse(null, { status: 204 }),
      ),
    )
    await expect(api.deleteStudio('s1')).resolves.toBeUndefined()
  })
})

describe('request — error paths', () => {
  it('throws AuthErrorBody from JSON error response', async () => {
    mswServer.use(
      http.get('http://api.test/auth/me', () =>
        HttpResponse.json({ detail: 'No', code: 'FORBIDDEN' }, { status: 403 }),
      ),
    )
    await expect(api.me()).rejects.toEqual({ detail: 'No', code: 'FORBIDDEN' })
  })

  it('throws HTTP_ERROR from plain-text error response', async () => {
    mswServer.use(
      http.get('http://api.test/auth/me', () =>
        new HttpResponse('upstream exploded', {
          status: 502,
          statusText: 'Bad Gateway',
        }),
      ),
    )
    await expect(api.me()).rejects.toMatchObject({
      detail: 'upstream exploded',
      code: 'HTTP_ERROR',
    })
  })

  it('uses statusText when error response body is empty', async () => {
    mswServer.use(
      http.get('http://api.test/auth/me', () =>
        new HttpResponse('', { status: 503, statusText: 'Service Unavailable' }),
      ),
    )
    await expect(api.me()).rejects.toMatchObject({
      detail: 'Service Unavailable',
      code: 'HTTP_ERROR',
    })
  })
})

describe('request — shape', () => {
  it('sends JSON body with Content-Type and credentials: include', async () => {
    let captured: Request | null = null
    mswServer.use(
      http.post('http://api.test/studios', async ({ request }) => {
        captured = request.clone()
        return HttpResponse.json({
          id: 's1',
          name: 'X',
          description: null,
          logo_path: null,
          created_at: '',
        })
      }),
    )
    await api.createStudio({ name: 'X' })
    expect(captured).not.toBeNull()
    expect(captured!.method).toBe('POST')
    expect(captured!.headers.get('Content-Type')).toBe('application/json')
    expect(captured!.credentials).toBe('include')
    await expect(captured!.json()).resolves.toEqual({ name: 'X' })
  })

  it('sends PATCH with JSON body', async () => {
    let captured: Request | null = null
    mswServer.use(
      http.patch('http://api.test/auth/me', async ({ request }) => {
        captured = request.clone()
        return HttpResponse.json({
          user: {
            id: 'u1',
            email: 'a@b.com',
            display_name: 'New',
            is_platform_admin: false,
          },
          studios: [],
        })
      }),
    )
    await api.patchMeProfile({ display_name: 'New' })
    expect(captured).not.toBeNull()
    expect(captured!.method).toBe('PATCH')
    await expect(captured!.json()).resolves.toEqual({ display_name: 'New' })
  })
})

describe('listWorkOrders query string', () => {
  it.each([
    [{ status: 'backlog' }, 'status=backlog'],
    [{ assignee_id: 'u1' }, 'assignee_id=u1'],
    [{ phase: 'design' }, 'phase=design'],
    [{ is_stale: true }, 'is_stale=true'],
    [{ is_stale: false }, 'is_stale=false'],
    [{ section_id: 'sec1' }, 'section_id=sec1'],
  ] as const)(
    'forwards filter %p as %s',
    async (filter: WorkOrderListFilters, expected: string) => {
      let url = ''
      mswServer.use(
        http.get('http://api.test/projects/p1/work-orders', ({ request }) => {
          url = request.url
          return HttpResponse.json([])
        }),
      )
      await api.listWorkOrders('p1', filter)
      expect(url).toContain(expected)
    },
  )

  it('sends no query string when filters undefined', async () => {
    let url = ''
    mswServer.use(
      http.get('http://api.test/projects/p1/work-orders', ({ request }) => {
        url = request.url
        return HttpResponse.json([])
      }),
    )
    await api.listWorkOrders('p1')
    expect(url).not.toContain('?')
  })
})

describe('listMeNotifications', () => {
  it('includes limit and cursor when provided', async () => {
    let url = ''
    mswServer.use(
      http.get('http://api.test/me/notifications', ({ request }) => {
        url = request.url
        return HttpResponse.json({ items: [], next_cursor: null })
      }),
    )
    await api.listMeNotifications({ limit: 10, cursor: 'c1' })
    const u = new URL(url)
    expect(u.searchParams.get('limit')).toBe('10')
    expect(u.searchParams.get('cursor')).toBe('c1')
  })

  it('omits query string when params undefined', async () => {
    let url = ''
    mswServer.use(
      http.get('http://api.test/me/notifications', ({ request }) => {
        url = request.url
        return HttpResponse.json({ items: [], next_cursor: null })
      }),
    )
    await api.listMeNotifications()
    expect(url.endsWith('/me/notifications')).toBe(true)
  })
})

describe('getMeTokenUsage query params', () => {
  it('appends repeated studio_id values from an array', async () => {
    let url = ''
    mswServer.use(
      http.get('http://api.test/me/token-usage', ({ request }) => {
        url = request.url
        return HttpResponse.json(emptyTokenUsageReport())
      }),
    )
    await api.getMeTokenUsage({
      studio_id: ['  a  ', 'b'],
    })
    const ids = new URL(url).searchParams.getAll('studio_id')
    expect(ids).toEqual(['a', 'b'])
  })

  it('includes numeric limit', async () => {
    let url = ''
    mswServer.use(
      http.get('http://api.test/me/token-usage', ({ request }) => {
        url = request.url
        return HttpResponse.json(emptyTokenUsageReport())
      }),
    )
    await api.getMeTokenUsage({ limit: 25 })
    expect(new URL(url).searchParams.get('limit')).toBe('25')
  })

  it('omits empty string studio_id', async () => {
    let url = ''
    mswServer.use(
      http.get('http://api.test/me/token-usage', ({ request }) => {
        url = request.url
        return HttpResponse.json(emptyTokenUsageReport())
      }),
    )
    await api.getMeTokenUsage({ studio_id: '' })
    expect(new URL(url).searchParams.has('studio_id')).toBe(false)
  })

  it('combines filters', async () => {
    let url = ''
    mswServer.use(
      http.get('http://api.test/me/token-usage', ({ request }) => {
        url = request.url
        return HttpResponse.json(emptyTokenUsageReport())
      }),
    )
    const params: TokenUsageQueryParams = {
      studio_id: 's1',
      call_type: ['chat', 'structured'],
      date_from: '2024-01-01',
      offset: 5,
    }
    await api.getMeTokenUsage(params)
    const sp = new URL(url).searchParams
    expect(sp.getAll('call_type')).toEqual(['chat', 'structured'])
    expect(sp.get('studio_id')).toBe('s1')
    expect(sp.get('date_from')).toBe('2024-01-01')
    expect(sp.get('offset')).toBe('5')
  })
})

describe('listArtifactLibrary softwareId encoding', () => {
  it('encodeURIComponent special characters in softwareId', async () => {
    let url = ''
    mswServer.use(
      http.get('http://api.test/studios/st1/artifact-library', ({ request }) => {
        url = request.url
        return HttpResponse.json([])
      }),
    )
    await api.listArtifactLibrary('st1', { softwareId: 'a/b&x' })
    expect(url).toContain(
      `softwareId=${encodeURIComponent('a/b&x')}`,
    )
  })
})

describe('fetchCsv via downloadMeTokenUsageCsv', () => {
  it('returns a Blob on 200', async () => {
    mswServer.use(
      http.get('http://api.test/me/token-usage', ({ request }) => {
        if (!request.headers.get('Accept')?.includes('csv')) {
          return HttpResponse.json(emptyTokenUsageReport())
        }
        return new HttpResponse(new TextEncoder().encode('a,b'), {
          headers: { 'Content-Type': 'text/csv' },
        })
      }),
    )
    const blob = await api.downloadMeTokenUsageCsv()
    expect(blob.size).toBeGreaterThan(0)
    await expect(blob.text()).resolves.toBe('a,b')
  })

  it('throws JSON AuthErrorBody on non-OK CSV response', async () => {
    mswServer.use(
      http.get('http://api.test/me/token-usage', ({ request }) => {
        if (!request.headers.get('Accept')?.includes('csv')) {
          return HttpResponse.json(emptyTokenUsageReport())
        }
        return HttpResponse.json(
          { detail: 'nope', code: 'FORBIDDEN' },
          { status: 403 },
        )
      }),
    )
    await expect(api.downloadMeTokenUsageCsv()).rejects.toEqual({
      detail: 'nope',
      code: 'FORBIDDEN',
    })
  })
})

describe('uploadStudioArtifact', () => {
  it('posts multipart/form-data with file and optional name', async () => {
    mswServer.use(
      http.post('http://api.test/studios/st1/artifacts', ({ request }) => {
        expect(request.headers.get('Content-Type')).toContain('multipart/form-data')
        return HttpResponse.json({
          id: 'a1',
          project_id: null,
          name: 'Shown',
          file_type: 'txt',
          size_bytes: 3,
          uploaded_by: null,
          created_at: '',
        })
      }),
    )
    const file = new File(['abc'], 'blob.txt', { type: 'text/plain' })
    const row = await api.uploadStudioArtifact('st1', file, 'Shown')
    expect(row.name).toBe('Shown')
  })

  it('throws structured error on failure', async () => {
    mswServer.use(
      http.post('http://api.test/studios/st1/artifacts', () =>
        HttpResponse.json({ detail: 'fail', code: 'BAD' }, { status: 400 }),
      ),
    )
    const file = new File(['x'], 'f.txt')
    await expect(api.uploadStudioArtifact('st1', file)).rejects.toEqual({
      detail: 'fail',
      code: 'BAD',
    })
  })
})

describe('downloadArtifactBlob', () => {
  it('returns a Blob on 200', async () => {
    mswServer.use(
      http.get('http://api.test/projects/p1/artifacts/a1/download', () =>
        new HttpResponse(new TextEncoder().encode('xyz')),
      ),
    )
    const blob = await api.downloadArtifactBlob('p1', 'a1')
    await expect(blob.text()).resolves.toBe('xyz')
  })

  it('rejects on non-OK response', async () => {
    mswServer.use(
      http.get('http://api.test/projects/p1/artifacts/a1/download', () =>
        HttpResponse.json({ detail: 'missing', code: 'NOT_FOUND' }, {
          status: 404,
        }),
      ),
    )
    await expect(api.downloadArtifactBlob('p1', 'a1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})

describe('downloadArtifactBlobById', () => {
  it('returns a Blob on 200', async () => {
    mswServer.use(
      http.get('http://api.test/artifacts/a9/download', () =>
        new HttpResponse(new TextEncoder().encode('by-id')),
      ),
    )
    const blob = await api.downloadArtifactBlobById('a9')
    await expect(blob.text()).resolves.toBe('by-id')
  })

  it('rejects on non-OK response', async () => {
    mswServer.use(
      http.get('http://api.test/artifacts/a9/download', () =>
        new HttpResponse('', { status: 500, statusText: 'Err' }),
      ),
    )
    await expect(api.downloadArtifactBlobById('a9')).rejects.toMatchObject({
      code: 'HTTP_ERROR',
    })
  })
})

describe('streamPrivateThreadReply', () => {
  it('consumes SSE chunks and dispatches token + meta', async () => {
    mswServer.use(
      http.post(
        'http://api.test/projects/p1/sections/sec1/thread/messages',
        () => {
          const enc = new TextEncoder()
          const body = new ReadableStream({
            start(controller) {
              controller.enqueue(
                enc.encode('data: {"type":"token","text":"Hello "}\n\n'),
              )
              controller.enqueue(
                enc.encode('data: {"type":"token","text":"world"}\n\n'),
              )
              controller.enqueue(
                enc.encode(
                  'data: {"type":"meta","findings":[],"conflicts":[],"context_truncated":false,"patch_proposal":null}\n\n',
                ),
              )
              controller.enqueue(enc.encode('data: [DONE]\n\n'))
              controller.close()
            },
          })
          return new HttpResponse(body, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          })
        },
      ),
    )

    const tokens: string[] = []
    let meta: PrivateThreadStreamMeta | null = null
    await api.streamPrivateThreadReply(
      'p1',
      'sec1',
      { content: 'hi' },
      {
        onToken: (t) => tokens.push(t),
        onMeta: (m) => {
          meta = m
        },
      },
    )
    expect(tokens).toEqual(['Hello ', 'world'])
    expect(meta).toEqual({
      findings: [],
      conflicts: [],
      context_truncated: false,
      patch_proposal: null,
    })
  })

  it('throws when response body is missing', async () => {
    mswServer.use(
      http.post(
        'http://api.test/projects/p1/sections/sec1/thread/messages',
        () => new HttpResponse(null, { status: 200 }),
      ),
    )
    await expect(
      api.streamPrivateThreadReply(
        'p1',
        'sec1',
        { content: 'hi' },
        {
          onToken: () => undefined,
          onMeta: () => undefined,
        },
      ),
    ).rejects.toThrow(/No response body/)
  })

  it('throws on non-200', async () => {
    mswServer.use(
      http.post(
        'http://api.test/projects/p1/sections/sec1/thread/messages',
        () =>
          HttpResponse.json({ detail: 'no', code: 'FORBIDDEN' }, { status: 403 }),
      ),
    )
    await expect(
      api.streamPrivateThreadReply(
        'p1',
        'sec1',
        { content: 'hi' },
        {
          onToken: () => undefined,
          onMeta: () => undefined,
        },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})

describe('batch: thin request wrappers for line coverage', () => {
  it(
    'invokes request()-based exports with MSW stubs',
    async () => {
      mswServer.use(...apiCoverageHandlers())
      await invokeThinApiCoverage(api)
    },
    30_000,
  )
})

describe('downloadBlob', () => {
  it('creates an object URL and triggers download', () => {
    const createSpy = vi.fn(() => 'blob:mock')
    const revokeSpy = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: createSpy,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: revokeSpy,
    })
    const clickSpy = vi.fn()
    vi.spyOn(document, 'createElement').mockImplementation(() => {
      const a = {
        href: '',
        download: '',
        click: clickSpy,
      } as unknown as HTMLAnchorElement
      return a
    })
    api.downloadBlob(new Blob(['hello']), 'file.csv')
    expect(createSpy).toHaveBeenCalled()
    expect(clickSpy).toHaveBeenCalled()
    expect(revokeSpy).toHaveBeenCalledWith('blob:mock')
    vi.restoreAllMocks()
    delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL
    delete (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL
  })
})
})
