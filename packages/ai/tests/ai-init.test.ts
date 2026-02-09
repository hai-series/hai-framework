/**
 * ai.init / ai.close / ai.config / ai.isInitialized 生命周期测试
 */

import { describe, expect, it } from 'vitest'
import { ai, AIErrorCode } from '../src/index.js'

describe('ai.init', () => {
  it('默认配置初始化成功', () => {
    const result = ai.init()
    expect(result.success).toBe(true)
    expect(ai.isInitialized).toBe(true)
    ai.close()
  })

  it('自定义 LLM 配置初始化成功', () => {
    const result = ai.init({
      llm: {
        model: 'gpt-4o',
        apiKey: 'sk-test-key',
        temperature: 0.5,
        maxTokens: 2048,
        timeout: 30000,
      },
    })
    expect(result.success).toBe(true)
    expect(ai.config).not.toBeNull()
    expect(ai.config!.llm?.model).toBe('gpt-4o')
    expect(ai.config!.llm?.temperature).toBe(0.5)
    expect(ai.config!.llm?.maxTokens).toBe(2048)
    ai.close()
  })

  it('配置默认值自动填充', () => {
    ai.init({})
    expect(ai.config).not.toBeNull()
    // LLM schema 有默认值，但 llm 字段本身是 optional
    ai.close()
  })

  it('无效配置返回错误', () => {
    const result = ai.init({
      llm: {
        temperature: 999 as unknown as number, // 超出 0-2 范围
      },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AIErrorCode.CONFIGURATION_ERROR)
    }
  })

  it('重复初始化应重置状态', () => {
    ai.init({ llm: { model: 'model-a' } })
    expect(ai.config!.llm?.model).toBe('model-a')

    ai.init({ llm: { model: 'model-b' } })
    expect(ai.config!.llm?.model).toBe('model-b')
    ai.close()
  })
})

describe('ai.close', () => {
  it('关闭后状态重置', () => {
    ai.init()
    expect(ai.isInitialized).toBe(true)

    ai.close()
    expect(ai.isInitialized).toBe(false)
    expect(ai.config).toBeNull()
  })

  it('重复关闭不会报错', () => {
    ai.init()
    ai.close()
    ai.close()
    expect(ai.isInitialized).toBe(false)
  })
})

describe('ai.isInitialized', () => {
  it('未初始化时为 false', () => {
    ai.close()
    expect(ai.isInitialized).toBe(false)
  })
})

describe('未初始化时的 LLM 操作', () => {
  it('ai.llm.chat 返回 NOT_INITIALIZED', async () => {
    ai.close()
    const result = await ai.llm.chat({ messages: [{ role: 'user', content: '你好' }] })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AIErrorCode.NOT_INITIALIZED)
    }
  })

  it('ai.llm.listModels 返回 NOT_INITIALIZED', async () => {
    ai.close()
    const result = await ai.llm.listModels()
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AIErrorCode.NOT_INITIALIZED)
    }
  })

  it('ai.llm.chatStream 抛出 NOT_INITIALIZED', async () => {
    ai.close()
    const stream = ai.llm.chatStream({ messages: [{ role: 'user', content: '你好' }] })
    await expect(async () => {
      for await (const _chunk of stream) {
        // 不应进入
      }
    }).rejects.toMatchObject({ code: AIErrorCode.NOT_INITIALIZED })
  })
})

describe('未初始化时的 MCP 操作', () => {
  it('ai.mcp.callTool 返回 NOT_INITIALIZED', async () => {
    ai.close()
    const result = await ai.mcp.callTool('test', {})
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AIErrorCode.NOT_INITIALIZED)
    }
  })

  it('ai.mcp.readResource 返回 NOT_INITIALIZED', async () => {
    ai.close()
    const result = await ai.mcp.readResource('test://resource')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AIErrorCode.NOT_INITIALIZED)
    }
  })

  it('ai.mcp.getPrompt 返回 NOT_INITIALIZED', async () => {
    ai.close()
    const result = await ai.mcp.getPrompt('test', {})
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AIErrorCode.NOT_INITIALIZED)
    }
  })

  it('ai.mcp.registerTool 抛出 NOT_INITIALIZED', () => {
    ai.close()
    expect(() => {
      ai.mcp.registerTool(
        { name: 'test', description: 'test', inputSchema: {} },
        async () => ({}),
      )
    }).toThrow()
  })

  it('ai.mcp.registerResource 抛出 NOT_INITIALIZED', () => {
    ai.close()
    expect(() => {
      ai.mcp.registerResource(
        { uri: 'test://r', name: 'test' },
        async () => ({ uri: 'test://r' }),
      )
    }).toThrow()
  })

  it('ai.mcp.registerPrompt 抛出 NOT_INITIALIZED', () => {
    ai.close()
    expect(() => {
      ai.mcp.registerPrompt(
        { name: 'test' },
        async () => [],
      )
    }).toThrow()
  })
})
