/** 标准 SSE 文本语义与真实 Node HTTP Provider 的 UTF-8 分片、终止和取消。 */
import type { ServerResponse } from 'node:http'
import { Buffer } from 'node:buffer'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { ai, HaiAIError } from '../src/index.js'
import { createMemoryStoreProvider } from '../src/store/providers/ai-store-provider-memory.js'

afterEach(async () => {
  await ai.close()
})

describe('ai.stream standard event stream interpretation', () => {
  it.each(['\n', '\r\n', '\r'])('accepts %j and every one-character split', (end) => {
    const decoder = ai.stream.createSSEDecoder()
    const wire = ['\uFEFF: heartbeat', 'event: delta', 'id: 42', 'retry: 5000', 'data: 第一行', 'data: 第二行', '', ''].join(end)
    const events = [...wire].flatMap(character => [...decoder.decode(character)])
    expect(events).toEqual([{ event: 'delta', id: '42', retry: 5000, data: '第一行\n第二行' }])
  })

  it('only removes one ASCII space and preserves trailing spaces and tabs', () => {
    const decoder = ai.stream.createSSEDecoder()
    expect([...decoder.decode('event:  update \ndata:  left  \ndata:\tright\t\n\n')]).toEqual([
      { event: ' update ', data: ' left  \n\tright\t' },
    ])
  })

  it('does not dispatch comments, unknown fields, or metadata-only blocks', () => {
    const decoder = ai.stream.createSSEDecoder()
    expect([...decoder.decode(': ping\n\nevent: ignored\nid: retained\nretry: 5\n\nunknown: value\ndata ignored\n\n')]).toEqual([])
    expect([...decoder.decode('data: payload\n\n')]).toEqual([{ id: 'retained', retry: 5, data: 'payload' }])
  })

  it('bare data dispatches an empty data value; empty id clears inherited identity', () => {
    const decoder = ai.stream.createSSEDecoder()
    expect([...decoder.decode('id: previous\ndata: first\n\nid\ndata\n\n')]).toEqual([
      { id: 'previous', data: 'first' },
      { id: '', data: '' },
    ])
  })

  it('clears the event type after dispatch and preserves the default message semantics', () => {
    const decoder = ai.stream.createSSEDecoder()
    expect([...decoder.decode('event: custom\ndata: first\n\nevent:\ndata: second\n\ndata: third\n\n')]).toEqual([
      { event: 'custom', data: 'first' },
      { data: 'second' },
      { data: 'third' },
    ])
  })

  it('rejects NUL ids and invalid retry syntax without replacing previous metadata', () => {
    const decoder = ai.stream.createSSEDecoder()
    const events = [...decoder.decode('id: valid\nretry: 20\n\nid: invalid\0value\nretry: 5ms\ndata: first\n\nretry: -5\ndata: second\n\nretry: 1.5\ndata: third\n\n')]
    expect(events.map(event => ({ id: event.id, retry: event.retry }))).toEqual(Array.from({ length: 3 }, () => ({ id: 'valid', retry: 20 })))
  })

  it('does not synthesize the final blank line and reset drops incomplete data and metadata', () => {
    const decoder = ai.stream.createSSEDecoder()
    expect([...decoder.decode('id: stale\ndata: partial\n')]).toEqual([])
    expect([...decoder.decode('')]).toEqual([])
    decoder.reset()
    expect([...decoder.decode('data: fresh\n\n')]).toEqual([{ data: 'fresh' }])
  })

  it('strips exactly one leading BOM and preserves a later BOM as data', () => {
    const decoder = ai.stream.createSSEDecoder()
    expect([...decoder.decode('')]).toEqual([])
    expect([...decoder.decode('\uFEFFdata: \uFEFFpayload\n\n')]).toEqual([{ data: '\uFEFFpayload' }])
    decoder.reset()
    expect([...decoder.decode('\uFEFF\uFEFFdata: invalid field\n\n')]).toEqual([])
  })

  it('encodes an empty id and normalizes all data line endings without injecting fields', () => {
    const decoder = ai.stream.createSSEDecoder()
    expect([...decoder.decode('id: previous\ndata: first\n\n')][0]?.id).toBe('previous')
    const wire = ai.stream.encodeSSE({ id: '', data: ' first \r\nsecond\rthird\nfourth' })
    expect([...decoder.decode(wire)]).toEqual([{ id: '', data: ' first \nsecond\nthird\nfourth' }])
  })

  it.each([{ id: 'a\ndata: injected' }, { id: 'a\0b' }, { event: 'a\rdata: injected' }])('rejects invalid encoder metadata %j', (event) => {
    expect(() => ai.stream.encodeSSE({ ...event, data: 'payload' })).toThrow(TypeError)
  })

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])('rejects invalid retry %j', (retry) => {
    expect(() => ai.stream.encodeSSE({ retry, data: 'payload' })).toThrow(RangeError)
  })
})

