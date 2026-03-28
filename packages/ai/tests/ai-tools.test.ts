/**
 * ai.tools — 工具定义、工具注册表、工具执行 测试
 */

import type { ToolCall } from '../src/index.js'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ai, HaiAIError } from '../src/index.js'

// =============================================================================
// ai.tools.define
// =============================================================================

describe('ai.tools.define', () => {
  it('定义同步工具并执行', async () => {
    const greet = ai.tools.define({
      name: 'greet',
      description: '问候',
      parameters: z.object({ name: z.string() }),
      handler: ({ name }) => `Hello ${name}`,
    })

    expect(greet.name).toBe('greet')
    expect(greet.description).toBe('问候')

    const result = await greet.execute({ name: 'Alice' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('Hello Alice')
    }
  })

  it('定义异步工具并执行', async () => {
    const fetchUser = ai.tools.define({
      name: 'fetch_user',
      description: '获取用户',
      parameters: z.object({ id: z.number() }),
      handler: async ({ id }) => ({ id, name: `User-${id}` }),
    })

    const result = await fetchUser.execute({ id: 42 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ id: 42, name: 'User-42' })
    }
  })

  it('参数校验失败返回 VALIDATION_FAILED', async () => {
    const tool = ai.tools.define({
      name: 'strict_tool',
      description: 'test',
      parameters: z.object({ count: z.number().min(1) }),
      handler: ({ count }) => count * 2,
    })

    // 传入字符串而非数字
    const result = await tool.execute({ count: 'abc' } as unknown as { count: number })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAIError.TOOL_VALIDATION_FAILED.code)
    }
  })

  it('handler 抛异常返回 EXECUTION_FAILED', async () => {
    const tool = ai.tools.define({
      name: 'crash_tool',
      description: 'test',
      parameters: z.object({}),
      handler: () => { throw new Error('boom') },
    })

    const result = await tool.execute({})
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAIError.TOOL_EXECUTION_FAILED.code)
      expect(result.error.message).toBe('boom')
    }
  })

  it('toDefinition 生成 OpenAI 格式', () => {
    const tool = ai.tools.define({
      name: 'search',
      description: '搜索',
      parameters: z.object({
        query: z.string(),
        limit: z.number().optional(),
      }),
      handler: () => [],
    })

    const def = tool.toDefinition()
    expect(def.type).toBe('function')
    expect(def.function.name).toBe('search')
    expect(def.function.description).toBe('搜索')
    expect(def.function.parameters).toBeDefined()
    // JSON Schema 应含 properties
    expect(def.function.parameters).toHaveProperty('properties')
    expect(def.function.parameters).not.toHaveProperty('$schema')
  })

  it('复杂嵌套 Zod schema', async () => {
    const tool = ai.tools.define({
      name: 'create_event',
      description: '创建事件',
      parameters: z.object({
        title: z.string(),
        attendees: z.array(z.object({
          name: z.string(),
          email: z.string().email(),
        })),
        location: z.object({
          city: z.string(),
          country: z.string(),
        }).optional(),
      }),
      handler: input => ({ id: '1', ...input }),
    })

    const result = await tool.execute({
      title: 'Meeting',
      attendees: [{ name: 'Alice', email: 'alice@example.com' }],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.title).toBe('Meeting')
      expect(result.data.attendees).toHaveLength(1)
    }

    const def = tool.toDefinition()
    const props = def.function.parameters.properties as Record<string, { type?: string }>
    expect(props.attendees).toBeDefined()
  })

  it('嵌套 schema 校验失败', async () => {
    const tool = ai.tools.define({
      name: 'nested',
      description: 'test',
      parameters: z.object({
        items: z.array(z.object({ count: z.number().min(0) })),
      }),
      handler: input => input,
    })

    const result = await tool.execute({
      items: [{ count: -1 }],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAIError.TOOL_VALIDATION_FAILED.code)
    }
  })
})

// =============================================================================
// ai.tools.createRegistry
// =============================================================================

