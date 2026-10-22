/**
 * A2A共享执行journal：Task与事件同一CAS提交；本地Map只跟踪本进程执行句柄。
 * @module ai-a2a-runtime
 */
import type { AgentCard, Message, MessageSendParams, Task, TaskIdParams, TaskQueryParams } from '@a2a-js/sdk'
import type { AgentExecutionEvent, AgentExecutor, ExecutionEventBus, ServerCallContext, TaskStore } from '@a2a-js/sdk/server'
import type { AIRelStore, AIVersionedRecord } from '../store/ai-store-types.js'
import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { A2AError, DefaultExecutionEventBus, DefaultRequestHandler, RequestContext, ResultManager } from '@a2a-js/sdk/server'
import { aiM } from '../ai-i18n.js'

/**
 * Task、稳定消息回执及事件的单文档权威状态；历史不自动删除，防止旧重试重新执行。
 * @example const receipt = await journal.readVersioned(taskId)
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
 * @example const limits: A2ARuntimeOptions = { leaseMs: 30000, pollIntervalMs: 250, maxExecutionMs: 300000 }
 */
export interface A2ARuntimeOptions {
  leaseMs: number
  pollIntervalMs: number
  maxExecutionMs: number
}

const FINAL_STATES = new Set(['completed', 'failed', 'canceled', 'rejected'])
const MAX_JOURNAL_BYTES = 8 * 1024 * 1024
const MAX_EVENTS = 2048
const MAX_RECEIPTS = 256

/** 存储异常只输出固定协议错误，避免SDK把驱动连接串或SQL直接写入响应及流日志。 */
function safeState<T>(store: AIRelStore<T>): Pick<AIRelStore<T>, 'readVersioned' | 'compareAndSwap' | 'currentTime'> {
  const guard = async <V>(operation: () => Promise<V>): Promise<V> => {
    try {
      return await operation()
    }
    catch {
      throw A2AError.internalError(aiM('ai_a2aStateUnavailable'))
    }
  }
  return {
    readVersioned: id => guard(() => store.readVersioned(id)),
    compareAndSwap: (id, value) => guard(() => store.compareAndSwap(id, value)),
    currentTime: () => guard(() => store.currentTime()),
  }
}

/** 已认证身份只能来自可信传输上下文。 */
function principal(context?: ServerCallContext): string {
  return context?.user?.isAuthenticated ? `user:${context.user.userName}` : 'anonymous'
}

/**
 * 共享执行器；未知外部效果不会在另一个节点自动重放。
 * @example const task = await handler.getTask({ id: receipt }, trustedContext)
 */
export class SharedA2ARequestHandler extends DefaultRequestHandler {
  private readonly executions = new Map<string, { controller: AbortController, done: Promise<void> }>()
  private closed = false
  private readonly journal: ReturnType<typeof safeState<A2AJournal>>
  private readonly contexts: ReturnType<typeof safeState<{ owner: string }>>

  constructor(card: AgentCard, taskStore: TaskStore, private readonly executor: AgentExecutor, journal: AIRelStore<A2AJournal>, contexts: AIRelStore<{ owner: string }>, private readonly options: A2ARuntimeOptions) {
    super(card, taskStore, executor)
    this.journal = safeState(journal)
    this.contexts = safeState(contexts)
  }

  /** 只读取对应调用方的共享权威状态；DB故障向上失败。 */
  private async read(id: string, owner: string): Promise<AIVersionedRecord<A2AJournal>> {
    const record = await this.journal.readVersioned(id)
    if (!record || record.data.owner !== owner)
      throw A2AError.taskNotFound(id)
    return record
  }

  /** CAS变更从最新状态计算，生产不依赖本机时钟，活跃执行的写入还须通过数据库截止条件。 */
  private async mutate(id: string, owner: string, operation: (value: A2AJournal) => Promise<A2AJournal> | A2AJournal, executionId?: string): Promise<A2AJournal> {
    for (let attempt = 0;
      attempt < 32;
      attempt++) {
      const current = await this.read(id, owner)
      if (executionId && (current.data.executionId !== executionId || current.data.finished || current.data.interrupted))
        throw A2AError.internalError(aiM('ai_a2aExecutionLost'))
      const next = await operation(structuredClone(current.data))
      if (next.events.length > MAX_EVENTS || Buffer.byteLength(JSON.stringify(next)) > MAX_JOURNAL_BYTES)
        throw A2AError.internalError(aiM('ai_a2aJournalLimit'))
      const version = await this.journal.compareAndSwap(id, {
        expectedVersion: current.version,
        data: next,
        scope: { objectId: owner, refId: next.task.contextId },
        ...(executionId ? { notAfter: Math.min(current.data.leasedUntil, current.data.deadline) } : {}),
      })
      if (version)
        return next
      if (executionId && await this.journal.currentTime() >= Math.min(current.data.leasedUntil, current.data.deadline))
        throw A2AError.internalError(aiM('ai_a2aLeaseExpired'))
    }
    throw A2AError.internalError(aiM('ai_a2aUpdateConflict'))
  }

