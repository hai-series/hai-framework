import type {
  DefineToolOptions,
  Tool,
  ToolAuthorizer,
  ToolExecutionContext,
  ToolRegistryOperations,
  ToolRegistryOptions,
} from './tools-types.js'
import { core } from '@h-ai/core'
import { z } from 'zod'
import { toolsM } from './tools-i18n.js'
import { HaiToolsError } from './tools-types.js'

const logger = core.logger.child({ module: 'tools' })
const portableName = /^[a-z][\w-]{0,63}$/i
const maxTimeout = 2_147_483_647
// 工具扩展统一经过 define，避免结构类型的手写 execute 绕过授权与输入校验。
const definitions = new WeakSet<object>()

function validTimeout(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= maxTimeout
}

/** 在取消时停止等待；实际处理器仍须自行响应 signal。 */
function raceCancellation<T>(run: () => T | Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason)
      return
    }
    const abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    Promise.resolve().then(() => {
      signal.throwIfAborted()
      return run()
    }).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

function joinedAuthorizer(registry?: ToolAuthorizer, execution?: ToolAuthorizer): ToolAuthorizer | undefined {
  if (!registry)
    return execution
  if (!execution)
    return registry
  return async (request) => {
    if (!await registry(request))
      return false
    const { signal, deadline } = request.context
    if (signal.aborted || Date.now() >= deadline)
      return false
    return execution(request)
  }
}

/**
 * 定义带校验、授权与取消的中立工具。定义配置无效时抛出 TypeError。
 * @example 模块内部上下文
 * ```ts
 * const echo = defineTool({ name: 'echo', description: 'Echo', parameters: z.string(), handler: input => input })
 * const result = await echo.execute('hello')
 * if (!result.success) throw new Error(result.error.message)
 * ```
 */
export function defineTool<TInput, TOutput>(definition: DefineToolOptions<TInput, TOutput>): Tool<TInput, TOutput> {
  const { name, description, parameters, handler, resultHandler, timeoutMs = 30_000 } = definition
  if (!portableName.test(name) || !validTimeout(timeoutMs))
    throw new TypeError('Tool definition requires a portable name and a valid timeout')
  if ((typeof handler === 'function') === (typeof resultHandler === 'function'))
    throw new TypeError('Tool definition requires exactly one handler or resultHandler')

  const tool: Tool<TInput, TOutput> = {
    name,
    description,
    parameters,
    toDefinition() {
      const { $schema, ...inputSchema } = z.toJSONSchema(parameters, { io: 'input' })
      return {
        name,
        description,
        inputSchema,
        ...(definition.title
          ? { title: definition.title }
          : {}),
        ...(definition.examples
          ? { examples: definition.examples }
          : {}),
      }
    },
    async execute(input, options = {}) {
      const duration = options.deadline === undefined
        ? options.timeoutMs ?? timeoutMs
        : Math.max(0, options.deadline - Date.now())
      if (!validTimeout(duration) || (options.deadline !== undefined && !Number.isSafeInteger(options.deadline)))
        return core.err(HaiToolsError.VALIDATION_FAILED, toolsM('tools_validationFailed'))
      if (options.signal?.aborted)
        return core.err(HaiToolsError.CANCELLED, toolsM('tools_cancelled'), options.signal.reason)
      if (duration === 0)
        return core.err(HaiToolsError.TIMEOUT, toolsM('tools_timeout'))

      const timeout = new AbortController()
      const timer = setTimeout(() => timeout.abort(new DOMException('Tool deadline exceeded', 'TimeoutError')), duration)
      const signal = options.signal
        ? AbortSignal.any([options.signal, timeout.signal])
        : timeout.signal
      const context: ToolExecutionContext = {
        signal,
        objectId: options.objectId,
        sessionId: options.sessionId,
        deadline: options.deadline ?? Date.now() + duration,
      }
      const interrupted = (cause: unknown) => options.signal?.aborted
        ? core.err(HaiToolsError.CANCELLED, toolsM('tools_cancelled'), cause)
        : core.err(HaiToolsError.TIMEOUT, toolsM('tools_timeout'), cause)
      const refreshDeadline = () => {
        if (Date.now() >= context.deadline && !timeout.signal.aborted)
          timeout.abort(new DOMException('Tool deadline exceeded', 'TimeoutError'))
      }
      const checkActive = () => {
        refreshDeadline()
        signal.throwIfAborted()
      }
      try {
        // 参数校验也受同一截止时间控制，异步或抛错的校验不会越过 HaiResult 边界。
        let parsed: Awaited<ReturnType<typeof parameters.safeParseAsync>>
        try {
          checkActive()
          parsed = await raceCancellation(() => parameters.safeParseAsync(input), signal)
          checkActive()
        }
        catch (cause) {
          refreshDeadline()
          if (signal.aborted)
            return interrupted(cause)
          logger.debug('Tool validation failed', { tool: name })
          return core.err(HaiToolsError.VALIDATION_FAILED, toolsM('tools_validationFailed'), cause)
        }
        if (!parsed.success)
          return core.err(HaiToolsError.VALIDATION_FAILED, toolsM('tools_validationFailed'), parsed.error)

        const authorizer = options.authorize
        if (authorizer) {
          try {
            checkActive()
            const allowed = await raceCancellation(() => authorizer({ toolName: name, input: parsed.data, context }), signal)
            checkActive()
            if (!allowed)
              return core.err(HaiToolsError.FORBIDDEN, toolsM('tools_forbidden'))
          }
          catch (cause) {
            refreshDeadline()
            if (signal.aborted)
              return interrupted(cause)
            logger.debug('Tool authorization failed', { tool: name })
            return core.err(HaiToolsError.FORBIDDEN, toolsM('tools_forbidden'), cause)
          }
        }
        try {
          checkActive()
          // 显式结果处理器保留上游业务错误；普通处理器的 success 字段仍作为数据。
          const output = await raceCancellation(() => resultHandler
            ? resultHandler(parsed.data, context)
            : Promise.resolve(handler!(parsed.data, context)).then(core.ok), signal)
          checkActive()
          return output
        }
        catch (cause) {
          refreshDeadline()
          if (signal.aborted)
            return interrupted(cause)
          logger.warn('Tool execution failed', { tool: name, errorCode: HaiToolsError.EXECUTION_FAILED.code })
          return core.err(HaiToolsError.EXECUTION_FAILED, toolsM('tools_executionFailed'), cause)
        }
      }
      finally {
        clearTimeout(timer)
      }
    },
  }
  Object.freeze(tool)
  definitions.add(tool)
  return tool
}

