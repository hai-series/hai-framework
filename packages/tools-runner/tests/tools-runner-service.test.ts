import type { LogRecord } from '@h-ai/core'
import type { RunnerFunctions } from '@h-ai/runner'
import type { ToolServiceAuthorization, ToolServiceOptions } from '../src/index.js'
import process from 'node:process'
import { setImmediate } from 'node:timers/promises'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { runner as frameworkRunner, HaiRunnerError } from '@h-ai/runner'
import { HaiToolsError, tools } from '@h-ai/tools'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { toolsRunner } from '../src/index.js'

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

function createService(enabled = ['echo'], overrides: Partial<Pick<ToolServiceOptions, 'authorize' | 'createTools' | 'runTimeoutMs'>> = {}) {
  const result = toolsRunner.createService({
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
    ...overrides,
  })
  expect(result.success).toBe(true)
  if (!result.success)
    throw new Error(result.error.message)
  closed.push(result.data.close)
  return result.data
}

function pauseRunnerSubmit() {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const submit = runner.submit
  const spy = vi.spyOn(runner, 'submit').mockImplementation(async (input) => {
    entered.resolve()
    await release.promise
    return submit(input)
  })
  return {
    entered: entered.promise,
    release: release.resolve,
    restore: () => spy.mockRestore(),
  }
}

