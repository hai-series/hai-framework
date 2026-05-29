/**
 * ai.init / ai.close / ai.config / ai.isInitialized 生命周期测试
 */

import type { AIRelStore, AIStoreProvider, AIVectorStore } from '../src/index.js'

import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { ai, HaiAIError } from '../src/index.js'

function createNoopRelStore<T>(): AIRelStore<T> {
  return {
    save: async () => {},
    saveMany: async () => {},
    get: async () => undefined,
    query: async () => [],
    queryPage: async () => ({ items: [], total: 0 }),
    remove: async () => false,
    removeBy: async () => 0,
    count: async () => 0,
    clear: async () => {},
  }
}

function createNoopVectorStore(): AIVectorStore {
  return {
    upsert: async () => {},
    search: async () => [],
    remove: async () => {},
    clear: async () => {},
  }
}

describe('ai.init', () => {
  it('默认配置初始化成功', async () => {
    const result = await ai.init()
    expect(result.success).toBe(true)
    expect(ai.isInitialized).toBe(true)
    await ai.close()
  })

  it('自定义 LLM 配置初始化成功', async () => {
    const result = await ai.init({
      llm: {
        model: 'gpt-4o',
        apiKey: 'sk-test-key',
        baseUrl: 'https://user:pass@api.openai.com/v1',
        temperature: 0.5,
        maxTokens: 2048,
        timeout: 30000,
      },
    })
    expect(result.success).toBe(true)
    expect(ai.config).not.toBeNull()
    expect(ai.config!.llm?.model).toBe('gpt-4o')
    expect(ai.config!.llm?.apiKey).toBe('[REDACTED]')
    expect(ai.config!.llm?.baseUrl).toBe('https://[REDACTED]:[REDACTED]@api.openai.com/v1')
    expect(ai.config!.llm?.temperature).toBe(0.5)
    expect(ai.config!.llm?.maxTokens).toBe(2048)
    await ai.close()
  })

  it('配置默认值自动填充', async () => {
    await ai.init({})
    expect(ai.config).not.toBeNull()
    // LLM schema 有默认值，但 llm 字段本身是 optional
    await ai.close()
  })

  it('无效配置返回错误', async () => {
    const result = await ai.init({
      llm: {
        temperature: 999, // 超出 0-2 范围
      },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAIError.CONFIGURATION_ERROR.code)
    }
  })

  it('负数 timeout 返回错误', async () => {
    const result = await ai.init({
      llm: { timeout: -1 },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAIError.CONFIGURATION_ERROR.code)
    }
  })

  it('非法 baseUrl 格式返回错误', async () => {
    const result = await ai.init({
      llm: { baseUrl: 'not-a-url' },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAIError.CONFIGURATION_ERROR.code)
    }
  })

  it('同时配置 llm 和 mcp', async () => {
    const result = await ai.init({
      llm: { model: 'gpt-4o', apiKey: 'sk-test' },
      mcp: { server: { name: 'my-server' } },
    })
    expect(result.success).toBe(true)
    expect(ai.config?.llm?.model).toBe('gpt-4o')
    expect(ai.config?.mcp?.server?.name).toBe('my-server')
    await ai.close()
  })

  it('mcp 配置默认值', async () => {
    await ai.init({
      mcp: { server: { name: 'test-server' } },
    })
    expect(ai.config?.mcp?.server?.version).toBe('1.0.0')
    await ai.close()
  })

  it('重复初始化应重置状态', async () => {
    await ai.init({ llm: { model: 'model-a' } })
    expect(ai.config!.llm?.model).toBe('model-a')

    await ai.init({ llm: { model: 'model-b' } })
    expect(ai.config!.llm?.model).toBe('model-b')
    await ai.close()
  })
})

describe('ai.close', () => {
  it('关闭后状态重置', async () => {
    await ai.init()
    expect(ai.isInitialized).toBe(true)

    await ai.close()
    expect(ai.isInitialized).toBe(false)
    expect(ai.config).toBeNull()
  })

  it('重复关闭不会报错', async () => {
    await ai.init()
    await ai.close()
    await ai.close()
    expect(ai.isInitialized).toBe(false)
  })

  it('关闭时释放自定义 storeProvider', async () => {
    let closeCount = 0
    const storeProvider: AIStoreProvider = {
      name: 'test',
      createRelStore: () => createNoopRelStore(),
      createVectorStore: () => createNoopVectorStore(),
      initialize: async () => {},
      close: async () => { closeCount += 1 },
    }

    const result = await ai.init({ llm: { model: 'gpt-4o-mini' } }, { storeProvider })
    expect(result.success).toBe(true)

    await ai.close()
    expect(closeCount).toBe(1)
    expect(ai.isInitialized).toBe(false)
  })
})

