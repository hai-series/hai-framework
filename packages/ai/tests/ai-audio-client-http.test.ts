/** 保留的公开 AudioClient 使用真实 Node WebSocket 验证分片、取消与消费方关闭。 */
import type { WebSocket as ServerWebSocket } from 'ws'
import { Buffer } from 'node:buffer'
import { once } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocketServer } from 'ws'
import { HaiAIError } from '../src/ai-types.js'
import { createAudioClient } from '../src/client/ai-audio-client.js'

describe('standalone AudioClient actual WebSocket', () => {
  let server: WebSocketServer
  let url: string
  let onDone: (socket: ServerWebSocket) => void
  let observedUrl: string | undefined
  beforeEach(async () => {
    server = new WebSocketServer({ host: '127.0.0.1', port: 0 })
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Missing WebSocket server address')
    url = `ws://127.0.0.1:${address.port}/api/v1/ai/audio`
    onDone = () => {}
    observedUrl = undefined
    server.on('connection', (socket, request) => {
      observedUrl = request.url
      socket.on('message', (raw) => {
        const message: unknown = JSON.parse(raw.toString())
        if (typeof message === 'object' && message !== null && 'type' in message && message.type === 'done')
          onDone(socket)
      })
    })
  })
  afterEach(async () => {
    for (const socket of server.clients)
      socket.terminate()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  })

  function segment(socket: ServerWebSocket): void {
    socket.send(JSON.stringify({ type: 'segment_started', segmentId: 'synthesis', text: '中文', format: 'mp3' }))
  }

  it('assembles fragmented UTF-8 text and binary frames and uses a per-operation ticket', async () => {
    onDone = (socket) => {
      const text = Buffer.from(JSON.stringify({ type: 'segment_started', segmentId: 'synthesis', text: '中文', format: 'mp3' }))
      const split = text.indexOf(Buffer.from('中')) + 1
      socket.send(text.subarray(0, split), { binary: false, fin: false })
      socket.send(text.subarray(split), { binary: false, fin: true })
      socket.send(Buffer.from([1, 2]), { binary: true, fin: false })
      socket.send(Buffer.from([3, 4]), { binary: true, fin: true })
      socket.send(JSON.stringify({ type: 'segment_done', segmentId: 'synthesis' }))
      socket.send(JSON.stringify({ type: 'end' }))
    }
    const getTicket = vi.fn(async () => 'test-only-ticket + 中文')
    const client = createAudioClient({ url, getTicket })
    const output = await client.synthesize({ text: '中文', model: 'test-voice', format: 'wav' })
    expect(output.format).toBe('mp3')
    expect(Array.from(output.data)).toEqual([1, 2, 3, 4])
    expect(getTicket).toHaveBeenCalledWith({ operation: 'synthesize', model: 'test-voice' })
    expect(new URL(observedUrl!, 'http://localhost').searchParams.get('ticket')).toBe('test-only-ticket + 中文')
  })

  it.each(['abort', 'return'] as const)('%s closes the actual remote socket without requiring an end frame', async (mode) => {
    onDone = segment
    const closed = new Promise<void>(resolve => server.once('connection', socket => socket.once('close', () => resolve())))
    const controller = new AbortController()
    const client = createAudioClient({ url, getTicket: () => 'test-only-ticket' })
    const stream = client.synthesizeStream({ text: { id: 'synthesis', text: '中文' }, signal: controller.signal })
    const iterator = stream[Symbol.asyncIterator]()
    const first = await iterator.next()
    expect(first.value.type).toBe('segment_started')
    if (mode === 'abort') {
      controller.abort()
      await expect(iterator.next()).rejects.toMatchObject({ code: HaiAIError.AUDIO_CANCELLED.code })
    }
    else {
      // for-await 消费方 break 会调用同一 return 入口，必须执行连接 finally。
      await iterator.return?.()
    }
    await closed
  })

  it('rejects an actual disconnect before end instead of returning partial audio', async () => {
    onDone = (socket) => {
      segment(socket)
      socket.send(Buffer.from([1, 2]))
      socket.close()
    }
    const client = createAudioClient({ url, getTicket: () => 'test-only-ticket' })
    await expect(client.synthesize({ text: '中文' })).rejects.toMatchObject({ code: HaiAIError.AUDIO_CONNECTION_FAILED.code })
  })
})
