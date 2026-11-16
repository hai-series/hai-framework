import type { HaiError, HaiResult } from '@h-ai/core'
import type { RunnerContext, RunnerExecution, RunnerJson } from '@h-ai/runner'
import type { ToolRegistryOperations } from '../tools-types.js'
import type { ToolCatalog, ToolReceipt, ToolRun, ToolService, ToolServiceContext, ToolServiceOptions } from './tools-service-types.js'
import { setTimeout as delay } from 'node:timers/promises'
import { core, err, ok } from '@h-ai/core'
import { z } from 'zod'
import { toolsM } from '../tools-i18n.js'
import { tools } from '../tools-main.js'
import { HaiToolsError } from '../tools-types.js'

const logger = core.logger.child({ module: 'tools', scope: 'service' })
const scopeSchema = z.strictObject({
  tenantId: z.string().min(1).max(200),
  userId: z.string().min(1).max(200),
})
const keySchema = z.string().min(1).max(200)
const invocationSchema = z.strictObject({
  name: z.string().regex(/^[a-z][\w-]{0,63}$/i),
  input: z.json(),
  sessionId: keySchema.optional(),
  environmentId: z.string().min(1).max(100).optional(),
})
const receiptSchema = z.strictObject({
  id: z.string().regex(/^[a-f\d]{64}$/i),
  key: keySchema,
})
const timeoutSchema = z.number().int().min(1).max(86_400_000)
const live = new Set(['queued', 'running', 'cancelling'])
const errorEvent = z.object({
  type: z.literal('tool-error'),
  error: z.object({
    code: z.string(),
    message: z.string(),
    httpStatus: z.number(),
    traceId: z.string().optional(),
  }),
})

function invalid(cause?: unknown) {
  return err(HaiToolsError.VALIDATION_FAILED, toolsM('tools_validationFailed'), cause)
}
function forbidden(cause?: unknown) {
  return err(HaiToolsError.FORBIDDEN, toolsM('tools_forbidden'), cause)
}
function failed(cause?: unknown) {
  return err(HaiToolsError.EXECUTION_FAILED, toolsM('tools_executionFailed'), cause)
}
function cancelled(cause?: unknown) {
  return err(HaiToolsError.CANCELLED, toolsM('tools_cancelled'), cause)
}

