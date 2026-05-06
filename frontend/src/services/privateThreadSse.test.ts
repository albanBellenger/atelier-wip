import { describe, expect, it } from 'vitest'

import {
  consumePrivateThreadSseBody,
  type PrivateThreadStreamMeta,
} from './privateThreadSse'

function makeReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const enc = new TextEncoder()
  let i = 0
  return {
    read: async () => {
      if (i >= chunks.length) {
        return { done: true, value: undefined } as const
      }
      const value = enc.encode(chunks[i])
      i += 1
      return { done: false, value } as const
    },
    cancel: async () => undefined,
    releaseLock: (): void => undefined,
    closed: Promise.resolve(undefined),
  } as unknown as ReadableStreamDefaultReader<Uint8Array>
}

describe('consumePrivateThreadSseBody', () => {
  it('emits tokens in order', async () => {
    const tokens: string[] = []
    await consumePrivateThreadSseBody(
      makeReader([
        'data: {"type":"token","text":"Hello "}\n\n',
        'data: {"type":"token","text":"world"}\n\n',
        'data: [DONE]\n\n',
      ]),
      { onToken: (t) => tokens.push(t), onMeta: () => undefined },
    )
    expect(tokens).toEqual(['Hello ', 'world'])
  })

  it('emits meta with normalised arrays and patch_proposal=null', async () => {
    let meta: PrivateThreadStreamMeta | null = null
    await consumePrivateThreadSseBody(
      makeReader([
        'data: {"type":"meta","findings":[{"finding_type":"gap","description":"X"}],"conflicts":[],"context_truncated":true,"patch_proposal":null}\n\n',
        'data: [DONE]\n\n',
      ]),
      {
        onToken: () => undefined,
        onMeta: (m) => {
          meta = m
        },
      },
    )
    expect(meta).toEqual({
      findings: [{ finding_type: 'gap', description: 'X' }],
      conflicts: [],
      context_truncated: true,
      patch_proposal: null,
    })
  })

  it('coerces non-array findings/conflicts to empty arrays', async () => {
    let meta: PrivateThreadStreamMeta | null = null
    await consumePrivateThreadSseBody(
      makeReader([
        'data: {"type":"meta","findings":"oops","conflicts":null}\n\n',
        'data: [DONE]\n\n',
      ]),
      {
        onToken: () => undefined,
        onMeta: (m) => {
          meta = m
        },
      },
    )
    expect(meta).toEqual({
      findings: [],
      conflicts: [],
    })
  })

  it('reassembles frames split across chunks', async () => {
    const tokens: string[] = []
    await consumePrivateThreadSseBody(
      makeReader([
        'data: {"type":"toke',
        'n","text":"split"}\n\n',
        'data: [DONE]\n\n',
      ]),
      { onToken: (t) => tokens.push(t), onMeta: () => undefined },
    )
    expect(tokens).toEqual(['split'])
  })

  it('ignores malformed JSON', async () => {
    const tokens: string[] = []
    await consumePrivateThreadSseBody(
      makeReader([
        'data: {not json\n\n',
        'data: {"type":"token","text":"ok"}\n\n',
        'data: [DONE]\n\n',
      ]),
      { onToken: (t) => tokens.push(t), onMeta: () => undefined },
    )
    expect(tokens).toEqual(['ok'])
  })

  it('ignores non-data lines', async () => {
    const tokens: string[] = []
    await consumePrivateThreadSseBody(
      makeReader([
        ': keepalive comment\n\n',
        'event: ping\n\n',
        'data: {"type":"token","text":"x"}\n\n',
        'data: [DONE]\n\n',
      ]),
      { onToken: (t) => tokens.push(t), onMeta: () => undefined },
    )
    expect(tokens).toEqual(['x'])
  })

  it('skips token frames with empty text (current behaviour)', async () => {
    const tokens: string[] = []
    await consumePrivateThreadSseBody(
      makeReader([
        'data: {"type":"token","text":""}\n\n',
        'data: [DONE]\n\n',
      ]),
      { onToken: (t) => tokens.push(t), onMeta: () => undefined },
    )
    expect(tokens).toEqual([])
  })

  it('handles a stream with only [DONE]', async () => {
    const tokens: string[] = []
    let metaCalls = 0
    await consumePrivateThreadSseBody(makeReader(['data: [DONE]\n\n']), {
      onToken: (t) => tokens.push(t),
      onMeta: () => {
        metaCalls += 1
      },
    })
    expect(tokens).toEqual([])
    expect(metaCalls).toBe(0)
  })
})
