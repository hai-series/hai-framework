/**
 * @h-ai/ai/client — 浏览器语音客户端测试
 *
 * 通过公共入口 `createAudioClient(...)` 验证浏览器端语音客户端的传输语义：
 * - 正常合成从 `segment_started` 读取服务端解析后的真实音频格式（不由请求参数猜测）
 * - 取消 / 未收到 end 的异常断连 / 服务端领域错误 / 未完成合成段等异常路径
 *
 * WebSocket 传输通过替换 `globalThis.WebSocket` 的可脚本化 mock 隔离，不访问真实服务端。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HaiAIError } from '../src/ai-types.js'
import { createAudioClient } from '../src/client/ai-audio-client.js'

/** 可脚本化的浏览器 WebSocket mock（模拟 DOM WebSocket 行为） */
class MockDomWebSocket {
  static instances: MockDomWebSocket[] = []
  static script: ((data: unknown, ws: MockDomWebSocket) => void) | null = null

  binaryType = 'blob'
  readyState = 0
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null
  readonly sent: unknown[] = []

  constructor(readonly url: string) {
    MockDomWebSocket.instances.push(this)
    // 下一微任务建立连接，模拟异步 onopen
    queueMicrotask(() => {
      this.readyState = 1
      this.onopen?.()
    })
  }

  send(data: unknown): void {
    this.sent.push(data)
    MockDomWebSocket.script?.(data, this)
  }

  close(): void {
    if (this.readyState === 3)
      return
    this.readyState = 3
    this.onclose?.()
  }

  /** 服务端下发一条文本 JSON 帧 */
  serverText(text: string): void {
    this.onmessage?.({ data: text })
  }

  /** 服务端下发一帧二进制音频 */
  serverBinary(bytes: Uint8Array): void {
    this.onmessage?.({ data: bytes.buffer })
  }

  /** 触发连接错误 */
  fail(): void {
    this.onerror?.()
  }
}

/** 从 mock 发送队列取出解析后的控制消息类型 */
function isDone(data: unknown): boolean {
  return typeof data === 'string' && (JSON.parse(data) as { type?: string }).type === 'done'
}

describe('createAudioClient 浏览器语音客户端', () => {
  beforeEach(() => {
    MockDomWebSocket.instances.length = 0
    MockDomWebSocket.script = null
    vi.stubGlobal('WebSocket', MockDomWebSocket)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function createClient() {
    return createAudioClient({ url: 'wss://host/ai/audio', getTicket: () => 'ticket-1' })
  }

  it('synthesize 从 segment_started 读取服务端真实格式（不猜测请求参数）', async () => {
    // 请求未指定 format，服务端解析 Provider 后返回 mp3
    MockDomWebSocket.script = (data, ws) => {
      if (isDone(data)) {
        ws.serverText(JSON.stringify({ type: 'segment_started', segmentId: 'synthesis', text: '你好', format: 'mp3' }))
        ws.serverBinary(new Uint8Array([1, 2]))
        ws.serverBinary(new Uint8Array([3, 4]))
        ws.serverText(JSON.stringify({ type: 'segment_done', segmentId: 'synthesis' }))
        ws.serverText(JSON.stringify({ type: 'end' }))
        ws.close()
      }
    }

    const result = await createClient().synthesize({ text: '你好' })
    expect(result.format).toBe('mp3')
    expect(result.sampleRate).toBeUndefined()
    expect(Array.from(result.data)).toEqual([1, 2, 3, 4])
  })

  it('取消信号触发时抛出 AUDIO_CANCELLED', async () => {
    const controller = new AbortController()
    MockDomWebSocket.script = (_data, _ws) => {
      controller.abort()
    }

    await expect(createClient().synthesize({ text: '你好', signal: controller.signal }))
      .rejects
      .toMatchObject({ code: HaiAIError.AUDIO_CANCELLED.code })
  })

  it('未收到 end 便关闭连接时抛出 AUDIO_CONNECTION_FAILED', async () => {
    MockDomWebSocket.script = (data, ws) => {
      if (isDone(data)) {
        ws.serverText(JSON.stringify({ type: 'segment_started', segmentId: 'synthesis', text: '你好', format: 'mp3' }))
        ws.serverBinary(new Uint8Array([1, 2]))
        ws.serverText(JSON.stringify({ type: 'segment_done', segmentId: 'synthesis' }))
        // 未发送 end 直接关闭
        ws.close()
      }
    }

    await expect(createClient().synthesize({ text: '你好' }))
      .rejects
      .toMatchObject({ code: HaiAIError.AUDIO_CONNECTION_FAILED.code })
  })

  it('服务端 error 帧保留领域错误码', async () => {
    MockDomWebSocket.script = (data, ws) => {
      if (isDone(data)) {
        ws.serverText(JSON.stringify({ type: 'error', code: HaiAIError.AUDIO_UPSTREAM_ERROR.code, message: 'upstream boom' }))
        ws.close()
      }
    }

    await expect(createClient().synthesize({ text: '你好' }))
      .rejects
      .toMatchObject({ code: HaiAIError.AUDIO_UPSTREAM_ERROR.code })
  })

  it('收到 end 但合成段未完成时抛出 AUDIO_PROTOCOL_ERROR（不返回部分音频）', async () => {
    MockDomWebSocket.script = (data, ws) => {
      if (isDone(data)) {
        ws.serverText(JSON.stringify({ type: 'segment_started', segmentId: 'synthesis', text: '你好', format: 'mp3' }))
        ws.serverBinary(new Uint8Array([1, 2]))
        // 未发送 segment_done 便结束
        ws.serverText(JSON.stringify({ type: 'end' }))
        ws.close()
      }
    }

    await expect(createClient().synthesize({ text: '你好' }))
      .rejects
      .toMatchObject({ code: HaiAIError.AUDIO_PROTOCOL_ERROR.code })
  })

  it('连接建立后网络异常断连时抛出 AUDIO_CONNECTION_FAILED', async () => {
    MockDomWebSocket.script = (data, ws) => {
      if (isDone(data)) {
        ws.serverText(JSON.stringify({ type: 'segment_started', segmentId: 'synthesis', text: '你好', format: 'pcm16', sampleRate: 24000 }))
        ws.serverBinary(new Uint8Array([1, 2]))
        ws.fail()
        ws.close()
      }
    }

    await expect(createClient().synthesize({ text: '你好' }))
      .rejects
      .toMatchObject({ code: HaiAIError.AUDIO_CONNECTION_FAILED.code })
  })

  it('transcribe 正常返回文本并以 end 结束', async () => {
    MockDomWebSocket.script = (data, ws) => {
      if (isDone(data)) {
        ws.serverText(JSON.stringify({ type: 'transcript', text: '人工智能', final: true }))
        ws.serverText(JSON.stringify({ type: 'end' }))
        ws.close()
      }
    }

    const result = await createClient().transcribe({ audio: { data: new Uint8Array([1, 2, 3]), format: 'wav' } })
    expect(result.text).toBe('人工智能')
  })
})
