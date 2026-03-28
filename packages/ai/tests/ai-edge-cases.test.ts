/**
 * ai — 边界场景与分支覆盖补充测试
 *
 * 补充现有测试未覆盖的边界分支，确保实际使用中不会出现意外行为。
 */

import type { AIApiAdapter } from '../src/client/ai-client.js'
import type { ChatCompletionChunk } from '../src/index.js'
import { err, ok } from '@h-ai/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { collectStreamContent, createAIClient } from '../src/client/ai-client.js'
import { ai, HaiAIError } from '../src/index.js'

// =============================================================================
// ai.tools.define — 非 Error 异常
// =============================================================================

describe('ai.tools.define — 非 Error 类型异常', () => {
  it('handler 抛出字符串时返回 EXECUTION_FAILED', async () => {
    const tool = ai.tools.define({
      name: 'throw_string',
      description: 'test',
      parameters: z.object({}),
      // eslint-disable-next-line no-throw-literal
      handler: () => { throw 'raw string error' },
    })

    const result = await tool.execute({})
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.type).toBe('EXECUTION_FAILED')
      expect(result.error.message).toBe('raw string error')
    }
  })

  it('handler 抛出 undefined 时返回 EXECUTION_FAILED', async () => {
    const tool = ai.tools.define({
      name: 'throw_undefined',
      description: 'test',
      parameters: z.object({}),
      // eslint-disable-next-line no-throw-literal
      handler: () => { throw undefined },
    })

    const result = await tool.execute({})
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.type).toBe('EXECUTION_FAILED')
      expect(result.error.message).toBe('undefined')
    }
  })

  it('handler 抛出数字时返回 EXECUTION_FAILED', async () => {
    const tool = ai.tools.define({
      name: 'throw_number',
      description: 'test',
      parameters: z.object({}),
      // eslint-disable-next-line no-throw-literal
      handler: () => { throw 42 },
    })

    const result = await tool.execute({})
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.type).toBe('EXECUTION_FAILED')
      expect(result.error.message).toBe('42')
    }
  })
})

// =============================================================================
// ai.tools.createRegistry — handler 返回字符串的序列化
// =============================================================================