describe('toolsRunner.createService', () => {
  it('preserves queued jobs and receipts across the adapter cutover in both directions', async () => {
    const api = frameworkRunner.create()
    let closeFacade: (() => void) | undefined
    const receiptKey = 'existing-before-cutover'
    const kind = 'hai.tools.compatibility.v1'
    const sessionId = 'original-session'
    const received = vi.fn()
    const options: Omit<ToolServiceOptions, 'runner'> = {
      id: 'compatibility',
      enabled: {
        tools: ['echo'],
      },
      authorize: () => true,
      createTools: context => ({
        tools: [
          tools.define({
            name: 'echo',
            description: 'Echo',
            parameters: z.object({
              value: z.string(),
            }),
            handler(input) {
              received(context.execution?.id, context.scope, context.sessionId)
              return input
            },
          }),
        ],
      }),
    }

    try {
      expect((await api.init({ nodeId: 'cutover-api', executor: false })).success).toBe(true)
      // 写入原服务提交的持久协议，模拟升级时已经排队且客户端已保存回执。
      const legacy = await api.submit({
        scope,
        kind,
        input: {
          name: 'echo',
          input: { value: 'retained' },
          sessionId,
        },
        idempotencyKey: receiptKey,
        capacityClass: 'default',
        runTimeoutMs: 300_000,
        queueTimeoutMs: 300_000,
      })
      expect(legacy.success).toBe(true)
      if (!legacy.success)
        throw new Error(legacy.error.message)
      const receipt = { id: legacy.data.id, key: receiptKey }

      const facade = toolsRunner.createService({ ...options, runner: api })
      expect(facade.success).toBe(true)
      if (!facade.success)
        throw new Error(facade.error.message)
      closeFacade = facade.data.close
      expect(await facade.data.find(receiptKey, { scope, sessionId })).toMatchObject({
        success: true,
        data: { receipt, status: 'queued' },
      })
      expect(await facade.data.submit({
        name: 'echo',
        input: { value: 'retained' },
        idempotencyKey: receiptKey,
      }, { scope, sessionId })).toMatchObject({
        success: true,
        data: { receipt, status: 'queued' },
      })

      const worker = toolsRunner.createService({ ...options, runner })
      expect(worker.success).toBe(true)
      if (!worker.success)
        throw new Error(worker.error.message)
      closed.push(worker.data.close)
      await expect.poll(() => facade.data.inspect(receipt, { scope, sessionId })).toMatchObject({
        success: true,
        data: {
          receipt,
          status: 'succeeded',
          output: { value: 'retained' },
        },
      })
      expect(received).toHaveBeenCalledExactlyOnceWith(receipt.id, scope, sessionId)

      // 切换回按旧任务名和载荷消费的处理器，反向核对新入口写入的持久协议。
      worker.data.close()
      const legacyPayload = vi.fn()
      const previousWorker = runner.register(kind, async (payload, context) => {
        legacyPayload(payload, context.scope)
        return { value: 'existing worker' }
      })
      expect(previousWorker.success).toBe(true)
      if (!previousWorker.success)
        throw new Error(previousWorker.error.message)
      closed.push(previousWorker.data)

      const fresh = await facade.data.submit({
        name: 'echo',
        input: { value: 'queued after cutover' },
        idempotencyKey: 'moved-frontend',
      }, { scope, sessionId })
      expect(fresh.success).toBe(true)
      if (!fresh.success)
        throw new Error(fresh.error.message)
      await expect.poll(() => facade.data.inspect(fresh.data.receipt, { scope, sessionId })).toMatchObject({
        success: true,
        data: {
          receipt: fresh.data.receipt,
          status: 'succeeded',
          output: { value: 'existing worker' },
        },
      })
      expect(legacyPayload).toHaveBeenCalledExactlyOnceWith({
        name: 'echo',
        input: { value: 'queued after cutover' },
        sessionId,
      }, scope)
    }
    finally {
      closeFacade?.()
      expect((await api.close()).success).toBe(true)
    }
  })

  it.each(['constructor', 'toString'])('执行合法的原型同名工具 %s，不误绑定继承的环境属性', async (name) => {
    const created = toolsRunner.createService({
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
    const created = toolsRunner.createService({
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
    const created = toolsRunner.createService({
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
    const request = { name: 'denied', input: {}, idempotencyKey: 'one' }
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await created.data.invoke(request, { scope })
      expect(result.success).toBe(false)
      if (!result.success)
        expect(result.error.code).toBe(HaiToolsError.FORBIDDEN.code)
    }
    const found = await created.data.find(request.idempotencyKey, { scope })
    expect(found.success).toBe(true)
    if (!found.success || !found.data)
      throw new Error('Expected the persisted tool run')
    expect(found.data.failure).toBe('handler-failed')
    const submitted = await created.data.submit(request, { scope })
    expect(submitted.success).toBe(true)
    if (submitted.success) {
      expect(submitted.data.receipt).toEqual(found.data.receipt)
      expect(submitted.data.status).toBe('failed')
      expect(submitted.data.failure).toBe(found.data.failure)
    }
  })
  it('保留工具自己的短截止时间，Runner只提供更长的外层上限', async () => {
    const created = toolsRunner.createService({
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

  it('执行期的宿主授权接收工具的短截止信号', async () => {
    const decision = Promise.withResolvers<boolean>()
    const handler = vi.fn(() => 'written')
    let executionSignal: AbortSignal | undefined
    const created = toolsRunner.createService({
      id: 'authorization-deadline',
      runner,
      runTimeoutMs: 5000,
      enabled: {
        tools: ['budget'],
      },
      authorize({ context, phase }) {
        if (phase === 'submit')
          return true
        executionSignal = context.signal
        return decision.promise
      },
      createTools: () => ({
        tools: [
          tools.define({
            name: 'budget',
            description: 'Deadline',
            parameters: z.object({}),
            timeoutMs: 100,
            handler,
          }),
        ],
      }),
    })
    expect(created.success).toBe(true)
    if (!created.success)
      throw new Error(created.error.message)
    closed.push(created.data.close)
    try {
      const result = await created.data.invoke({ name: 'budget', input: {} }, { scope })
      expect(result.success).toBe(false)
      if (!result.success)
        expect(result.error.code).toBe(HaiToolsError.TIMEOUT.code)
      expect(executionSignal?.aborted).toBe(true)
      expect(handler).not.toHaveBeenCalled()
    }
    finally {
      decision.resolve(false)
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
    const api = toolsRunner.createService({ ...options, runner })
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
      const executor = toolsRunner.createService({ ...options, runner: worker })
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

  it('跨节点错误沿用首次提交的语言，旧任务使用执行节点的语言', async () => {
    await runner.close()
    expect((await runner.init({ nodeId: 'locale-api', executor: false })).success).toBe(true)
    const worker = frameworkRunner.create()
    const options = {
      id: 'localized',
      createTools: () => ({
        tools: [
          tools.define({
            name: 'localized',
            description: 'Localized failure',
            parameters: z.object({}),
            handler: () => null,
          }),
        ],
      }),
      enabled: {
        tools: ['localized'],
      },
      authorize: ({ phase }: ToolServiceAuthorization) => phase === 'submit',
    }
    const api = toolsRunner.createService({ ...options, runner })
    expect(api.success).toBe(true)
    if (!api.success)
      throw new Error(api.error.message)
    closed.push(api.data.close)

    const context = { scope }
    const english = { name: 'localized', input: {}, idempotencyKey: 'english' }
    const japanese = { ...english, idempotencyKey: 'japanese' }
    const legacy = { ...english, idempotencyKey: 'legacy' }
    const first = await core.i18n.runWithLocale('en-US', () => api.data.submit(english, context))
    const replay = await core.i18n.runWithLocale('ja-JP', () => api.data.submit(english, context))
    expect(first.success).toBe(true)
    expect(replay.success).toBe(true)
    if (first.success && replay.success)
      expect(replay.data.receipt).toEqual(first.data.receipt)
    expect((await core.i18n.runWithLocale('ja-JP', () => api.data.submit(japanese, context))).success).toBe(true)
    const old = await runner.submit({
      kind: 'hai.tools.localized.v1',
      scope,
      input: { name: legacy.name, input: legacy.input },
      idempotencyKey: legacy.idempotencyKey,
    })
    expect(old.success).toBe(true)

    try {
      const started = await core.i18n.runWithLocale('zh-CN', () => worker.init({ nodeId: 'locale-worker', pollMs: 10 }))
      expect(started.success).toBe(true)
      const executor = toolsRunner.createService({ ...options, runner: worker })
      expect(executor.success).toBe(true)
      if (!executor.success)
        throw new Error(executor.error.message)
      closed.push(executor.data.close)

      expect(await core.i18n.runWithLocale('ja-JP', () => api.data.invoke(english, context))).toMatchObject({
        success: false,
        error: {
          code: HaiToolsError.FORBIDDEN.code,
          message: expect.stringContaining('Tool execution is not authorized'),
          traceId: expect.any(String),
        },
      })
      expect(await core.i18n.runWithLocale('en-US', () => api.data.invoke(japanese, context))).toMatchObject({
        success: false,
        error: {
          code: HaiToolsError.FORBIDDEN.code,
          message: expect.stringContaining('このツールを実行する権限がありません'),
          traceId: expect.any(String),
        },
      })
      expect(await core.i18n.runWithLocale('en-US', () => api.data.invoke(legacy, context))).toMatchObject({
        success: false,
        error: {
          code: HaiToolsError.FORBIDDEN.code,
          message: expect.stringContaining('无权执行此工具'),
          traceId: expect.any(String),
        },
      })
    }
    finally {
      await worker.close()
    }
  })

  it('业务失败使Runner任务失败并通过安全事件返回错误', async () => {
    const created = toolsRunner.createService({
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
      const created = toolsRunner.createService({
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
      const created = toolsRunner.createService({
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

  it('持久化发起前取消时不调用 Runner', async () => {
    const entered = Promise.withResolvers<void>()
    const authorization = Promise.withResolvers<boolean>()
    const service = createService(['echo'], {
      authorize() {
        entered.resolve()
        return authorization.promise
      },
    })
    const submit = vi.spyOn(runner, 'submit')
    const controller = new AbortController()
    try {
      const pending = service.submit({
        name: 'echo',
        input: { value: 'before' },
      }, { scope, signal: controller.signal })
      await entered.promise
      controller.abort()
      const result = await pending
      authorization.resolve(true)
      await setImmediate()
      expect(result.success).toBe(false)
      if (!result.success)
        expect(result.error.code).toBe(HaiToolsError.CANCELLED.code)
      expect(submit).not.toHaveBeenCalled()
    }
    finally {
      authorization.resolve(false)
      submit.mockRestore()
    }
  })

  it.each(['cancel', 'timeout', 'conflict'])('持久化发起后发生 %s 仍等待真实提交结果', async (scenario) => {
    const admissionEnded = Promise.withResolvers<void>()
    const service = createService(['echo'], {
      runTimeoutMs: 250,
      authorize({ context, phase }) {
        if (phase === 'submit')
          context.signal?.addEventListener('abort', () => admissionEnded.resolve(), { once: true })
        return true
      },
    })
    const controller = new AbortController()
    const request = {
      name: 'echo',
      input: { value: 'after' },
      idempotencyKey: 'paused',
    }
    if (scenario === 'conflict') {
      const existing = await service.submit({
        ...request,
        input: { value: 'existing' },
      }, { scope })
      expect(existing.success).toBe(true)
    }
    const commit = pauseRunnerSubmit()
    try {
      let settled = false
      const pending = service.submit(request, { scope, signal: controller.signal }).then((result) => {
        settled = true
        return result
      })
      await commit.entered
      if (scenario !== 'timeout')
        controller.abort()
      await admissionEnded.promise
      await setImmediate()
      expect(settled).toBe(false)
      commit.release()
      const submitted = await pending
      if (scenario === 'conflict') {
        expect(submitted.success).toBe(false)
        if (!submitted.success)
          expect(submitted.error.code).toBe(HaiRunnerError.CONFLICT.code)
        return
      }
      expect(submitted.success).toBe(true)
      if (!submitted.success)
        throw new Error(submitted.error.message)
      const found = await service.find(request.idempotencyKey, { scope })
      expect(found.success).toBe(true)
      if (found.success)
        expect(found.data?.receipt).toEqual(submitted.data.receipt)
    }
    finally {
      commit.release()
      commit.restore()
    }
  })

  it.each([false, true])('invoke 在提交期间取消时按调用方是否提供幂等键处理（%s）', async (hasKey) => {
    const service = createService(['waiting'], {
      createTools: () => ({
        tools: [
          tools.define({
            name: 'waiting',
            description: 'Wait for cancellation',
            parameters: z.object({}),
            handler: (_input, { signal }) => new Promise<never>((_resolve, reject) => {
              signal.addEventListener('abort', () => reject(signal.reason), { once: true })
            }),
          }),
        ],
      }),
    })
    const request = {
      name: 'waiting',
      input: {},
      ...(hasKey
        ? { idempotencyKey: 'existing' }
        : {}),
    }
    const existing = hasKey
      ? await service.submit(request, { scope })
      : undefined
    if (existing)
      expect(existing.success).toBe(true)

    const commit = pauseRunnerSubmit()
    const cancel = vi.spyOn(runner, 'cancel')
    const controller = new AbortController()
    try {
      const pending = service.invoke(request, { scope, signal: controller.signal })
      await commit.entered
      controller.abort()
      commit.release()
      const result = await pending
      expect(result.success).toBe(false)
      if (result.success)
        throw new Error('Expected invocation cancellation')
      expect(result.error.code).toBe(HaiToolsError.CANCELLED.code)
      const receipt = z.object({
        id: z.string(),
        key: z.string(),
      }).parse(result.error.ext?.receipt)
      const found = await service.find(receipt.key, { scope })
      expect(found.success).toBe(true)
      if (found.success)
        expect(found.data?.receipt).toEqual(receipt)
      if (existing?.success) {
        expect(receipt).toEqual(existing.data.receipt)
        expect(cancel).not.toHaveBeenCalled()
        if (found.success)
          expect(['queued', 'running']).toContain(found.data?.status)
      }
      else {
        expect(cancel).toHaveBeenCalledExactlyOnceWith(scope, receipt.id)
        if (found.success)
          expect(['cancelling', 'cancelled']).toContain(found.data?.status)
      }
    }
    finally {
      commit.release()
      commit.restore()
      cancel.mockRestore()
    }
  })

  it('invoke取消请求写入Runner并等待协作处理器结算为cancelled', async () => {
    let started: () => void = () => {}
    const entered = new Promise<void>((resolve) => {
      started = resolve
    })
    const created = toolsRunner.createService({
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
