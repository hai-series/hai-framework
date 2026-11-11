/**
 * A2A共享执行journal：Task与事件同一CAS提交；本地Map只跟踪本进程执行句柄。
 * @module ai-a2a-runtime
 */
import type { AgentCard, CancelTaskRequest, GetTaskRequest, Message, SendMessageRequest, StreamResponse, SubscribeToTaskRequest } from '@a2a-js/sdk'
import type { A2ARequestHandler, AgentExecutionEvent, AgentExecutor, ExecutionEventBus, ServerCallContext } from '@a2a-js/sdk/server'
import type { AIRelStore, AIVersionedRecord } from '../store/ai-store-types.js'
import type { A2AMessageRecord } from './ai-a2a-types.js'
import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { Role, Task, TaskState, TaskStatus } from '@a2a-js/sdk'
import { A2AError, ExtendedAgentCardNotConfiguredError, PushNotificationNotSupportedError, RequestMalformedError, TaskNotCancelableError, TaskNotFoundError, UnsupportedOperationError } from '@a2a-js/sdk/errors'
import { AgentEvent, ServerCallContext as CallContext, DefaultExecutionEventBus, RequestContext, ResultManager } from '@a2a-js/sdk/server'
import { core } from '@h-ai/core'
import { aiM } from '../ai-i18n.js'

/**
 * Task、稳定消息回执及事件的单文档权威状态；历史不自动删除，防止旧重试重新执行。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * async function inspect(store: AIRelStore<A2AJournal>, taskId: string) {
 *   const receipt = await store.readVersioned(taskId)
 *   if (!receipt) return undefined
 *   return { version: receipt.version, task: receipt.data.task, interrupted: receipt.data.interrupted }
 * }
 * // 消息日志不构成执行提交证据；以同文档 Task/finished/中断状态核对未知外部效果。
 * ```
 */
export interface A2AJournal {
  owner: string
  executionId: string
  leasedUntil: number
  deadline: number
  task: Task
  events: AgentExecutionEvent[]
  receipts: Array<{ id: string, digest: string }>
  message: Message
  result?: Message | Task
  finished: boolean
  cancelRequested: boolean
  interrupted: boolean
}

/**
 * A2A共享执行参数，时钟和截止条件均由Store提供。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const options: A2ARuntimeOptions = { leaseMs: 30_000, pollIntervalMs: 250, maxExecutionMs: 300_000 }
 * const checksPerLease = options.leaseMs / options.pollIntervalMs
 * ```
 */
export interface A2ARuntimeOptions {
  leaseMs: number
  pollIntervalMs: number
  maxExecutionMs: number
}

const FINAL_STATES = new Set([
  TaskState.TASK_STATE_COMPLETED,
  TaskState.TASK_STATE_FAILED,
  TaskState.TASK_STATE_CANCELED,
  TaskState.TASK_STATE_REJECTED,
])
const MAX_JOURNAL_BYTES = 8 * 1024 * 1024
const MAX_EVENTS = 2048
const MAX_RECEIPTS = 256
const logger = core.logger.child({ module: 'ai', scope: 'a2a-runtime' })

/** 统一构造协议语义错误，公开响应只包含已本地化的受控诊断。 */
const malformed = (message: string) => new RequestMalformedError({ message })
const notFound = (message: string) => new TaskNotFoundError({ message })
const notCancelable = (message: string) => new TaskNotCancelableError({ message })

/** 将执行事件映射为 A2A 协议流。 */
function streamResponse(event: AgentExecutionEvent): StreamResponse {
  switch (event.kind) {
    case 'message': return {
      payload: { $case: 'message', value: event.data },
    }
    case 'task': return {
      payload: { $case: 'task', value: event.data },
    }
    case 'statusUpdate': return {
      payload: { $case: 'statusUpdate', value: event.data },
    }
    case 'artifactUpdate': return {
      payload: { $case: 'artifactUpdate', value: event.data },
    }
  }
}

