/**
 * @h-ai/ai — A2A 子功能组装
 *
 * 实现 A2A 操作接口：共享 journal 任务状态、消息日志、远端调用。
 * 包含延迟初始化代理工厂（`createA2ALazyProxy`）和完整操作实例工厂（`createA2AOperations`）。
 * @module ai-a2a-functions
 */

import type { Message, Task } from '@a2a-js/sdk'
import type { AgentExecutor } from '@a2a-js/sdk/server'
import type { HaiResult } from '@h-ai/core'

import type { A2AConfig } from '../ai-config.js'
import type { AIRelStore, AIStoreProvider } from '../store/ai-store-types.js'

import type { A2AJournal, A2ARuntimeOptions } from './ai-a2a-runtime.js'
import type {
  A2AAgentCardConfig,
  A2ACallOptions,
  A2ACallResult,
  A2AHandleResult,
  A2AMessageRecord,
  A2AOperations,
  A2ATaskFilter,
} from './ai-a2a-types.js'

import { A2AClient } from '@a2a-js/sdk/client'
import { JsonRpcTransportHandler, ServerCallContext as ServerCallContextImpl } from '@a2a-js/sdk/server'
import { core, err, ok } from '@h-ai/core'

import { aiM } from '../ai-i18n.js'
import { HaiAIError } from '../ai-types.js'
import { buildAgentCard } from './ai-a2a-card.js'
import { SharedA2ARequestHandler } from './ai-a2a-runtime.js'

const logger = core.logger.child({ module: 'ai', scope: 'a2a' })
const DEFAULT_A2A_CALL_TIMEOUT_MS = 60_000

/**
 * 校验通过的真实远端地址与去除查询和片段后的诊断标签。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const validated = validateRemoteUrl('https://trusted-agent.example.com/a2a?route=docs')
 * const request: ValidatedRemoteUrl = validated
 * const safeLabel = request.safeLabel // 日志不记录 query/hash。
 * ```
 */
interface ValidatedRemoteUrl {
  requestUrl: string
  safeLabel: string
}

/**
 * 校验远端 Agent URL 的基础边界。
 *
 * A2A 目标通常来自服务端配置；这里拒绝非 HTTP(S) 协议和 URL 内嵌凭据，
 * 并生成不含 query/hash 的安全标签用于错误与持久化记录。部署侧仍应对可访问 origin
 * 使用白名单，因为 DNS 解析与重定向策略属于应用网络边界。
 */
