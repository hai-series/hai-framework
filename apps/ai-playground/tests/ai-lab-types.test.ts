/**
 * AI 实验台输入校验 Schema 单元测试
 *
 * 验证 API 边界的 Zod 校验：接受合法请求、拒绝越界/非法输入，并校验常量约定。
 * @module tests/ai-lab-types
 */

import { describe, expect, it } from 'vitest'
import { ChatRequestSchema, ImageRequestSchema, MAX_AUDIO_BYTES, MAX_REFERENCE_IMAGE_BYTES, MemoryAddRequestSchema, RememberRequestSchema, TtsRequestSchema } from '../src/lib/ai-lab-types.js'

describe('aI Playground input schemas', () => {
  it('accepts a bounded chat request', () => {
    const result = ChatRequestSchema.safeParse({
      profileId: 'demo-user',
      sessionId: 'session-1',
      messages: [{ role: 'user', content: '你好' }],
      useMemory: true,
    })
    expect(result.success).toBe(true)
  })

  it('accepts a remember request from one exchange', () => {
    const result = RememberRequestSchema.safeParse({
      profileId: 'demo-user',
      userMessage: '记住我偏好简洁的回答',
      assistantMessage: '好的，我会简洁回答。',
    })
    expect(result.success).toBe(true)
  })

  it('rejects a remember request with an empty message', () => {
    const result = RememberRequestSchema.safeParse({
      profileId: 'demo-user',
      userMessage: '',
      assistantMessage: 'ok',
    })
    expect(result.success).toBe(false)
  })

  it('rejects oversized TTS text', () => {
    const result = TtsRequestSchema.safeParse({ text: 'a'.repeat(2001) })
    expect(result.success).toBe(false)
  })

  it('accepts documented image presets and rejects out-of-range dimensions', () => {
    expect(ImageRequestSchema.safeParse({
      prompt: 'A calm lake at sunrise',
      width: 1024,
      height: 1024,
    }).success).toBe(true)
    expect(ImageRequestSchema.safeParse({
      prompt: 'A calm lake at sunrise',
      width: 256,
      height: 1024,
    }).success).toBe(false)
  })

  it('rejects invalid memory importance', () => {
    const result = MemoryAddRequestSchema.safeParse({
      profileId: 'demo-user',
      content: '偏好中文',
      type: 'preference',
      importance: 1.1,
    })
    expect(result.success).toBe(false)
  })

  it('keeps the audio limit aligned with AI documentation', () => {
    expect(MAX_AUDIO_BYTES).toBe(10 * 1024 * 1024)
    expect(MAX_REFERENCE_IMAGE_BYTES).toBe(10 * 1024 * 1024)
  })
})
