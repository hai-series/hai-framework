import type { ReldbOpsContext } from '../src/providers/reldb-provider-base.js'
import { core, ok } from '@h-ai/core'
import { describe, expect, it, vi } from 'vitest'
import { createBaseDdlOps, createBaseDmlOps, createBaseTxManager, logReldbOperation } from '../src/providers/reldb-provider-base.js'

function createContext(): ReldbOpsContext {
  return {
    isConnected: () => true,
    operationLog: () => ({ read: true, write: false, maxLength: 24, level: 'trace' }),
    logger: {
      error: vi.fn<(message: string, context?: Record<string, unknown>) => void>(),
      info: vi.fn<(message: string, context?: Record<string, unknown>) => void>(),
      debug: vi.fn<(message: string, context?: Record<string, unknown>) => void>(),
      trace: vi.fn<(message: string, context?: Record<string, unknown>) => void>(),
    },
  }
}

describe('reldb operation log', () => {
  it('logs enabled read operations through context config', () => {
    const ctx = createContext()

    logReldbOperation(
      ctx,
      'read',
      'query',
      { sql: 'SELECT * FROM users WHERE name = ?', params: ['very-long-parameter-value'] },
    )

    expect(ctx.logger.trace).toHaveBeenCalledOnce()
    expect(ctx.logger.debug).not.toHaveBeenCalled()
    expect(ctx.logger.info).not.toHaveBeenCalled()
    expect(ctx.logger.trace).toHaveBeenCalledWith('RelDB operation executed', {
      category: 'read',
      operation: 'query',
      payload: expect.stringMatching(/^.{24}$/),
    })
  })

  it('logs detailed driver errors with the trace but excludes SQL literals, bound values and DDL defaults', async () => {
    const ctx = createContext()
    ctx.operationLog = () => ({ read: true, write: true, maxLength: 1000, level: 'trace' })
    const secret = 'NOT_A_REAL_SECRET'
    logReldbOperation(ctx, 'write', 'execute', { sql: `INSERT INTO secrets VALUES ('${secret}')`, params: [secret] })
    logReldbOperation(ctx, 'write', 'batch', { statements: [{ sql: secret, params: [secret] }] })
    logReldbOperation(ctx, 'write', 'ddl.createTable', { columns: { password: { defaultValue: secret } } })
    const rawError = Object.assign(new Error(`Driver rejected ${secret}`), { code: '23505', schema: 'public', constraint: 'entries_2_key', routine: '_bt_check_unique', sql: secret, parameters: [secret] })
    rawError.stack = `Error: Driver rejected ${secret}\n    at execute (database.ts:25:50)`
    const dml = createBaseDmlOps(ctx, {
      query: vi.fn(async () => { throw rawError }),
      get: vi.fn(async () => ok(null)),
      execute: vi.fn(async () => ok({ changes: 1 })),
      batch: vi.fn(async () => ok(undefined)),
      queryPage: vi.fn(async () => ok({ items: [], total: 0, page: 1, pageSize: 20 })),
    })
    const result = await core.context.run({ requestId: 'sql-detail' }, () => dml.query('SELECT ?, ?, ?', [secret, 2, 5]))
    expect(result).toMatchObject({ success: false, error: { traceId: 'sql-detail' } })
    if (!result.success) {
      expect(result.error.message).not.toContain(secret)
      expect(result.error.cause).toMatchObject({ code: '23505', schema: 'public', constraint: 'entries_2_key', routine: '_bt_check_unique', stack: expect.stringContaining('database.ts:25:50') })
    }
    const logged = JSON.stringify([vi.mocked(ctx.logger.trace).mock.calls, vi.mocked(ctx.logger.error).mock.calls])
    expect(logged).not.toContain(secret)
    expect(logged).not.toContain('INSERT INTO')
    expect(logged).toContain('parameterCount')
    expect(logged).toContain('statementCount')
    expect(logged).toContain('Driver rejected')
    expect(logged).toContain('23505')
    expect(logged).toContain('sql-detail')
  })

  it('logs from base DML operations before delegating to raw operations', async () => {
    const ctx = createContext()
    const rawQuery = vi.fn(async () => ok([{ id: 1 }]))
    const dml = createBaseDmlOps(ctx, {
      query: rawQuery,
      get: vi.fn(async () => ok(null)),
      execute: vi.fn(async () => ok({ changes: 1 })),
      batch: vi.fn(async () => ok(undefined)),
      queryPage: vi.fn(async () => ok({ items: [], total: 0, page: 1, pageSize: 20 })),
    })

    const result = await dml.query('SELECT * FROM users WHERE name = ?', ['Alice'])

    expect(result.success).toBe(true)
    expect(rawQuery).toHaveBeenCalledWith('SELECT * FROM users WHERE name = ?', ['Alice'])
    expect(ctx.logger.trace).toHaveBeenCalledWith('RelDB operation executed', expect.objectContaining({
      category: 'read',
      operation: 'query',
    }))
  })

  it('logs from base DDL operations before delegating to raw operations', async () => {
    const ctx = createContext()
    ctx.operationLog = () => ({ read: false, write: true, maxLength: 1000, level: 'debug' })
    const rawCreateTable = vi.fn(async () => ok(undefined))
    const ddl = createBaseDdlOps(ctx, {
      createTable: rawCreateTable,
      dropTable: vi.fn(async () => ok(undefined)),
      addColumn: vi.fn(async () => ok(undefined)),
      dropColumn: vi.fn(async () => ok(undefined)),
      renameTable: vi.fn(async () => ok(undefined)),
      createIndex: vi.fn(async () => ok(undefined)),
      dropIndex: vi.fn(async () => ok(undefined)),
      raw: vi.fn(async () => ok(undefined)),
    })

    const result = await ddl.createTable('users', { id: { type: 'INTEGER', primaryKey: true } })

    expect(result.success).toBe(true)
    expect(rawCreateTable).toHaveBeenCalledWith('users', { id: { type: 'INTEGER', primaryKey: true } }, true)
    expect(ctx.logger.debug).toHaveBeenCalledWith('RelDB operation executed', expect.objectContaining({
      category: 'write',
      operation: 'ddl.createTable',
    }))
  })

  it('logs transaction lifecycle operations from base tx manager', async () => {
    const ctx = createContext()
    ctx.operationLog = () => ({ read: false, write: true, maxLength: 1000, level: 'debug' })
    const commit = vi.fn(async () => ok(undefined))
    const rollback = vi.fn(async () => ok(undefined))
    const txManager = createBaseTxManager(ctx, async () => ok({
      query: vi.fn(async () => ok([])),
      get: vi.fn(async () => ok(null)),
      execute: vi.fn(async () => ok({ changes: 1 })),
      batch: vi.fn(async () => ok(undefined)),
      queryPage: vi.fn(async () => ok({ items: [], total: 0, page: 1, pageSize: 20 })),
      crud: { table: vi.fn() },
      commit,
      rollback,
    }))

    const txResult = await txManager.begin()
    expect(txResult.success).toBe(true)
    if (!txResult.success) {
      return
    }

    await txResult.data.commit()
    const rollbackTxResult = await txManager.begin()
    expect(rollbackTxResult.success).toBe(true)
    if (!rollbackTxResult.success) {
      return
    }
    await rollbackTxResult.data.rollback()
    await txManager.wrap(async () => undefined)

    expect(commit).toHaveBeenCalledTimes(2)
    expect(rollback).toHaveBeenCalledTimes(1)
    expect(ctx.logger.debug).toHaveBeenCalledWith('RelDB operation executed', expect.objectContaining({ operation: 'tx.begin' }))
    expect(ctx.logger.debug).toHaveBeenCalledWith('RelDB operation executed', expect.objectContaining({ operation: 'tx.commit' }))
    expect(ctx.logger.debug).toHaveBeenCalledWith('RelDB operation executed', expect.objectContaining({ operation: 'tx.rollback' }))
  })

  it('does not log disabled categories', () => {
    const ctx = createContext()
    ctx.operationLog = () => ({ read: false, write: true, maxLength: 1000, level: 'info' })

    logReldbOperation(ctx, 'read', 'get', { sql: 'SELECT 1' })

    expect(ctx.logger.info).not.toHaveBeenCalled()
    expect(ctx.logger.debug).not.toHaveBeenCalled()
    expect(ctx.logger.trace).not.toHaveBeenCalled()
  })
})