/** 异步策略与 Schema 也受同一请求信号约束，不取消借入的模块。 */
async function interrupted<T>(run: () => T | Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    Promise.resolve().then(() => {
      signal.throwIfAborted()
      return run()
    }).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

/**
 * 创建共享 Runner 上的工具服务。工厂只登记本服务的处理器，不管理 Runner 生命周期。
 * @example 模块内部上下文
 * ```ts
 * function configure(options: ToolServiceOptions) { return createToolService(options) }
 * ```
 */
export function createToolService(options: ToolServiceOptions): HaiResult<ToolService> {
  const configuration = z.object({
    id: z.string().min(1).max(60).regex(/^[\w.-]+$/),
    runTimeoutMs: timeoutSchema.default(300_000),
    queueTimeoutMs: timeoutSchema.default(300_000),
  }).safeParse(options)
  if (!configuration.success || typeof options.createTools !== 'function' || typeof options.authorize !== 'function')
    return invalid(configuration.error)
  const { id, runTimeoutMs, queueTimeoutMs } = configuration.data
  const kind = `hai.tools.${id}.v1`
  let closed = false

  function context(input: ToolServiceContext, execution?: RunnerContext): ToolServiceContext {
    return {
      scope: scopeSchema.parse(input.scope),
      ...(input.sessionId === undefined
        ? {}
        : {
            sessionId: keySchema.parse(input.sessionId),
          }),
      signal: execution?.signal ?? input.signal,
      ...(execution
        ? { execution }
        : {}),
    }
  }

  async function guarded<T>(input: ToolServiceContext, run: (current: ToolServiceContext) => Promise<HaiResult<T>>): Promise<HaiResult<T>> {
    if (closed)
      return failed()
    if (input.signal?.aborted)
      return cancelled(input.signal.reason)
    try {
      const current = context(input)
      const signal = AbortSignal.any([
        AbortSignal.timeout(runTimeoutMs),
        ...(current.signal
          ? [current.signal]
          : []),
      ])
      return await interrupted(() => run({ ...current, signal }), signal)
    }
    catch (cause) {
      if (input.signal?.aborted)
        return cancelled(cause)
      if (cause instanceof Error && cause.name === 'TimeoutError')
        return err(HaiToolsError.TIMEOUT, toolsM('tools_timeout'), cause)
      if (cause instanceof z.ZodError)
        return invalid(cause)
      const failure = failed(cause)
      if (!failure.success) {
        const safe = core.error.toPublic(failure.error)
        failure.error.traceId = safe.traceId
        logger.error('Tool service operation failed', {
          service: id,
          errorCode: String(safe.code),
          traceId: safe.traceId,
        })
      }
      return failure
    }
  }

  async function resolve(current: ToolServiceContext): Promise<HaiResult<{ registry: ToolRegistryOperations, catalog: ToolCatalog, environments: ReadonlyMap<string, string> }>> {
    const signal = current.signal ?? AbortSignal.timeout(runTimeoutMs)
    const set = await interrupted(() => options.createTools(current), signal)
    const select = options.enabled
    const selection = typeof select === 'function'
      ? await interrupted(() => select(current), signal)
      : select
    const allowed = new Set(selection.tools ?? [])
    const excluded = new Set(selection.exclude ?? [])
    const groups = set.groups ?? []
    for (const group of groups) {
      if (selection.groups?.includes(group.id)) {
        for (const name of group.tools)
          allowed.add(name)
      }
    }
    const registry = tools.createRegistry()
    const registered = registry.registerMany(set.tools.filter(tool => allowed.has(tool.name) && !excluded.has(tool.name)))
    if (!registered.success)
      return registered
    const definitions = registry.getDefinitions()
    const names = new Set(definitions.map(tool => tool.name))
    return ok({
      registry,
      environments: new Map(Object.entries(set.environments ?? {})),
      catalog: {
        tools: definitions,
        groups: groups.map(group => ({
          ...group,
          tools: group.tools.filter(name => names.has(name)),
        })).filter(group => group.tools.length > 0),
      },
    })
  }

  async function authorize(current: ToolServiceContext, name: string, input: unknown, phase: 'submit' | 'execute'): Promise<boolean> {
    try {
      return await interrupted(() => options.authorize({ context: current, name, input, phase }), current.signal ?? AbortSignal.timeout(runTimeoutMs)) === true
    }
    catch (cause) {
      if (current.signal?.aborted)
        throw cause
      return false
    }
  }

  async function execute(input: RunnerJson, execution: RunnerContext): Promise<RunnerJson> {
    const parsed = invocationSchema.parse(input)
    const current = context({ scope: execution.scope, sessionId: parsed.sessionId }, execution)
    const resolved = await resolve(current)
    let result: HaiResult<unknown>
    if (!resolved.success) {
      result = resolved
    }
    else if (!resolved.data.registry.has(parsed.name) || resolved.data.environments.get(parsed.name) !== parsed.environmentId) {
      result = forbidden()
    }
    else {
      result = await resolved.data.registry.execute(parsed.name, parsed.input, {
        signal: execution.signal,
        objectId: JSON.stringify([execution.scope.tenantId, execution.scope.userId]),
        sessionId: current.sessionId,
        authorize: request => authorize(current, parsed.name, request.input, 'execute'),
      })
    }
    if (!result.success) {
      const safe = core.error.toPublic(result.error)
      const diagnostic = {
        service: id,
        tool: parsed.name,
        executionId: execution.id,
        errorCode: String(safe.code),
        traceId: safe.traceId,
      }
      if ((safe.httpStatus ?? 500) >= 500)
        logger.error('Tool execution failed', diagnostic)
      else logger.debug('Tool execution rejected', diagnostic)
      const emitted = await execution.emit({
        type: 'tool-error',
        error: {
          code: String(safe.code),
          message: safe.message,
          httpStatus: safe.httpStatus ?? 500,
          ...(safe.traceId
            ? { traceId: safe.traceId }
            : {}),
        },
      })
      if (!emitted.success)
        logger.warn('Tool failure event could not be persisted', { executionId: execution.id, code: emitted.error.code })
      throw new Error('Tool operation failed')
    }
    const output = z.json().safeParse(result.data === undefined
      ? null
      : result.data)
    if (!output.success)
      throw new Error('Tool output is not a persistent JSON result')
    return output.data
  }

  const registration = options.runner.register(kind, execute)
  if (!registration.success)
    return registration

  async function find(receipt: ToolReceipt, current: ToolServiceContext): Promise<HaiResult<RunnerExecution>> {
    const parsed = receiptSchema.safeParse(receipt)
    if (!parsed.success)
      return invalid(parsed.error)
    const found = await options.runner.find(current.scope, kind, receipt.key)
    if (!found.success)
      return found
    return found.data?.id === receipt.id
      ? ok(found.data)
      : err(HaiToolsError.NOT_FOUND, toolsM('tools_notFound'))
  }

  async function project(execution: RunnerExecution, receipt: ToolReceipt, current: ToolServiceContext, after = 0): Promise<HaiResult<ToolRun>> {
    const events = await options.runner.events(current.scope, execution.id, after, 100)
    if (!events.success)
      return events
    return ok({
      receipt,
      status: execution.status,
      ...(execution.output === undefined
        ? {}
        : { output: execution.output }),
      ...(execution.failure
        ? { failure: execution.failure }
        : {}),
      events: events.data,
      next: events.data.at(-1)?.sequence ?? after,
    })
  }

  const service: ToolService = {
    find: (idempotencyKey, input) => guarded(input, async (current) => {
      const key = keySchema.safeParse(idempotencyKey)
      if (!key.success)
        return invalid(key.error)
      const found = await options.runner.find(current.scope, kind, key.data)
      if (!found.success)
        return found
      return found.data
        ? project(found.data, { id: found.data.id, key: key.data }, current)
        : ok(undefined)
    }),
    catalog: input => guarded(input, async (current) => {
      const resolved = await resolve(current)
      return resolved.success
        ? ok(resolved.data.catalog)
        : resolved
    }),
    submit: (request, input) => guarded(input, async (current) => {
      const parsed = invocationSchema.safeParse({
        name: request.name,
        input: request.input,
        ...(current.sessionId === undefined
          ? {}
          : { sessionId: current.sessionId }),
      })
      const key = keySchema.safeParse(request.idempotencyKey ?? core.id.uuid())
      if (!parsed.success || !key.success)
        return invalid()
      const resolved = await resolve(current)
      if (!resolved.success)
        return resolved
      const tool = resolved.data.registry.get(parsed.data.name)
      if (!tool)
        return forbidden()
      const signal = current.signal ?? AbortSignal.timeout(runTimeoutMs)
      let validation: Awaited<ReturnType<typeof tool.parameters.safeParseAsync>>
      try {
        validation = await interrupted(() => tool.parameters.safeParseAsync(parsed.data.input), signal)
      }
      catch (cause) {
        if (signal.aborted)
          throw cause
        return invalid(cause)
      }
      if (!validation.success)
        return invalid(validation.error)
      if (!await authorize(current, parsed.data.name, validation.data, 'submit'))
        return forbidden()
      current.signal?.throwIfAborted()
      const environmentId = resolved.data.environments.get(parsed.data.name)
      const payload = {
        ...parsed.data,
        ...(environmentId
          ? { environmentId }
          : {}),
      }
      const accepted = await options.runner.submit({
        kind,
        scope: current.scope,
        input: payload,
        ...(environmentId
          ? { environmentId }
          : {}),
        idempotencyKey: key.data,
        capacityClass: environmentId ? 'tool' : 'default',
        runTimeoutMs,
        queueTimeoutMs,
      })
      if (!accepted.success)
        return accepted
      return ok({
        receipt: { id: accepted.data.id, key: key.data },
        status: accepted.data.status,
        ...(accepted.data.output === undefined
          ? {}
          : { output: accepted.data.output }),
        events: [],
        next: 0,
      })
    }),
    inspect: (receipt, input, cursor = {}) => guarded(input, async (current) => {
      const after = z.number().int().min(0).max(100_000).safeParse(cursor.after ?? 0)
      if (!after.success)
        return invalid(after.error)
      const found = await find(receipt, current)
      return found.success
        ? project(found.data, receipt, current, after.data)
        : found
    }),
    cancel: (receipt, input) => guarded(input, async (current) => {
      const found = await find(receipt, current)
      if (!found.success)
        return found
      const cancelled = await options.runner.cancel(current.scope, found.data.id)
      return cancelled.success
        ? project(cancelled.data, receipt, current)
        : cancelled
    }),
    async invoke(request, input) {
      const submitted = await service.submit(request, input)
      if (!submitted.success)
        return submitted
      let current = submitted.data
      let lastError: HaiError | undefined
      const signal = input.signal
        ? AbortSignal.any([
            input.signal,
            AbortSignal.timeout(runTimeoutMs + queueTimeoutMs + 1000),
          ])
        : AbortSignal.timeout(runTimeoutMs + queueTimeoutMs + 1000)
      try {
        while (live.has(current.status)) {
          await delay(40, undefined, { signal })
          const inspected = await service.inspect(current.receipt, { ...input, signal }, { after: current.next })
          if (!inspected.success)
            return inspected
          current = inspected.data
          for (const event of current.events) {
            const parsed = errorEvent.safeParse(event.data)
            if (parsed.success)
              lastError = parsed.data.error
          }
        }
        if (current.status === 'succeeded')
          return ok(current.output ?? null)
        // 幂等提交可能直接返回终态，失败事件仍从唯一的 Runner 事件流恢复。
        while (!lastError && (current.events.length === 100 || current.next === 0)) {
          const inspected = await service.inspect(current.receipt, { ...input, signal }, { after: current.next })
          if (!inspected.success)
            return inspected
          current = inspected.data
          for (const event of current.events) {
            const parsed = errorEvent.safeParse(event.data)
            if (parsed.success)
              lastError = parsed.data.error
          }
          if (current.events.length < 100)
            break
        }
        if (lastError)
          return err(lastError)
        if (current.status === 'cancelled')
          return cancelled()
        if (current.failure === 'run-timeout' || current.failure === 'queue-timeout')
          return err(HaiToolsError.TIMEOUT, toolsM('tools_timeout'))
        return failed()
      }
      catch (cause) {
        if (input.signal?.aborted)
          return cancelled(cause)
        return err(HaiToolsError.TIMEOUT, toolsM('tools_timeout'), cause)
      }
      finally {
        if (signal.aborted && live.has(current.status)) {
          const stopped = await options.runner.cancel(input.scope, current.receipt.id)
          if (!stopped.success)
            logger.warn('Tool cancellation could not be requested', { executionId: current.receipt.id, code: stopped.error.code })
        }
      }
    },
    close() {
      if (closed)
        return
      closed = true
      registration.data()
    },
  }
  return ok(service)
}
