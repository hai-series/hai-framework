/**
 * @h-ai/ai — A2A 子功能组装
 *
 * 实现 A2A 操作接口：RelDB 持久化 TaskStore、消息日志、远端调用。
 * 包含延迟初始化代理工厂（`createA2ALazyProxy`）和完整操作实例工厂（`createA2AOperations`）。
 * @module ai-a2a-functions
 */

import type { Message, Task } from '@a2a-js/sdk'
import type { AgentExecutor, ExecutionEventBus, ServerCallContext, TaskStore } from '@a2a-js/sdk/server'
import type { Result } from '@h-ai/core'

import type { A2AConfig } from '../ai-config.js'
import type { AIError } from '../ai-types.js'
import type { AIRelStore, AIStoreProvider } from '../store/ai-store-types.js'
import type {
  A2AAgentCardConfig,
  A2ACallOptions,
  A2ACallResult,
  A2AClientCallRecord,
  A2AHandleResult,
  A2AMessageRecord,
  A2AOperations,
  A2ATaskFilter,
} from './ai-a2a-types.js'

import { A2AClient } from '@a2a-js/sdk/client'
import { DefaultExecutionEventBusManager, DefaultRequestHandler, JsonRpcTransportHandler, ServerCallContext as ServerCallContextImpl } from '@a2a-js/sdk/server'
import { core, err, ok } from '@h-ai/core'

import { AIErrorCode } from '../ai-config.js'
import { aiM } from '../ai-i18n.js'
import { buildAgentCard } from './ai-a2a-server.js'