/** 存储异常只输出固定协议错误，避免SDK把驱动连接串或SQL直接写入响应及流日志。 */
function safeState<T>(store: AIRelStore<T>): Pick<AIRelStore<T>, 'readVersioned' | 'compareAndSwap' | 'currentTime'> {
  const guard = async <V>(operation: () => Promise<V>): Promise<V> => {
    try {
      return await operation()
    }
    catch {
      throw new A2AError(aiM('ai_a2aStateUnavailable'))
    }
  }
  return {
    readVersioned: id => guard(() => store.readVersioned(id)),
    compareAndSwap: (id, value) => guard(() => store.compareAndSwap(id, value)),
    currentTime: () => guard(() => store.currentTime()),
  }
}

/** 已认证身份只能来自可信传输上下文。 */
function principal(context: ServerCallContext): string {
  return context?.user?.isAuthenticated
    ? `user:${context.user.userName}`
    : 'anonymous'
}

/**
 * 共享执行器；未知外部效果不会在另一个节点自动重放。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * async function inspect(card: AgentCard, executor: AgentExecutor, journal: AIRelStore<A2AJournal>, contexts: AIRelStore<{ owner: string }>, messages: AIRelStore<A2AMessageRecord>, taskId: string, trustedContext: ServerCallContext) {
 *   const handler = new SharedA2ARequestHandler(card, executor, journal, contexts, messages, { leaseMs: 30_000, pollIntervalMs: 250, maxExecutionMs: 300_000 })
 *   try { return await handler.getTask({ id: taskId, tenant: '' }, trustedContext) }
 *   finally { await handler.close() }
 * }
 * ```
 */
export class SharedA2ARequestHandler implements A2ARequestHandler {
  private readonly executions = new Map<string, { controller: AbortController, done: Promise<void> }>()
  private closed = false
  private readonly journal: ReturnType<typeof safeState<A2AJournal>>
  private readonly contexts: ReturnType<typeof safeState<{ owner: string }>>

  constructor(private readonly card: AgentCard, private readonly executor: AgentExecutor, journal: AIRelStore<A2AJournal>, contexts: AIRelStore<{ owner: string }>, private readonly messages: AIRelStore<A2AMessageRecord>, private readonly options: A2ARuntimeOptions) {
    this.journal = safeState(journal)
    this.contexts = safeState(contexts)
  }

  /** 只返回当前公开 Agent Card；任务权威状态完全由共享 journal 负责。 */
  async getAgentCard(): Promise<AgentCard> {
    return this.card
  }

  /** 未配置扩展卡时保留 SDK 的标准协议错误。 */
  async getAuthenticatedExtendedAgentCard(): Promise<never> {
    throw new ExtendedAgentCardNotConfiguredError()
  }

  /** 未声明推送能力，拒绝通过 SDK 的其它存储路径读写任务。 */
  async createTaskPushNotificationConfig(): Promise<never> {
    throw new PushNotificationNotSupportedError()
  }

  /** 未声明推送能力，保留标准 unsupported 错误。 */
  async getTaskPushNotificationConfig(): Promise<never> {
    throw new PushNotificationNotSupportedError()
  }

  /** 未声明推送能力，保留标准 unsupported 错误。 */
  async listTaskPushNotificationConfigs(): Promise<never> {
    throw new PushNotificationNotSupportedError()
  }

  /** 未声明推送能力，保留标准 unsupported 错误。 */
  async deleteTaskPushNotificationConfig(): Promise<never> {
    throw new PushNotificationNotSupportedError()
  }

  /** 共享 journal 暂不支持协议级任务枚举；不回退到进程内任务表。 */
  async listTasks(): Promise<never> {
    throw new UnsupportedOperationError()
  }

