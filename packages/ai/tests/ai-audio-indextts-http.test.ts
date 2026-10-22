/** 真实 Node HTTP 证明 Undici fetch/Agent 配对、multipart、取消/超时与连接释放。 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Socket } from 'node:net'
import type { FormData } from 'undici'
import { Buffer } from 'node:buffer'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { Response } from 'undici'
import { afterEach, expect, it, vi } from 'vitest'
import { ai, HaiAIError } from '../src/index.js'

afterEach(async () => {
  vi.unstubAllGlobals()
  await ai.close()
})
const reference = { audio: { data: new Uint8Array([1, 2, 3, 4]), format: 'wav' as const }, language: 'ja', transcript: 'reference' }

async function serverTest(
  handler: (request: IncomingMessage, response: ServerResponse) => Promise<void>,
  operation: (baseUrl: string, sockets: Set<Socket>) => Promise<void>,
): Promise<void> {
  const sockets = new Set<Socket>()
  const failures: unknown[] = []
  const server = createServer((request, response) => {
    void handler(request, response).catch((error: unknown) => {
      failures.push(error)
      response.destroy()
    })
  })
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
  })
  try {
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Server unavailable')
    await operation(`http://127.0.0.1:${address.port}/v1`, sockets)
    expect(failures).toHaveLength(0)
  }
  finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}

async function init(baseUrl: string, timeout = 2000): Promise<void> {
  const result = await ai.init({ llm: { apiKey: 'unused' }, audio: {
    models: [{ id: 'index', provider: 'indextts', model: 'indextts-2.5', operations: ['synthesize'], baseUrl, apiKey: 'local-only-key', timeout }],
    synthesizeModel: 'index',
  } })
  expect(result.success).toBe(true)
}

it('真实 multipart 请求携带参考音频和控制字段，解析二进制与 metadata 并关闭连接', async () => {
  let form: FormData | undefined
  let authorization: string | undefined
  await serverTest(async (request, response) => {
    expect(request.url).toBe('/v1/audio/speech')
    authorization = request.headers.authorization
    const chunks: Uint8Array[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    form = await new Response(Buffer.concat(chunks), { headers: { 'Content-Type': request.headers['content-type'] ?? '' } }).formData()
    response.writeHead(200, {
      'Content-Type': 'audio/wav',
      'x-hai-audio-duration-ms': '3210',
      'x-hai-duration-matched': 'true',
      'x-hai-applied-speed': '1.1',
      'x-hai-audio-sample-rate': '24000',
      'x-hai-audio-channels': '1',
    })
    response.end(Buffer.from([7, 8, 9]))
  }, async (baseUrl, sockets) => {
    // 内置 fetch 故意不可用，实际请求必须使用与 Agent 同版本的 Undici fetch。
    const builtin = vi.fn(() => {
      throw new Error('Built-in fetch must not receive an Undici Agent')
    })
    vi.stubGlobal('fetch', builtin)
    await init(baseUrl)
    const result = await ai.audio.synthesize({
      text: '下午三点出发',
      language: 'zh',
      speakerReference: reference,
      styleReference: reference,
      styleStrength: 0.8,
      targetDurationMs: 3210,
      durationToleranceMs: 100,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(Array.from(result.data.data)).toEqual([7, 8, 9])
      expect(result.data).toMatchObject({ format: 'wav', durationMs: 3210, sampleRate: 24000, channels: 1, metadata: { speed: 1.1, durationMatched: true } })
    }
    expect(builtin).not.toHaveBeenCalled()
    expect(authorization).toBe('Bearer local-only-key')
    expect(form?.get('text')).toBe('下午三点出发')
    expect(form?.get('target_duration_ms')).toBe('3210')
    expect(form?.get('duration_tolerance_ms')).toBe('100')
    expect(form?.get('speaker_reference_text')).toBe('reference')
    expect(form?.get('speaker_reference_language')).toBe('ja')
    const uploaded = form?.get('speaker_reference')
    expect(uploaded).toMatchObject({ name: 'speaker_reference.wav', size: 4 })
    await expect.poll(() => sockets.size).toBe(0)
  })
})

it.each(['headers', 'body'] as const)('真实 %s 等待超时返回 AUDIO_TIMEOUT 且释放 socket', async (phase) => {
  await serverTest(async (request, response) => {
    request.resume()
    if (phase === 'body') {
      response.writeHead(200, { 'Content-Type': 'audio/wav' })
      response.write(Buffer.from([1]))
    }
  }, async (baseUrl, sockets) => {
    await init(baseUrl, 150)
    const result = await ai.audio.synthesize({ text: 'timeout', speakerReference: reference })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiAIError.AUDIO_TIMEOUT.code)
    await expect.poll(() => sockets.size).toBe(0)
  })
})

it.each(['headers', 'body'] as const)('真实 %s 等待被用户取消时返回 AUDIO_CANCELLED 且释放 socket', async (phase) => {
  let received!: () => void
  const started = new Promise<void>((resolve) => {
    received = resolve
  })
  await serverTest(async (request, response) => {
    request.resume()
    if (phase === 'body') {
      response.writeHead(200, { 'Content-Type': 'audio/wav' })
      response.write(Buffer.from([1]))
    }
    received()
  }, async (baseUrl, sockets) => {
    await init(baseUrl)
    const controller = new AbortController()
    const pending = ai.audio.synthesize({ text: 'cancel', speakerReference: reference, signal: controller.signal })
    await started
    controller.abort()
    const result = await pending
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiAIError.AUDIO_CANCELLED.code)
    await expect.poll(() => sockets.size).toBe(0)
  })
})

it('真实错误响应返回 AUDIO_UPSTREAM_ERROR，按段流式失败保留抛错边界', async () => {
  await serverTest(async (request, response) => {
    request.resume()
    response.writeHead(503, { 'Content-Type': 'text/plain' })
    response.end('temporarily unavailable')
  }, async (baseUrl, sockets) => {
    await init(baseUrl)
    const result = await ai.audio.synthesize({ text: 'error', speakerReference: reference })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiAIError.AUDIO_UPSTREAM_ERROR.code)
    const consume = async () => {
      for await (const _event of ai.audio.synthesizeStream({ text: { id: 'one', text: 'error' }, speakerReference: reference })) { /* 完整消费以验证迭代抛错。 */ }
    }
    await expect(consume()).rejects.toMatchObject({ code: HaiAIError.AUDIO_UPSTREAM_ERROR.code })
    await expect.poll(() => sockets.size).toBe(0)
  })
})
