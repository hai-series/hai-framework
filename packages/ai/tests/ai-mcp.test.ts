/**
 * ai.mcp — 工具/资源/提示词 注册与调用 测试
 *
 * MCP 操作需要先 await ai.init()，所有 describe 中自行管理生命周期。
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ai, createMcpServer, HaiAIError } from '../src/index.js'

afterEach(async () => {
  await ai.close()
})

it('根入口导出独立 MCP Server 工厂', () => {
  expect(createMcpServer).toBeTypeOf('function')
})

it('独立 MCP Server 与官方 Client 完成初始化、发现和调用', async () => {
  const server = createMcpServer({ name: 'integration', version: '1.0.0' })
  const client = new Client({ name: 'test-client', version: '1.0.0' })
  server.registerTool('echo', { inputSchema: { text: z.string() } }, async ({ text }) => ({ content: [{ type: 'text', text }] }))
  server.registerResource('data', 'test://data', {}, async uri => ({ contents: [{ uri: uri.href, text: 'resource' }] }))
  server.registerPrompt('greet', { argsSchema: { name: z.string() } }, async ({ name }) => ({ messages: [{ role: 'user', content: { type: 'text', text: name } }] }))
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  try {
    await server.connect(serverTransport)
    await client.connect(clientTransport)
    expect(client.getServerCapabilities()).toMatchObject({ tools: {}, resources: {}, prompts: {} })
    expect((await client.listTools()).tools.map(tool => tool.name)).toEqual(['echo'])
    expect(await client.callTool({ name: 'echo', arguments: { text: 'hello' } })).toMatchObject({ content: [{ text: 'hello' }] })
    expect(await client.callTool({ name: 'echo', arguments: { text: 1 } })).toMatchObject({ isError: true })
    expect((await client.listResources()).resources).toHaveLength(1)
    expect(await client.readResource({ uri: 'test://data' })).toMatchObject({ contents: [{ text: 'resource' }] })
    expect((await client.listPrompts()).prompts).toHaveLength(1)
    expect(await client.getPrompt({ name: 'greet', arguments: { name: 'Ada' } })).toMatchObject({ messages: [{ content: { text: 'Ada' } }] })
  }
  finally {
    await client.close()
    await server.close()
  }
})

describe('ai.mcp — 协议校验', () => {
  it('非法输入不会执行工具，非法 Schema 不会替换已有工具', async () => {
    expect((await ai.init()).success).toBe(true)
    const handler = vi.fn(async () => 'ok')
    expect(ai.mcp.registerTool({ name: 'typed', description: '', inputSchema: {
      type: 'object',
      properties: { count: { type: 'integer', minimum: 1 } },
      required: ['count'],
      additionalProperties: false,
    } }, handler).success).toBe(true)
    for (const args of [{}, { count: '1' }, { count: 0 }, { count: 1, extra: true }]) {
      expect(await ai.mcp.callTool('typed', args)).toMatchObject({ success: false, error: { code: HaiAIError.MCP_TOOL_ERROR.code } })
    }
    expect(handler).not.toHaveBeenCalled()
    expect(ai.mcp.registerTool({ name: 'typed', description: '', inputSchema: { type: 'invalid' } }, handler).success).toBe(false)
    expect((await ai.mcp.callTool('typed', { count: 1 })).success).toBe(true)
  })

  it('部分上下文会补齐 requestId 且不修改调用方对象', async () => {
    await ai.init()
    const handler = vi.fn(async () => 'ok')
    ai.mcp.registerTool({ name: 'context', description: '', inputSchema: {} }, handler)
    const context = { metadata: { scope: 'test' } }
    expect((await ai.mcp.callTool('context', {}, context)).success).toBe(true)
    expect(handler.mock.calls[0]?.[1]).toMatchObject({ requestId: expect.any(String), metadata: context.metadata })
    expect(context).not.toHaveProperty('requestId')
  })

  it('必填提示词参数不能来自原型', async () => {
    await ai.init()
    const handler = vi.fn(async () => [])
    ai.mcp.registerPrompt({ name: 'required', arguments: [{ name: 'toString', required: true }] }, handler)
    expect(await ai.mcp.getPrompt('required', {})).toMatchObject({ success: false, error: { code: HaiAIError.MCP_PROTOCOL_ERROR.code } })
    expect(handler).not.toHaveBeenCalled()
  })

  it.each([{}, { text: 'both', blob: 'YQ==' }, { blob: 'base64...' }, { text: 'valid', blob: 'base64...' }])('拒绝不符合 text/blob 契约的资源 %j', async (content) => {
    await ai.init()
    ai.mcp.registerResource({ uri: 'test://resource', name: 'test' }, async () => ({ uri: 'test://resource', ...content }))
    expect(await ai.mcp.readResource('test://resource')).toMatchObject({ success: false, error: { code: HaiAIError.MCP_RESOURCE_ERROR.code } })
  })

  it('支持 SDK 图片提示词内容', async () => {
    await ai.init()
    ai.mcp.registerPrompt({ name: 'image' }, async () => [{ role: 'user', content: { type: 'image', data: 'YQ==', mimeType: 'image/png' } }])
    expect(await ai.mcp.getPrompt('image', {})).toMatchObject({ success: true, data: [{ content: { type: 'image' } }] })
  })
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
      async () => ({ uri: 'data://img', blob: 'YQ==', mimeType: 'application/octet-stream' }),
    )

    const result = await ai.mcp.readResource('data://img')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.blob).toBe('YQ==')
      expect(result.data.mimeType).toBe('application/octet-stream')
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
