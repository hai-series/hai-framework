/**
 * ai.mcp — 工具/资源/提示词 注册与调用 测试
 *
 * MCP 操作需要先 await ai.init()，所有 describe 中自行管理生命周期。
 */

import { afterEach, describe, expect, it } from 'vitest'
import { ai, HaiAIError } from '../src/index.js'

afterEach(() => {
  ai.close()
})

// =============================================================================
// ai.mcp.registerTool + callTool
// =============================================================================

describe('ai.mcp — Tool', () => {
  it('注册并调用工具', async () => {
    await ai.init()

    ai.mcp.registerTool(
      { name: 'add', description: '加法', inputSchema: { type: 'object' } },
      async (input: unknown) => {
        const { a, b } = input as { a: number, b: number }
        return { sum: a + b }
      },
    )

    const result = await ai.mcp.callTool('add', { a: 3, b: 5 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ sum: 8 })
    }
  })

  it('调用不存在的工具返回 MCP_TOOL_ERROR', async () => {
    await ai.init()

    const result = await ai.mcp.callTool('nonexistent', {})
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAIError.MCP_TOOL_ERROR.code)
    }
  })

  it('工具 handler 抛异常返回 MCP_TOOL_ERROR', async () => {
    await ai.init()

    ai.mcp.registerTool(
      { name: 'crash', description: '崩溃', inputSchema: {} },
      async () => { throw new Error('tool boom') },
    )

    const result = await ai.mcp.callTool('crash', {})
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAIError.MCP_TOOL_ERROR.code)
      expect(result.error.message).toContain('tool boom')
    }
  })

  it('传入 context 参数', async () => {
    await ai.init()

    let receivedCtx: unknown = null
    ai.mcp.registerTool(
      { name: 'ctx_tool', description: 'test', inputSchema: {} },
      async (_input: unknown, ctx: unknown) => {
        receivedCtx = ctx
        return 'ok'
      },
    )

    const ctx = { requestId: 'req-001' }
    await ai.mcp.callTool('ctx_tool', {}, ctx)
    expect(receivedCtx).toEqual(ctx)
  })

  it('不传 context 时自动生成 requestId', async () => {
    await ai.init()

    let receivedCtx: unknown = null
    ai.mcp.registerTool(
      { name: 'auto_ctx', description: 'test', inputSchema: {} },
      async (_input: unknown, ctx: unknown) => {
        receivedCtx = ctx
        return 'ok'
      },
    )

    await ai.mcp.callTool('auto_ctx', {})
    expect(receivedCtx).toBeDefined()
    expect((receivedCtx as { requestId: string }).requestId).toBeTruthy()
  })

  it('覆盖注册同名工具', async () => {
    await ai.init()

    ai.mcp.registerTool(
      { name: 'dup', description: 'v1', inputSchema: {} },
      async () => 'version-1',
    )
    ai.mcp.registerTool(
      { name: 'dup', description: 'v2', inputSchema: {} },
      async () => 'version-2',
    )

    const result = await ai.mcp.callTool('dup', {})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('version-2')
    }
  })

  it('handler 抛非 Error 对象返回 MCP_TOOL_ERROR', async () => {
    await ai.init()

    ai.mcp.registerTool(
      { name: 'str_throw', description: 'test', inputSchema: {} },
      () => { throw new TypeError('string error') },
    )

    const result = await ai.mcp.callTool('str_throw', {})
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAIError.MCP_TOOL_ERROR.code)
    }
  })
})

// =============================================================================
// ai.mcp.registerResource + readResource
// =============================================================================