function validateRemoteUrl(remoteUrl: string): ValidatedRemoteUrl {
  const parsed = new URL(remoteUrl)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
    throw new Error('A2A remote URL must use HTTP or HTTPS')
  if (parsed.username || parsed.password)
    throw new Error('A2A remote URL must not contain credentials')

  return {
    requestUrl: parsed.toString(),
    safeLabel: `${parsed.origin}${parsed.pathname}`,
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined
}

function isTaskResult(value: unknown): value is Task {
  return asRecord(value)?.status !== undefined
}

function isMessageResult(value: unknown): value is Message {
  return Array.isArray(asRecord(value)?.parts)
}

function getPartText(part: unknown): string | undefined {
  const record = asRecord(part)
  return typeof record?.text === 'string' ? record.text : undefined
}

function getTextParts(parts: readonly unknown[] | undefined): string[] {
  return parts?.map(getPartText).filter((text): text is string => text != null) ?? []
}

async function executeRemoteAgentCall(
  remoteUrl: string,
  message: string,
  options?: A2ACallOptions,
): Promise<HaiResult<A2ACallResult>> {
  let safeLabel = '(invalid or unavailable URL)'
  try {
    const validatedUrl = validateRemoteUrl(remoteUrl)
    const requestUrl = validatedUrl.requestUrl
    safeLabel = validatedUrl.safeLabel
    const customHeaders = options?.headers
    const timeoutMs = Math.max(1, options?.timeout ?? DEFAULT_A2A_CALL_TIMEOUT_MS)
    const client = new A2AClient(requestUrl, {
      fetchImpl: ((input: RequestInfo | URL, init?: RequestInit) => {
        const existingHeaders = init?.headers
          ? Object.fromEntries(new Headers(init.headers as HeadersInit).entries())
          : {}
        const signals = [init?.signal, AbortSignal.timeout(timeoutMs)].filter((signal): signal is AbortSignal => Boolean(signal))
        const fetchInit: RequestInit = {
          ...init,
          headers: { ...existingHeaders, ...customHeaders },
          signal: signals.length > 1 ? AbortSignal.any(signals) : signals[0],
        }
        return globalThis.fetch(input, fetchInit)
      }) as typeof fetch,
    })
    const params: { message: Message } = {
      message: {
        kind: 'message',
        messageId: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        role: 'user',
        parts: [{ kind: 'text', text: message }],
      },
    }

    const response = await client.sendMessage(params)
    if ('error' in response) {
      return err(HaiAIError.A2A_REMOTE_CALL_FAILED, aiM('ai_a2aRemoteCallFailed', { params: { url: safeLabel, error: 'Remote agent returned an error' } }))
    }

    const responseData = response.result
    let result: A2ACallResult
    if (isTaskResult(responseData)) {
      const textParts = responseData.artifacts?.flatMap(artifact => getTextParts(artifact.parts)) ?? []
      result = {
        taskId: responseData.id,
        taskState: responseData.status?.state,
        responseText: textParts.join('\n') || undefined,
        responseParts: responseData.artifacts?.flatMap(artifact => artifact.parts ?? []),
      }
    }
    else if (isMessageResult(responseData)) {
      const textParts = getTextParts(responseData.parts)
      result = {
        responseText: textParts.join('\n') || undefined,
        responseParts: responseData.parts,
      }
    }
    else {
      result = {}
    }

    return ok(result)
  }
  catch (error) {
    const errorName = error instanceof Error ? error.name : 'UnknownError'
    return err(HaiAIError.A2A_REMOTE_CALL_FAILED, aiM('ai_a2aRemoteCallFailed', { params: { url: safeLabel, error: errorName } }))
  }
}

// ─── 工厂函数 ───

/**
 * A2A 子功能组装依赖
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * function bind(provider: AIStoreProvider): A2ADeps {
 *   // 必须在 provider.initialize() 前登记表，延迟注册 executor 不再创建遗漏的表。
 *   return createA2AStores(provider)
 * }
 * ```
 */
export interface A2ADeps {
  /** Task和事件同文档CAS权威状态。 */
  journalStore: AIRelStore<A2AJournal>
  /** context身份归属持久CAS登记。 */
  contextStore: AIRelStore<{ owner: string }>
  /** 初始化阶段已创建的消息存储 */
  messageStore: AIRelStore<A2AMessageRecord>
}

/**
 * 在 StoreProvider.initialize 前创建 A2A 表，避免延迟注册 executor 时漏建表。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * async function prepare(provider: AIStoreProvider) {
 *   const stores = createA2AStores(provider)
 *   await provider.initialize()
 *   return stores
 * }
 * ```
 */
export function createA2AStores(storeProvider: AIStoreProvider): A2ADeps {
  return {
    journalStore: storeProvider.createRelStore<A2AJournal>('hai_ai_a2a_journal', { hasObjectId: true, hasRefId: true }),
    contextStore: storeProvider.createRelStore<{ owner: string }>('hai_ai_a2a_contexts'),
    messageStore: storeProvider.createRelStore<A2AMessageRecord>('hai_ai_a2a_messages', { hasObjectId: true, hasStatus: true }),
  }
}

/**
 * A2A 子功能配置
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * function options(executor: AgentExecutor): A2ACreateOptions {
 *   return { executor, agentCard: { name: 'guide', url: 'https://example.com/a2a' }, runtime: { leaseMs: 30_000, pollIntervalMs: 250, maxExecutionMs: 300_000 } }
 * }
 * ```
 */
export interface A2ACreateOptions {
  /** Agent Card 配置 */
  agentCard: A2AAgentCardConfig
  /** Agent 执行器（由应用层实现） */
  executor: AgentExecutor
  /** 内部可注入的执行预算；公开默认30秒租约、250毫秒轮询、5分钟执行期限。 */
  runtime?: Partial<A2ARuntimeOptions>
}

/**
 * AI生命周期内部持有的实现；关闭先停止A2A执行再关闭共享Store。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * async function stop(implementation: A2AImplementation) {
 *   await implementation.close() // 等待本地执行停止后，应用才能关闭借用的共享 Store。
 * }
 * ```
 */
export interface A2AImplementation extends A2AOperations {
  close: () => Promise<void>
}

/**
 * 创建 A2A 操作接口实例
 *
 * 组装共享 journal 的 RequestHandler、消息日志、远端调用等能力。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * async function run(options: A2ACreateOptions, deps: A2ADeps) {
 *   const operations = createA2AOperations(options, deps)
 *   try {
 *     const result = await operations.listMessages({ callerId: 'agent-1', limit: 20 })
 *     if (!result.success) return result
 *     return result.data
 *   }
 *   finally { await operations.close() }
 * }
 * ```
 */
export function createA2AOperations(
  options: A2ACreateOptions,
  deps: A2ADeps,
): A2AImplementation {
  const { messageStore, journalStore, contextStore } = deps
  const agentCardConfig = options.agentCard

  // 构建 SDK 层
  const agentCard = buildAgentCard(agentCardConfig)
  const requestHandler = new SharedA2ARequestHandler(agentCard, options.executor, journalStore, contextStore, messageStore, { leaseMs: 30000, pollIntervalMs: 250, maxExecutionMs: 300000, ...options.runtime })
  const transportHandler = new JsonRpcTransportHandler(requestHandler)

  return {
    close: () => requestHandler.close(),
    registerExecutor() {
      logger.warn('A2A executor already registered, ignoring duplicate registerExecutor call')
      return ok(undefined)
    },

    getAgentCard() {
      return ok(buildAgentCard(agentCardConfig))
    },

    async handleRequest(requestBody: unknown, context?: Record<string, unknown>): Promise<A2AHandleResult> {
      // 身份只能来自可信传输层认证结果，不能从 JSON-RPC 参数中读取。
      const agentId = typeof context?.agentId === 'string' ? context.agentId : undefined
      const serverContext = new ServerCallContextImpl(undefined, agentId
        ? { isAuthenticated: true, userName: agentId }
        : undefined)

      const result = await transportHandler.handle(requestBody, serverContext)

      // 判断是否为 AsyncGenerator（流式响应）
      if (result && typeof result === 'object' && Symbol.asyncIterator in result) {
        return {
          streaming: true,
          stream: result as AsyncGenerator<unknown, void, undefined>,
        }
      }

      return {
        streaming: false,
        body: result,
      }
    },

    async listMessages(filter: A2ATaskFilter) {
      try {
        const page = await messageStore.queryPage(
          {
            objectId: filter.callerId,
            status: filter.status,
            where: {
              ...(filter.contextId === undefined ? {} : { contextId: filter.contextId }),
              ...(filter.since === undefined ? {} : { createdAt: { $gte: filter.since } }),
            },
            orderBy: { field: 'createdAt' as keyof A2AMessageRecord, direction: 'desc' },
          },
          { offset: filter.offset ?? 0, limit: filter.limit ?? 50 },
        )
        return ok(page)
      }
      catch {
        return err(HaiAIError.A2A_LIST_MESSAGES_FAILED, aiM('ai_a2aListMessagesFailed'))
      }
    },

    async callRemoteAgent(remoteUrl: string, message: string, options?: A2ACallOptions) {
      return executeRemoteAgentCall(remoteUrl, message, options)
    },
  }
}

// ─── 延迟初始化代理 ───

/**
 * 延迟代理的外部依赖（由 ai-main 注入状态访问器）
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * function initialized(deps: A2ALazyProxyDeps) {
 *   return deps.isInitialized() && deps.getA2AConfig() !== null && deps.getStores() !== null
 * }
 * ```
 */
export interface A2ALazyProxyDeps {
  /** 是否已初始化（即 currentConfig !== null） */
  isInitialized: () => boolean
  /** 获取 A2A 配置（config.a2a） */
  getA2AConfig: () => A2AConfig | null
  /** 获取当前 A2A 实现（registerExecutor 后才有值） */
  getA2AImpl: () => A2AImplementation | null
  /** 保存 A2A 实现引用 */
  setA2AImpl: (impl: A2AImplementation) => void
  /** 获取初始化阶段已建表的 A2A 存储 */
  getStores: () => A2ADeps | null
  /** 未初始化错误工厂 */
  notInitializedResult: <T>() => HaiResult<T>
}

/**
 * 创建 A2A 延迟初始化代理
 *
 * `callRemoteAgent()` 是独立客户端能力，只需 `ai.init()`；`getAgentCard()` 可直接读取配置。
 * 只有服务端请求处理与消息查询依赖 `registerExecutor()`。
 *
 * @param deps - 由 ai-main 注入的状态访问器
 * @returns A2AOperations 代理对象
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * function card(deps: A2ALazyProxyDeps) {
 *   const operations = createA2ALazyProxy(deps)
 *   const result = operations.getAgentCard()
 *   if (!result.success) return result
 *   return result.data
 * }
 * ```
 */
export function createA2ALazyProxy(deps: A2ALazyProxyDeps): A2AOperations {
  return {
    registerExecutor(executor: AgentExecutor): HaiResult<void> {
      if (!deps.isInitialized()) {
        return deps.notInitializedResult()
      }
      const a2aConfig = deps.getA2AConfig()
      if (!a2aConfig) {
        return err(HaiAIError.A2A_NOT_CONFIGURED, aiM('ai_a2aNotConfigured'))
      }
      if (deps.getA2AImpl()) {
        return err(HaiAIError.CONFIGURATION_ERROR, aiM('ai_a2aExecutorAlreadyRegistered'))
      }
      const stores = deps.getStores()
      if (!stores) {
        return err(HaiAIError.STORE_FAILED, aiM('ai_internalError', { params: { error: 'StoreProvider not available' } }))
      }
      const agentCardWithSecurity = { ...a2aConfig.agentCard, security: a2aConfig.security }
      const impl = createA2AOperations(
        { agentCard: agentCardWithSecurity, executor, runtime: a2aConfig.execution },
        stores,
      )
      deps.setA2AImpl(impl)
      logger.info('A2A executor registered', { agentName: a2aConfig.agentCard.name })
      return ok(undefined)
    },

    getAgentCard() {
      const impl = deps.getA2AImpl()
      if (impl)
        return impl.getAgentCard()
      const a2aConfig = deps.getA2AConfig()
      if (a2aConfig)
        return ok(buildAgentCard({ ...a2aConfig.agentCard, security: a2aConfig.security }))
      if (!deps.isInitialized())
        return deps.notInitializedResult()
      return err(HaiAIError.A2A_NOT_CONFIGURED, aiM('ai_a2aNotConfigured'))
    },

    async handleRequest(requestBody: unknown, context?: Record<string, unknown>) {
      const impl = deps.getA2AImpl()
      if (impl)
        return impl.handleRequest(requestBody, context)
      const id = asRecord(requestBody)?.id
      return {
        streaming: false,
        body: {
          jsonrpc: '2.0',
          id: typeof id === 'string' || typeof id === 'number' ? id : null,
          error: {
            code: -32603,
            message: aiM(deps.isInitialized() ? 'ai_a2aNotConfigured' : 'ai_notInitialized'),
          },
        },
      }
    },

    async listMessages(filter) {
      const impl = deps.getA2AImpl()
      if (impl)
        return impl.listMessages(filter)
      if (!deps.isInitialized())
        return deps.notInitializedResult()
      return err(HaiAIError.A2A_NOT_CONFIGURED, aiM('ai_a2aNotConfigured'))
    },

    async callRemoteAgent(remoteUrl, message, options) {
      const impl = deps.getA2AImpl()
      if (impl)
        return impl.callRemoteAgent(remoteUrl, message, options)
      if (!deps.isInitialized())
        return deps.notInitializedResult()
      return executeRemoteAgentCall(remoteUrl, message, options)
    },
  }
}