describe('ai.isInitialized', () => {
  it('未初始化时为 false', async () => {
    await ai.close()
    expect(ai.isInitialized).toBe(false)
  })
})

describe('未初始化时的 LLM 操作', () => {
  it('ai.llm.chat 返回 NOT_INITIALIZED', async () => {
    await ai.close()
    const result = await ai.llm.chat({ messages: [{ role: 'user', content: '你好' }] })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAIError.NOT_INITIALIZED.code)
    }
  })

  it('ai.llm.listModels 返回 NOT_INITIALIZED', async () => {
    await ai.close()
    const result = await ai.llm.listModels()
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAIError.NOT_INITIALIZED.code)
    }
  })

  it('ai.llm.chatStream 抛出 NOT_INITIALIZED', async () => {
    await ai.close()
    const stream = ai.llm.chatStream({ messages: [{ role: 'user', content: '你好' }] })
    await expect(async () => {
      for await (const _chunk of stream) {
        // 不应进入
      }
    }).rejects.toMatchObject({ code: HaiAIError.NOT_INITIALIZED.code })
  })
})

describe('未初始化时的 MCP 操作', () => {
  it('ai.mcp.callTool 返回 NOT_INITIALIZED', async () => {
    await ai.close()
    const result = await ai.mcp.callTool('test', {})
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAIError.NOT_INITIALIZED.code)
    }
  })

  it('ai.mcp.readResource 返回 NOT_INITIALIZED', async () => {
    await ai.close()
    const result = await ai.mcp.readResource('test://resource')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAIError.NOT_INITIALIZED.code)
    }
  })

  it('ai.mcp.getPrompt 返回 NOT_INITIALIZED', async () => {
    await ai.close()
    const result = await ai.mcp.getPrompt('test', {})
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAIError.NOT_INITIALIZED.code)
    }
  })

  it('ai.mcp.registerTool 返回 NOT_INITIALIZED', async () => {
    await ai.close()
    const result = ai.mcp.registerTool(
      { name: 'test', description: 'test', inputSchema: {} },
      async () => ({}),
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAIError.NOT_INITIALIZED.code)
    }
  })

  it('ai.mcp.registerResource 返回 NOT_INITIALIZED', async () => {
    await ai.close()
    const result = ai.mcp.registerResource(
      { uri: 'test://r', name: 'test' },
      async () => ({ uri: 'test://r' }),
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAIError.NOT_INITIALIZED.code)
    }
  })

  it('ai.mcp.registerPrompt 返回 NOT_INITIALIZED', async () => {
    await ai.close()
    const result = ai.mcp.registerPrompt(
      { name: 'test' },
      async () => [],
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAIError.NOT_INITIALIZED.code)
    }
  })
})

describe('ai.tools / ai.stream 无需初始化即可使用', () => {
  it('ai.tools.define 无需 init', async () => {
    await ai.close()
    const tool = ai.tools.define({
      name: 't',
      description: 'test',
      parameters: z.object({}),
      handler: () => 'ok',
    })
    expect(tool.name).toBe('t')
  })

  it('ai.tools.createRegistry 无需 init', async () => {
    await ai.close()
    const registry = ai.tools.createRegistry()
    expect(registry.size).toBe(0)
  })

  it('ai.stream.createProcessor 无需 init', async () => {
    await ai.close()
    const processor = ai.stream.createProcessor()
    expect(processor.getResult().content).toBe('')
  })

  it('ai.stream.encodeSSE 无需 init', async () => {
    await ai.close()
    const encoded = ai.stream.encodeSSE({ data: 'test' })
    expect(encoded).toContain('data: test')
  })

  it('ai.stream.createSSEDecoder 无需 init', async () => {
    await ai.close()
    const decoder = ai.stream.createSSEDecoder()
    const events = [...decoder.decode('data: hello\n\n')]
    expect(events[0].data).toBe('hello')
  })
})
