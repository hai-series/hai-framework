/**
 * @h-ai/ai — A2A 子功能组装
 *
 * 实现 A2A 操作接口：RelDB 持久化 TaskStore、消息日志、远端调用。
 * 包含延迟初始化代理工厂（`createA2ALazyProxy`）和完整操作实例工厂（`createA2AOperations`）。
 * @module ai-a2a-functions
 */

import type { Message, Task } from '@a2a-js/sdk'
import type { AgentExecutor, ExecutionEventBus, ServerCallContext, TaskStore } from '@a2a-js/sdk/server'
import type { HaiResult } from '@h-ai/core'

import type { A2AConfig } from '../ai-config.js'

import type { AIRelStore, AIStoreProvider } from '../store/ai-store-types.js'
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
import { DefaultExecutionEventBusManager, DefaultRequestHandler, JsonRpcTransportHandler, ServerCallContext as ServerCallContextImpl } from '@a2a-js/sdk/server'
import { core, err, ok } from '@h-ai/core'

import { aiM } from '../ai-i18n.js'
import { HaiAIError } from '../ai-types.js'
import { buildAgentCard } from './ai-a2a-server.js'

const logger = core.logger.child({ module: 'ai', scope: 'a2a' })
const DEFAULT_A2A_CALL_TIMEOUT_MS = 60_000

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

