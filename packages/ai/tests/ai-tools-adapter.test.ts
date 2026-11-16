/** AI 协议适配使用同一份中立工具注册表，不保存第二份工具状态。 */
import type { ToolCall } from '../src/index.js'
import { tools } from '@h-ai/tools'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ai, HaiAIError } from '../src/index.js'

function call(name: string, input: unknown, id = 'call-1'): ToolCall {
  return {
    id,
    type: 'function',
    function: {
      name,
      arguments: JSON.stringify(input),
    },
  }
}

describe('ai.tools.adapt', () => {
  it('只从模型Schema删除资源选择format，保留目录元数据和其他格式/默认数据', () => {
    const registry = tools.createRegistry()
    expect(registry.register(tools.define({
      name: 'resource',
      description: 'Resource',
      parameters: z.object({
        file: z.string().meta({ format: 'artifact-id' }),
        nested: z.object({
          references: z.array(z.string()).meta({ format: 'artifact-ids' }),
          date: z.string().meta({ format: 'date-time' }),
        }),
        configuration: z.object({
          format: z.string(),
        }).default({ format: 'artifact-id' }),
      }),
      handler: input => input,
    })).success).toBe(true)
    const model = ai.tools.adapt(registry).getDefinitions()[0].function.parameters
    expect(model).toMatchObject({
      properties: {
        file: { type: 'string' },
        nested: {
          properties: {
            references: { type: 'array' },
            date: { format: 'date-time' },
          },
        },
        configuration: {
          default: { format: 'artifact-id' },
        },
      },
    })
    const serialized = JSON.stringify(model)
    expect(serialized).not.toContain('"format":"artifact-ids"')
    expect(serialized.match(/"format":"artifact-id"/g)).toHaveLength(1)
    expect(JSON.stringify(registry.getDefinitions())).toContain('"format":"artifact-ids"')
  })
  it('直接业务调用和模型调用共享实现与实时注册状态', async () => {
    const registry = tools.createRegistry()
    const modelTools = ai.tools.adapt(registry)
    expect(registry.register(tools.define({
      name: 'count',
      description: '数量',
      parameters: z.object({
        value: z.number(),
      }),
      handler: ({ value }) => ({ doubled: value * 2 }),
    })).success).toBe(true)

    const direct = await registry.execute('count', { value: 4 })
    const model = await modelTools.execute(call('count', { value: 4 }))
    expect(direct.success).toBe(true)
    expect(model.success).toBe(true)
    if (direct.success && model.success) {
      expect(JSON.parse(model.data.content)).toEqual(direct.data)
      expect(model.data).toEqual({ role: 'tool', tool_call_id: 'call-1', content: '{"doubled":8}' })
    }
    const definitions = modelTools.getDefinitions()
    expect(definitions).toEqual([
      {
        type: 'function',
        function: {
          name: 'count',
          description: '数量',
          parameters: expect.objectContaining({ type: 'object' }),
        },
      },
    ])
    registry.clear()
    expect(modelTools.getDefinitions()).toEqual([])
    const missing = await modelTools.execute(call('count', { value: 4 }))
    expect(missing.success).toBe(false)
    if (!missing.success)
      expect(missing.error.module).toBe('tools')
  })

  it('校验和授权失败透传中立错误，模型适配不执行自己的授权逻辑', async () => {
    let invoked = false
    const registry = tools.createRegistry({
      authorize: () => false,
    })
    expect(registry.register(tools.define({
      name: 'protected',
      description: '授权调用',
      parameters: z.object({
        value: z.number().positive(),
      }),
      handler: () => {
        invoked = true
        return 'done'
      },
    })).success).toBe(true)
    const adapted = ai.tools.adapt(registry)
    const validation = await adapted.execute(call('protected', { value: 0 }))
    const forbidden = await adapted.execute(call('protected', { value: 1 }))
    expect(validation.success).toBe(false)
    expect(forbidden.success).toBe(false)
    if (!validation.success && !forbidden.success) {
      expect(validation.error.module).toBe('tools')
      expect(forbidden.error.module).toBe('tools')
      expect(validation.error.code).not.toBe(forbidden.error.code)
    }
    expect(invoked).toBe(false)
  })

  it('无效 JSON 返回 AI 协议错误并且不执行工具', async () => {
    const registry = tools.createRegistry()
    const result = await ai.tools.adapt(registry).execute({
      id: 'invalid',
      type: 'function',
      function: { name: 'echo', arguments: 'not json' },
    })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiAIError.TOOL_PROTOCOL_ERROR.code)
  })

  it('custom 调用返回明确的协议错误', async () => {
    const result = await ai.tools.adapt(tools.createRegistry()).execute({
      id: 'custom',
      type: 'custom',
      custom: { name: 'raw', input: 'text' },
    })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiAIError.TOOL_PROTOCOL_ERROR.code)
  })

  it('字符串、null 和空返回值形成有效工具消息', async () => {
    const registry = tools.createRegistry()
    expect(registry.registerMany([
      tools.define({
        name: 'text',
        description: '文本',
        parameters: z.object({}),
        handler: () => 'hello',
      }),
      tools.define({
        name: 'empty',
        description: '空值',
        parameters: z.object({}),
        handler: () => null,
      }),
      tools.define({
        name: 'void_result',
        description: '无返回值',
        parameters: z.object({}),
        handler: () => undefined,
      }),
    ]).success).toBe(true)
    const result = await ai.tools.adapt(registry).executeAll(['text', 'empty', 'void_result'].map(name => call(name, {}, name)))
    expect(result.success).toBe(true)
    if (result.success)
      expect(result.data.map(message => message.content)).toEqual(['hello', 'null', 'null'])
  })

  it('循环对象或 BigInt 结果返回安全的协议编码错误', async () => {
    const recursive: Record<string, unknown> = {}
    recursive.self = recursive
    const registry = tools.createRegistry()
    expect(registry.registerMany([
      tools.define({
        name: 'recursive',
        description: '循环对象',
        parameters: z.object({}),
        handler: () => recursive,
      }),
      tools.define({
        name: 'bigint',
        description: '大整数',
        parameters: z.object({}),
        handler: () => 10n,
      }),
    ]).success).toBe(true)
    for (const name of ['recursive', 'bigint']) {
      const result = await ai.tools.adapt(registry).execute(call(name, {}))
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiAIError.TOOL_RESULT_ERROR.code)
        expect(result.error.cause).toBeInstanceOf(Error)
      }
    }
  })

  it('批量调用默认按输入顺序执行，首个失败后停止剩余调用', async () => {
    const seen: number[] = []
    const registry = tools.createRegistry()
    expect(registry.register(tools.define({
      name: 'append',
      description: '顺序执行',
      parameters: z.object({
        value: z.number(),
      }),
      handler: ({ value }) => {
        seen.push(value)
        return value
      },
    })).success).toBe(true)
    const adapted = ai.tools.adapt(registry)
    const result = await adapted.executeAll([
      call('append', { value: 1 }),
      call('append', { value: 2 }, 'call-2'),
    ])
    expect(result.success).toBe(true)
    expect(seen).toEqual([1, 2])
    const failed = await adapted.executeAll([
      call('missing', {}),
      call('append', { value: 3 }),
    ])
    expect(failed.success).toBe(false)
    expect(seen).toEqual([1, 2])
  })

  it('已取消请求透传信号并返回中立取消错误', async () => {
    const controller = new AbortController()
    controller.abort()
    let invoked = false
    const registry = tools.createRegistry()
    expect(registry.register(tools.define({
      name: 'abortable',
      description: '取消调用',
      parameters: z.object({}),
      handler: () => {
        invoked = true
        return 'done'
      },
    })).success).toBe(true)
    const result = await ai.tools.adapt(registry).execute(call('abortable', {}), { signal: controller.signal })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.module).toBe('tools')
    expect(invoked).toBe(false)
  })
})
