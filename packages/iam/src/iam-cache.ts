/** IAM 热路径共享缓存；写入栅栏覆盖数据库提交和外部事务完成。 */

import type { CacheValue } from '@h-ai/cache'
import type { HaiResult } from '@h-ai/core'
import type { DmlWithTxOperations } from '@h-ai/reldb'
import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { iamM } from './iam-i18n.js'
import { HaiIamError } from './iam-types.js'

/**
 * 缓存读取代际与尚未确认完成的写入数。
 * @example 模块内部上下文
 * ```ts
 * const state: Revision = { epoch: 'example', writers: 0, activeWriters: [] }
 * void state
 * ```
 */
interface Revision {
  epoch: string
  writers: number
  activeWriters: { id: string, startedAt: number }[]
}

const revisionKey = 'hai:iam:read_cache:revision'
const transactions = new WeakMap<DmlWithTxOperations, Promise<HaiResult<void>>>()
const logger = core.logger.child({ module: 'iam', scope: 'read-cache' })
const completedWriters = new Set<string>()
let retryTimer: ReturnType<typeof setInterval> | undefined
let retryTask: Promise<void> | undefined
let lastStuckWarning = 0
let retryQueueFullWarned = false

function failure() {
  return core.err(HaiIamError.REPOSITORY_ERROR, iamM('iam_readCacheUnavailable'))
}

function newRevision(activeWriters: Revision['activeWriters'] = []): Revision {
  return {
    epoch: randomUUID(),
    writers: activeWriters.length,
    activeWriters,
  }
}

function queueRelease(id: string) {
  if (completedWriters.size < 256 || completedWriters.has(id)) {
    completedWriters.add(id)
  }
  else if (!retryQueueFullWarned) {
    retryQueueFullWarned = true
    logger.warn('IAM cache writer release queue is full; remaining registrations require maintenance')
  }
}

function isRevision(value: unknown): value is Revision {
  return !!value && typeof value === 'object'
    && 'epoch' in value && typeof value.epoch === 'string' && value.epoch.length > 0
    && 'activeWriters' in value && Array.isArray(value.activeWriters)
    && 'writers' in value && value.writers === value.activeWriters.length
    && (value.activeWriters as unknown[]).every(writer =>
      !!writer && typeof writer === 'object' && 'id' in writer && typeof writer.id === 'string'
      && 'startedAt' in writer && Number.isSafeInteger(writer.startedAt))
}

async function revision(): Promise<HaiResult<Revision>> {
  const current = await cache.kv.get(revisionKey)
  if (!current.success)
    return current
  if (isRevision(current.data))
    return core.ok(current.data)
  // 生产空键可能是 Redis 丢失了仍在写入的登记，只能由维护人员在确认事务排空后重建。
  if (current.data !== null || core.module.requiresSharedState(process.env))
    return failure()
  const created = await cache.kv.set(revisionKey, newRevision(), { nx: true })
  if (!created.success)
    return created
  const loaded = await cache.kv.get(revisionKey)
  return loaded.success && isRevision(loaded.data)
    ? core.ok(loaded.data)
    : failure()
}

async function changeWriter(id: string, startedAt?: number): Promise<HaiResult<void>> {
  for (let attempt = 0; attempt < 32; attempt++) {
    const current = await revision()
    if (!current.success)
      return current
    const active = current.data.activeWriters
    const registered = active.some(writer => writer.id === id)
    if (registered === (startedAt !== undefined))
      return core.ok(undefined)
    const next = startedAt === undefined
      ? active.filter(writer => writer.id !== id)
      : [
          ...active,
          { id, startedAt },
        ]
    const written = await cache.kv.compareAndSwap(revisionKey, current.data, newRevision(next))
    if (!written.success) {
      // CAS 可能写成但回复丢失。新增登记失败后，业务代码还没有执行写 SQL。
      if (startedAt !== undefined)
        queueRelease(id)
      return written
    }
    if (written.data)
      return core.ok(undefined)
  }
  return failure()
}

/**
 * 只缓存成功的有限寿命 DTO；写入中或 Redis 不可用时回源，绝不复用旧授权。
 * @example 模块内部上下文
 * ```ts
 * async function readExample() {
 *   const result = await readIamCache('example', async () => core.ok({ enabled: true }))
 *   if (!result.success) return result
 *   return result.data.enabled
 * }
 * ```
 */
export async function readIamCache<T>(key: string, load: () => Promise<HaiResult<T>>): Promise<HaiResult<T>> {
  const before = await revision()
  if (!before.success)
    return load()
  if (before.data.writers) {
    const now = Date.now()
    if (now - lastStuckWarning >= 60_000 && before.data.activeWriters.some(writer => now - writer.startedAt >= 60_000)) {
      lastStuckWarning = now
      logger.warn('IAM cache writer registration is still active; authorization reads use database', { writers: before.data.writers })
    }
    return load()
  }
  const address = `hai:iam:read_cache:${before.data.epoch}:${key}`
  const cached = await cache.kv.get<{ value: T }>(address)
  if (cached.success && cached.data) {
    const after = await revision()
    if (after.success && !after.data.writers && after.data.epoch === before.data.epoch)
      return core.ok(cached.data.value)
    return load()
  }
  const result = await load()
  if (!result.success)
    return result
  const after = await revision()
  if (after.success && !after.data.writers && after.data.epoch === before.data.epoch)
    await cache.kv.set(address, { value: result.data }, { ex: 60 })
  return result
}

async function finish(id: string, report = true) {
  try {
    const completed = await changeWriter(id)
    if (completed.success)
      return
    if (report)
      logger.warn('IAM cache writer release pending', { code: completed.error.code, traceId: completed.error.traceId })
  }
  catch {
    if (report)
      logger.warn('IAM cache writer release pending')
  }
  queueRelease(id)
}