  /**
   * 消息持久化必须被执行流程等待；稳定键使同一执行的写入不产生重复日志。
   * 此日志不是 journal 的发布回执：之后 CAS 失租时，仍须以 Task 的未知效果标记核对业务。
   */
  private async saveMessage(request: RequestContext, executionId: string, message: Message): Promise<void> {
    try {
      const callerId = request.context?.user?.isAuthenticated ? request.context.user.userName : undefined
      const record: A2AMessageRecord = {
        id: `msg_${createHash('sha256').update(JSON.stringify([
          request.taskId,
          executionId,
          message.role,
          message.messageId,
        ])).digest('hex')}`,
        taskId: request.taskId,
        contextId: request.contextId,
        role: message.role === Role.ROLE_USER
          ? 'user'
          : 'agent',
        parts: structuredClone(message.parts),
        createdAt: await this.journal.currentTime(),
        ...(callerId
          ? {
              caller: { agentId: callerId },
            }
          : {}),
      }
      await this.messages.save(record.id, record, { objectId: callerId, status: record.role })
    }
    catch {
      logger.warn('A2A message persistence failed', { direction: message.role })
      throw new A2AError(aiM('ai_a2aMessageStoreFailed'))
    }
  }

  /** 只读取对应调用方的共享权威状态；DB故障向上失败。 */
  private async read(id: string, owner: string): Promise<AIVersionedRecord<A2AJournal>> {
    const record = await this.journal.readVersioned(id)
    if (!record || record.data.owner !== owner)
      throw notFound(id)
    return record
  }

  /** CAS变更从最新状态计算，生产不依赖本机时钟，活跃执行的写入还须通过数据库截止条件。 */
  private async mutate(id: string, owner: string, operation: (value: A2AJournal) => Promise<A2AJournal> | A2AJournal, executionId?: string): Promise<A2AJournal> {
    for (let attempt = 0;
      attempt < 32;
      attempt++) {
      const current = await this.read(id, owner)
      if (executionId && (current.data.executionId !== executionId || current.data.finished || current.data.interrupted))
        throw new A2AError(aiM('ai_a2aExecutionLost'))
      const next = await operation(structuredClone(current.data))
      if (next.events.length > MAX_EVENTS || Buffer.byteLength(JSON.stringify(next)) > MAX_JOURNAL_BYTES)
        throw new A2AError(aiM('ai_a2aJournalLimit'))
      const version = await this.journal.compareAndSwap(id, {
        expectedVersion: current.version,
        data: next,
        scope: { objectId: owner, refId: next.task.contextId },
        ...(executionId
          ? {
              notAfter: Math.min(current.data.leasedUntil, current.data.deadline),
            }
          : {}),
      })
      if (version)
        return next
      if (executionId && await this.journal.currentTime() >= Math.min(current.data.leasedUntil, current.data.deadline))
        throw new A2AError(aiM('ai_a2aLeaseExpired'))
    }
    throw new A2AError(aiM('ai_a2aUpdateConflict'))
  }

  /** 过期在途仅标记中断，不接管业务副作用；旧执行的CAS和数据库截止均会失败。 */
  private async inspect(id: string, owner: string): Promise<A2AJournal> {
    const current = await this.read(id, owner)
    if (!current.data.finished && await this.journal.currentTime() >= Math.min(current.data.leasedUntil, current.data.deadline)) {
      return this.mutate(id, owner, async (value) => {
        if (!value.finished && await this.journal.currentTime() >= Math.min(value.leasedUntil, value.deadline)) {
          value.finished = true
          value.interrupted = true
          value.task.status = TaskStatus.fromJSON({
            state: TaskState.TASK_STATE_FAILED,
            timestamp: new Date(await this.journal.currentTime()).toISOString(),
          })
          value.task.metadata = {
            ...value.task.metadata,
            haiExecution: { interrupted: true, requiresEffectReconciliation: true },
          }
          value.result = value.task
          value.events.push(AgentEvent.statusUpdate({
            taskId: id,
            contextId: value.task.contextId,
            status: value.task.status,
            metadata: undefined,
          }))
        }
        return value
      })
    }
    return current.data
  }

  /** 外部指定的context必须先以CAS绑定身份，不能把同名上下文当不同租户共用。 */
  private async claimContext(id: string, owner: string): Promise<void> {
    const key = createHash('sha256').update(id).digest('hex')
    const current = await this.contexts.readVersioned(key)
    if (current) {
      if (current.data.owner !== owner)
        throw malformed(aiM('ai_a2aContextUnavailable'))
      return
    }
    const created = await this.contexts.compareAndSwap(key, {
      expectedVersion: undefined,
      data: { owner },
    })
    if (!created) {
      const winner = await this.contexts.readVersioned(key)
      if (winner?.data.owner !== owner)
        throw malformed(aiM('ai_a2aContextUnavailable'))
    }
  }