/**
 * 创建进程内工具注册器，默认拒绝隐式覆盖。
 * @example 模块内部上下文
 * ```ts
 * const registry = createToolRegistry({ authorize: ({ context }) => !!context.objectId })
 * const result = await registry.execute('echo', 'hello', { objectId: 'user-1' })
 * if (!result.success) throw new Error(result.error.message)
 * ```
 */
export function createToolRegistry(options: ToolRegistryOptions = {}): ToolRegistryOperations {
  const registered = new Map<string, Tool>()
  const duplicate = () => core.err(HaiToolsError.ALREADY_REGISTERED, toolsM('tools_alreadyRegistered'))
  const missing = () => core.err(HaiToolsError.NOT_FOUND, toolsM('tools_notFound'))

  const registry: ToolRegistryOperations = {
    register(tool) {
      if (!definitions.has(tool) || !portableName.test(tool.name))
        return core.err(HaiToolsError.VALIDATION_FAILED, toolsM('tools_validationFailed'))
      if (registered.has(tool.name))
        return duplicate()
      registered.set(tool.name, tool)
      return core.ok(undefined)
    },
    registerMany(incoming) {
      const names = new Set<string>()
      for (const tool of incoming) {
        if (!definitions.has(tool) || !portableName.test(tool.name))
          return core.err(HaiToolsError.VALIDATION_FAILED, toolsM('tools_validationFailed'))
        if (registered.has(tool.name) || names.has(tool.name))
          return duplicate()
        names.add(tool.name)
      }
      for (const tool of incoming)
        registered.set(tool.name, tool)
      return core.ok(undefined)
    },
    replace(tool) {
      if (!definitions.has(tool) || !portableName.test(tool.name))
        return core.err(HaiToolsError.VALIDATION_FAILED, toolsM('tools_validationFailed'))
      if (!registered.has(tool.name))
        return missing()
      registered.set(tool.name, tool)
      return core.ok(undefined)
    },
    unregister: name => registered.delete(name),
    get: name => registered.get(name),
    has: name => registered.has(name),
    getNames: () => [
      ...registered.keys(),
    ],
    getDefinitions: () => [
      ...registered.values(),
    ].map(tool => tool.toDefinition()),
    async execute(name, input, execution = {}) {
      const tool = registered.get(name)
      if (!tool)
        return missing()
      return tool.execute(input, {
        ...execution,
        authorize: joinedAuthorizer(options.authorize, execution.authorize),
      })
    },
    async executeAll(calls, execution = {}) {
      const outputs: unknown[] = []
      if (execution.parallel) {
        const results = await Promise.all(calls.map(call => registry.execute(call.name, call.input, execution)))
        for (const result of results) {
          if (!result.success)
            return result
          outputs.push(result.data)
        }
      }
      else {
        for (const call of calls) {
          const result = await registry.execute(call.name, call.input, execution)
          if (!result.success)
            return result
          outputs.push(result.data)
        }
      }
      return core.ok(outputs)
    },
    clear: () => registered.clear(),
    get size() { return registered.size },
  }
  return registry
}
