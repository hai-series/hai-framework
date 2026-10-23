import type { AiChatCompletionInput } from '../src/ai/ai-schemas.js'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { AiChatCompletionInputSchema, AiChatMessageSchema } from '../src/ai/ai-schemas.js'

describe('ai completion schema', () => {
  it('公开类型只允许非流式请求，运行时不静默裁剪 stream', () => {
    expectTypeOf<AiChatCompletionInput>().not.toHaveProperty('stream')
    for (const stream of [true, false])
      expect(AiChatCompletionInputSchema.safeParse({ messages: [{ role: 'user', content: 'hello' }], stream }).success).toBe(false)
  })

  it('完整嵌套 JSON Schema 和严格工具定义均保留', () => {
    const input = {
      messages: [{ role: 'user', name: 'alice', content: 'lookup' }],
      tools: [{ type: 'function', function: {
        name: 'lookup',
        strict: true,
        parameters: { type: 'object', properties: { ids: { type: 'array', items: { anyOf: [{ type: 'integer' }, { type: 'null' }] } } }, additionalProperties: false },
      } }],
      tool_choice: { type: 'function', function: { name: 'lookup' } },
    }
    expect(AiChatCompletionInputSchema.parse(input)).toEqual(input)
    expect(AiChatCompletionInputSchema.safeParse({ ...input, tool_choice: { type: 'function', function: { name: 'other' } } }).success).toBe(false)
  })

  it('按角色校验工具结果、助手工具调用和消息内容', () => {
    expect(AiChatMessageSchema.safeParse({ role: 'tool', content: '42' }).success).toBe(false)
    expect(AiChatMessageSchema.safeParse({ role: 'assistant', content: null }).success).toBe(false)
    expect(AiChatMessageSchema.safeParse({ role: 'assistant', content: null, tool_calls: [{ id: 'call', type: 'function', function: { name: 'lookup', arguments: '{}' } }] }).success).toBe(true)
    expect(AiChatMessageSchema.safeParse({ role: 'tool', tool_call_id: 'call', content: '42' }).success).toBe(true)
    expect(AiChatMessageSchema.safeParse({ role: 'tool', tool_call_id: 'call', content: '42', name: 'ignored' }).success).toBe(false)
  })
})