  /** 幂等消息在同一Task持久留存；需要输入的Task可由任意节点继续，终态/中断任务不能重新执行。 */
  private async begin(params: SendMessageRequest, context: ServerCallContext): Promise<{ id: string, owner: string, executionId: string }> {
    if (this.closed)
      throw new A2AError(aiM('ai_a2aRuntimeClosed'))
    if (!params.message)
      throw malformed(aiM('ai_a2aInvalidMessage'))
    const message = structuredClone(params.message)
    const identifiers = [
      message.messageId,
      message.taskId,
      message.contextId,
      ...message.referenceTaskIds ?? [],
    ]
    if (message.role !== Role.ROLE_USER || !message.messageId || identifiers.some(value => value !== '' && value !== undefined && (typeof value !== 'string' || value.length > 256)) || Buffer.byteLength(JSON.stringify(message)) > 1048576)
      throw malformed(aiM('ai_a2aInvalidMessage'))
    const owner = principal(context)
    const id = message.taskId || `task_${createHash('sha256').update(JSON.stringify([owner, message.contextId || '', message.messageId])).digest('hex')}`
    for (let attempt = 0;
      attempt < 32;
      attempt++) {
      const current = await this.journal.readVersioned(id)
      if (current && current.data.owner !== owner)
        throw notFound(id)
      if (message.taskId && !current)
        throw notFound(id)
      if (current?.data.receipts.some(receipt => receipt.id === message.messageId)) {
        const receipt = current.data.receipts.find(receipt => receipt.id === message.messageId)!
        if (receipt.digest !== createHash('sha256').update(JSON.stringify(message)).digest('hex'))
          throw malformed(aiM('ai_a2aIdempotencyConflict'))
        if (current.data.message.messageId !== message.messageId)
          throw malformed(aiM('ai_a2aTaskAdvanced'))
        return { id, owner, executionId: current.data.executionId }
      }
      // 取消器只接收 taskId；旧取消尚未确认时不可换代，避免迟到取消作用到下一轮执行。
      if (current && (!current.data.finished || current.data.cancelRequested || FINAL_STATES.has(current.data.task.status?.state ?? TaskState.TASK_STATE_UNSPECIFIED) || current.data.interrupted))
        throw malformed(aiM('ai_a2aTaskNotAccepting'))
      if (current && current.data.receipts.length >= MAX_RECEIPTS)
        throw malformed(aiM('ai_a2aReceiptLimit'))
      const contextId = current?.data.task.contextId || message.contextId || randomUUID()
      if (message.contextId && message.contextId !== contextId)
        throw malformed(aiM('ai_a2aContextMismatch'))
      await this.claimContext(contextId, owner)
      const referenceTasks: Task[] = []
      if ((message.referenceTaskIds?.length ?? 0) > 32)
        throw malformed(aiM('ai_a2aReferenceLimit'))
      for (const reference of message.referenceTaskIds ?? []) referenceTasks.push((await this.read(reference, owner)).data.task)
      const now = await this.journal.currentTime()
      const task: Task = current
        ? structuredClone(current.data.task)
        : Task.fromJSON({ id, contextId })
      task.status = TaskStatus.fromJSON({
        state: TaskState.TASK_STATE_SUBMITTED,
        timestamp: new Date(now).toISOString(),
      })
      task.history = [
        ...task.history ?? [],
        message,
      ]
      const executionId = randomUUID()
      const next: A2AJournal = {
        owner,
        executionId,
        leasedUntil: now + this.options.leaseMs,
        deadline: now + this.options.maxExecutionMs,
        task,
        events: [],
        receipts: [
          ...current?.data.receipts ?? [],
          {
            id: message.messageId,
            digest: createHash('sha256').update(JSON.stringify(message)).digest('hex'),
          },
        ],
        message,
        finished: false,
        cancelRequested: false,
        interrupted: false,
      }
      if (Buffer.byteLength(JSON.stringify(next)) > MAX_JOURNAL_BYTES)
        throw malformed(aiM('ai_a2aJournalLimit'))
      const created = await this.journal.compareAndSwap(id, {
        expectedVersion: current?.version,
        data: next,
        scope: { objectId: owner, refId: contextId },
        notAfter: Math.min(next.leasedUntil, next.deadline),
      })
      if (!created)
        continue
      const request = new RequestContext(params, id, contextId, context, current?.data.task, referenceTasks)
      const controller = new AbortController()
      const done = this.execute(request, next, controller).finally(() => this.executions.delete(executionId))
      this.executions.set(executionId, { controller, done })
      // 执行失败由共享journal记录，不能留下未处理rejection或将原始业务异常发送给用户。
      void done.catch(() => undefined)
      return { id, owner, executionId }
    }
    throw new A2AError(aiM('ai_a2aUpdateConflict'))
  }

