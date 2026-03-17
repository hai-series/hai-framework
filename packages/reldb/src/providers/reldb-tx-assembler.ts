/**
 * @h-ai/reldb — 事务句柄组装
 *
 * 将事务连接的 DML 操作 + commit/rollback 生命周期组装为完整的 DmlWithTxOperations。
 * 内部自动管理 ensureActive 守卫（commit/rollback 后拒绝操作）。
 * @module reldb-tx-assembler
 */

import type { PaginatedResult, Result } from '@h-ai/core'
import type {
  CrudManager,
  DmlOperations,
  DmlWithTxOperations,
  ExecuteResult,
  PaginationQueryOptions,
  ReldbError,
  TxManager,
  TxWrapCallback,
} from '../reldb-types.js'

import { err, ok } from '@h-ai/core'

import { ReldbErrorCode } from '../reldb-config.js'
import { createCrud } from '../reldb-crud-kernel.js'
import { reldbM } from '../reldb-i18n.js'

// ─── 事务回调接口 ───

/**
 * 事务生命周期回调
 *
 * Provider 提供具体的 commit/rollback/release 操作。
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
 * - commit/rollback（调用回调 + 标记非活跃 + 释放资源）
 *
 * @param baseDmlOps - 事务连接上的 DML 操作
 * @param callbacks - 事务生命周期回调
 * @returns 完整的事务句柄
 */
export function createTxHandle(baseDmlOps: DmlOperations, callbacks: TxCallbacks): DmlWithTxOperations {
  let active = true

  const ensureActive = (): Result<void, ReldbError> => {
    if (!active) {
      return err({
        code: ReldbErrorCode.TRANSACTION_FAILED,
        message: callbacks.errorMessage('transaction finished'),
      })
    }
    return ok(undefined)
  }

  const guardedOps: DmlOperations = {
    async query<T>(sql: string, params?: unknown[]): Promise<Result<T[], ReldbError>> {
      const check = ensureActive()
      if (!check.success)
        return check
      return baseDmlOps.query<T>(sql, params)
    },
    async get<T>(sql: string, params?: unknown[]): Promise<Result<T | null, ReldbError>> {
      const check = ensureActive()
      if (!check.success)
        return check
      return baseDmlOps.get<T>(sql, params)
    },
    async execute(sql: string, params?: unknown[]): Promise<Result<ExecuteResult, ReldbError>> {
      const check = ensureActive()
      if (!check.success)
        return check
      return baseDmlOps.execute(sql, params)
    },
    async batch(statements: Array<{ sql: string, params?: unknown[] }>): Promise<Result<void, ReldbError>> {
      const check = ensureActive()
      if (!check.success)
        return check
      return baseDmlOps.batch(statements)
    },
    async queryPage<T>(options: PaginationQueryOptions): Promise<Result<PaginatedResult<T>, ReldbError>> {
      const check = ensureActive()
      if (!check.success)
        return check
      return baseDmlOps.queryPage<T>(options)
    },
  }

  const crudManager: CrudManager = {
    table: config => createCrud(guardedOps, config),
  }

  return {
    ...guardedOps,
    crud: crudManager,

    async commit(): Promise<Result<void, ReldbError>> {
      const check = ensureActive()
      if (!check.success)
        return check
      try {
        await callbacks.commit()
        active = false
        return ok(undefined)
      }
      catch (error) {
        active = false
        return err({
          code: ReldbErrorCode.TRANSACTION_FAILED,
          message: callbacks.errorMessage(String(error)),
          cause: error,
        })
      }
      finally {
        callbacks.release()
      }
    },

    async rollback(): Promise<Result<void, ReldbError>> {
      const check = ensureActive()
      if (!check.success)
        return check
      try {
        await callbacks.rollback()
        active = false
        return ok(undefined)
      }
      catch (error) {
        active = false
        return err({
          code: ReldbErrorCode.TRANSACTION_FAILED,
          message: callbacks.errorMessage(String(error)),
          cause: error,
        })
      }
      finally {
        callbacks.release()
      }
    },
  }
}

// ─── tx.wrap 语法糖 ───

/**
 * 创建统一的 tx.wrap 函数
 *
 * 自动管理事务生命周期：begin → callback → commit（成功）/ rollback（失败）。
 *
 * @param beginTx - 开启事务函数
 * @returns tx.wrap 函数
 */
export function createTxWrap(
  beginTx: () => Promise<Result<DmlWithTxOperations, ReldbError>>,
): TxManager['wrap'] {
  return async <T>(fn: TxWrapCallback<T>): Promise<Result<T, ReldbError>> => {
    const txResult = await beginTx()
    if (!txResult.success)
      return txResult

    try {
      const result = await fn(txResult.data)
      const commitResult = await txResult.data.commit()
      if (!commitResult.success) {
        return commitResult as Result<T, ReldbError>
      }
      return ok(result)
    }
    catch (error) {
      await txResult.data.rollback()
      return err({
        code: ReldbErrorCode.TRANSACTION_FAILED,
        message: reldbM('reldb_txFailed', { params: { error: String(error) } }),
        cause: error,
      })
    }
  }
}
