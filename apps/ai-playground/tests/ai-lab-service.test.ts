/**
 * AI 实验台客户端服务测试
 *
 * 验证流式对话在任意网络分片边界下都能持续更新并返回最终文本。
 * @module tests/ai-lab-service
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { rememberExchange, sendChat } from '../src/lib/services/ai-lab.js'

const request = {
  profileId: 'demo-user',
  sessionId: 'session-1',
  messages: [{ role: 'user' as const, content: '你好' }],
  useMemory: false,
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('aI Playground client service', () => {
  it('parses progressive chat events split across network chunks', async () => {
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"text":"你'))
        controller.enqueue(encoder.encode('好"}\n{"text":"你好！","final":true}\n'))
        controller.close()
      },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })))
    const updates: string[] = []

    const result = await sendChat(request, text => updates.push(text))

    expect(updates).toEqual(['你好', '你好！'])
    expect(result).toEqual({ reply: '你好！' })
  })

  it('rejects an error event from the chat stream', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"error":true}\n'))
        controller.close()
      },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })))

    await expect(sendChat(request, () => {})).rejects.toMatchObject({ code: 'LLM_STREAM_ERROR' })
  })

  it('returns an empty reply without publishing an empty update', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"text":"","final":true}\n'))
        controller.close()
      },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })))
    const onText = vi.fn()

    await expect(sendChat(request, onText)).resolves.toEqual({ reply: '' })
    expect(onText).not.toHaveBeenCalled()
  })

  it('passes the cancellation signal to background memory extraction', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: { remembered: 1 },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(rememberExchange({
      profileId: 'demo-user',
      userMessage: '请记住我喜欢绿色。',
      assistantMessage: '好的。',
    }, controller.signal)).resolves.toEqual({ remembered: 1 })

    expect(fetchMock).toHaveBeenCalledWith('/api/chat/remember', expect.objectContaining({
      signal: controller.signal,
    }))
  })
})