function isAgentMessageEvent(event: unknown): event is { role: 'agent', parts?: unknown[] } {
  const record = asRecord(event)
  return record?.role === 'agent' && (record.parts === undefined || Array.isArray(record.parts))
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

// ─── RelDB 持久化 TaskStore ───

/**
 * 基于 ReldbAIStore 的 A2A TaskStore 实现
 *
 * 将 SDK 的 Task 对象桥接到 RelDB 存储，利用 status 和 refId 索引列
 * 实现按状态和上下文查询。
 */
export class ReldbA2ATaskStore implements TaskStore {
  constructor(private readonly store: AIRelStore<Task>) {}

  async save(task: Task, _context?: ServerCallContext): Promise<void> {
    await this.store.save(task.id, task, {
      objectId: task.contextId,
      status: task.status?.state,
      refId: task.contextId,
    })
  }

  async load(taskId: string, _context?: ServerCallContext): Promise<Task | undefined> {
    return this.store.get(taskId)
  }
}

// ─── A2A 消息日志拦截器 ───

/**
 * 创建带消息日志的 AgentExecutor 包装器
 *
 * 在真实 AgentExecutor.execute 前后记录入站消息和出站响应到 messageStore。
 */
function wrapExecutorWithLogging(
  executor: AgentExecutor,
  messageStore: AIRelStore<A2AMessageRecord>,
): AgentExecutor {
  return {
    async execute(requestContext, eventBus) {
      // 记录入站消息
      const inboundRecord: A2AMessageRecord = {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        taskId: requestContext.taskId,
        role: 'user',
        parts: requestContext.userMessage.parts ?? [],
        createdAt: Date.now(),
      }
      messageStore.save(inboundRecord.id, inboundRecord, { objectId: requestContext.taskId, status: 'user' })
        .catch(e => logger.warn('Failed to save inbound A2A message', { error: e }))

      // 监听出站事件并记录
      const originalPublish = eventBus.publish.bind(eventBus)
      // SDK event bus 继承原生 EventTarget，不能用 Object.create 伪造 receiver。
      const wrappedBus: ExecutionEventBus = {
        on: eventBus.on.bind(eventBus),
        off: eventBus.off.bind(eventBus),
        once: eventBus.once.bind(eventBus),
        removeAllListeners: eventBus.removeAllListeners.bind(eventBus),
        finished: eventBus.finished.bind(eventBus),
        publish(event) {
        // SDK 未提供 ExecutionEvent 的类型守卫；先做最小运行时判别，再记录 agent 消息。
          if (isAgentMessageEvent(event)) {
            const outboundRecord: A2AMessageRecord = {
              id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
              taskId: requestContext.taskId,
              role: 'agent',
              parts: event.parts ?? [],
              createdAt: Date.now(),
            }
            messageStore.save(outboundRecord.id, outboundRecord, { objectId: requestContext.taskId, status: 'agent' })
              .catch(e => logger.warn('Failed to save outbound A2A message', { error: e }))
          }
          originalPublish(event)
        },
      }

      await executor.execute(requestContext, wrappedBus)
    },
    async cancelTask(taskId, eventBus) {
      await executor.cancelTask(taskId, eventBus)
    },
  }
}

// ─── 工厂函数 ───

/** A2A 子功能组装依赖 */
export interface A2ADeps {
  storeProvider: AIStoreProvider
}

/** A2A 子功能配置 */
export interface A2ACreateOptions {
  /** Agent Card 配置 */
  agentCard: A2AAgentCardConfig
  /** Agent 执行器（由应用层实现） */
  executor: AgentExecutor
}

/**
 * 创建 A2A 操作接口实例
 *
 * 组装 TaskStore、RequestHandler、消息日志、远端调用等能力。
 */
export function createA2AOperations(
  options: A2ACreateOptions,
  deps: A2ADeps,
): A2AOperations {
  const { storeProvider } = deps
  const agentCardConfig = options.agentCard

  // 创建持久化存储
  const taskStore = storeProvider.createRelStore<Task>('hai_ai_a2a_tasks', {
    hasObjectId: true,
    hasStatus: true,
    hasRefId: true,
  })
  const messageStore = storeProvider.createRelStore<A2AMessageRecord>('hai_ai_a2a_messages', {
    hasObjectId: true,
    hasStatus: true,
  })

  // 构建 SDK 层
  const agentCard = buildAgentCard(agentCardConfig)
  const a2aTaskStore = new ReldbA2ATaskStore(taskStore)
  const wrappedExecutor = wrapExecutorWithLogging(options.executor, messageStore)
  const eventBusManager = new DefaultExecutionEventBusManager()
  const requestHandler = new DefaultRequestHandler(agentCard, a2aTaskStore, wrappedExecutor, eventBusManager)
  const transportHandler = new JsonRpcTransportHandler(requestHandler)

  return {
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
            objectId: filter.contextId ?? filter.callerId,
            status: filter.status,
            orderBy: { field: 'createdAt' as keyof A2AMessageRecord, direction: 'desc' },
          },
          { offset: filter.offset ?? 0, limit: filter.limit ?? 50 },
        )
        return ok(page)
      }
      catch (error) {
        return err(HaiAIError.STORE_FAILED, aiM('ai_a2aListMessagesFailed', { params: { error: String(error) } }), error)
      }
    },

    async callRemoteAgent(remoteUrl: string, message: string, options?: A2ACallOptions) {
      return executeRemoteAgentCall(remoteUrl, message, options)
    },
  }
}

// ─── 延迟初始化代理 ───

/** 延迟代理的外部依赖（由 ai-main 注入状态访问器） */
export interface A2ALazyProxyDeps {
  /** 是否已初始化（即 currentConfig !== null） */
  isInitialized: () => boolean
  /** 获取 A2A 配置（config.a2a） */
  getA2AConfig: () => A2AConfig | null
  /** 获取当前 A2A 实现（registerExecutor 后才有值） */
  getA2AImpl: () => A2AOperations | null
  /** 保存 A2A 实现引用 */
  setA2AImpl: (impl: A2AOperations) => void
  /** 获取 StoreProvider（用于 createA2AOperations） */
  getStoreProvider: () => AIStoreProvider | null
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
        logger.warn('A2A executor already registered, re-registering')
      }
      const storeProvider = deps.getStoreProvider()
      if (!storeProvider) {
        return err(HaiAIError.STORE_FAILED, aiM('ai_internalError', { params: { error: 'StoreProvider not available' } }))
      }
      const agentCardWithSecurity = { ...a2aConfig.agentCard, security: a2aConfig.security }
      const impl = createA2AOperations(
        { agentCard: agentCardWithSecurity, executor },
        { storeProvider },
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
