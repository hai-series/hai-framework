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

    const registered = registry.register(add)
    expect(registered.success).toBe(true)
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

  it('register 返回 HaiResult 并拒绝隐式链式装配', () => {
    const registry = ai.tools.createRegistry()
    const { add, multiply } = createTestTools()

    const first = registry.register(add)
    const second = registry.register(multiply)
    expect(first.success).toBe(true)
    expect(second.success).toBe(true)
    expect(registry.size).toBe(2)
  })

  it('registerMany 返回 HaiResult', () => {
    const registry = ai.tools.createRegistry()
    const { add, multiply } = createTestTools()

    const result = registry.registerMany([add, multiply])
    expect(result.success).toBe(true)
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

  it('重复注册同名工具默认拒绝，replace 显式替换', async () => {
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

    expect(registry.register(v1).success).toBe(true)
    const duplicate = registry.register(v2)
    expect(duplicate.success).toBe(false)
    if (!duplicate.success)
      expect(duplicate.error.code).toBe(HaiAIError.TOOL_ALREADY_REGISTERED.code)
    expect(registry.size).toBe(1)

    const original = await registry.execute({
      id: 'c1',
      type: 'function',
      function: { name: 'calc', arguments: '{"x":5}' },
    })
    expect(original.success && original.data.content).toBe('10')

    expect(registry.replace(v2).success).toBe(true)
    const replaced = await registry.execute({
      id: 'c2',
      type: 'function',
      function: { name: 'calc', arguments: '{"x":5}' },
    })
    expect(replaced.success && replaced.data.content).toBe('50')
  })

  it('registerMany 遇到重复名称时保持原子性', () => {
    const registry = ai.tools.createRegistry()
    const { add } = createTestTools()
    const duplicate = ai.tools.define({
      name: 'add',
      description: 'duplicate',
      parameters: z.object({}),
      handler: () => 0,
    })

    const result = registry.registerMany([add, duplicate])
    expect(result.success).toBe(false)
    expect(registry.size).toBe(0)
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

  it('executeAll 默认串行，只有显式 parallel=true 才并行', async () => {
    const registry = ai.tools.createRegistry()
    let active = 0
    let maxActive = 0
    const slow = ai.tools.define({
      name: 'slow',
      description: 'slow',
      parameters: z.object({ value: z.number() }),
      handler: async ({ value }) => {
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise(resolve => setTimeout(resolve, 10))
        active -= 1
        return value
      },
    })
    registry.register(slow)
    const calls: ToolCall[] = [1, 2].map(value => ({
      id: `c${value}`,
      type: 'function',
      function: { name: 'slow', arguments: JSON.stringify({ value }) },
    }))

    const result = await registry.executeAll(calls)
    expect(result.success).toBe(true)
    expect(maxActive).toBe(1)
  })
})

// =============================================================================
// 工具执行上下文（signal / 超时 / 取消 / objectId / sessionId）
// =============================================================================

describe('ai.tools 执行上下文', () => {
  it('handler 收到执行上下文（signal / objectId / sessionId）', async () => {
    let received: { hasSignal: boolean, objectId?: string, sessionId?: string } | undefined
    const tool = ai.tools.define({
      name: 'ctx',
      description: 'ctx',
      parameters: z.object({}),
      handler: (_input, context) => {
        received = { hasSignal: context.signal instanceof AbortSignal, objectId: context.objectId, sessionId: context.sessionId }
        return 'ok'
      },
    })

    const result = await tool.execute({}, { objectId: 'u-1', sessionId: 's-1' })
    expect(result.success).toBe(true)
    expect(received?.hasSignal).toBe(true)
    expect(received?.objectId).toBe('u-1')
    expect(received?.sessionId).toBe('s-1')
  })

  it('超时后返回 TOOL_TIMEOUT，且不再等待未响应 signal 的 handler', async () => {
    const tool = ai.tools.define({
      name: 'slow',
      description: 'slow',
      parameters: z.object({}),
      // handler 不响应 signal，长时间不返回
      handler: () => new Promise<string>((resolve) => { setTimeout(resolve, 1000, 'late') }),
    })

    const start = Date.now()
    const result = await tool.execute({}, { timeoutMs: 20 })
    const elapsed = Date.now() - start
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiAIError.TOOL_TIMEOUT.code)
    // 取消后立即停止等待（远小于 handler 的 1000ms）
    expect(elapsed).toBeLessThan(500)
  })

  it('外部 AbortSignal 取消后返回 TOOL_TIMEOUT', async () => {
    const controller = new AbortController()
    const tool = ai.tools.define({
      name: 'abortable',
      description: 'abortable',
      parameters: z.object({}),
      handler: () => new Promise<string>((resolve) => { setTimeout(resolve, 1000, 'late') }),
    })

    const p = tool.execute({}, { signal: controller.signal, timeoutMs: 5000 })
    controller.abort()
    const result = await p
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiAIError.TOOL_TIMEOUT.code)
  })

  it('handler 响应 signal 可提前中止耗时操作', async () => {
    let aborted = false
    const tool = ai.tools.define({
      name: 'cooperative',
      description: 'cooperative',
      parameters: z.object({}),
      handler: (_input, context) => new Promise<string>((resolve, reject) => {
        const timer = setTimeout(resolve, 1000, 'done')
        context.signal.addEventListener('abort', () => {
          clearTimeout(timer)
          aborted = true
          reject(new DOMException('Aborted', 'AbortError'))
        })
      }),
    })

    const result = await tool.execute({}, { timeoutMs: 20 })
    expect(result.success).toBe(false)
    expect(aborted).toBe(true)
  })

  it('registry.executeAll 将执行上下文透传给每个工具', async () => {
    const seen: string[] = []
    const registry = ai.tools.createRegistry()
    registry.register(ai.tools.define({
      name: 'a',
      description: 'a',
      parameters: z.object({}),
      handler: (_i, ctx) => {
        seen.push(ctx.objectId ?? 'none')
        return 'a'
      },
    }))
    registry.register(ai.tools.define({
      name: 'b',
      description: 'b',
      parameters: z.object({}),
      handler: (_i, ctx) => {
        seen.push(ctx.objectId ?? 'none')
        return 'b'
      },
    }))

    const calls: ToolCall[] = [
      { id: 'c1', type: 'function', function: { name: 'a', arguments: '{}' } },
      { id: 'c2', type: 'function', function: { name: 'b', arguments: '{}' } },
    ]
    const result = await registry.executeAll(calls, { objectId: 'tenant-9' })
    expect(result.success).toBe(true)
    expect(seen).toEqual(['tenant-9', 'tenant-9'])
  })
})

