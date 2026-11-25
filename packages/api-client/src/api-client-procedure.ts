import type { AnyContractProcedure, AnyContractRouter, ContractRouterClient } from '@orpc/contract'
import type { JsonifiedClient } from '@orpc/openapi-client'
import type { ApiRequestObserver, ApiRequestRecord } from './api-client-types.js'
import { core } from '@h-ai/core'
import { getContractRouter, isContractProcedure } from '@orpc/contract'
import { apiClientM } from './api-client-i18n.js'
import { conformsToResponseSchema, mapClientError } from './api-client-response.js'
import { HaiApiClientError } from './api-client-types.js'

const REQUEST_OBSERVATION = Symbol('hai.api-client.request-observation')

/**
 * 内部构造的可变摘要，不对消费者暴露写入能力。
 * @example 模块内部上下文
 * ```ts
 * function update(record: MutableRequestRecord) { record.attempts += 1 }
 * ```
 */
export type MutableRequestRecord = { -readonly [Key in keyof ApiRequestRecord]: ApiRequestRecord[Key] }

/**
 * 构造只记录属性路径的内部代理，末端调用交给 callProcedure；不在访问属性时发送请求。
 * @param state - 当前 rawClient，可在 close 后变为 null。
 * @param state.rawClient - 当前 oRPC 客户端；未初始化或关闭后为 null。
 * @param state.observers - 本实例逻辑请求订阅集合。
 * @param node - 当前契约节点；只代理实际存在的子节点。
 * @param path - 已访问的 contract 属性路径。
 * @returns 动态代理；由契约公开类型约束调用路径，不对外承诺任意字符串 API。
 *
 * @example 模块内部上下文
 * ```ts
 * function proxyIam(router: AnyContractRouter) {
 *   // 直到调用代理方法才读取客户端状态。
 *   return createProcedureProxy({ rawClient: null }, router, ['iam'])
 * }
 * ```
 */
export function createProcedureProxy<TContract extends AnyContractRouter>(
  state: { rawClient: JsonifiedClient<ContractRouterClient<TContract>> | null, observers?: Set<ApiRequestObserver> },
  node: AnyContractRouter,
  path: string[],
): unknown {
  return new Proxy(() => undefined, {
    get(_t, property) {
      if (typeof property !== 'string' || property === 'then' || !Object.hasOwn(node, property))
        return undefined
      const child = getContractRouter(node, [property])
      return child
        ? createProcedureProxy(state, child, [...path, property])
        : undefined
    },
    apply(_t, _thisArg, args) {
      if (isContractProcedure(node))
        return callObservedProcedure(state.rawClient, node, path, args, state.observers)
      return core.err(HaiApiClientError.UNKNOWN, apiClientM('apiClient_unknown'))
    },
  })
}