  /** 用SDK计算artifact/status合并，临时TaskStore仅参与纯内存计算，最后与事件一起单CAS发布。 */
  private async publish(id: string, owner: string, executionId: string, event: AgentExecutionEvent): Promise<void> {
    if ((event.kind === 'task'
      ? event.data.id
      : event.kind === 'message'
        ? event.data.taskId
        : event.data.taskId) && (event.kind === 'task'
      ? event.data.id
      : event.kind === 'message'
        ? event.data.taskId
        : event.data.taskId) !== id) {
      throw malformed(aiM('ai_a2aEventTaskMismatch'))
    }
    await this.mutate(id, owner, async (value) => {
      let task = structuredClone(value.task)
      const manager = new ResultManager({
        load: async () => task,
        save: async (next) => {
          task = structuredClone(next)
        },
        list: async () => { throw new UnsupportedOperationError() },
      }, new CallContext())
      manager.setContext(value.message)
      await manager.processEvent(structuredClone(event))
      value.task = manager.getCurrentTask() ?? task
      const result = manager.getFinalResult()
      if (result && 'messageId' in result) {
        value.result = result
        value.task.status = TaskStatus.fromJSON({ state: TaskState.TASK_STATE_COMPLETED })
      }
      else {
        value.result = value.task
      }
      value.events.push(event)
      return value
    }, executionId)
  }

