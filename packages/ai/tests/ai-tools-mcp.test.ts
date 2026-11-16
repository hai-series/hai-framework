import { ok } from '@h-ai/core'
import { afterEach, expect, it, vi } from 'vitest'
import { ai } from '../src/index.js'

afterEach(async () => {
  vi.restoreAllMocks()
  await ai.close()
})

it('wraps a configured search service and validates its friendly form schema before invoking MCP', async () => {
  expect((await ai.init()).success).toBe(true)
  const invoke = vi.spyOn(ai.mcp.services, 'invoke').mockImplementation(async () => ok({
    content: [
      { type: 'text' as const, text: 'Source: https://example.com' },
    ],
  }))
  const authorize = vi.fn(async () => true)
  const result = ai.tools.createMcpTools({
    context: {
      scope: { tenantId: 'team', userId: 'alice' },
      sessionId: 'session',
    },
    definitions: [
      {
        name: 'web_search',
        serviceId: 'search',
        tool: 'search',
        description: 'Search web',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', minLength: 1 },
          },
          required: ['query'],
          additionalProperties: false,
        },
      },
    ],
    authorize,
  })
  expect(result.success).toBe(true)
  if (!result.success)
    throw new Error('Expected configured tool')
  const tool = result.data.tools[0]
  expect(tool).toBeDefined()
  expect((await tool.execute({ query: '' })).success).toBe(false)
  expect(invoke).not.toHaveBeenCalled()
  expect((await tool.execute({ query: 'Hai' })).success).toBe(true)
  expect(invoke).toHaveBeenCalledWith({
    serviceId: 'search',
    tool: 'search',
    arguments: { query: 'Hai' },
  }, expect.objectContaining({
    principal: { tenantId: 'team', userId: 'alice' },
    taskId: 'session',
    authorize,
  }))
})

it('fails closed for invalid or externally referenced input schemas', () => {
  const result = ai.tools.createMcpTools({
    context: {
      scope: { tenantId: 'team', userId: 'alice' },
    },
    definitions: [
      {
        name: 'web_search',
        serviceId: 'search',
        tool: 'search',
        description: 'Search web',
        inputSchema: { $ref: 'https://example.com/schema' },
      },
    ],
    authorize: () => true,
  })
  expect(result.success).toBe(false)
})

it('在初始化前定义的MCP工具按每次执行时的真实生命周期解析服务', async () => {
  const created = ai.tools.createMcpTools({
    context: {
      scope: { tenantId: 'team', userId: 'alice' },
    },
    definitions: [
      {
        name: 'web_search',
        serviceId: 'search',
        tool: 'search',
        description: 'Search',
        inputSchema: { type: 'object', properties: {} },
      },
    ],
    authorize: () => true,
  })
  expect(created.success).toBe(true)
  if (!created.success)
    throw new Error('Expected configured tool')
  const tool = created.data.tools[0]
  try {
    for (const text of ['first instance', 'replacement instance']) {
      expect((await ai.init()).success).toBe(true)
      const invoke = vi.spyOn(ai.mcp.services, 'invoke').mockResolvedValue(ok({
        content: [
          { type: 'text', text },
        ],
      }))
      const result = await tool.execute({})
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual({
          content: [
            { type: 'text', text },
          ],
        })
      }
      expect(invoke).toHaveBeenCalledOnce()
      await ai.close()
      expect((await tool.execute({})).success).toBe(false)
    }
  }
  finally {
    vi.restoreAllMocks()
    await ai.close()
  }
})
