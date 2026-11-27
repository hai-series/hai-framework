import type { HaiResult } from '@h-ai/core'
import type { RunnerConfig } from './runner-config.js'
import type { WarmContainer } from './runner-container.js'
import type { RunnerClaim, RunnerStore } from './runner-store.js'
import type { RunnerContext, RunnerFunctions, RunnerHandler, RunnerJson, RunnerLaunch, RunnerOwner, RunnerProcess, RunnerScope, RunnerSubmit, RunnerWarmPool } from './runner-types.js'
import { Buffer } from 'node:buffer'
import { core } from '@h-ai/core'
import { json, runnerKind, submitSchema, warmPoolSchema } from './runner-config.js'
import { confirmContainerReleased, prepareWarmContainer, startContainer } from './runner-container.js'
import { runnerM } from './runner-i18n.js'
import { confirmRunnerProcessReleased } from './runner-process.js'
import { HaiRunnerError } from './runner-types.js'

const logger = core.logger.child({ module: 'runner' })
const inactive = core.module.createNotInitializedKit(HaiRunnerError.NOT_INITIALIZED, () => runnerM('runner_notInitialized')).result

/**
 * 本地任务控制不作为持久归属凭据；只用于停止当前节点实际持有的资源。
 * @example 模块内部上下文
 * ```ts
 * function abort(execution: LocalExecution) { execution.abort.abort() }
 * ```
 */
interface LocalExecution {
  abort: AbortController
  done: Promise<boolean>
  renewAt: number
}

const MAX_PAYLOAD_BYTES = 512 * 1024

/**
 * 为非法配置、任务或操作参数生成同一 Runner 错误。
 * @example 模块内部上下文
 * ```ts
 * const result = invalidRunnerInput()
 * if (!result.success) void result.error.code
 * ```
 */
export function invalidRunnerInput() {
  return core.err(HaiRunnerError.INVALID, runnerM('runner_invalid'))
}

function cleanupUnconfirmed() {
  return core.err(HaiRunnerError.CLEANUP_UNCONFIRMED, runnerM('runner_cleanupUnconfirmed'))
}

function notFound() {
  return core.err(HaiRunnerError.NOT_FOUND, runnerM('runner_notFound'))
}

function validAddress(scope: RunnerScope, id: string) {
  return !!scope && typeof scope.tenantId === 'string' && typeof scope.userId === 'string'
    && scope.tenantId.length > 0 && scope.tenantId.length <= 200
    && scope.userId.length > 0 && scope.userId.length <= 200 && /^[a-f\d]{64}$/u.test(id)
}

function bounded(input: unknown) {
  try {
    return Buffer.byteLength(JSON.stringify(input)) <= MAX_PAYLOAD_BYTES
  }
  catch {
    return false
  }
}

/**
 * 执行代码按当前实例的运行期读状态，关闭时继续处理仍在清理的资源。
 * @example 模块内部上下文
 * ```ts
 * const initial: RunnerRuntime = { config: undefined, store: undefined, owner: undefined, closingRequested: false }
 * const execution = createRunnerExecution(initial)
 * ```
 */
interface RunnerRuntime {
  readonly config: RunnerConfig | undefined
  readonly store: RunnerStore | undefined
  readonly owner: RunnerOwner | undefined
  readonly closingRequested: boolean
}

/**
 * 创建本实例的执行、续租与任务操作，运行期由入口发布。
 * @example 模块内部上下文
 * ```ts
 * function startExecution(runtime: RunnerRuntime, config: RunnerConfig) {
 *   const execution = createRunnerExecution(runtime)
 *   execution.start(config)
 *   return execution
 * }
 * ```
 */
