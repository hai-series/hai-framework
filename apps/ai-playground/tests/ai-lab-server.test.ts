/**
 * AI 实验台服务端并发测试
 *
 * 验证后台记忆提取未完成时，新一轮对话会优先取消提取，不被慢 LLM 调用阻塞。
 * @module tests/ai-lab-server
 */

import type { ChatMessage } from '@h-ai/ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { rememberExchange, streamChatWithMemory } from '../src/lib/server/ai-lab.js'

const mocks = vi.hoisted(() => ({
  extract: vi.fn(),
  injectMemories: vi.fn(),
  chatStream: vi.fn(),
}))

vi.mock('@h-ai/ai', () => ({
  ai: {
    memory: {
      scoped: () => ({
        extract: mocks.extract,
        injectMemories: mocks.injectMemories,
      }),
    },
    llm: {
      chatStream: mocks.chatStream,
    },
  },
}))

vi.mock('@h-ai/core', () => ({
  core: {
    logger: { warn: vi.fn() },
  },
  ok: (data: unknown) => ({ success: true as const, data }),
}))

vi.mock('../src/lib/server/init.js', () => ({
  AI_ASR_MODEL: 'test-asr',
  AI_AUDIO_PROVIDER: 'test',
  AI_LLM_MODEL: 'test-llm',
  AI_TTS_MODEL: 'test-tts',
  AI_TTS_VOICES: [],
}))

beforeEach(() => {
  mocks.extract.mockReset()
  mocks.injectMemories.mockReset()
  mocks.chatStream.mockReset()
  mocks.injectMemories.mockImplementation(async (messages: ChatMessage[]) => ({
    success: true as const,
    data: messages,
  }))
  mocks.chatStream.mockReturnValue((async function* () {})())
})

describe('aI Playground memory extraction concurrency', () => {
  it.each([true, false])('starts the next chat while extraction is pending (useMemory=%s)', async (useMemory) => {
    let markExtractionStarted: (() => void) | undefined
    const extractionStarted = new Promise<void>((resolve) => {
      markExtractionStarted = resolve
    })
    mocks.extract.mockImplementation((_messages: ChatMessage[], options?: { signal?: AbortSignal }) => {
      markExtractionStarted?.()
      return new Promise((resolve) => {
        const finish = () => resolve({
          success: false as const,
          error: { code: 7012, message: 'memory extraction aborted' },
        })
        if (options?.signal?.aborted)
          finish()
        else
          options?.signal?.addEventListener('abort', finish, { once: true })
      })
    })

    const extraction = rememberExchange({
      profileId: `user-${useMemory}`,
      userMessage: '请记住我喜欢绿色。',
      assistantMessage: '好的。',
    })
    await extractionStarted

    const chat = await streamChatWithMemory({
      profileId: `user-${useMemory}`,
      sessionId: 'session-1',
      messages: [{ role: 'user', content: '第二个问题' }],
      useMemory,
    })

    expect(chat.success).toBe(true)
    expect((await extraction).success).toBe(false)
    expect(mocks.injectMemories).toHaveBeenCalledTimes(useMemory ? 1 : 0)
    expect(mocks.chatStream).toHaveBeenCalledOnce()
  })

  it('aborts a memory extraction after the total timeout', async () => {
    vi.useFakeTimers()
    try {
      mocks.extract.mockImplementation((_messages: ChatMessage[], options?: { signal?: AbortSignal }) => new Promise((resolve) => {
        options?.signal?.addEventListener('abort', () => resolve({
          success: false as const,
          error: { code: 7012, message: 'memory extraction timed out' },
        }), { once: true })
      }))

      const extraction = rememberExchange({
        profileId: 'timeout-user',
        userMessage: '请记住我喜欢绿色。',
        assistantMessage: '好的。',
      })
      await vi.advanceTimersByTimeAsync(20_000)

      expect((await extraction).success).toBe(false)
    }
    finally {
      vi.useRealTimers()
    }
  })
})