  /** 过期在途仅标记中断，不接管业务副作用；旧执行的CAS和数据库截止均会失败。 */
  private async inspect(id: string, owner: string): Promise<A2AJournal> {
    const current = await this.read(id, owner)
    if (!current.data.finished && await this.journal.currentTime() >= Math.min(current.data.leasedUntil, current.data.deadline)) {
      return this.mutate(id, owner, async (value) => {
        if (!value.finished && await this.journal.currentTime() >= Math.min(value.leasedUntil, value.deadline)) {
          value.finished = true
          value.interrupted = true
          value.task.status = { state: 'failed', timestamp: new Date(await this.journal.currentTime()).toISOString() }
          value.task.metadata = { ...value.task.metadata, haiExecution: { interrupted: true, requiresEffectReconciliation: true } }
          value.result = value.task
          value.events.push({ kind: 'status-update', taskId: id, contextId: value.task.contextId, status: value.task.status, final: true })
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
        throw A2AError.invalidParams(aiM('ai_a2aContextUnavailable'))
      return
    }
    const created = await this.contexts.compareAndSwap(key, { expectedVersion: undefined, data: { owner } })
    if (!created) {
      const winner = await this.contexts.readVersioned(key)
      if (winner?.data.owner !== owner)
        throw A2AError.invalidParams(aiM('ai_a2aContextUnavailable'))
    }
  }

  /** 幂等消息在同一Task持久留存；需要输入的Task可由任意节点继续，终态/中断任务不能重新执行。 */
  private async begin(params: MessageSendParams, context?: ServerCallContext): Promise<{ id: string, owner: string, executionId: string }> {
    if (this.closed)
      throw A2AError.internalError(aiM('ai_a2aRuntimeClosed'))
    const message = structuredClone(params.message)
    const identifiers = [message.messageId, message.taskId, message.contextId, ...message.referenceTaskIds ?? []]
    if (message.role !== 'user' || !message.messageId || identifiers.some(value => value !== undefined && (typeof value !== 'string' || value.length === 0 || value.length > 256)) || Buffer.byteLength(JSON.stringify(message)) > 1048576)
      throw A2AError.invalidParams(aiM('ai_a2aInvalidMessage'))
    const owner = principal(context)
    const id = message.taskId ?? `task_${createHash('sha256').update(JSON.stringify([owner, message.contextId ?? '', message.messageId])).digest('hex')}`
    for (let attempt = 0;
      attempt < 32;
      attempt++) {
      const current = await this.journal.readVersioned(id)
      if (current && current.data.owner !== owner)
        throw A2AError.taskNotFound(id)
      if (message.taskId && !current)
        throw A2AError.taskNotFound(id)
      if (current?.data.receipts.some(receipt => receipt.id === message.messageId)) {
        const receipt = current.data.receipts.find(receipt => receipt.id === message.messageId)!
        if (receipt.digest !== createHash('sha256').update(JSON.stringify(message)).digest('hex'))
          throw A2AError.invalidParams(aiM('ai_a2aIdempotencyConflict'))
        if (current.data.message.messageId !== message.messageId)
          throw A2AError.invalidParams(aiM('ai_a2aTaskAdvanced'))
        return { id, owner, executionId: current.data.executionId }
      }
      // 取消器只接收 taskId；旧取消尚未确认时不可换代，避免迟到取消作用到下一轮执行。
      if (current && (!current.data.finished || current.data.cancelRequested || FINAL_STATES.has(current.data.task.status.state) || current.data.interrupted))
        throw A2AError.invalidParams(aiM('ai_a2aTaskNotAccepting'))
      if (current && current.data.receipts.length >= MAX_RECEIPTS)
        throw A2AError.invalidParams(aiM('ai_a2aReceiptLimit'))
      const contextId = current?.data.task.contextId ?? message.contextId ?? randomUUID()
      if (message.contextId && message.contextId !== contextId)
        throw A2AError.invalidParams(aiM('ai_a2aContextMismatch'))
      await this.claimContext(contextId, owner)
      const referenceTasks: Task[] = []
      if ((message.referenceTaskIds?.length ?? 0) > 32)
        throw A2AError.invalidParams(aiM('ai_a2aReferenceLimit'))
      for (const reference of message.referenceTaskIds ?? []) referenceTasks.push((await this.read(reference, owner)).data.task)
      const now = await this.journal.currentTime()
      const task: Task = current ? structuredClone(current.data.task) : { kind: 'task', id, contextId, status: { state: 'submitted' }, history: [] }
      task.status = { state: 'submitted', timestamp: new Date(now).toISOString() }
      task.history = [...task.history ?? [], message]
      const executionId = randomUUID()
      const next: A2AJournal = { owner, executionId, leasedUntil: now + this.options.leaseMs, deadline: now + this.options.maxExecutionMs, task, events: [], receipts: [...current?.data.receipts ?? [], { id: message.messageId, digest: createHash('sha256').update(JSON.stringify(message)).digest('hex') }], message, finished: false, cancelRequested: false, interrupted: false }
      if (Buffer.byteLength(JSON.stringify(next)) > MAX_JOURNAL_BYTES)
        throw A2AError.invalidParams(aiM('ai_a2aJournalLimit'))
      const created = await this.journal.compareAndSwap(id, { expectedVersion: current?.version, data: next, scope: { objectId: owner, refId: contextId }, notAfter: Math.min(next.leasedUntil, next.deadline) })
      if (!created)
        continue
      const request = new RequestContext(message, id, contextId, current?.data.task, referenceTasks, context)
      const controller = new AbortController()
      const done = this.execute(request, next, controller).finally(() => this.executions.delete(executionId))
      this.executions.set(executionId, { controller, done })
      // 执行失败由共享journal记录，不能留下未处理rejection或将原始业务异常发送给用户。
      void done.catch(() => undefined)
      return { id, owner, executionId }
    }
    throw A2AError.internalError(aiM('ai_a2aUpdateConflict'))
  }

  /** 用SDK计算artifact/status合并，临时TaskStore仅参与纯内存计算，最后与事件一起单CAS发布。 */
  private async publish(id: string, owner: string, executionId: string, event: AgentExecutionEvent): Promise<void> {
    if ((event.kind === 'task' ? event.id : event.taskId) && (event.kind === 'task' ? event.id : event.taskId) !== id)
      throw A2AError.invalidParams(aiM('ai_a2aEventTaskMismatch'))
    await this.mutate(id, owner, async (value) => {
      let task = structuredClone(value.task)
      const manager = new ResultManager({ load: async () => task, save: async (next) => {
        task = structuredClone(next)
      } })
      manager.setContext(value.message)
      await manager.processEvent(structuredClone(event))
      value.task = manager.getCurrentTask() ?? task
      const result = manager.getFinalResult()
      if (result?.kind === 'message') {
        value.result = result
        value.task.status = { state: 'completed' }
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
    const enqueue = (event: AgentExecutionEvent) => {
      if (signal.aborted || producerFinished || failed)
        throw A2AError.internalError(aiM('ai_a2aExecutionNotWritable'))
      if (++pending > MAX_EVENTS)
        throw A2AError.internalError(aiM('ai_a2aOutputLimit'))
      const copy = structuredClone(event)
      if (copy.kind === 'message' || (copy.kind === 'status-update' && copy.final))
        producerFinished = true
      queue = queue.then(async () => {
        // 任一事件失败后，已排队事件也不得继续持久化或通知，避免发布虚假的 completed。
        if (failed)
          return
        await this.publish(initial.task.id, initial.owner, initial.executionId, copy)
        pending--
        local.publish(copy)
      }).catch(() => { failed = true })
    }
    const bus: ExecutionEventBus = {
      publish: enqueue,
      finished: () => { producerFinished = true },
      on(name, fn) {
        local.on(name, fn)
        return this
      },
      off(name, fn) {
        local.off(name, fn)
        return this
      },
      once(name, fn) {
        local.once(name, fn)
        return this
      },
      removeAllListeners(name) {
        local.removeAllListeners(name)
        return this
      },
    }
    let cancelled = false
    const heartbeat = (async () => {
      while (!signal.aborted) {
        try {
          await delay(Math.max(50, Math.floor(this.options.leaseMs / 3)), undefined, { signal })
          const renewed = await this.mutate(initial.task.id, initial.owner, async (value) => {
            value.leasedUntil = await this.journal.currentTime() + this.options.leaseMs
            return value
          }, initial.executionId)
          if (renewed.cancelRequested && !cancelled) {
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
      const now = await this.journal.currentTime()
      if (this.closed || signal.aborted || now >= Math.min(initial.leasedUntil, initial.deadline))
        throw A2AError.internalError(aiM('ai_a2aExecutionInterrupted'))
      await this.executor.execute(request, bus)
      await queue
      if (failed || signal.aborted)
        throw A2AError.internalError(aiM('ai_a2aExecutionInterrupted'))
      await this.mutate(initial.task.id, initial.owner, (value) => {
        if (!value.result || value.task.status.state === 'submitted' || value.task.status.state === 'working') {
          value.task.status = { state: 'failed' }
          value.interrupted = true
        }
        value.finished = true
        if (value.interrupted)
          value.task.metadata = { ...value.task.metadata, haiExecution: { interrupted: true, requiresEffectReconciliation: true } }
        value.result = value.result?.kind === 'message' && !value.interrupted ? value.result : value.task
        return value
      }, initial.executionId)
    }
    catch {
      try {
        await this.mutate(initial.task.id, initial.owner, (value) => {
          value.task.status = { state: 'failed' }
          value.finished = true
          value.interrupted = true
          value.task.metadata = { ...value.task.metadata, haiExecution: { interrupted: true, requiresEffectReconciliation: true } }
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
      local.finished()
    }
  }

  override async sendMessage(params: MessageSendParams, context?: ServerCallContext): Promise<Message | Task> {
    const run = await this.begin(params, context)
    if (params.configuration?.blocking === false)
      return structuredClone((await this.inspect(run.id, run.owner)).task)
    for await (const _event of this.watch(run.id, run.owner)) { /* 共享journal完成后返回最终权威结果。 */ }
    const final = await this.inspect(run.id, run.owner)
    return structuredClone(final.result ?? final.task)
  }

  override async* sendMessageStream(params: MessageSendParams, context?: ServerCallContext): AsyncGenerator<AgentExecutionEvent, void, undefined> {
    const run = await this.begin(params, context)
    yield structuredClone((await this.inspect(run.id, run.owner)).task)
    yield* this.watch(run.id, run.owner)
  }

  /** 每个订阅有独立游标，无本地bus依赖；取消订阅不会谎称业务执行已取消。 */
  private async* watch(id: string, owner: string): AsyncGenerator<AgentExecutionEvent, void, undefined> {
    let cursor = 0
    let executionId: string | undefined
    while (!this.closed) {
      const value = await this.inspect(id, owner)
      if (executionId && executionId !== value.executionId)
        throw A2AError.internalError(aiM('ai_a2aSubscriptionAdvanced'))
      executionId = value.executionId
      while (cursor < value.events.length) yield structuredClone(value.events[cursor++]!)
      if (value.finished) {
        // 执行器抛错或事件写失败可能没有最终事件；从同一权威快照明确交付失败Task，不能静默结束working流。
        if (value.interrupted)
          yield structuredClone(value.task)
        return
      }
      await delay(this.options.pollIntervalMs)
    }
    throw A2AError.internalError(aiM('ai_a2aRuntimeClosed'))
  }

  override async getTask(params: TaskQueryParams, context?: ServerCallContext): Promise<Task> {
    const task = structuredClone((await this.inspect(params.id, principal(context))).task)
    task.history = params.historyLength && params.historyLength > 0 ? task.history?.slice(-params.historyLength) : []
    return task
  }

  override async cancelTask(params: TaskIdParams, context?: ServerCallContext): Promise<Task> {
    const owner = principal(context)
    const current = await this.inspect(params.id, owner)
    if (FINAL_STATES.has(current.task.status.state))
      throw A2AError.taskNotCancelable(params.id)
    await this.mutate(params.id, owner, (value) => {
      if (FINAL_STATES.has(value.task.status.state))
        throw A2AError.taskNotCancelable(params.id)
      value.cancelRequested = true
      if (value.finished) {
        value.task.status = { state: 'canceled' }
        value.result = value.task
      }
      return value
    })
    for await (const _event of this.watch(params.id, owner)) { /* 只等待owner确认，不在当前节点伪造canceled。 */ }
    return (await this.inspect(params.id, owner)).task
  }

  override async* resubscribe(params: TaskIdParams, context?: ServerCallContext): AsyncGenerator<Exclude<AgentExecutionEvent, Message>, void, undefined> {
    const owner = principal(context)
    yield structuredClone((await this.inspect(params.id, owner)).task)
    for await (const event of this.watch(params.id, owner)) {
      if (event.kind !== 'message')
        yield event
    }
  }

  /** 模块关闭取消本机执行并等待一个租约周期；未退出的业务仍被持久代际约束。 */
  async close(): Promise<void> {
    this.closed = true
    for (const execution of this.executions.values()) execution.controller.abort()
    const deadline = new AbortController()
    try {
      await Promise.race([Promise.allSettled([...this.executions.values()].map(item => item.done)), delay(this.options.leaseMs, undefined, { signal: deadline.signal })])
    }
    finally { deadline.abort() }
  }
}