describe('ai.tools.createRegistry', () => {
  function createTestTools() {
    const add = ai.tools.define({
      name: 'add',
      description: '加法',
      parameters: z.object({ a: z.number(), b: z.number() }),
      handler: ({ a, b }) => a + b,
    })
    const multiply = ai.tools.define({
      name: 'multiply',
      description: '乘法',
      parameters: z.object({ a: z.number(), b: z.number() }),
      handler: ({ a, b }) => a * b,
    })
    return { add, multiply }
  }

  it('注册和获取工具', () => {
    const registry = ai.tools.createRegistry()
    const { add } = createTestTools()

    registry.register(add)
    expect(registry.has('add')).toBe(true)
    expect(registry.get('add')).toBeDefined()
    expect(registry.size).toBe(1)
  })

  it('批量注册', () => {
    const registry = ai.tools.createRegistry()
    const { add, multiply } = createTestTools()

    registry.registerMany([add, multiply])
    expect(registry.size).toBe(2)
    expect(registry.getNames()).toContain('add')
    expect(registry.getNames()).toContain('multiply')
  })

  it('注销工具', () => {
    const registry = ai.tools.createRegistry()
    const { add } = createTestTools()

    registry.register(add)
    expect(registry.unregister('add')).toBe(true)
    expect(registry.has('add')).toBe(false)
    expect(registry.size).toBe(0)
  })

  it('注销不存在的工具返回 false', () => {
    const registry = ai.tools.createRegistry()
    expect(registry.unregister('nonexistent')).toBe(false)
  })

  it('getDefinitions 返回所有工具的 OpenAI 定义', () => {
    const registry = ai.tools.createRegistry()
    const { add, multiply } = createTestTools()

    registry.registerMany([add, multiply])
    const defs = registry.getDefinitions()

    expect(defs).toHaveLength(2)
    expect(defs.every(d => d.type === 'function')).toBe(true)
    const names = defs.map(d => d.function.name)
    expect(names).toContain('add')
    expect(names).toContain('multiply')
  })

  it('execute 执行工具调用', async () => {
    const registry = ai.tools.createRegistry()
    const { add } = createTestTools()
    registry.register(add)

    const toolCall: ToolCall = {
      id: 'call-1',
      type: 'function',
      function: {
        name: 'add',
        arguments: JSON.stringify({ a: 3, b: 4 }),
      },
    }

    const result = await registry.execute(toolCall)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.role).toBe('tool')
      expect(result.data.tool_call_id).toBe('call-1')
      expect(result.data.content).toBe('7') // 数字结果被 JSON.stringify
    }
  })

  it('execute 工具不存在返回 TOOL_NOT_FOUND', async () => {
    const registry = ai.tools.createRegistry()

    const result = await registry.execute({
      id: 'call-x',
      type: 'function',
      function: { name: 'unknown', arguments: '{}' },
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAIError.TOOL_NOT_FOUND.code)
    }
  })

  it('execute 无效 JSON 参数返回 VALIDATION_FAILED', async () => {
    const registry = ai.tools.createRegistry()
    const { add } = createTestTools()
    registry.register(add)

    const result = await registry.execute({
      id: 'call-bad',
      type: 'function',
      function: { name: 'add', arguments: '{invalid json' },
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAIError.TOOL_VALIDATION_FAILED.code)
    }
  })

  it('execute 返回字符串结果时直接作为 content', async () => {
    const registry = ai.tools.createRegistry()
    const echo = ai.tools.define({
      name: 'echo',
      description: '回显',
      parameters: z.object({ text: z.string() }),
      handler: ({ text }) => text,
    })
    registry.register(echo)

    const result = await registry.execute({
      id: 'call-echo',
      type: 'function',
      function: { name: 'echo', arguments: '{"text":"hello"}' },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.content).toBe('hello')
    }
  })

  it('executeAll 并行执行多个工具', async () => {
    const registry = ai.tools.createRegistry()
    const { add, multiply } = createTestTools()
    registry.registerMany([add, multiply])

    const calls: ToolCall[] = [
      { id: 'c1', type: 'function', function: { name: 'add', arguments: '{"a":1,"b":2}' } },
      { id: 'c2', type: 'function', function: { name: 'multiply', arguments: '{"a":3,"b":4}' } },
    ]

    const result = await registry.executeAll(calls, { parallel: true })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(2)
      expect(result.data[0].content).toBe('3')
      expect(result.data[1].content).toBe('12')
    }
  })

  it('executeAll 串行执行', async () => {
    const registry = ai.tools.createRegistry()
    const { add } = createTestTools()
    registry.register(add)

    const calls: ToolCall[] = [
      { id: 'c1', type: 'function', function: { name: 'add', arguments: '{"a":10,"b":20}' } },
    ]

    const result = await registry.executeAll(calls, { parallel: false })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data[0].content).toBe('30')
    }
  })

  it('executeAll 遇到错误时中断', async () => {
    const registry = ai.tools.createRegistry()
    const { add } = createTestTools()
    registry.register(add)

    const calls: ToolCall[] = [
      { id: 'c1', type: 'function', function: { name: 'add', arguments: '{"a":1,"b":2}' } },
      { id: 'c2', type: 'function', function: { name: 'unknown', arguments: '{}' } },
    ]

    const result = await registry.executeAll(calls, { parallel: false })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAIError.TOOL_NOT_FOUND.code)
    }
  })

  it('clear 清空所有工具', () => {
    const registry = ai.tools.createRegistry()
    const { add, multiply } = createTestTools()
    registry.registerMany([add, multiply])

    expect(registry.size).toBe(2)
    registry.clear()
    expect(registry.size).toBe(0)
    expect(registry.has('add')).toBe(false)
  })

  it('链式注册', () => {
    const registry = ai.tools.createRegistry()
    const { add, multiply } = createTestTools()

    const result = registry.register(add).register(multiply)
    expect(result).toBe(registry)
    expect(registry.size).toBe(2)
  })

  it('registerMany 链式返回 registry', () => {
    const registry = ai.tools.createRegistry()
    const { add, multiply } = createTestTools()

    const result = registry.registerMany([add, multiply])
    expect(result).toBe(registry)
  })

  it('get 不存在的工具返回 undefined', () => {
    const registry = ai.tools.createRegistry()
    expect(registry.get('nonexistent')).toBeUndefined()
  })

  it('空注册表的 getNames 和 getDefinitions', () => {
    const registry = ai.tools.createRegistry()
    expect(registry.getNames()).toEqual([])
    expect(registry.getDefinitions()).toEqual([])
  })

  it('重复注册同名工具覆盖旧的', async () => {
    const registry = ai.tools.createRegistry()
    const v1 = ai.tools.define({
      name: 'calc',
      description: 'v1',
      parameters: z.object({ x: z.number() }),
      handler: ({ x }) => x * 2,
    })
    const v2 = ai.tools.define({
      name: 'calc',
      description: 'v2',
      parameters: z.object({ x: z.number() }),
      handler: ({ x }) => x * 10,
    })

    registry.register(v1)
    registry.register(v2)
    expect(registry.size).toBe(1)

    const result = await registry.execute({
      id: 'c1',
      type: 'function',
      function: { name: 'calc', arguments: '{"x":5}' },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.content).toBe('50') // v2 的逻辑
    }
  })

  it('executeAll 并行模式遇到错误', async () => {
    const registry = ai.tools.createRegistry()
    const { add } = createTestTools()
    registry.register(add)

    const calls: ToolCall[] = [
      { id: 'c1', type: 'function', function: { name: 'add', arguments: '{"a":1,"b":2}' } },
      { id: 'c2', type: 'function', function: { name: 'missing', arguments: '{}' } },
    ]

    const result = await registry.executeAll(calls, { parallel: true })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAIError.TOOL_NOT_FOUND.code)
    }
  })

  it('executeAll 空数组返回成功', async () => {
    const registry = ai.tools.createRegistry()

    const result = await registry.executeAll([])
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual([])
    }
  })

  it('handler 异步抛异常通过 execute 返回错误', async () => {
    const registry = ai.tools.createRegistry()
    const failTool = ai.tools.define({
      name: 'async_fail',
      description: 'test',
      parameters: z.object({}),
      handler: async () => { throw new Error('async boom') },
    })
    registry.register(failTool)

    const result = await registry.execute({
      id: 'c1',
      type: 'function',
      function: { name: 'async_fail', arguments: '{}' },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAIError.TOOL_EXECUTION_FAILED.code)
      expect(result.error.message).toBe('async boom')
    }
  })
})
