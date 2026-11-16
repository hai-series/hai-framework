/** 通用工具的真实业务输入、执行隔离和失败边界。 */
import { core, ok } from '@h-ai/core'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { tools } from '../src/index.js'

describe('tools 中立执行内核', () => {
  it('自定义扩展通过 define 接入，拒绝绕过统一授权和验证的手写执行器', async () => {
    let executed = false
    const registry = tools.createRegistry({
      authorize: () => false,
    })
    const registered = registry.register({
      name: 'unsafe',
      description: '不能绕过内核',
      parameters: z.object({}),
      toDefinition: () => ({ name: 'unsafe', description: '', inputSchema: {} }),
      execute: async () => {
        executed = true
        return ok('bypassed')
      },
    })
    expect(registered.success).toBe(false)
    const result = await registry.execute('unsafe', {})
    expect(result.success).toBe(false)
    expect(executed).toBe(false)
  })

  it('同步校验超过截止时间后不会进入 handler 或报告成功', async () => {
    let executed = false
    const slow = tools.define({
      name: 'slow_validation',
      description: '同步耗时校验',
      timeoutMs: 1,
      parameters: z.string().refine(() => {
        const until = performance.now() + 10
        while (performance.now() < until) { /* 模拟同步第三方校验，定时器此时不能运行。 */ }
        return true
      }),
      handler: () => {
        executed = true
        return 'late'
      },
    })
    const result = await slow.execute('value')
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe('hai:tools:025')
    expect(executed).toBe(false)
  })

  it('注册手写工具也必须校验可移植名称，批量失败不会留下部分登记', () => {
    const valid = tools.define({
      name: 'portable',
      description: '合法名称',
      parameters: z.object({}),
      handler: () => 1,
    })
    const invalid = { ...valid, name: 'not.portable' }
    const registry = tools.createRegistry()
    for (const result of [
      registry.register(invalid),
      registry.registerMany([valid, invalid]),
      registry.replace(invalid),
    ]) {
      expect(result.success).toBe(false)
      if (!result.success)
        expect(result.error.code).toBe('hai:tools:022')
    }
    expect(registry.size).toBe(0)
  })

  it('异步参数校验可正常完成，校验异常以失败结果返回', async () => {
    const asyncTool = tools.define({
      name: 'async_validation',
      description: '异步校验',
      parameters: z.string().refine(async value => value === 'valid'),
      handler: value => value,
    })
    const valid = await asyncTool.execute('valid')
    expect(valid.success).toBe(true)
    if (valid.success)
      expect(valid.data).toBe('valid')
    const throwing = tools.define({
      name: 'throwing_validation',
      description: '失败的校验',
      parameters: z.string().refine(() => { throw new Error('private validation detail') }),
      handler: value => value,
    })
    const failed = await throwing.execute('value')
    expect(failed.success).toBe(false)
    if (!failed.success) {
      expect(failed.error.code).toBe('hai:tools:022')
      expect(failed.error.message).not.toContain('private validation detail')
    }
  })

  it('直接业务调用保留结构化结果，并生成不含模型协议的定义', async () => {
    const count = tools.define({
      name: 'count',
      description: '统计数量',
      parameters: z.object({
        count: z.number().int().positive(),
      }),
      handler: ({ count }) => ({
        count,
        exact: BigInt(count),
      }),
    })
    const registry = tools.createRegistry()
    expect(registry.register(count).success).toBe(true)

    const result = await registry.execute('count', { count: 3 })
    expect(result.success).toBe(true)
    if (result.success)
      expect(result.data).toEqual({ count: 3, exact: 3n })
    expect(count.toDefinition()).toEqual({
      name: 'count',
      description: '统计数量',
      inputSchema: expect.objectContaining({
        type: 'object',
        required: ['count'],
      }),
    })
    expect(count.toDefinition().inputSchema).not.toHaveProperty('$schema')
    expect(registry.getDefinitions()).toHaveLength(1)
  })

  it('校验先于授权及执行，授权只看到规范化输入', async () => {
    const seen: unknown[] = []
    let executed = false
    const registry = tools.createRegistry({
      authorize: ({ input, context }) => {
        seen.push(input)
        return context.objectId === 'owner'
      },
    })
    expect(registry.register(tools.define({
      name: 'normalize',
      description: '规范化输入',
      parameters: z.object({
        value: z.string().trim().min(1),
      }),
      handler: ({ value }) => {
        executed = true
        return value
      },
    })).success).toBe(true)

    const invalid = await registry.execute('normalize', { value: '' }, { objectId: 'owner' })
    expect(invalid.success).toBe(false)
    if (!invalid.success)
      expect(invalid.error.code).toBe('hai:tools:022')
    expect(seen).toEqual([])
    expect(executed).toBe(false)

    const denied = await registry.execute('normalize', { value: ' value ' }, { objectId: 'other' })
    expect(denied.success).toBe(false)
    if (!denied.success)
      expect(denied.error.code).toBe('hai:tools:024')
    expect(executed).toBe(false)
    expect(seen).toEqual([
      { value: 'value' },
    ])
  })

  it('注册级和单次授权必须同时通过，授权异常拒绝执行且不泄露原因', async () => {
    const checked: string[] = []
    let executed = false
    const registry = tools.createRegistry({
      authorize: () => {
        checked.push('registry')
        return true
      },
    })
    expect(registry.register(tools.define({
      name: 'write',
      description: '受限写入',
      parameters: z.object({}),
      handler: () => { executed = true },
    })).success).toBe(true)
    const result = await registry.execute('write', {}, {
      authorize: () => {
        checked.push('execution')
        throw new Error('secret authorization detail')
      },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('hai:tools:024')
      expect(result.error.message).not.toContain('secret authorization detail')
    }
    expect(executed).toBe(false)
    expect(checked).toEqual(['registry', 'execution'])
  })

  it('批量注册原子拒绝重名，显式替换后业务行为改变', async () => {
    const registry = tools.createRegistry()
    const create = (value: number) => tools.define({
      name: 'version',
      description: '版本',
      parameters: z.object({}),
      handler: () => value,
    })
    const duplicate = registry.registerMany([
      create(1),
      create(2),
    ])
    expect(duplicate.success).toBe(false)
    if (!duplicate.success)
      expect(duplicate.error.code).toBe('hai:tools:021')
    expect(registry.size).toBe(0)
    expect(registry.register(create(1)).success).toBe(true)
    expect(registry.replace(create(2)).success).toBe(true)
    const result = await registry.execute('version', {})
    expect(result.success).toBe(true)
    if (result.success)
      expect(result.data).toBe(2)
    expect(registry.unregister('version')).toBe(true)
    const missing = await registry.execute('version', {})
    expect(missing.success).toBe(false)
    if (!missing.success)
      expect(missing.error.code).toBe('hai:tools:020')
  })

  it('默认串行并保留顺序，后续失败阻止剩余调用', async () => {
    const values: number[] = []
    const registry = tools.createRegistry()
    expect(registry.register(tools.define({
      name: 'append',
      description: '顺序写入',
      parameters: z.object({
        value: z.number(),
      }),
      handler: ({ value }) => {
        values.push(value)
        return value
      },
    })).success).toBe(true)
    const success = await registry.executeAll([
      {
        name: 'append',
        input: { value: 1 },
      },
      {
        name: 'append',
        input: { value: 2 },
      },
    ])
    expect(success.success).toBe(true)
    if (success.success)
      expect(success.data).toEqual([1, 2])
    const failed = await registry.executeAll([
      { name: 'missing', input: {} },
      {
        name: 'append',
        input: { value: 3 },
      },
    ])
    expect(failed.success).toBe(false)
    expect(values).toEqual([1, 2])
  })

  it('已取消执行不进入 handler，执行中的取消与超时有独立错误', async () => {
    let entered = false
    const waiting = tools.define({
      name: 'waiting',
      description: '等待取消',
      parameters: z.object({}),
      handler: (_input, context) => {
        entered = true
        return new Promise<string>((_resolve, reject) => {
          context.signal.addEventListener('abort', () => reject(context.signal.reason), { once: true })
        })
      },
    })
    const before = new AbortController()
    before.abort()
    const cancelled = await waiting.execute({}, { signal: before.signal })
    expect(cancelled.success).toBe(false)
    if (!cancelled.success)
      expect(cancelled.error.code).toBe('hai:tools:026')
    expect(entered).toBe(false)

    const timeout = await waiting.execute({}, { timeoutMs: 10 })
    expect(timeout.success).toBe(false)
    if (!timeout.success)
      expect(timeout.error.code).toBe('hai:tools:025')
    expect(entered).toBe(true)
  })

  it('截止时间覆盖工具默认超时，业务身份和会话透传', async () => {
    const deadline = Date.now() + 10_000
    const echo = tools.define({
      name: 'context',
      description: '执行上下文',
      parameters: z.object({}),
      timeoutMs: 1,
      handler: (_input, context) => ({ objectId: context.objectId, sessionId: context.sessionId, deadline: context.deadline }),
    })
    const result = await echo.execute({}, { objectId: 'owner', sessionId: 'request', deadline })
    expect(result.success).toBe(true)
    if (result.success)
      expect(result.data).toEqual({ objectId: 'owner', sessionId: 'request', deadline })
  })

  it('失败返回安全消息与原始原因，日志不记录输入或任意异常正文', async () => {
    const failure = new Error('private upstream body')
    const records: string[] = []
    const stop = core.logger.observe(record => records.push(JSON.stringify(record)))
    try {
      const result = await tools.define({
        name: 'failure',
        description: '失败',
        parameters: z.object({
          secret: z.string(),
        }),
        handler: () => { throw failure },
      }).execute({ secret: 'private-input' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('hai:tools:023')
        expect(result.error.message).not.toContain('private upstream body')
        expect(result.error.cause).toBe(failure)
      }
      expect(records.length).toBeGreaterThan(0)
      expect(records.join('')).not.toContain('private-input')
      expect(records.join('')).not.toContain('private upstream body')
    }
    finally { stop() }
  })
})