/** 不复制业务入参；通过 oRPC 每次调用的 context 将同一关联传给传输层。 */
async function callObservedProcedure(rawClient: unknown, procedure: AnyContractProcedure, path: string[], args: unknown[], observers?: ReadonlySet<ApiRequestObserver>): Promise<unknown> {
  const record: MutableRequestRecord = {
    requestId: core.context.get().requestId ?? core.id.uuid(),
    procedure: path.join('.'),
    timestamp: Date.now(),
    duration: 0,
    success: false,
    attempts: 0,
  }
  const provided = args[1] && typeof args[1] === 'object'
    ? args[1] as Record<string, unknown>
    : {}
  const providedContext = provided.context && typeof provided.context === 'object'
    ? provided.context
    : {}
  const options = {
    ...provided,
    context: { ...providedContext, [REQUEST_OBSERVATION]: record },
  }
  let result = await callProcedure(rawClient, procedure, path, [args[0], options])
  record.duration = Math.max(0, Date.now() - record.timestamp)
  record.success = !(result && typeof result === 'object' && 'success' in result && result.success === false)
  if (!record.success && result && typeof result === 'object' && 'error' in result && result.error && typeof result.error === 'object' && 'code' in result.error) {
    record.errorCode = String(result.error.code)
    if ('message' in result.error && typeof result.error.message === 'string') {
      const error = result.error as Parameters<typeof core.error.toPublic>[0]
      const errorTraceId = error.traceId && /^[\w.:-]{1,128}$/.test(error.traceId)
        ? error.traceId
        : undefined
      const receivedId = errorTraceId ?? record.requestId
      record.requestId = receivedId
      const safe = core.error.toPublic({ ...error, publicExt: error.ext }, receivedId)
      if (error.cause && typeof error.cause === 'object' && !Array.isArray(error.cause)) {
        const metadata: Record<string, unknown> = {}
        for (const key of [
          'orpcCode',
          'status',
          'transportCode',
          'serverTime',
          'direction',
          'stage',
          'limitBytes',
          'actualBytes',
        ]) {
          const value: unknown = Reflect.get(error.cause, key)
          if (typeof value === 'number' || typeof value === 'string')
            metadata[key] = core.sanitize.sanitizeSensitiveValue(value, key)
        }
        if (Object.keys(metadata).length)
          safe.cause = metadata
      }
      // 结构化服务端错误由服务端记录。缺少该关联标识的协议或传输失败由客户端诊断。
      const serverReported = record.status !== undefined && errorTraceId !== undefined
      const status = record.status !== undefined && record.status >= 400
        ? record.status
        : safe.httpStatus
      const cause = error.cause instanceof Error
        ? error.cause
        : undefined
      const networkCause = cause?.cause ?? cause
      const causeCode = networkCause && typeof networkCause === 'object' && 'code' in networkCause
        && typeof networkCause.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(networkCause.code)
        ? networkCause.code
        : undefined
      const logContext = {
        traceId: safe.traceId,
        requestId: record.requestId,
        procedure: record.procedure,
        status,
        errorCode: safe.code,
        causeName: cause?.name,
        causeCode,
        diagnostic: !Array.isArray(safe.cause)
          ? safe.cause
          : undefined,
      }
      if (serverReported || (status !== undefined && status >= 400 && status < 500))
        core.logger.debug('API request failed', logContext)
      else
        core.logger.error('API request failed', logContext)
      result = { ...result, error: safe }
    }
  }
  for (const observer of observers ?? []) {
    try {
      const observed: unknown = observer(Object.freeze({ ...record }))
      if (observed instanceof Promise)
        void observed.catch(() => {})
    }
    catch { /* 观察失败不改变请求结果。 */ }
  }
  return result
}

/**
 * 解析真实 rawClient 中的 procedure 并调用，将调用异常映射为标准 HaiResult 失败。
 * @param rawClient - 已构建的 oRPC client；缺省时返回 NOT_INITIALIZED。
 * @param procedure - 当前契约操作及其响应 Schema。
 * @param path - 契约层级路径。
 * @param args - 原始 procedure 参数。
 * @returns 原契约结果或客户端失败，不把失败改成成功。
 *
 * @example 模块内部上下文
 * ```ts
 * async function callBeforeInit(currentUser: AnyContractProcedure) {
 *   // 未初始化返回失败 HaiResult。
 *   return callProcedure(null, currentUser, ['iam', 'auth', 'currentUser'], [])
 * }
 * ```
 */
async function callProcedure(
  rawClient: unknown,
  procedure: AnyContractProcedure,
  path: string[],
  args: unknown[],
): Promise<unknown> {
  if (!rawClient) {
    return core.err(HaiApiClientError.NOT_INITIALIZED, apiClientM('apiClient_notInitialized'))
  }

  // 沿 path 解析 rawClient[a][b][c]...
  let target: unknown = rawClient
  for (const segment of path) {
    if ((typeof target !== 'object' || target === null) && typeof target !== 'function') {
      return core.err(HaiApiClientError.UNKNOWN, apiClientM('apiClient_unknown'))
    }
    target = Reflect.get(target as object, segment)
  }
  if (typeof target !== 'function') {
    return core.err(HaiApiClientError.UNKNOWN, apiClientM('apiClient_unknown'))
  }

  try {
    const output = await (target as (...a: unknown[]) => Promise<unknown>)(...args)
    return conformsToResponseSchema(procedure['~orpc'].outputSchema, output)
      ? output
      : core.err(HaiApiClientError.VALIDATION_FAILED, apiClientM('apiClient_responseValidationFailed'))
  }
  catch (error) {
    return mapClientError(error)
  }
}

/**
 * 从内部调用上下文读取贯穿发送与重试的可变摘要。
 * @example 模块内部上下文
 * ```ts
 * const absent = getObservation({}) // 此调用没有诊断摘要。
 * ```
 */
export function getObservation(context: Record<PropertyKey, unknown>): MutableRequestRecord | undefined {
  const record = context[REQUEST_OBSERVATION]
  return record && typeof record === 'object' && 'requestId' in record
    ? record as MutableRequestRecord
    : undefined
}