  /** 发布队列有界；finished不会早于尚未持久化的事件，跨节点取消由执行owner调用真实取消器。 */
  private async execute(request: RequestContext, initial: A2AJournal, controller: AbortController): Promise<void> {
    const signal = controller.signal
    let queue = Promise.resolve()
    let pending = 0
    let failed = false
    let producerFinished = false
    const local = new DefaultExecutionEventBus()
    const publishCommitted = local.publish.bind(local)
    const finishCommitted = local.finished.bind(local)
    const enqueue = (event: AgentExecutionEvent) => {
      if (signal.aborted || producerFinished || failed)
        throw new A2AError(aiM('ai_a2aExecutionNotWritable'))
      if (++pending > MAX_EVENTS)
        throw new A2AError(aiM('ai_a2aOutputLimit'))
      const copy = structuredClone(event)
      if (copy.kind === 'message' || (copy.kind === 'statusUpdate' && (FINAL_STATES.has(copy.data.status?.state ?? TaskState.TASK_STATE_UNSPECIFIED) || copy.data.status?.state === TaskState.TASK_STATE_INPUT_REQUIRED || copy.data.status?.state === TaskState.TASK_STATE_AUTH_REQUIRED)))
        producerFinished = true
      queue = queue.then(async () => {
        // 任一事件失败后，已排队事件也不得继续持久化或通知，避免发布虚假的 completed。
        if (failed)
          return
        // 复用已有有界发布队列；日志失败后不发布该消息，也不发布后续虚假的完成事件。
        if (copy.kind === 'message' && copy.data.role === Role.ROLE_AGENT)
          await this.saveMessage(request, initial.executionId, copy.data)
        await this.publish(initial.task.id, initial.owner, initial.executionId, copy)
        pending--
        publishCommitted(copy)
      }).catch(() => { failed = true })
    }
    // 复用 SDK 的完整事件订阅接口；只替换生产入口，通知仍在持久化后发出。
    local.publish = enqueue
    local.finished = () => {
      producerFinished = true
    }
    const bus: ExecutionEventBus = local
    let cancelled = false
    let executorStarted = false
    const heartbeat = (async () => {
      while (!signal.aborted) {
        try {
          await delay(Math.max(50, Math.floor(this.options.leaseMs / 3)), undefined, { signal })
          const renewed = await this.mutate(initial.task.id, initial.owner, async (value) => {
            value.leasedUntil = await this.journal.currentTime() + this.options.leaseMs
            return value
          }, initial.executionId)
          if (renewed.cancelRequested && !cancelled && executorStarted) {
            cancelled = true
            await this.executor.cancelTask(initial.task.id, bus)
          }
        }
        catch {
          if (!signal.aborted)
            failed = true
          break
        }
      }
    })()
    try {
      // 领取响应本身也可能延迟；按共享时钟拒绝已知过期或关闭后才恢复的业务入口。
      await this.saveMessage(request, initial.executionId, request.userMessage)
      // 日志写入也可能暂停跨过租约/期限；业务入口必须重新核验共享代际和存储时钟。
      const current = await this.read(initial.task.id, initial.owner)
      const now = await this.journal.currentTime()
      if (this.closed || signal.aborted || failed || current.data.executionId !== initial.executionId || current.data.finished || current.data.interrupted
        || now >= Math.min(current.data.leasedUntil, current.data.deadline)) {
        throw new A2AError(aiM('ai_a2aExecutionInterrupted'))
      }
      if (current.data.cancelRequested) {
        // 等待入站持久化时尚未进入业务，owner 可确认取消而不调用未启动执行器的取消副作用。
        await this.mutate(initial.task.id, initial.owner, (value) => {
          value.task.status = TaskStatus.fromJSON({ state: TaskState.TASK_STATE_CANCELED })
          value.finished = true
          value.result = value.task
          value.events.push(AgentEvent.statusUpdate({
            taskId: value.task.id,
            contextId: value.task.contextId,
            status: value.task.status,
            metadata: undefined,
          }))
          return value
        }, initial.executionId)
        return
      }
      executorStarted = true
      await this.executor.execute(request, bus)
      await queue
      if (failed || signal.aborted)
        throw new A2AError(aiM('ai_a2aExecutionInterrupted'))
      await this.mutate(initial.task.id, initial.owner, (value) => {
        if (!value.result || value.task.status?.state === TaskState.TASK_STATE_SUBMITTED || value.task.status?.state === TaskState.TASK_STATE_WORKING) {
          value.task.status = TaskStatus.fromJSON({ state: TaskState.TASK_STATE_FAILED })
          value.interrupted = true
        }
        value.finished = true
        if (value.interrupted) {
          value.task.metadata = {
            ...value.task.metadata,
            haiExecution: { interrupted: true, requiresEffectReconciliation: true },
          }
        }
        value.result = value.result && 'messageId' in value.result && !value.interrupted
          ? value.result
          : value.task
        return value
      }, initial.executionId)
    }
    catch {
      try {
        await this.mutate(initial.task.id, initial.owner, (value) => {
          value.task.status = TaskStatus.fromJSON({ state: TaskState.TASK_STATE_FAILED })
          value.finished = true
          value.interrupted = true
          value.task.metadata = {
            ...value.task.metadata,
            haiExecution: { interrupted: true, requiresEffectReconciliation: true },
          }
          value.result = value.task
          return value
        }, initial.executionId)
      }
      catch { /* DB故障或租约丢失不覆盖未知状态；后续inspect按持久期限标记中断。 */ }
    }
    finally {
      controller.abort()
      // 延时器最多等待一个续租周期；执行完成后不再续租。
      await heartbeat.catch(() => undefined)
      finishCommitted()
    }
  }