type TestProvider = 'anthropic' | 'mimo'

async function serve(handler: (response: ServerResponse) => Promise<void>, operation: (origin: string) => Promise<void>): Promise<void> {
  const failures: unknown[] = []
  const server = createServer((request, response) => {
    request.resume()
    response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8' })
    void handler(response).catch((error: unknown) => {
      failures.push(error)
      response.destroy()
    })
  })
  try {
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Missing HTTP address')
    await operation(`http://127.0.0.1:${address.port}`)
    expect(failures).toHaveLength(0)
  }
  finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}

async function initialize(origin: string, timeout = 3000): Promise<void> {
  const result = await ai.init({
    llm: { protocol: 'anthropic', model: 'test-model', apiKey: 'test-only-key', baseUrl: origin, timeout },
    audio: { models: [{ id: 'mimo', provider: 'mimo', model: 'mimo-test', apiKey: 'test-only-key', baseUrl: origin, operations: ['transcribe'], timeout }], transcribeModel: 'mimo' },
  }, { storeProvider: createMemoryStoreProvider() })
  expect(result.success).toBe(true)
  if (!result.success)
    throw new Error(result.error.message)
}

function delta(provider: TestProvider): string {
  return provider === 'anthropic'
    ? 'data: {"type":"content_block_delta",\r\ndata: "delta":{"type":"text_delta","text":"中文  "}}\r\n\r\n'
    : 'data: {"choices":[\r\ndata: {"delta":{"content":"中文  "}}]}\r\n\r\n'
}

async function* output(provider: TestProvider, signal?: AbortSignal): AsyncIterable<string> {
  if (provider === 'anthropic') {
    for await (const chunk of ai.llm.chatStream({ messages: [{ role: 'user', content: 'hello' }], enablePersist: false, signal })) {
      const text = chunk.choices[0]?.delta.content
      if (text)
        yield text
    }
  }
  else {
    for await (const event of ai.audio.transcribeStream({ audio: { data: new Uint8Array([1, 2]), format: 'wav' }, signal })) {
      if (event.type === 'transcript' && !event.final)
        yield event.text
    }
  }
}

it.each(['anthropic', 'mimo'] as const)('%s consumes actual byte-split UTF-8/CRLF/multiline events and ignores incomplete EOF data', async (provider) => {
  await serve(async (response) => {
    const bytes = Buffer.from(`\uFEFF: heartbeat\r\n\r\n${delta(provider)}`)
    for (const byte of bytes) {
      if (response.destroyed)
        return
      response.write(Buffer.from([byte]))
      await delay(1)
    }
    const incomplete = provider === 'anthropic'
      ? 'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"NOT_COMMITTED"}}\r\n'
      : 'data: {"choices":[{"delta":{"content":"NOT_COMMITTED"}}]}\r\n'
    response.end(incomplete)
  }, async (origin) => {
    await initialize(origin)
    const values: string[] = []
    for await (const text of output(provider)) values.push(text)
    expect(values).toEqual(['中文  '])
  })
})

describe.each(['anthropic', 'mimo'] as const)('%s actual HTTP reader lifecycle', (provider) => {
  it.each(['return', 'abort', 'done', 'timeout'] as const)('%s terminates while upstream remains open and closes the response', async (mode) => {
    let closed = false
    await serve(async (response) => {
      response.once('close', () => {
        closed = true
      })
      response.write(delta(provider))
      if (mode === 'done')
        response.write(provider === 'anthropic' ? 'data: {"type":"message_stop"}\r\n\r\n' : 'data: [DONE]\r\n\r\n')
    }, async (origin) => {
      await initialize(origin, mode === 'timeout' ? 150 : 3000)
      const controller = new AbortController()
      const iterator = output(provider, controller.signal)[Symbol.asyncIterator]()
      const first = await iterator.next()
      expect(first.value).toBe('中文  ')
      if (mode === 'return') {
        await iterator.return?.()
      }
      else if (mode === 'done') {
        expect((await iterator.next()).done).toBe(true)
      }
      else {
        if (mode === 'abort')
          controller.abort()
        if (provider === 'mimo') {
          await expect(iterator.next()).rejects.toMatchObject({ code: mode === 'timeout' ? HaiAIError.AUDIO_TIMEOUT.code : HaiAIError.AUDIO_CANCELLED.code })
        }
        else {
          await expect(iterator.next()).rejects.toMatchObject({ name: mode === 'timeout' ? 'TimeoutError' : 'AbortError' })
        }
      }
      await expect.poll(() => closed).toBe(true)
    })
  })
})
