/** IAM 热路径共享缓存；写入栅栏覆盖数据库提交和外部事务完成。 */
import type { HaiResult } from '@h-ai/core'
import type { DmlWithTxOperations } from '@h-ai/reldb'
import { randomUUID } from 'node:crypto'
import { cache } from '@h-ai/cache'
import { core, err, ok } from '@h-ai/core'
import { iamM } from './iam-i18n.js'
import { HaiIamError } from './iam-types.js'

/**
 * 缓存读取代际与尚未确认完成的写入数。
 * @example 模块内部上下文
 * ```ts
 * const state: Revision = { epoch: 'example', writers: 0 }
 * void state
 * ```
 */
interface Revision { epoch: string, writers: number }
const revisionKey = 'hai:iam:read_cache:revision'
const transactions = new WeakMap<DmlWithTxOperations, Promise<HaiResult<void>>>()
const logger = core.logger.child({ module: 'iam', scope: 'read-cache' })
let degraded = false
function failure() {
  return err(HaiIamError.REPOSITORY_ERROR, iamM('iam_sessionExpired'))
}

async function revision(): Promise<HaiResult<Revision>> {
  const current = await cache.kv.get<Revision>(revisionKey)
  if (!current.success)
    return current
  if (current.data)
    return ok(current.data)
  const created = await cache.kv.set(revisionKey, { epoch: randomUUID(), writers: 0 }, { nx: true })
  if (!created.success)
    return created
  const loaded = await cache.kv.get<Revision>(revisionKey)
  return loaded.success && loaded.data ? ok(loaded.data) : failure()
}

async function change(delta: number): Promise<HaiResult<void>> {
  for (let attempt = 0; attempt < 32; attempt++) {
    const current = await revision()
    if (!current.success)
      return current
    const written = await cache.kv.compareAndSwap(revisionKey, current.data, { epoch: randomUUID(), writers: Math.max(0, current.data.writers + delta) })
    if (!written.success)
      return written
    if (written.data)
      return ok(undefined)
  }
  return failure()
}

/**
 * 只缓存成功的有限寿命 DTO；写入中或 Redis 不可用时回源，绝不复用旧授权。
 * @example 模块内部上下文
 * ```ts
 * async function readExample() {
 *   const result = await readIamCache('example', async () => ok({ enabled: true }))
 *   if (!result.success) return result
 *   return result.data.enabled
 * }
 * ```
 */
export async function readIamCache<T>(key: string, load: () => Promise<HaiResult<T>>): Promise<HaiResult<T>> {
  const before = await revision()
  if (!before.success || before.data.writers)
    return load()
  const address = `hai:iam:read_cache:${before.data.epoch}:${key}`
  const cached = await cache.kv.get<{ value: T }>(address)
  if (cached.success && cached.data) {
    const after = await revision()
    if (after.success && !after.data.writers && after.data.epoch === before.data.epoch)
      return ok(cached.data.value)
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

async function finish() {
  const completed = await change(-1)
  if (!completed.success && !degraded) {
    degraded = true
    // 写入已提交时不能伪装成失败；持久脏标记保留，后续鉴权安全回源。
    logger.warn('IAM cache invalidation incomplete; authorization reads use database', { code: completed.error.code })
  }
  if (completed.success)
    degraded = false
}

async function enroll(tx: DmlWithTxOperations): Promise<HaiResult<void>> {
  const existing = transactions.get(tx)
  if (existing)
    return existing
  const pending = (async () => {
    const started = await change(1)
    if (!started.success)
      return started
    const commit = tx.commit.bind(tx)
    const rollback = tx.rollback.bind(tx)
    // DmlWithTxOperations 的完成方法可写；原方法仍恰好调用一次。
    // 未知提交结果或进程崩溃保留脏标记，不依赖 TTL 恢复可能过时的授权。
    tx.commit = async () => {
      const result = await commit()
      if (result.success)
        await finish()
      return result
    }
    tx.rollback = async () => {
      const result = await rollback()
      if (result.success)
        await finish()
      return result
    }
    return ok(undefined)
  })()
  transactions.set(tx, pending)
  return pending
}

/**
 * 给真实写入口增加共享失效；txIndex 为已有事务参数的位置。
 * @example 模块内部上下文
 * ```ts
 * async function writeExample() {
 *   const operation = guardIamMutation(async () => ok(undefined))
 *   const result = await operation()
 *   if (!result.success) return result
 *   return result.data
 * }
 * ```
 */
export function guardIamMutation<A extends unknown[], T>(operation: (...args: A) => Promise<HaiResult<T>>, txIndex?: number): (...args: A) => Promise<HaiResult<T>> {
  return async (...args) => {
    const candidate = txIndex === undefined ? undefined : args[txIndex]
    // 事务参数来自已声明的 IAM 方法签名；此处只收窄公共事务句柄。
    const tx = candidate as DmlWithTxOperations | undefined
    let started: HaiResult<void>
    try {
      started = tx ? await enroll(tx) : await change(1)
    }
    catch { return failure() }
    if (!started.success)
      return started
    try {
      return await operation(...args)
    }
    catch { return failure() }
    finally {
      if (!tx)
        await finish()
    }
  }
}