async function retryCompletedWriters() {
  for (const id of [...completedWriters].slice(0, 32)) {
    completedWriters.delete(id)
    await finish(id, false)
  }
  if (completedWriters.size === 0)
    retryQueueFullWarned = false
}

/**
 * IAM 运行期重试已确认结束的登记。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * startIamReadCacheMaintenance()
 * ```
 */
export function startIamReadCacheMaintenance(): void {
  retryTimer ??= setInterval(() => {
    if (completedWriters.size && !retryTask) {
      retryTask = retryCompletedWriters().finally(() => {
        retryTask = undefined
      })
    }
  }, 1000)
  retryTimer.unref()
}

/**
 * 等待本地重试结束，未释放的登记留在 Redis 继续保护读路径。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * await stopIamReadCacheMaintenance()
 * ```
 */
export async function stopIamReadCacheMaintenance(): Promise<void> {
  clearInterval(retryTimer)
  retryTimer = undefined
  await retryTask
  completedWriters.clear()
  lastStuckWarning = 0
  retryQueueFullWarned = false
}

/**
 * 将写入登记绑定真实事务，COMMIT 或 ROLLBACK 确认后只释放本次 ID。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * async function protect(tx: DmlWithTxOperations) {
 *   return protectIamTransaction(tx)
 * }
 * ```
 */
export function protectIamTransaction(tx: DmlWithTxOperations): Promise<HaiResult<void>> {
  const existing = transactions.get(tx)
  if (existing)
    return existing
  const id = randomUUID()
  const pending = changeWriter(id, Date.now()).catch(() => failure())
  for (const action of ['commit', 'rollback'] as const) {
    const complete = tx[action].bind(tx)
    tx[action] = async () => {
      const registration = await pending
      const result = await complete()
      if (registration.success && result.success)
        await finish(id)
      else if (registration.success && !result.success)
        logger.warn('IAM cache writer transaction outcome is unknown', { code: result.error.code, traceId: result.error.traceId })
      return result
    }
  }
  transactions.set(tx, pending)
  return pending
}

/**
 * 给真实写入口增加共享失效；txIndex 为已有事务参数的位置。
 * @example 模块内部上下文
 * ```ts
 * async function writeExample() {
 *   const operation = guardIamMutation(async (_tx?: DmlWithTxOperations) => core.ok(undefined), 0)
 *   const result = await operation()
 *   if (!result.success) return result
 *   return result.data
 * }
 * ```
 */
export function guardIamMutation<A extends unknown[], T>(operation: (...args: A) => Promise<HaiResult<T>>, txIndex: number): (...args: A) => Promise<HaiResult<T>> {
  return async (...args) => {
    // 事务参数来自已声明的 IAM 方法签名；此处只收窄公共事务句柄。
    const supplied = args[txIndex] as DmlWithTxOperations | undefined
    const execute = async (tx: DmlWithTxOperations): Promise<HaiResult<T>> => {
      const protectedTx = await protectIamTransaction(tx)
      if (!protectedTx.success)
        return protectedTx
      args[txIndex] = tx
      return await operation(...args)
    }
    try {
      return supplied
        ? await execute(supplied)
        : await reldb.tx.wrapResult(execute)
    }
    catch { return failure() }
  }
}

/**
 * 保护单条自动提交的 SQL。数据库确认成功后才能释放登记，执行结果未知时继续回源。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const update = guardIamStatement((sql: string) => reldb.sql.execute(sql))
 * void update
 * ```
 */
export function guardIamStatement<A extends unknown[], T>(operation: (...args: A) => Promise<HaiResult<T>>): (...args: A) => Promise<HaiResult<T>> {
  return async (...args) => {
    const id = randomUUID()
    const registered = await changeWriter(id, Date.now()).catch(() => failure())
    if (!registered.success)
      return registered
    const result = await operation(...args).catch(() => failure())
    if (result.success)
      await finish(id)
    else
      logger.warn('IAM cache writer statement outcome is unknown', { code: result.error.code, traceId: result.error.traceId })
    return result
  }
}

function describeRevision(value: CacheValue) {
  if (value === null)
    return { epoch: 'missing', writers: null, activeWriters: [] }
  if (isRevision(value))
    return value
  // 维护只比较旧标记，不解释或沿用其写入登记。
  const epoch = typeof value === 'object' && 'epoch' in value && typeof value.epoch === 'string'
    ? value.epoch
    : null
  return { epoch, writers: null, activeWriters: [] }
}

/**
 * 查询标记，或维护窗口内按预检代次比较并换代。调用方必须已核实写入口停用及数据库事务排空。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const checked = await maintainIamReadCacheRevision()
 * if (checked.success) void checked.data.epoch
 * ```
 */
export async function maintainIamReadCacheRevision(expectedEpoch?: string) {
  const current = await cache.kv.get(revisionKey)
  if (!current.success)
    return current
  const observed = describeRevision(current.data)
  if (expectedEpoch === undefined)
    return core.ok(observed)
  if (observed.epoch !== expectedEpoch)
    return core.err(HaiIamError.CONFLICT, iamM('iam_readCacheUnavailable'))
  const next = newRevision()
  const written = await cache.kv.compareAndSwap(revisionKey, current.data ?? undefined, next)
  if (!written.success)
    return written
  if (!written.data)
    return core.err(HaiIamError.CONFLICT, iamM('iam_readCacheUnavailable'))
  const confirmed = await cache.kv.get(revisionKey)
  if (!confirmed.success)
    return confirmed
  return isRevision(confirmed.data) && confirmed.data.epoch === next.epoch && confirmed.data.writers === 0
    ? core.ok(next)
    : core.err(HaiIamError.CONFLICT, iamM('iam_readCacheUnavailable'))
}
