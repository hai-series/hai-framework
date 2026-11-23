import type { LogRecord } from '@h-ai/core'
import type { RunnerFunctions } from '@h-ai/runner'
import process from 'node:process'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { runner as frameworkRunner } from '@h-ai/runner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { HaiToolsError } from '../src/index.js'
import { tools } from '../src/server/index.js'

const scope = { tenantId: 'team', userId: 'alice' }
let runner: RunnerFunctions
let closed: (() => void)[] = []

beforeEach(async () => {
  expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
  runner = frameworkRunner.create()
  expect((await runner.init({ nodeId: 'tool-tests', pollMs: 10 })).success).toBe(true)
})

afterEach(async () => {
  for (const close of closed)
    close()
  closed = []
  await runner.close()
  await reldb.close()
})

function createService(enabled = ['echo']) {
  const result = tools.createService({
    id: 'test',
    runner,
    createTools: () => ({
      tools: [
        tools.define({
          name: 'echo',
          description: 'Echo',
          parameters: z.object({
            value: z.string(),
          }),
          handler: input => input,
        }),
      ],
      groups: [
        {
          id: 'text',
          title: 'Text',
          tools: ['echo'],
        },
      ],
    }),
    enabled: () => ({ tools: enabled }),
    authorize: () => true,
  })
  expect(result.success).toBe(true)
  if (!result.success)
    throw new Error(result.error.message)
  closed.push(result.data.close)
  return result.data
}