describe('ai.tools.createRegistry — 序列化边界', () => {
  it('handler 返回对象时 JSON.stringify 作为 content', async () => {
    const registry = ai.tools.createRegistry()
    const objTool = ai.tools.define({
      name: 'obj_tool',
      description: 'test',
      parameters: z.object({}),
      handler: () => ({ key: 'value', nested: { arr: [1, 2] } }),
    })
    registry.register(objTool)

    const result = await registry.execute({
      id: 'c1',
      type: 'function',
      function: { name: 'obj_tool', arguments: '{}' },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      const parsed = JSON.parse(result.data.content)
      expect(parsed).toEqual({ key: 'value', nested: { arr: [1, 2] } })
    }
  })

  it('handler 返回 null 时 JSON.stringify 为 "null"', async () => {
    const registry = ai.tools.createRegistry()
    const nullTool = ai.tools.define({
      name: 'null_tool',
      description: 'test',
      parameters: z.object({}),
      handler: () => null as unknown,
    })
    registry.register(nullTool)

    const result = await registry.execute({
      id: 'c1',
      type: 'function',
      function: { name: 'null_tool', arguments: '{}' },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.content).toBe('null')
    }
  })

  it('handler 返回数字时 JSON.stringify 为字符串', async () => {
    const registry = ai.tools.createRegistry()
    const numTool = ai.tools.define({
      name: 'num_tool',
      description: 'test',
      parameters: z.object({}),
      handler: () => 42 as unknown,
    })
    registry.register(numTool)

    const result = await registry.execute({
      id: 'c1',
      type: 'function',
      function: { name: 'num_tool', arguments: '{}' },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.content).toBe('42')
    }
  })
})

// =============================================================================
// ai.stream.createProcessor — 工具调用边界
// =============================================================================

describe('ai.stream.createProcessor — 工具调用边界', () => {
  /** 构造工具调用 chunk 的辅助函数 */
  function makeToolChunk(
    index: number,
    options?: {
      id?: string
      name?: string
      arguments?: string
      finishReason?: string | null
    },
  ): ChatCompletionChunk {
    return {
      id: 'chunk-tc',
      object: 'chat.completion.chunk',
      created: Date.now(),
      model: 'test',
      choices: [{
        index: 0,
        delta: {
          tool_calls: [{
            index,
            ...(options?.id ? { id: options.id } : {}),
            function: {
              ...(options?.name !== undefined ? { name: options.name } : {}),
              ...(options?.arguments !== undefined ? { arguments: options.arguments } : {}),
            },
          }],
        },
        finish_reason: options?.finishReason ?? null,
      }],
    }
  }

  it('无 id 的初始 chunk 被忽略（不创建新工具调用）', () => {
    const processor = ai.stream.createProcessor()

    // 没有 id 的 chunk → 不创建工具调用条目
    processor.process(makeToolChunk(0, { name: 'fn', arguments: '{}' }))

    const result = processor.getResult()
    expect(result.toolCalls).toHaveLength(0)
  })

  it('已有条目的续传无 id 也能正常累积', () => {
    const processor = ai.stream.createProcessor()

    // 初始 chunk 有 id
    processor.process(makeToolChunk(0, { id: 'call-1', name: 'search', arguments: '{"q":' }))
    // 续传没有 id，但有 arguments
    processor.process(makeToolChunk(0, { arguments: '"test"}' }))

    const result = processor.getResult()
    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0].function.arguments).toBe('{"q":"test"}')
  })

  it('工具名可跨 chunk 累积', () => {
    const processor = ai.stream.createProcessor()

    processor.process(makeToolChunk(0, { id: 'c1', name: 'get', arguments: '' }))
    processor.process(makeToolChunk(0, { name: 'Weather', arguments: '{}' }))

    const result = processor.getResult()
    expect(result.toolCalls[0].function.name).toBe('getWeather')
  })

  it('三个并行工具调用交错到达', () => {
    const processor = ai.stream.createProcessor()

    // 三个工具同时开始
    processor.process(makeToolChunk(0, { id: 'c1', name: 'a', arguments: '' }))
    processor.process(makeToolChunk(1, { id: 'c2', name: 'b', arguments: '' }))
    processor.process(makeToolChunk(2, { id: 'c3', name: 'c', arguments: '' }))

    // 交错传参
    processor.process(makeToolChunk(1, { arguments: '{"x":1}' }))
    processor.process(makeToolChunk(0, { arguments: '{"y":2}' }))
    processor.process(makeToolChunk(2, { arguments: '{"z":3}' }))

    const result = processor.getResult()
    expect(result.toolCalls).toHaveLength(3)
    expect(result.toolCalls[0].function.name).toBe('a')
    expect(result.toolCalls[0].function.arguments).toBe('{"y":2}')
    expect(result.toolCalls[1].function.name).toBe('b')
    expect(result.toolCalls[1].function.arguments).toBe('{"x":1}')
    expect(result.toolCalls[2].function.name).toBe('c')
    expect(result.toolCalls[2].function.arguments).toBe('{"z":3}')
  })
})

// =============================================================================
// createAIClient — 认证边界（认证相关功能现已委托给 api-client）
// =============================================================================

