/**
 * @h-ai/reldb — 事务句柄组装
 *
 * 将事务连接的 DML 操作 + commit/rollback 生命周期组装为完整的 DmlWithTxOperations。
 * 事务结束开始时拒绝新操作并等待此前接受的操作结算。
 * @module reldb-tx-assembler
 */

import type { HaiResult, PaginatedResult } from '@h-ai/core'

import type {
  CrudManager,
  DmlOperations,
  DmlWithTxOperations,
  ExecuteResult,
  PaginationQueryOptions,
  TxManager,
  TxWrapCallback,
} from '../reldb-types.js'
import { core } from '@h-ai/core'
import { createCrud } from '../reldb-crud-kernel.js'
import { reldbM } from '../reldb-i18n.js'
import { HaiReldbError } from '../reldb-types.js'

// ─── 事务回调接口 ───

/**
 * 事务生命周期回调
 *
 * Provider 提供具体的 commit/rollback/release 操作。
 * @example 模块内部上下文
 * ```ts
 * function release(callbacks: TxCallbacks) {
 *   callbacks.release() // commit/rollback 之后归还唯一事务资源。
 * }
 * ```
 */
export interface TxCallbacks {
  /** 提交事务 */
  commit: () => Promise<void>
  /** 回滚事务 */
  rollback: () => Promise<void>
  /** 释放资源（连接归还池等），commit/rollback 后调用 */
  release: () => void
  /** 事务错误消息生成 */
  errorMessage: (detail: string) => string
}

// ─── 事务句柄组装 ───

/**
 * 组装完整的事务句柄
 *
 * 内部自动管理：
 * - ensureActive 守卫（commit/rollback 后拒绝操作）
 * - DmlOperations（带守卫）
 * - crud（基于 DmlOperations 创建）
 * - commit/rollback（拒绝新操作、等待在途操作、结束事务并释放资源）
 *
 * @param baseDmlOps - 事务连接上的 DML 操作
 * @param callbacks - 事务生命周期回调
 * @returns 完整的事务句柄
 * @example 模块内部上下文
 * ```ts
 * function wrap(ops: DmlOperations, callbacks: TxCallbacks) {
 *   return createTxHandle(ops, callbacks)
 * }
 * ```
 */
export function createTxHandle(baseDmlOps: DmlOperations, callbacks: TxCallbacks): DmlWithTxOperations {
  let active = true
  const inFlight = new Set<Promise<unknown>>()

  const ensureActive = (): HaiResult<void> => {
    if (!active) {
      return core.err(HaiReldbError.TRANSACTION_FAILED, callbacks.errorMessage('transaction finished'))
    }
    return core.ok(undefined)
  }

  function runOperation<T>(run: () => Promise<HaiResult<T>>): Promise<HaiResult<T>> {
    const check = ensureActive()
    if (!check.success)
      return Promise.resolve(check)

    // 先登记再进入驱动。两条完成路径都移除登记，原结果交给调用方。
    const operation = Promise.resolve().then(run)
    inFlight.add(operation)
    const remove = () => {
      inFlight.delete(operation)
    }
    void operation.then(remove, remove)
    return operation
  }

  const guardedOps: DmlOperations = {
    query<T>(sql: string, params?: unknown[]): Promise<HaiResult<T[]>> {
      return runOperation(() => baseDmlOps.query<T>(sql, params))
    },
    get<T>(sql: string, params?: unknown[]): Promise<HaiResult<T | null>> {
      return runOperation(() => baseDmlOps.get<T>(sql, params))
    },
    execute(sql: string, params?: unknown[]): Promise<HaiResult<ExecuteResult>> {
      return runOperation(() => baseDmlOps.execute(sql, params))
    },
    batch(statements) {
      return runOperation(() => baseDmlOps.batch(statements))
    },
    queryPage<T>(options: PaginationQueryOptions): Promise<HaiResult<PaginatedResult<T>>> {
      return runOperation(() => baseDmlOps.queryPage<T>(options))
    },
  }

  const crudManager: CrudManager = {
    table: config => createCrud(guardedOps, config),
  }

  async function finish(action: 'commit' | 'rollback'): Promise<HaiResult<void>> {
    const check = ensureActive()
    if (!check.success)
      return check
    // 先独占结束权，后续 DML 无法加入等待集合。
    active = false
    try {
      if (inFlight.size)
        await Promise.allSettled(inFlight)
      await callbacks[action]()
      return core.ok(undefined)
    }
    catch (error) {
      return core.err(HaiReldbError.TRANSACTION_FAILED, callbacks.errorMessage(String(error)), error)
    }
    finally {
      callbacks.release()
    }
  }

  return {
    ...guardedOps,
    crud: crudManager,
    commit: () => finish('commit'),
    rollback: () => finish('rollback'),
  }
}

// ─── tx.wrap 语法糖 ───

function callbackFailure(error: unknown) {
  return core.err(HaiReldbError.TRANSACTION_FAILED, reldbM('reldb_txFailed', {
    params: {
      error: String(error),
    },
  }), error)
}

/**
 * 创建统一的 tx.wrap 函数
 *
 * 自动管理事务生命周期：begin → callback → commit（成功）/ rollback（失败）。
 *
 * @param beginTx - 开启事务函数
 * @returns tx.wrap 函数
 * @example 模块内部上下文
 * ```ts
 * function wrap(begin: () => Promise<HaiResult<DmlWithTxOperations>>) {
 *   return createTxWrap(begin)
 * }
 * ```
 */
export function createTxWrap(
  beginTx: () => Promise<HaiResult<DmlWithTxOperations>>,
): TxManager['wrap'] {
  return async <T>(fn: TxWrapCallback<T>): Promise<HaiResult<T>> => {
    const txResult = await beginTx()
    if (!txResult.success)
      return txResult

    try {
      const result = await fn(txResult.data)
      const commitResult = await txResult.data.commit()
      if (!commitResult.success) {
        return commitResult as HaiResult<T>
      }
      return core.ok(result)
    }
    catch (error) {
      await txResult.data.rollback()
      return callbackFailure(error)
    }
  }
}

/**
 * 组装在事务边界展开业务结果的入口。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * function wrap(begin: TxManager['begin']) {
 *   return createTxResultWrap(begin)
 * }
 * ```
 */
export function createTxResultWrap(begin: TxManager['begin']): TxManager['wrapResult'] {
  return async <T>(fn: TxWrapCallback<HaiResult<T>>): Promise<HaiResult<T>> => {
    const opened = await begin()
    if (!opened.success)
      return opened

    const tx = opened.data
    let result: HaiResult<T>
    try {
      result = await fn(tx)
    }
    catch (error) {
      result = callbackFailure(error)
    }

    const finished = result.success
      ? await tx.commit()
      : await tx.rollback()
    return finished.success ? result : finished
  }
}