describe('ai.mcp — Resource', () => {
  it('注册并读取资源', async () => {
    await ai.init()

    ai.mcp.registerResource(
      { uri: 'file:///data.json', name: '数据文件', description: '测试数据' },
      async () => ({ uri: 'file:///data.json', text: '{"key":"value"}', mimeType: 'application/json' }),
    )

    const result = await ai.mcp.readResource('file:///data.json')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.uri).toBe('file:///data.json')
      expect(result.data.text).toBe('{"key":"value"}')
    }
  })

  it('读取不存在的资源返回 MCP_RESOURCE_ERROR', async () => {
    await ai.init()

    const result = await ai.mcp.readResource('file:///nonexistent')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAIError.MCP_RESOURCE_ERROR.code)
    }
  })

  it('资源 handler 抛异常返回 MCP_RESOURCE_ERROR', async () => {
    await ai.init()

    ai.mcp.registerResource(
      { uri: 'bad://res', name: 'bad' },
      async () => { throw new Error('resource boom') },
    )

    const result = await ai.mcp.readResource('bad://res')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAIError.MCP_RESOURCE_ERROR.code)
      expect(result.error.message).toContain('resource boom')
    }
  })

  it('资源 mimeType 和 blob 字段正确保留', async () => {
    await ai.init()

    ai.mcp.registerResource(
      { uri: 'data://img', name: '图片', mimeType: 'image/png' },
      async () => ({ uri: 'data://img', blob: 'base64data', mimeType: 'image/png' }),
    )

    const result = await ai.mcp.readResource('data://img')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.blob).toBe('base64data')
      expect(result.data.mimeType).toBe('image/png')
    }
  })

  it('覆盖注册同 URI 资源', async () => {
    await ai.init()

    ai.mcp.registerResource(
      { uri: 'file:///a', name: 'v1' },
      async () => ({ uri: 'file:///a', text: 'old' }),
    )
    ai.mcp.registerResource(
      { uri: 'file:///a', name: 'v2' },
      async () => ({ uri: 'file:///a', text: 'new' }),
    )

    const result = await ai.mcp.readResource('file:///a')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.text).toBe('new')
    }
  })
})

// =============================================================================
// ai.mcp.registerPrompt + getPrompt
// =============================================================================

describe('ai.mcp — Prompt', () => {
  it('注册并获取提示词', async () => {
    await ai.init()

    ai.mcp.registerPrompt(
      { name: 'greeting', description: '问候', arguments: [{ name: 'name', required: true }] },
      async (args) => {
        return [{ role: 'user', content: { type: 'text', text: `Hello ${args.name}` } }]
      },
    )

    const result = await ai.mcp.getPrompt('greeting', { name: 'Alice' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(1)
      expect(result.data[0].content.text).toBe('Hello Alice')
    }
  })

  it('获取不存在的提示词返回 MCP_PROTOCOL_ERROR', async () => {
    await ai.init()

    const result = await ai.mcp.getPrompt('nonexistent', {})
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAIError.MCP_PROTOCOL_ERROR.code)
    }
  })

  it('缺少必需参数返回 MCP_PROTOCOL_ERROR', async () => {
    await ai.init()

    ai.mcp.registerPrompt(
      { name: 'strict', arguments: [{ name: 'required_arg', required: true }] },
      async () => [],
    )

    const result = await ai.mcp.getPrompt('strict', {}) // 不传 required_arg
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAIError.MCP_PROTOCOL_ERROR.code)
    }
  })

  it('提示词 handler 抛异常返回 MCP_PROTOCOL_ERROR', async () => {
    await ai.init()

    ai.mcp.registerPrompt(
      { name: 'crash_prompt' },
      async () => { throw new Error('prompt boom') },
    )

    const result = await ai.mcp.getPrompt('crash_prompt', {})
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAIError.MCP_PROTOCOL_ERROR.code)
      expect(result.error.message).toContain('prompt boom')
    }
  })

  it('可选参数可以不传', async () => {
    await ai.init()

    ai.mcp.registerPrompt(
      {
        name: 'flexible',
        arguments: [
          { name: 'required', required: true },
          { name: 'optional', required: false },
        ],
      },
      async args => [{ role: 'user', content: { type: 'text', text: args.required } }],
    )

    const result = await ai.mcp.getPrompt('flexible', { required: 'yes' })
    expect(result.success).toBe(true)
  })

  it('返回多条提示词消息', async () => {
    await ai.init()

    ai.mcp.registerPrompt(
      { name: 'multi' },
      async () => [
        { role: 'user', content: { type: 'text', text: '请翻译' } },
        { role: 'assistant', content: { type: 'text', text: '好的' } },
        { role: 'user', content: { type: 'text', text: 'Hello' } },
      ],
    )

    const result = await ai.mcp.getPrompt('multi', {})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(3)
      expect(result.data[0].role).toBe('user')
      expect(result.data[1].role).toBe('assistant')
    }
  })

  it('提示词 resource 类型内容', async () => {
    await ai.init()

    ai.mcp.registerPrompt(
      { name: 'with_resource' },
      async () => [{
        role: 'user',
        content: {
          type: 'resource',
          resource: { uri: 'file:///doc.md', text: '# Title', mimeType: 'text/markdown' },
        },
      }],
    )

    const result = await ai.mcp.getPrompt('with_resource', {})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data[0].content.type).toBe('resource')
      expect(result.data[0].content.resource?.uri).toBe('file:///doc.md')
    }
  })
})