describe('createAIClient — 错误处理边界', () => {
  /** 创建 mock api adapter */
  function createMockApi(postResult: unknown): AIApiAdapter {
    return {
      post: vi.fn().mockResolvedValue(postResult),
      stream: vi.fn(),
    }
  }

  function makeChatResponse(content: string) {
    return {
      id: 'resp-1',
      object: 'chat.completion',
      created: Date.now(),
      model: 'test',
      choices: [{
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }
  }

  it('api.post 返回错误时抛出包含错误消息的异常', async () => {
    const api = createMockApi(err({ message: 'Token expired' }))
    const client = createAIClient({ api })

    await expect(
      client.chat({ messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow('AI chat request failed: Token expired')
  })

  it('api.post 返回成功时正常返回', async () => {
    const api = createMockApi(ok(makeChatResponse('ok')))
    const client = createAIClient({ api })

    const result = await client.chat({ messages: [{ role: 'user', content: 'hi' }] })
    expect(result.choices[0].message.content).toBe('ok')
  })
})

// =============================================================================
// collectStreamContent — delta 无 content
// =============================================================================

describe('collectStreamContent — 边界', () => {
  async function* toAsyncIterable<T>(items: T[]): AsyncIterable<T> {
    for (const item of items) {
      yield item
    }
  }

  it('混合有 content 和无 content 的 chunk', async () => {
    const chunks: ChatCompletionChunk[] = [
      {
        id: 'c1',
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: 'test',
        choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
      },
      {
        id: 'c2',
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: 'test',
        choices: [{ index: 0, delta: { content: 'Hello' }, finish_reason: null }],
      },
      {
        id: 'c3',
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: 'test',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      },
    ]

    const content = await collectStreamContent(toAsyncIterable(chunks))
    expect(content).toBe('Hello')
  })
})

// =============================================================================
// ai.mcp — 同步 handler 与边界
// =============================================================================

describe('ai.mcp — 同步与边界场景', () => {
  afterEach(() => {
    ai.close()
  })

  it('同步 tool handler 正常工作', async () => {
    await ai.init()

    ai.mcp.registerTool(
      { name: 'sync_add', description: '同步加法', inputSchema: { type: 'object' } },
      ((input: unknown) => {
        const { a, b } = input as { a: number, b: number }
        return { sum: a + b }
      }) as unknown as Parameters<typeof ai.mcp.registerTool>[1],
    )

    const result = await ai.mcp.callTool('sync_add', { a: 10, b: 20 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ sum: 30 })
    }
  })

  it('tool handler 返回 undefined 时正常返回', async () => {
    await ai.init()

    ai.mcp.registerTool(
      { name: 'void_tool', description: '无返回值工具', inputSchema: {} },
      async () => undefined,
    )

    const result = await ai.mcp.callTool('void_tool', {})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBeUndefined()
    }
  })

  it('prompt 无 arguments 定义时传入任意参数正常', async () => {
    await ai.init()

    ai.mcp.registerPrompt(
      { name: 'no_args_prompt' },
      async () => [{ role: 'user', content: { type: 'text', text: 'fixed' } }],
    )

    // 传入额外参数不影响
    const result = await ai.mcp.getPrompt('no_args_prompt', { extra: 'ignored' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data[0].content.text).toBe('fixed')
    }
  })

  it('resource handler 返回 text 和 blob 均可', async () => {
    await ai.init()

    // text 资源
    ai.mcp.registerResource(
      { uri: 'text://doc', name: '文本' },
      async () => ({ uri: 'text://doc', text: 'hello' }),
    )

    // blob 资源
    ai.mcp.registerResource(
      { uri: 'blob://img', name: '图片' },
      async () => ({ uri: 'blob://img', blob: 'base64...', mimeType: 'image/png' }),
    )

    const textResult = await ai.mcp.readResource('text://doc')
    expect(textResult.success).toBe(true)
    if (textResult.success) {
      expect(textResult.data.text).toBe('hello')
      expect(textResult.data.blob).toBeUndefined()
    }

    const blobResult = await ai.mcp.readResource('blob://img')
    expect(blobResult.success).toBe(true)
    if (blobResult.success) {
      expect(blobResult.data.blob).toBe('base64...')
    }
  })
})

// =============================================================================
// ai — 未初始化时的统一行为
// =============================================================================

describe('ai — 未初始化时的行为一致性', () => {
  afterEach(() => {
    ai.close()
  })

  it('close 后再访问 llm 功能返回 NOT_INITIALIZED', async () => {
    await ai.init({ llm: { apiKey: 'sk-test' } })
    ai.close()

    const result = await ai.llm.chat({
      messages: [{ role: 'user', content: 'test' }],
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAIError.NOT_INITIALIZED.code)
    }
  })

  it('close 后再访问 mcp 功能返回 NOT_INITIALIZED', async () => {
    await ai.init()
    ai.close()

    const result = await ai.mcp.callTool('any', {})
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAIError.NOT_INITIALIZED.code)
    }
  })

  it('反复 init/close 不会泄漏状态', async () => {
    // 第一轮
    await ai.init()
    ai.mcp.registerTool(
      { name: 'first', description: 'test', inputSchema: {} },
      async () => 'first',
    )
    ai.close()

    // 第二轮：之前注册的工具不应存在
    await ai.init()
    const result = await ai.mcp.callTool('first', {})
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAIError.MCP_TOOL_ERROR.code)
    }
  })
})
