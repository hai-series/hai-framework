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
  done: Promise<void>
  renewAt: number
  cancellation?: Promise<HaiResult<void>>
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
  let toolClaim: Promise<void> | undefined
  let sweepAt = 0
  let pruneAt = 0
  let draining: Promise<boolean> | undefined
  const running = new Map<string, LocalExecution>()
  const pendingCleanup = new Map<string, () => Promise<boolean>>()
  const handlers = new Map<string, { handler: RunnerHandler }>()
  const pools = new Map<string, RunnerWarmPool>()
  const warmReservations = new Map<string, RunnerWarmPool>()
  const standby = new Map<string, { handle: WarmContainer, pool: RunnerWarmPool, available: boolean, transferred: () => void }>()
  let warmAt = 0
  const poolKey = (kind: string, key: string) => `${kind}:${key}`
  const stillUnconfirmed = async () => false

  async function settle(id: string, current: RunnerStore, output: RunnerJson | undefined, release: () => Promise<boolean>, requested?: Promise<HaiResult<void>>) {
    const stopped = await release()
    if (!stopped)
      pendingCleanup.set(id, release)
    const cancellation = await (requested ?? running.get(id)?.cancellation)
    if (cancellation && !cancellation.success) {
      pendingCleanup.set(id, async () => {
        if (!(await current.cancelOwned(id)).success || !await release())
          return false
        await current.finish(id, undefined, true)
        return true
      })
      return
    }
    const result = await current.finish(id, output, stopped)
    if (!result.success)
      logger.warn('Managed execution final state could not be committed', { executionId: id, code: result.error.code })
  }

  function prewarm(claim: RunnerClaim, pool: RunnerWarmPool, current: RunnerStore, settings: RunnerConfig) {
    const abort = new AbortController()
    const environment = claim.request.environment!
    let release = stillUnconfirmed
    warmReservations.set(claim.id, pool)
    const done = (async () => {
      const launched = await prepareWarmContainer(settings.engine, environment, abort.signal, (identity, previous) =>
        current.recordContainer(claim.id, identity, previous))
      if (!launched.success) {
        const stopped = launched.error.code !== HaiRunnerError.CLEANUP_UNCONFIRMED.code
        release = async () => stopped
        await settle(claim.id, current, undefined, release)
        return
      }
      const handle = launched.data
      release = async () => (await handle.close()).success
      handle.stderr.resume()
      let transferred = false
      let releaseOnAbort!: () => void
      const released = new Promise<void>((resolve) => {
        releaseOnAbort = resolve
      })
      const candidate = {
        handle,
        pool,
        available: true,
        transferred: () => {
          transferred = true
          releaseOnAbort()
        },
      }
      standby.set(claim.id, candidate)
      abort.signal.addEventListener('abort', releaseOnAbort, { once: true })
      if (abort.signal.aborted)
        releaseOnAbort()
      try {
        const ready = await current.markWarmReady(claim.id)
        if (ready.success && !abort.signal.aborted) {
          await Promise.race([
            released,
            handle.wait(),
          ])
        }
      }
      finally {
        candidate.available = false
        abort.signal.removeEventListener('abort', releaseOnAbort)
        // 等待已经携带这个容器 ID 的领取请求结算，后续领取将跳过该容器。
        await toolClaim?.catch(() => {})
        standby.delete(claim.id)
      }
      if (!transferred)
        await settle(claim.id, current, undefined, release)
    })().catch(() => {
      if (!pendingCleanup.has(claim.id))
        pendingCleanup.set(claim.id, release)
      logger.warn('Warm container cleanup could not be confirmed', { executionId: claim.id })
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
          : await startContainer(settings.engine, environment, resources, options, abort.signal, (identity, previous) =>
              current.recordContainer(claim.id, identity, previous))
        if (!started.success && started.error.code === HaiRunnerError.CLEANUP_UNCONFIRMED.code)
          uncertain = true
        return started
      })()
      return process
    }

    async function execute(): Promise<void> {
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
        void closeProcess().catch(() => {})
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
      await settle(claim.id, current, output, closeProcess)
    }

    const done = Promise.resolve().then(execute).catch(() => {
      if (!pendingCleanup.has(claim.id))
        pendingCleanup.set(claim.id, closeProcess)
      logger.warn('Managed execution failed to finish', { executionId: claim.id })
    }).finally(() => running.delete(claim.id))
    running.set(claim.id, { abort, done, renewAt: performance.now() + settings.pollMs })
  }

  async function claimWork(current: RunnerStore, settings: RunnerConfig, holder: RunnerOwner, category: 'control' | 'tool' | 'default') {
    const registrations = new Map(handlers)
    const currentPools = [
      ...pools.values(),
    ].filter(pool => registrations.has(pool.kind))
    const available = [...standby].flatMap(([id, candidate]) =>
      candidate.available && pools.get(poolKey(candidate.pool.kind, candidate.pool.key)) === candidate.pool
      && registrations.has(candidate.pool.kind) && !running.get(id)?.abort.signal.aborted
        ? [id]
        : [])
    const claimed = await current.claim([
      ...registrations.keys(),
    ], category, currentPools, available)
    if (!claimed.success) {
      logger.warn('Managed execution claim failed', { code: claimed.error.code })
      return
    }
    if (!claimed.data)
      return
    const claim = claimed.data
    const registration = registrations.get(claim.kind)
    const warmed = claim.warmId
      ? standby.get(claim.warmId)
      : undefined
    if (warmed && claim.warmId) {
      warmReservations.delete(claim.warmId)
      warmed.transferred()
    }
    if (registration && handlers.get(claim.kind) === registration
      && !runtime.closingRequested && (!claim.warmId || warmed)) {
      launch(claim, registration.handler, current, settings, holder, warmed?.handle)
    }
    else {
      const cancellation = runtime.closingRequested
        ? current.cancelOwned(claim.id).catch(cleanupUnconfirmed)
        : undefined
      const release = warmed
        ? async () => (await warmed.handle.close()).success
        : async () => !claim.warmId
      await settle(claim.id, current, undefined, release, cancellation)
    }
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
      if (!handlers.size)
        return
      for (const category of ['control', 'tool', 'default'] as const) {
        if (runtime.closingRequested)
          return
        const operation = claimWork(current, settings, holder, category)
        if (category === 'tool')
          toolClaim = operation
        try {
          await operation
        }
        finally {
          toolClaim = undefined
        }
      }
      if (!runtime.closingRequested && performance.now() >= warmAt) {
        warmAt = performance.now() + Math.max(250, settings.pollMs)
        for (const pool of [
          ...pools.values(),
        ]) {
          if (runtime.closingRequested)
            return
          const key = poolKey(pool.kind, pool.key)
          const registration = handlers.get(pool.kind)
          if (!registration || pools.get(key) !== pool)
            continue
          const reserved = await current.reserveWarm(pool)
          if (!reserved.success || !reserved.data)
            continue
          if (runtime.closingRequested || handlers.get(pool.kind) !== registration || pools.get(key) !== pool) {
            const { id } = reserved.data
            await settle(id, current, undefined, async () => true, current.cancelOwned(id).catch(cleanupUnconfirmed))
            continue
          }
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
    sweepAt = 0
    pruneAt = 0
    warmAt = 0
    if (config.executor) {
      timer = setInterval(poll, config.pollMs)
      timer.unref()
    }
  }

  function stopLocalExecution(current: RunnerStore, id: string, execution: LocalExecution) {
    execution.cancellation ??= current.cancelOwned(id).catch(cleanupUnconfirmed)
    execution.abort.abort()
    return Promise.all([execution.cancellation, execution.done])
  }

  function stopWarmReservations(current: RunnerStore, matches: (pool: RunnerWarmPool) => boolean) {
    const retiring = [...warmReservations].filter(([, pool]) => matches(pool))
    const stop = () => {
      for (const [id, pool] of retiring) {
        const execution = running.get(id)
        if (execution && warmReservations.get(id) === pool)
          void stopLocalExecution(current, id, execution)
      }
    }
    // 先结算在途领取实际接管的容器，再回收尚未转给执行任务的预热资源。
    if (toolClaim)
      void toolClaim.then(stop, stop)
    else
      stop()
  }

  function stopLocal() {
    const current = runtime.store!
    return [...running].map(([id, execution]) => stopLocalExecution(current, id, execution))
  }

  async function drain(): Promise<boolean> {
    const stopping = stopLocal()
    await tick
    await Promise.all([
      ...stopping,
      ...stopLocal(),
    ])
    await Promise.all([...pendingCleanup].map(async ([id, release]) => {
      if (await release().catch(() => false) && pendingCleanup.get(id) === release)
        pendingCleanup.delete(id)
    }))
    return pendingCleanup.size === 0
  }

  async function close(onDrained: () => void): Promise<HaiResult<void>> {
    let deadline: NodeJS.Timeout | undefined
    try {
      const timeout = new Promise<false>((resolve) => {
        deadline = setTimeout(resolve, runtime.config!.closeTimeoutMs, false)
      })
      draining ??= drain().catch(() => false).finally(() => {
        draining = undefined
      })
      const drained = await Promise.race([
        draining,
        timeout,
      ])
      if (!drained)
        return cleanupUnconfirmed()
      clearInterval(timer)
      handlers.clear()
      pools.clear()
      onDrained()
      return core.ok(undefined)
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
      const { config, store } = runtime
      if (!config || !store || runtime.closingRequested)
        return inactive()
      if (!runnerKind.safeParse(kind).success || typeof handler !== 'function')
        return invalidRunnerInput()
      if (!config.executor)
        return core.ok(() => {})
      if (handlers.has(kind) || handlers.size >= 100)
        return core.err(HaiRunnerError.CONFLICT, runnerM('runner_conflict'))
      const registration = { handler }
      handlers.set(kind, registration)
      return core.ok(() => {
        if (handlers.get(kind) !== registration)
          return
        handlers.delete(kind)
        stopWarmReservations(store, pool => pool.kind === kind)
      })
    },
    registerWarmPool(input) {
      const { config, store } = runtime
      if (!config || !store || runtime.closingRequested)
        return inactive()
      const parsed = warmPoolSchema.safeParse(input)
      if (!parsed.success)
        return invalidRunnerInput()
      const pool = parsed.data
      const environment = config.environments.find(item => item.id === pool.environmentId)
      if (!environment || environment.networkPolicy !== 'offline' || environment.resources.scratchMiB < 4
        || (config.executor && !handlers.has(pool.kind))) {
        return invalidRunnerInput()
      }
      const key = poolKey(pool.kind, pool.key)
      if (pools.has(key) || pools.size >= 100)
        return core.err(HaiRunnerError.CONFLICT, runnerM('runner_conflict'))
      pools.set(key, pool)
      return core.ok(() => {
        if (pools.get(key) !== pool)
          return
        pools.delete(key)
        stopWarmReservations(store, candidate => candidate === pool)
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
      if (!current || !runtime.config?.executor)
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
        const verified = await confirmContainerReleased(evidence.data.container, review.hostResourcesStopped)
        if (!verified.success)
          return verified
      }
      else if (review.hostResourcesStopped !== true || !await confirmRunnerProcessReleased(evidence.data.process)) {
        return cleanupUnconfirmed()
      }
      if (current !== runtime.store)
        return inactive()
      const reconciled = await current.reconcile(scope, id, evidence.data.generation, {
        operatorId: review.operatorId,
        reason: review.reason.trim(),
        ...(!evidence.data.container?.id && review.hostResourcesStopped && { hostResourcesStopped: true }),
      }, evidence.data.container)
      if (reconciled.success) {
        pendingCleanup.delete(id)
        logger.info('Unknown execution resources reconciled', { executionId: id, operatorId: review.operatorId })
      }
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