describe('ai.tools 授权', () => {
  it('registry 授权拒绝时不执行 handler', async () => {
    let handled = false
    const registry = ai.tools.createRegistry({
      authorize: ({ context }) => context.objectId === 'allowed-user',
    })
    registry.register(ai.tools.define({
      name: 'delete_record',
      description: 'delete',
      parameters: z.object({ id: z.string() }),
      handler: () => {
        handled = true
        return 'deleted'
      },
    }))

    const result = await registry.execute({
      id: 'c1',
      type: 'function',
      function: { name: 'delete_record', arguments: '{"id":"1"}' },
    }, { objectId: 'denied-user' })

    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiAIError.TOOL_FORBIDDEN.code)
    expect(handled).toBe(false)
  })

  it('授权接收已通过 Zod 校验的输入', async () => {
    let authorizedInput: unknown
    const registry = ai.tools.createRegistry({
      authorize: ({ input }) => {
        authorizedInput = input
        return true
      },
    })
    registry.register(ai.tools.define({
      name: 'validated',
      description: 'validated',
      parameters: z.object({ count: z.number().int().positive() }),
      handler: ({ count }) => count,
    }))

    const invalid = await registry.execute({
      id: 'c1',
      type: 'function',
      function: { name: 'validated', arguments: '{"count":0}' },
    })
    expect(invalid.success).toBe(false)
    expect(authorizedInput).toBeUndefined()

    const valid = await registry.execute({
      id: 'c2',
      type: 'function',
      function: { name: 'validated', arguments: '{"count":2}' },
    })
    expect(valid.success).toBe(true)
    expect(authorizedInput).toEqual({ count: 2 })
  })

  it('授权异常时 fail-closed 且不泄露异常消息', async () => {
    let handled = false
    const registry = ai.tools.createRegistry({
      authorize: () => { throw new Error('secret authorization backend detail') },
    })
    registry.register(ai.tools.define({
      name: 'secure',
      description: 'secure',
      parameters: z.object({}),
      handler: () => {
        handled = true
        return 'ok'
      },
    }))

    const result = await registry.execute({
      id: 'c1',
      type: 'function',
      function: { name: 'secure', arguments: '{}' },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAIError.TOOL_FORBIDDEN.code)
      expect(result.error.message).not.toContain('secret authorization backend detail')
    }
    expect(handled).toBe(false)
  })

  it('registry 与单次授权必须同时通过', async () => {
    const checked: string[] = []
    const registry = ai.tools.createRegistry({
      authorize: () => {
        checked.push('registry')
        return true
      },
    })
    registry.register(ai.tools.define({
      name: 'secure',
      description: 'secure',
      parameters: z.object({}),
      handler: () => 'ok',
    }))

    const result = await registry.execute({
      id: 'c1',
      type: 'function',
      function: { name: 'secure', arguments: '{}' },
    }, {
      authorize: () => {
        checked.push('execution')
        return false
      },
    })

    expect(result.success).toBe(false)
    expect(checked).toEqual(['registry', 'execution'])
  })
})