describe('tools.createService', () => {
  it.each(['constructor', 'toString'])('执行合法的原型同名工具 %s，不误绑定继承的环境属性', async (name) => {
    const created = tools.createService({
      id: 'prototype-name',
      runner,
      enabled: {
        tools: [name],
      },
      authorize: () => true,
      createTools: () => ({
        tools: [
          tools.define({
            name,
            description: 'Host tool with a valid custom name',
            parameters: z.object({
              value: z.string(),
            }),
            handler: input => ({ name, value: input.value }),
          }),
        ],
      }),
    })
    expect(created.success).toBe(true)
    if (!created.success)
      throw new Error(created.error.message)
    closed.push(created.data.close)
    const result = await created.data.invoke({
      name,
      input: { value: 'host result' },
    }, { scope })
    expect(result.success).toBe(true)
    if (result.success)
      expect(result.data).toEqual({ name, value: 'host result' })
  })

  it('按幂等键找回唯一回执，不存在或跨主体时不返回任务', async () => {
    const enabled = ['echo']
    const service = createService(enabled)
    const missing = await service.find('recover-me', { scope })
    expect(missing.success).toBe(true)
    if (missing.success)
      expect(missing.data).toBeUndefined()
    const submitted = await service.submit({
      name: 'echo',
      input: { value: 'recover' },
      idempotencyKey: 'recover-me',
    }, { scope })
    expect(submitted.success).toBe(true)
    if (!submitted.success)
      throw new Error(submitted.error.message)
    enabled.length = 0
    for (let attempt = 0; attempt < 2; attempt++) {
      const found = await service.find('recover-me', { scope })
      expect(found.success).toBe(true)
      if (found.success)
        expect(found.data?.receipt).toEqual(submitted.data.receipt)
    }
    const other = await service.find('recover-me', {
      scope: { ...scope, userId: 'bob' },
    })
    expect(other.success).toBe(true)
    if (other.success)
      expect(other.data).toBeUndefined()
    const invalid = await service.find('', { scope })
    expect(invalid.success).toBe(false)
    if (!invalid.success)
      expect(invalid.error.code).toBe(HaiToolsError.VALIDATION_FAILED.code)
    const cancelled = await service.find('recover-me', {
      scope,
      signal: AbortSignal.abort(),
    })
    expect(cancelled.success).toBe(false)
    if (!cancelled.success)
      expect(cancelled.error.code).toBe(HaiToolsError.CANCELLED.code)
    service.close()
    expect((await service.find('recover-me', { scope })).success).toBe(false)
  })
  it('调用者未取消的信号不会延长服务自己的目录截止时间', async () => {
    const created = tools.createService({
      id: 'admission-deadline',
      runner,
      runTimeoutMs: 10,
      enabled: { tools: [] },
      authorize: () => true,
      createTools: async () => new Promise(resolve => setTimeout(resolve, 100, { tools: [] })),
    })
    expect(created.success).toBe(true)
    if (!created.success)
      throw new Error(created.error.message)
    closed.push(created.data.close)
    const result = await created.data.catalog({ scope, signal: new AbortController().signal })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiToolsError.TIMEOUT.code)
  })
  it('相同幂等回执重读时保留业务失败码', async () => {
    const created = tools.createService({
      id: 'result-failure',
      runner,
      enabled: {
        tools: ['denied'],
      },
      authorize: () => true,
      createTools: () => ({
        tools: [
          tools.define({
            name: 'denied',
            description: 'Denied',
            parameters: z.object({}),
            resultHandler: () => core.err(HaiToolsError.FORBIDDEN, 'Denied'),
          }),
        ],
      }),
    })
    expect(created.success).toBe(true)
    if (!created.success)
      throw new Error(created.error.message)
    closed.push(created.data.close)
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await created.data.invoke({ name: 'denied', input: {}, idempotencyKey: 'one' }, { scope })
      expect(result.success).toBe(false)
      if (!result.success)
        expect(result.error.code).toBe(HaiToolsError.FORBIDDEN.code)
    }
  })
  it('保留工具自己的短截止时间，Runner只提供更长的外层上限', async () => {
    const created = tools.createService({
      id: 'deadline',
      runner,
      runTimeoutMs: 5000,
      enabled: {
        tools: ['budget'],
      },
      authorize: () => true,
      createTools: () => ({
        tools: [
          tools.define({
            name: 'budget',
            description: 'Deadline',
            parameters: z.object({}),
            timeoutMs: 10,
            handler: (_input, context) => ({ budget: context.deadline - Date.now() }),
          }),
        ],
      }),
    })
    expect(created.success).toBe(true)
    if (!created.success)
      throw new Error(created.error.message)
    closed.push(created.data.close)
    const result = await created.data.invoke({ name: 'budget', input: {} }, { scope })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(z.object({
        budget: z.number().max(10),
      }).safeParse(result.data).success).toBe(true)
    }
  })
  it('真实 Runner 完成调用，服务回执可观察且幂等', async () => {
    const service = createService()
    const request = {
      name: 'echo',
      input: { value: 'hello' },
      idempotencyKey: 'one',
    }
    const invoked = await service.invoke(request, { scope })
    expect(invoked.success).toBe(true)
    if (invoked.success)
      expect(invoked.data).toEqual({ value: 'hello' })
    const first = await service.submit(request, { scope })
    const second = await service.submit(request, { scope })
    expect(first.success).toBe(true)
    expect(second.success).toBe(true)
    if (first.success && second.success)
      expect(first.data.receipt).toEqual(second.data.receipt)
  })

  it('停用能力同时影响目录和提交', async () => {
    const service = createService([])
    const catalog = await service.catalog({ scope })
    expect(catalog.success).toBe(true)
    if (catalog.success)
      expect(catalog.data.tools).toEqual([])
    const submitted = await service.submit({
      name: 'echo',
      input: { value: 'no' },
    }, { scope })
    expect(submitted.success).toBe(false)
  })

  it('错误回执和其他主体不能查询或取消当前任务，关闭不关闭借入Runner', async () => {
    const service = createService()
    const accepted = await service.submit({
      name: 'echo',
      input: { value: 'hello' },
      idempotencyKey: 'receipt',
    }, { scope })
    expect(accepted.success).toBe(true)
    if (!accepted.success)
      throw new Error(accepted.error.message)
    const receipt = accepted.data.receipt
    expect((await service.inspect({ ...receipt, key: 'another-key' }, { scope })).success).toBe(false)
    expect((await service.cancel(receipt, {
      scope: { ...scope, userId: 'other' },
    })).success).toBe(false)
    service.close()
    expect(runner.register('after-service-close', async () => null).success).toBe(true)
    expect((await service.catalog({ scope })).success).toBe(false)
  })

  it('aPI和执行节点分离，执行节点复核最新启用策略', async () => {
    await runner.close()
    expect((await runner.init({ nodeId: 'api', executor: false })).success).toBe(true)
    const worker = frameworkRunner.create()
    let enabled = true
    let invoked = false
    const options = {
      id: 'distributed',
      createTools: () => ({
        tools: [
          tools.define({
            name: 'effect',
            description: 'Effect',
            parameters: z.object({}),
            handler: () => {
              invoked = true
              return 'done'
            },
          }),
        ],
      }),
      enabled: () => ({
        tools: enabled
          ? ['effect']
          : [],
      }),
      authorize: () => true,
    }
    const api = tools.createService({ ...options, runner })
    expect(api.success).toBe(true)
    if (!api.success)
      throw new Error(api.error.message)
    closed.push(api.data.close)
    const submitted = await api.data.submit({ name: 'effect', input: {}, idempotencyKey: 'one' }, { scope })
    expect(submitted.success).toBe(true)
    if (!submitted.success)
      throw new Error(submitted.error.message)
    enabled = false
    try {
      expect((await worker.init({ nodeId: 'worker', pollMs: 10 })).success).toBe(true)
      const executor = tools.createService({ ...options, runner: worker })
      expect(executor.success).toBe(true)
      if (!executor.success)
        throw new Error(executor.error.message)
      closed.push(executor.data.close)
      let status = submitted.data.status
      for (let attempt = 0; attempt < 100 && ['queued', 'running', 'cancelling'].includes(status); attempt++) {
        await new Promise(resolve => setTimeout(resolve, 10))
        const result = await api.data.inspect(submitted.data.receipt, { scope })
        expect(result.success).toBe(true)
        if (!result.success)
          throw new Error(result.error.message)
        status = result.data.status
      }
      expect(status).toBe('failed')
      expect(invoked).toBe(false)
    }
    finally { await worker.close() }
  })

  it('业务失败使Runner任务失败并通过安全事件返回错误', async () => {
    const created = tools.createService({
      id: 'failure',
      runner,
      enabled: {
        tools: ['failure'],
      },
      authorize: () => true,
      createTools: () => ({
        tools: [
          tools.define({
            name: 'failure',
            description: 'Failure',
            parameters: z.object({}),
            handler: () => { throw new Error('private body') },
          }),
        ],
      }),
    })
    expect(created.success).toBe(true)
    if (!created.success)
      throw new Error(created.error.message)
    closed.push(created.data.close)
    const result = await created.data.invoke({ name: 'failure', input: {} }, { scope })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('hai:tools:023')
      expect(result.error.message).not.toContain('private body')
    }
  })

  it('关联目录工厂异常的返回错误与日志，且不记录 SDK 私密内容', async () => {
    const records: LogRecord[] = []
    const output: string[] = []
    const previousLevel = core.logger.getLevel()
    core.logger.configure({ level: 'debug', format: 'json' })
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      output.push(typeof chunk === 'string'
        ? chunk
        : new TextDecoder().decode(chunk))
      return true
    }) as typeof process.stdout.write)
    const stop = core.logger.observe(record => records.push(record))
    const cause = Object.assign(new Error('PRIVATE_CATALOG_SDK_BODY'), {
      apiKey: 'PRIVATE_CATALOG_SDK_KEY',
      request: { input: 'PRIVATE_CATALOG_INPUT' },
    })
    try {
      const created = tools.createService({
        id: 'catalog-diagnostic',
        runner,
        enabled: {},
        authorize: () => true,
        createTools: () => { throw cause },
      })
      expect(created.success).toBe(true)
      if (!created.success)
        throw new Error(created.error.message)
      closed.push(created.data.close)
      const result = await created.data.catalog({ scope, sessionId: 'PRIVATE_CATALOG_INPUT' })
      expect(result.success).toBe(false)
      if (result.success)
        throw new Error('Expected the catalog factory failure')
      expect(result.error.code).toBe(HaiToolsError.EXECUTION_FAILED.code)
      expect(result.error.traceId).toBeTruthy()
      expect(result.error.cause).toBe(cause)
      const safe = core.error.toPublic(result.error)
      expect(safe.traceId).toBe(result.error.traceId)
      const diagnostic = records.find(record => record.message === 'Tool service operation failed')
      expect(diagnostic).toMatchObject({
        level: 'error',
        context: {
          module: 'tools',
          scope: 'service',
          service: 'catalog-diagnostic',
          errorCode: result.error.code,
          traceId: result.error.traceId,
        },
      })
      expect(output.join('')).toContain(result.error.traceId)
      for (const secret of ['PRIVATE_CATALOG_SDK_BODY', 'PRIVATE_CATALOG_SDK_KEY', 'PRIVATE_CATALOG_INPUT']) {
        expect(output.join('')).not.toContain(secret)
        expect(JSON.stringify(records)).not.toContain(secret)
        expect(JSON.stringify(safe)).not.toContain(secret)
      }
    }
    finally {
      stop()
      write.mockRestore()
      core.logger.configure({ level: previousLevel, format: 'pretty' })
    }
  })

  it.each([
    { httpStatus: 503, level: 'error' },
    { httpStatus: 422, level: 'debug' },
  ])('关联 $httpStatus 失败事件与 $level 日志，且不记录输入或私有错误', async ({ httpStatus, level }) => {
    const records: LogRecord[] = []
    const output: string[] = []
    const previousLevel = core.logger.getLevel()
    core.logger.configure({ level: 'debug', format: 'json' })
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      output.push(typeof chunk === 'string'
        ? chunk
        : new TextDecoder().decode(chunk))
      return true
    }) as typeof process.stdout.write)
    const stop = core.logger.observe(record => records.push(record))
    try {
      const created = tools.createService({
        id: 'diagnostic',
        runner,
        enabled: {
          tools: ['failure'],
        },
        authorize: () => true,
        createTools: () => ({
          tools: [
            tools.define({
              name: 'failure',
              description: 'Failure diagnostic',
              parameters: z.object({
                value: z.string(),
              }),
              resultHandler: () => core.err({
                code: 'fixture:provider-failed',
                httpStatus,
                message: httpStatus >= 500
                  ? 'PRIVATE_PROVIDER_MESSAGE'
                  : 'Please check the request',
                cause: Object.assign(new Error('PRIVATE_PROVIDER_CAUSE'), { apiKey: 'PRIVATE_PROVIDER_CREDENTIAL' }),
              }),
            }),
          ],
        }),
      })
      expect(created.success).toBe(true)
      if (!created.success)
        throw new Error(created.error.message)
      closed.push(created.data.close)
      const result = await created.data.invoke({
        name: 'failure',
        input: { value: 'PRIVATE_TOOL_INPUT' },
        idempotencyKey: 'diagnostic-failure',
      }, { scope })
      expect(result.success).toBe(false)
      if (result.success)
        throw new Error('Expected the controlled tool failure')
      expect(result.error.code).toBe('fixture:provider-failed')
      expect(result.error.traceId).toBeTruthy()
      const found = await created.data.find('diagnostic-failure', { scope })
      expect(found.success).toBe(true)
      if (!found.success || !found.data)
        throw new Error('Expected the persistent failure event')
      const event = found.data.events.map(item => z.object({
        type: z.literal('tool-error'),
        error: z.object({
          code: z.string(),
          traceId: z.string(),
          httpStatus: z.number(),
        }),
      }).safeParse(item.data)).find(item => item.success)
      expect(event?.success).toBe(true)
      if (!event?.success)
        throw new Error('Expected the public tool error event')
      expect(event.data.error).toEqual({ code: result.error.code, traceId: result.error.traceId, httpStatus })
      const diagnostic = records.find(record => record.context.service === 'diagnostic' && record.context.tool === 'failure')
      expect(diagnostic).toMatchObject({
        level,
        context: {
          module: 'tools',
          scope: 'service',
          service: 'diagnostic',
          tool: 'failure',
          executionId: found.data.receipt.id,
          errorCode: result.error.code,
          traceId: event.data.error.traceId,
        },
      })
      expect(output.join('')).toContain(event.data.error.traceId)
      expect(output.join('')).toContain('fixture:provider-failed')
      for (const secret of [
        'PRIVATE_PROVIDER_MESSAGE',
        'PRIVATE_PROVIDER_CAUSE',
        'PRIVATE_PROVIDER_CREDENTIAL',
        'PRIVATE_TOOL_INPUT',
      ]) {
        expect(output.join('')).not.toContain(secret)
        expect(JSON.stringify(records)).not.toContain(secret)
        expect(JSON.stringify(found.data.events)).not.toContain(secret)
      }
    }
    finally {
      stop()
      write.mockRestore()
      core.logger.configure({ level: previousLevel, format: 'pretty' })
    }
  })

  it('invoke取消请求写入Runner并等待协作处理器结算为cancelled', async () => {
    let started: () => void = () => {}
    const entered = new Promise<void>((resolve) => {
      started = resolve
    })
    const created = tools.createService({
      id: 'cancellation',
      runner,
      enabled: {
        tools: ['waiting'],
      },
      authorize: () => true,
      createTools: () => ({
        tools: [
          tools.define({
            name: 'waiting',
            description: 'Wait',
            parameters: z.object({}),
            handler: (_input, execution) => {
              started()
              return new Promise<never>((_resolve, reject) => execution.signal.addEventListener('abort', () => reject(execution.signal.reason), { once: true }))
            },
          }),
        ],
      }),
    })
    expect(created.success).toBe(true)
    if (!created.success)
      throw new Error(created.error.message)
    closed.push(created.data.close)
    const controller = new AbortController()
    const invoked = created.data.invoke({ name: 'waiting', input: {}, idempotencyKey: 'abort' }, { scope, signal: controller.signal })
    await entered
    controller.abort()
    const result = await invoked
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe('hai:tools:026')
    const found = await runner.find(scope, 'hai.tools.cancellation.v1', 'abort')
    expect(found.success).toBe(true)
    if (!found.success || !found.data)
      throw new Error('Expected the persistent execution')
    let status = found.data.status
    for (let attempt = 0; attempt < 100 && status !== 'cancelled'; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 10))
      const checked = await runner.get(scope, found.data.id)
      if (!checked.success)
        throw new Error(checked.error.message)
      status = checked.data.status
    }
    expect(status).toBe('cancelled')
  })
})