export function createRunnerExecution(runtime: RunnerRuntime) {
  let timer: NodeJS.Timeout | undefined
  let tick: Promise<void> | undefined
  let sweepAt = 0
  let pruneAt = 0
  let unconfirmedCleanup = false
  const running = new Map<string, LocalExecution>()
  const handlers = new Map<string, RunnerHandler>()
  const pools = new Map<string, RunnerWarmPool>()
  const warmReservations = new Map<string, RunnerWarmPool>()
  const standby = new Map<string, { handle: WarmContainer, pool: RunnerWarmPool, transferred: () => void }>()
  let warmAt = 0
  const poolKey = (kind: string, key: string) => `${kind}:${key}`

  function prewarm(claim: RunnerClaim, pool: RunnerWarmPool, current: RunnerStore, settings: RunnerConfig) {
    const abort = new AbortController()
    const environment = claim.request.environment!
    warmReservations.set(claim.id, pool)
    const done = (async () => {
      const launched = await prepareWarmContainer(settings.engine, environment, abort.signal, identity =>
        current.recordContainer(claim.id, identity))
      if (!launched.success) {
        const stopped = launched.error.code !== HaiRunnerError.CLEANUP_UNCONFIRMED.code
        await current.finish(claim.id, undefined, stopped)
        if (!stopped)
          unconfirmedCleanup = true
        return stopped
      }
      const handle = launched.data
      handle.stderr.resume()
      let transferred = false
      const released = new Promise<void>((resolve) => {
        standby.set(claim.id, {
          handle,
          pool,
          transferred: () => {
            transferred = true
            resolve()
          },
        })
        abort.signal.addEventListener('abort', () => resolve(), { once: true })
        if (abort.signal.aborted)
          resolve()
      })
      const ready = await current.markWarmReady(claim.id)
      if (ready.success && !abort.signal.aborted) {
        await Promise.race([
          released,
          handle.wait(),
        ])
      }
      standby.delete(claim.id)
      if (transferred)
        return true
      const closed = await handle.close()
      await current.finish(claim.id, undefined, closed.success)
      if (!closed.success)
        unconfirmedCleanup = true
      return closed.success
    })().catch(() => {
      unconfirmedCleanup = true
      logger.warn('Warm container cleanup could not be confirmed', { executionId: claim.id })
      return false
    }).finally(() => {
      running.delete(claim.id)
      warmReservations.delete(claim.id)
    })
    running.set(claim.id, { abort, done, renewAt: performance.now() + settings.pollMs })
  }

  function launch(claim: RunnerClaim, handler: RunnerHandler, current: RunnerStore, settings: RunnerConfig, holder: RunnerOwner, warmed?: WarmContainer) {
    const abort = new AbortController()
    let process: Promise<HaiResult<RunnerProcess>> | undefined
    let uncertain = false

    const closeProcess = async () => {
      const started = await process
      if (started?.success)
        return (await started.data.close()).success
      return warmed
        ? (await warmed.close()).success
        : !uncertain
    }

    async function start(options: RunnerLaunch): Promise<HaiResult<RunnerProcess>> {
      const { environment, resources } = claim.request
      if (abort.signal.aborted || process || !environment || !resources)
        return invalidRunnerInput()
      process = (async () => {
        const renewed = await current.renew(claim.id)
        if (!renewed.success)
          return renewed
        if (renewed.data !== 'running' || abort.signal.aborted)
          return core.err(HaiRunnerError.LEASE_LOST, runnerM('runner_leaseLost'))
        const started = warmed
          ? await warmed.activate(options, abort.signal, async () => {
              const lease = await current.renew(claim.id)
              return lease.success && lease.data === 'running'
            })
          : await startContainer(settings.engine, environment, resources, options, abort.signal, identity =>
              current.recordContainer(claim.id, identity))
        if (!started.success && started.error.code === HaiRunnerError.CLEANUP_UNCONFIRMED.code)
          uncertain = true
        return started
      })()
      return process
    }

    async function execute(): Promise<boolean> {
      const context: RunnerContext = {
        id: claim.id,
        parentId: claim.parentId,
        scope: claim.request.scope,
        ...(claim.request.locale !== undefined && { locale: claim.request.locale }),
        maxResultBytes: MAX_PAYLOAD_BYTES,
        owner: holder,
        signal: abort.signal,
        start,
        emit: async (value) => {
          if (abort.signal.aborted || !bounded(value))
            return invalidRunnerInput()
          try {
            const parsed = json.safeParse(value)
            return parsed.success
              ? await current.emit(claim.id, parsed.data)
              : invalidRunnerInput()
          }
          catch {
            return invalidRunnerInput()
          }
        },
      }
      const stop = () => {
        void closeProcess()
      }
      abort.signal.addEventListener('abort', stop, { once: true })
      let output: RunnerJson | undefined
      try {
        const lease = await current.renew(claim.id)
        if (lease.success && lease.data === 'running' && !abort.signal.aborted) {
          const value = await handler(claim.request.input, context)
          if (!bounded(value))
            throw new Error('Runner handler output exceeded its bound')
          const parsed = json.safeParse(value)
          if (parsed.success)
            output = parsed.data
        }
      }
      catch {
        logger.warn('Managed execution handler failed', { executionId: claim.id, kind: claim.kind })
      }
      finally {
        abort.signal.removeEventListener('abort', stop)
      }
      const stopped = await closeProcess()
      if (!stopped)
        unconfirmedCleanup = true
      const result = await current.finish(claim.id, output, stopped)
      if (!result.success)
        logger.warn('Managed execution final state could not be committed', { executionId: claim.id, code: result.error.code })
      return stopped
    }

    const done = Promise.resolve().then(execute).catch(() => {
      unconfirmedCleanup = true
      logger.warn('Managed execution failed to finish', { executionId: claim.id })
      return false
    }).finally(() => running.delete(claim.id))
    running.set(claim.id, { abort, done, renewAt: performance.now() + settings.pollMs })
  }

  function poll() {
    const { store: current, config: settings, owner: holder } = runtime
    if (tick || !current || !settings || !holder)
      return
    tick = (async () => {
      await Promise.all([...running].map(async ([id, execution]) => {
        // 已取消的处理器继续续租，直到实际清理和结算结束。
        if (execution.renewAt > performance.now())
          return
        const result = await current.renew(id)
        execution.renewAt = performance.now() + (result.success && result.data === 'running'
          ? Math.min(250, settings.leaseMs / 4)
          : settings.pollMs)
        if (!result.success || result.data !== 'running')
          execution.abort.abort()
      }))
      if (!runtime.closingRequested && sweepAt <= performance.now()) {
        const maintenance = await current.sweep()
        if (!maintenance.success)
          logger.warn('Managed execution maintenance failed', { code: maintenance.error.code })
        sweepAt = performance.now() + Math.min(250, settings.leaseMs / 4)
      }
      if (runtime.closingRequested)
        return
      if (pruneAt <= performance.now()) {
        const pruned = await current.prune()
        if (!pruned.success)
          logger.warn('Managed execution retention failed', { code: pruned.error.code })
        pruneAt = performance.now() + (pruned.success && pruned.data
          ? 250
          : 1000)
      }
      const kinds = [
        ...handlers.keys(),
      ]
      if (!kinds.length)
        return
      const configuredPools = [
        ...pools.values(),
      ].filter(pool => handlers.has(pool.kind))
      for (const category of ['control', 'tool', 'default'] as const) {
        const available = [...standby].filter(([, candidate]) => pools.get(poolKey(candidate.pool.kind, candidate.pool.key)) === candidate.pool).map(([id]) => id)
        const claimed = await current.claim(kinds, category, configuredPools, available)
        if (!claimed.success) {
          logger.warn('Managed execution claim failed', { code: claimed.error.code })
          continue
        }
        if (!claimed.data)
          continue
        const handler = handlers.get(claimed.data.kind)
        const warmed = claimed.data.warmId
          ? standby.get(claimed.data.warmId)
          : undefined
        warmed?.transferred()
        if (handler && !runtime.closingRequested && (!claimed.data.warmId || warmed)) {
          launch(claimed.data, handler, current, settings, holder, warmed?.handle)
        }
        else {
          const stopped = warmed
            ? (await warmed.handle.close()).success
            : !claimed.data.warmId
          await current.finish(claimed.data.id, undefined, stopped)
        }
      }
      if (!runtime.closingRequested && performance.now() >= warmAt) {
        warmAt = performance.now() + Math.max(250, settings.pollMs)
        for (const pool of configuredPools) {
          const reserved = await current.reserveWarm(pool)
          if (reserved.success && reserved.data)
            prewarm(reserved.data, pool, current, settings)
        }
      }
    })().catch(() => {
      for (const execution of running.values())
        execution.abort.abort()
      logger.warn('Managed execution polling failed')
    }).finally(() => { tick = undefined })
  }

  function start(config: RunnerConfig) {
    unconfirmedCleanup = false
    sweepAt = 0
    pruneAt = 0
    warmAt = 0
    if (config.executor) {
      timer = setInterval(poll, config.pollMs)
      timer.unref()
    }
  }

  async function close(onDrained: () => void): Promise<HaiResult<void>> {
    await tick
    await Promise.all([...running].map(async ([id, execution]) => {
      const requested = await runtime.store?.cancelOwned(id)
      if (!requested?.success)
        unconfirmedCleanup = true
      execution.abort.abort()
    }))
    let deadline: NodeJS.Timeout | undefined
    try {
      const drained = await Promise.race([
        Promise.all([
          ...running.values(),
        ].map(execution => execution.done)).then(() => true),
        new Promise<false>((resolve) => { deadline = setTimeout(resolve, runtime.config!.closeTimeoutMs, false) }),
      ])
      if (!drained)
        return cleanupUnconfirmed()
      clearInterval(timer)
      handlers.clear()
      pools.clear()
      onDrained()
      return unconfirmedCleanup
        ? cleanupUnconfirmed()
        : core.ok(undefined)
    }
    finally {
      clearTimeout(deadline)
    }
  }

  const operations: Omit<RunnerFunctions, 'init' | 'close' | 'isExecutor'> = {
    environment(id) {
      const { config } = runtime
      if (!config || runtime.closingRequested)
        return inactive()
      const found = config.environments.find(item => item.id === id)
      return found
        ? core.ok(structuredClone(found))
        : notFound()
    },
    register(kind, handler) {
      const { config } = runtime
      if (!config || runtime.closingRequested)
        return inactive()
      if (!runnerKind.safeParse(kind).success || typeof handler !== 'function')
        return invalidRunnerInput()
      if (!config.executor)
        return core.ok(() => {})
      if (handlers.has(kind) || handlers.size >= 100)
        return core.err(HaiRunnerError.CONFLICT, runnerM('runner_conflict'))
      handlers.set(kind, handler)
      return core.ok(() => {
        if (handlers.get(kind) === handler)
          handlers.delete(kind)
      })
    },
    registerWarmPool(input) {
      const { config } = runtime
      if (!config || runtime.closingRequested)
        return inactive()
      const parsed = warmPoolSchema.safeParse(input)
      if (!parsed.success)
        return invalidRunnerInput()
      const pool = parsed.data
      const environment = config.environments.find(item => item.id === pool.environmentId)
      if (!environment || environment.networkPolicy !== 'offline' || (config.executor && !handlers.has(pool.kind)))
        return invalidRunnerInput()
      const key = poolKey(pool.kind, pool.key)
      if (pools.has(key) || pools.size >= 100)
        return core.err(HaiRunnerError.CONFLICT, runnerM('runner_conflict'))
      pools.set(key, pool)
      return core.ok(() => {
        if (pools.get(key) !== pool)
          return
        pools.delete(key)
        for (const [id, candidate] of warmReservations) {
          if (candidate === pool)
            running.get(id)?.abort.abort()
        }
      })
    },
    async submit(input: RunnerSubmit) {
      const { store } = runtime
      if (!store || runtime.closingRequested)
        return inactive()
      if (!bounded(input))
        return invalidRunnerInput()
      try {
        const parsed = submitSchema.safeParse(input)
        if (!parsed.success)
          return invalidRunnerInput()
        const request = parsed.data
        const pool = request.concurrency && pools.get(poolKey(request.kind, request.concurrency.key))
        if (request.warmPool && (!pool || pool.environmentId !== request.environmentId
          || pool.maxRunning !== request.concurrency?.limit)) {
          return invalidRunnerInput()
        }
        if (pool && !request.warmPool)
          return invalidRunnerInput()
        return await store.submit(request, pool)
      }
      catch {
        return invalidRunnerInput()
      }
    },
    async find(scope, kind, key) {
      const { store } = runtime
      if (!store)
        return inactive()
      return validAddress(scope, '0'.repeat(64)) && runnerKind.safeParse(kind).success && typeof key === 'string' && key.length > 0 && key.length <= 200
        ? store.find(scope, kind, key)
        : invalidRunnerInput()
    },
    async get(scope, id) {
      const { store } = runtime
      if (!store)
        return inactive()
      return validAddress(scope, id)
        ? store.get(scope, id)
        : invalidRunnerInput()
    },
    async cancel(scope, id) {
      const { store } = runtime
      if (!store)
        return inactive()
      return validAddress(scope, id)
        ? store.cancel(scope, id)
        : invalidRunnerInput()
    },
    async reconcileUnknown(scope, id, review) {
      const current = runtime.store
      if (!current || !runtime.config?.executor || runtime.closingRequested)
        return inactive()
      if (!validAddress(scope, id) || !review || typeof review.operatorId !== 'string'
        || !runnerKind.safeParse(review.operatorId).success || typeof review.reason !== 'string'
        || (review.hostResourcesStopped !== undefined && review.hostResourcesStopped !== true)
        || !review.reason.trim() || review.reason.length > 300 || /[\r\n\0]/u.test(review.reason)) {
        return invalidRunnerInput()
      }
      if (running.has(id))
        return cleanupUnconfirmed()
      const evidence = await current.reconciliation(scope, id)
      if (!evidence.success)
        return evidence
      if (evidence.data.container) {
        const verified = await confirmContainerReleased(evidence.data.container)
        if (!verified.success)
          return verified
      }
      else if (review.hostResourcesStopped !== true || !await confirmRunnerProcessReleased(evidence.data.process)) {
        return cleanupUnconfirmed()
      }
      if (current !== runtime.store || runtime.closingRequested)
        return inactive()
      const reconciled = await current.reconcile(scope, id, evidence.data.generation, {
        operatorId: review.operatorId,
        reason: review.reason.trim(),
        ...(!evidence.data.container && { hostResourcesStopped: true }),
      })
      if (reconciled.success)
        logger.info('Unknown execution resources reconciled', { executionId: id, operatorId: review.operatorId })
      return reconciled
    },
    async events(scope, id, after = 0, limit = 100) {
      const { store } = runtime
      if (!store)
        return inactive()
      return validAddress(scope, id) && Number.isSafeInteger(after) && after >= 0 && Number.isSafeInteger(limit) && limit >= 1 && limit <= 100
        ? store.events(scope, id, after, limit)
        : invalidRunnerInput()
    },
  }

  return { start, close, operations }
}