const logger = core.logger.child({ module: 'ai', scope: 'a2a' })

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
      const wrappedBus: ExecutionEventBus = Object.create(eventBus)
      wrappedBus.publish = (event) => {
        // @a2a-js/sdk ExecutionEventBus.publish 的 event 参数是联合类型，
        // 此处需要通过运行时检查判断是否为 Message 类型（含 role 属性），
        // SDK 未导出 Message 类型守卫，故使用 Record 断言访问属性
        if (event && typeof event === 'object' && 'role' in event && (event as unknown as Record<string, unknown>).role === 'agent') {
          const outboundRecord: A2AMessageRecord = {
            id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
            taskId: requestContext.taskId,
            role: 'agent',
            parts: (event as unknown as Record<string, unknown>).parts as unknown[] ?? [],
            createdAt: Date.now(),
          }
          messageStore.save(outboundRecord.id, outboundRecord, { objectId: requestContext.taskId, status: 'agent' })
            .catch(e => logger.warn('Failed to save outbound A2A message', { error: e }))
        }
        originalPublish(event)
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

  // A2AClient 实例缓存（按 URL 复用，避免每次调用都创建新实例）
  const clientCache = new Map<string, A2AClient>()

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
  const callRecordStore = storeProvider.createRelStore<A2AClientCallRecord>('hai_ai_a2a_calls', {
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
      return ok(agentCardConfig)
    },

    async handleRequest(requestBody: unknown, _context?: Record<string, unknown>): Promise<A2AHandleResult> {
      const serverContext = new ServerCallContextImpl()

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
        return err({
          code: AIErrorCode.STORE_FAILED,
          message: aiM('ai_a2aListMessagesFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },

    async callRemoteAgent(remoteUrl: string, message: string, _options?: A2ACallOptions) {
      const startTime = Date.now()
      try {
        let client = clientCache.get(remoteUrl)
        if (!client) {
          client = new A2AClient(remoteUrl)
          clientCache.set(remoteUrl, client)
        }
        const params: { message: Message } = {
          message: {
            kind: 'message',
            messageId: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
            role: 'user',
            parts: [{ kind: 'text', text: message }],
          },
        }

        const response = await client.sendMessage(params)

        // 处理 JSON-RPC 响应（SendMessageResponse = JSONRPCErrorResponse | SendMessageSuccessResponse）
        if ('error' in response) {
          return err({
            code: AIErrorCode.A2A_REMOTE_CALL_FAILED,
            message: aiM('ai_a2aRemoteCallFailed', { params: { url: remoteUrl, error: JSON.stringify(response.error) } }),
          })
        }

        // 提取 result（Task | Message）
        // @a2a-js/sdk SendMessageResponse.result 为 Task | Message 联合类型，
        // SDK 未提供类型守卫，通过 'status'/'parts' 属性运行时判别后断言
        const responseData = response.result
        let result: A2ACallResult
        if (responseData && 'status' in responseData) {
          // 通过 'status' 判别为 Task 类型
          const task = responseData as unknown as Task
          const textParts = task.artifacts?.flatMap(a => a.parts?.filter(p => 'text' in p).map(p => (p as { text: string }).text) ?? []) ?? []
          result = {
            taskId: task.id,
            taskState: task.status?.state,
            responseText: textParts.join('\n') || undefined,
            responseParts: task.artifacts?.flatMap(a => a.parts ?? []),
          }
        }
        else if (responseData && 'parts' in responseData) {
          // 通过 'parts' 判别为 Message 类型
          const msg = responseData as unknown as { role: string, parts: Array<{ text?: string }> }
          const textParts = msg.parts?.filter(p => p.text).map(p => p.text!) ?? []
          result = {
            responseText: textParts.join('\n') || undefined,
            responseParts: msg.parts,
          }
        }
        else {
          result = {} as A2ACallResult
        }

        // 记录调用日志
        const callRecord: A2AClientCallRecord = {
          id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
          remoteUrl,
          requestParts: params.message.parts,
          responseParts: result.responseParts,
          taskId: result.taskId,
          taskState: result.taskState,
          duration: Date.now() - startTime,
          createdAt: startTime,
        }
        callRecordStore.save(callRecord.id, callRecord, { objectId: remoteUrl, status: result.taskState })
          .catch(e => logger.warn('Failed to save A2A call record', { error: e }))

        return ok(result)
      }
      catch (error) {
        return err({
          code: AIErrorCode.A2A_REMOTE_CALL_FAILED,
          message: aiM('ai_a2aRemoteCallFailed', { params: { url: remoteUrl, error: String(error) } }),
          cause: error,
        })
      }
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
  notInitializedResult: <T>() => Result<T, AIError>
}

/**
 * 创建 A2A 延迟初始化代理
 *
 * 代理在 `ai.init()` 之后、`registerExecutor()` 之前即可提供 `getAgentCard()`。
 * 其余方法需在 `registerExecutor()` 成功后才可用。
 *
 * @param deps - 由 ai-main 注入的状态访问器
 * @returns A2AOperations 代理对象
 */
export function createA2ALazyProxy(deps: A2ALazyProxyDeps): A2AOperations {
  return {
    registerExecutor(executor: AgentExecutor): Result<void, AIError> {
      if (!deps.isInitialized()) {
        return deps.notInitializedResult()
      }
      const a2aConfig = deps.getA2AConfig()
      if (!a2aConfig) {
        return err({
          code: AIErrorCode.A2A_NOT_CONFIGURED,
          message: aiM('ai_a2aNotConfigured'),
        })
      }
      if (deps.getA2AImpl()) {
        logger.warn('A2A executor already registered, re-registering')
      }
      const storeProvider = deps.getStoreProvider()
      if (!storeProvider) {
        return err({
          code: AIErrorCode.STORE_FAILED,
          message: aiM('ai_internalError', { params: { error: 'StoreProvider not available' } }),
        })
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
        return ok({ ...a2aConfig.agentCard, security: a2aConfig.security } as A2AAgentCardConfig)
      if (!deps.isInitialized())
        return deps.notInitializedResult()
      return err({ code: AIErrorCode.A2A_NOT_CONFIGURED, message: aiM('ai_a2aNotConfigured') })
    },

    async handleRequest(requestBody: unknown, context?: Record<string, unknown>) {
      const impl = deps.getA2AImpl()
      if (impl)
        return impl.handleRequest(requestBody, context)
      if (!deps.isInitialized())
        return deps.notInitializedResult() as never
      return err({ code: AIErrorCode.A2A_NOT_CONFIGURED, message: aiM('ai_a2aNotConfigured') }) as never
    },

    async listMessages(filter) {
      const impl = deps.getA2AImpl()
      if (impl)
        return impl.listMessages(filter)
      if (!deps.isInitialized())
        return deps.notInitializedResult()
      return err({ code: AIErrorCode.A2A_NOT_CONFIGURED, message: aiM('ai_a2aNotConfigured') })
    },

    async callRemoteAgent(remoteUrl, message, options) {
      const impl = deps.getA2AImpl()
      if (impl)
        return impl.callRemoteAgent(remoteUrl, message, options)
      if (!deps.isInitialized())
        return deps.notInitializedResult()
      return err({ code: AIErrorCode.A2A_NOT_CONFIGURED, message: aiM('ai_a2aNotConfigured') })
    },
  }
}