  async sendMessage(params: SendMessageRequest, context: ServerCallContext): Promise<Message | Task> {
    const run = await this.begin(params, context)
    if (params.configuration?.returnImmediately === true)
      return structuredClone((await this.inspect(run.id, run.owner)).task)
    for await (const _event of this.watch(run.id, run.owner)) { /* 共享journal完成后返回最终权威结果。 */ }
    const final = await this.inspect(run.id, run.owner)
    return structuredClone(final.result ?? final.task)
  }

  async* sendMessageStream(params: SendMessageRequest, context: ServerCallContext): AsyncGenerator<StreamResponse, void, undefined> {
    const run = await this.begin(params, context)
    yield streamResponse(AgentEvent.task(structuredClone((await this.inspect(run.id, run.owner)).task)))
    for await (const event of this.watch(run.id, run.owner)) yield streamResponse(event)
  }

  /** 每个订阅有独立游标，无本地bus依赖；取消订阅不会谎称业务执行已取消。 */
  private async* watch(id: string, owner: string): AsyncGenerator<AgentExecutionEvent, void, undefined> {
    let cursor = 0
    let executionId: string | undefined
    while (!this.closed) {
      const value = await this.inspect(id, owner)
      if (executionId && executionId !== value.executionId)
        throw new A2AError(aiM('ai_a2aSubscriptionAdvanced'))
      executionId = value.executionId
      while (cursor < value.events.length) yield structuredClone(value.events[cursor++]!)
      if (value.finished) {
        // 执行器抛错或事件写失败可能没有最终事件；从同一权威快照明确交付失败Task，不能静默结束working流。
        if (value.interrupted)
          yield AgentEvent.task(structuredClone(value.task))
        return
      }
      await delay(this.options.pollIntervalMs)
    }
    throw new A2AError(aiM('ai_a2aRuntimeClosed'))
  }

  async getTask(params: GetTaskRequest, context: ServerCallContext): Promise<Task> {
    const task = structuredClone((await this.inspect(params.id, principal(context))).task)
    task.history = params.historyLength && params.historyLength > 0
      ? task.history?.slice(-params.historyLength)
      : []
    return task
  }

  async cancelTask(params: CancelTaskRequest, context: ServerCallContext): Promise<Task> {
    const owner = principal(context)
    const current = await this.inspect(params.id, owner)
    if (FINAL_STATES.has(current.task.status?.state ?? TaskState.TASK_STATE_UNSPECIFIED))
      throw notCancelable(params.id)
    await this.mutate(params.id, owner, (value) => {
      if (FINAL_STATES.has(value.task.status?.state ?? TaskState.TASK_STATE_UNSPECIFIED))
        throw notCancelable(params.id)
      value.cancelRequested = true
      if (value.finished) {
        value.task.status = TaskStatus.fromJSON({ state: TaskState.TASK_STATE_CANCELED })
        value.result = value.task
      }
      return value
    })
    for await (const _event of this.watch(params.id, owner)) { /* 只等待owner确认，不在当前节点伪造canceled。 */ }
    return (await this.inspect(params.id, owner)).task
  }

  async* resubscribe(params: SubscribeToTaskRequest, context: ServerCallContext): AsyncGenerator<StreamResponse, void, undefined> {
    const owner = principal(context)
    yield streamResponse(AgentEvent.task(structuredClone((await this.inspect(params.id, owner)).task)))
    for await (const event of this.watch(params.id, owner)) {
      if (event.kind !== 'message')
        yield streamResponse(event)
    }
  }

  /** 模块关闭取消本机执行并等待一个租约周期；未退出的业务仍被持久代际约束。 */
  async close(): Promise<void> {
    this.closed = true
    for (const execution of this.executions.values()) execution.controller.abort()
    const deadline = new AbortController()
    try {
      await Promise.race([
        Promise.allSettled([
          ...this.executions.values(),
        ].map(item => item.done)),
        delay(this.options.leaseMs, undefined, { signal: deadline.signal }),
      ])
    }
    finally { deadline.abort() }
  }
}
