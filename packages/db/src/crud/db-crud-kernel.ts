/**
 * =============================================================================
 * @hai/db - CRUD 抽象
 * =============================================================================
 *
 * 提供基于单表的通用 CRUD 操作封装，支持在 db.sql 与事务 tx 中复用。
 *
 * @module db-crud-kernel
 * =============================================================================
 */

import type { PaginatedResult, Result } from '@hai/core'
import type {
  CrudConfig,
  CrudCountOptions,
  CrudPageOptions,
  CrudQueryOptions,
  CrudRepository,
  DataOperations,
  DbError,
  ExecuteResult,
  QueryRow,
  TxHandle,
} from '../db-types.js'
import { err, ok } from '@hai/core'

import { DbErrorCode } from '../db-config.js'
import { dbM } from '../db-i18n.js'

// =============================================================================
// CRUD 工具方法
// =============================================================================

function buildSelectColumns(select?: string[]): string {
  if (!select || select.length === 0) {
    // 未指定字段时默认全部列
    return '*'
  }
  return select.join(', ')
}

/**
 * 从数据对象中挑选允许的列和值
 *
 * @param data - 原始数据
 * @param allowList - 允许列清单（为空时不过滤）
 * @returns 列名与参数值数组
 */
function pickColumns(
  data: Record<string, unknown>,
  allowList?: string[],
): { columns: string[], values: unknown[] } {
  const keys = Object.keys(data)
  // 若提供 allowList，则仅保留白名单列
  const columns = allowList ? keys.filter(key => allowList.includes(key)) : keys
  const values = columns.map(key => data[key])
  return { columns, values }
}

/**
 * 解析 COUNT 查询返回值
 *
 * 兼容不同驱动/SQL 的列别名与返回类型。
 */
function parseCount(row: QueryRow | null | undefined): number {
  if (!row) {
    // 无数据默认 0
    return 0
  }
  if ('total' in row) {
    // 常见别名 total
    return Number(row.total ?? 0)
  }
  if ('__total__' in row) {
    // 某些驱动使用 __total__
    return Number(row.__total__ ?? 0)
  }
  if ('cnt' in row) {
    // 默认别名 cnt
    return Number(row.cnt ?? 0)
  }
  const value = Object.values(row)[0]
  if (typeof value === 'bigint') {
    // SQLite/PG bigint 处理
    return Number(value)
  }
  return Number(value ?? 0)
}

// =============================================================================
// CRUD 工厂
// =============================================================================

/**
 * 创建 CRUD 仓库
 *
 * @param ops - 数据操作接口（db.sql 或 tx）
 * @param config - CRUD 配置
 * @returns CRUD 仓库
 */
export function createCrud<TItem>(
  ops: DataOperations,
  config: CrudConfig<TItem>,
): CrudRepository<TItem> {
  const table = config.table
  const idColumn = config.idColumn ?? 'id'
  const selectColumns = buildSelectColumns(config.select)
  const mapRow = config.mapRow ?? ((row: QueryRow) => row as TItem)

  // SQL 片段拼接工具（仅在传入值时附加）
  const buildWhereClause = (where?: string): string => (where ? ` WHERE ${where}` : '')
  const buildOrderClause = (orderBy?: string): string => (orderBy ? ` ORDER BY ${orderBy}` : '')
  const buildLimitOffset = (limit?: number, offset?: number): string => {
    const parts: string[] = []
    if (typeof limit === 'number') {
      // limit 优先
      parts.push(` LIMIT ${limit}`)
    }
    if (typeof offset === 'number') {
      // offset 仅在传入时生效
      parts.push(` OFFSET ${offset}`)
    }
    return parts.join('')
  }

  const createPayloadError = (): Result<ExecuteResult, DbError> => err({
    code: DbErrorCode.CONFIG_ERROR,
    message: dbM('db_crudEmptyPayload'),
  })

  const createColumnsError = (): Result<ExecuteResult, DbError> => err({
    code: DbErrorCode.CONFIG_ERROR,
    message: dbM('db_crudNoValidColumns'),
  })

  const resolveOps = (tx?: TxHandle): DataOperations => tx ?? ops

  return {
    async create(data: Record<string, unknown>, tx?: TxHandle): Promise<Result<ExecuteResult, DbError>> {
      if (!data || Object.keys(data).length === 0) {
        // 空数据直接报错
        return createPayloadError()
      }

      const { columns, values } = pickColumns(data, config.createColumns)
      if (columns.length === 0) {
        // 白名单过滤后无可写列
        return createColumnsError()
      }

      const placeholders = columns.map(() => '?').join(', ')
      const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`
      return resolveOps(tx).execute(sql, values)
    },

    async createMany(items: Array<Record<string, unknown>>, tx?: TxHandle): Promise<Result<void, DbError>> {
      if (!items || items.length === 0) {
        // 空数组视为成功
        return ok(undefined)
      }

      const statements: Array<{ sql: string, params?: unknown[] }> = []

      for (const item of items) {
        if (!item || Object.keys(item).length === 0) {
          // 任意项为空则整体失败
          return err({
            code: DbErrorCode.CONFIG_ERROR,
            message: dbM('db_crudEmptyPayload'),
          })
        }

        const { columns, values } = pickColumns(item, config.createColumns)
        if (columns.length === 0) {
          // 过滤后无可写列
          return err({
            code: DbErrorCode.CONFIG_ERROR,
            message: dbM('db_crudNoValidColumns'),
          })
        }

        const placeholders = columns.map(() => '?').join(', ')
        const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`
        statements.push({ sql, params: values })
      }

      return resolveOps(tx).batch(statements)
    },

    async findById(id: unknown, tx?: TxHandle): Promise<Result<TItem | null, DbError>> {
      const sql = `SELECT ${selectColumns} FROM ${table} WHERE ${idColumn} = ?`
      const result = await resolveOps(tx).get<QueryRow>(sql, [id])
      if (!result.success) {
        // 透传查询错误
        return result
      }
      // 未命中时返回 null
      return ok(result.data ? mapRow(result.data) : null)
    },

    async findAll(options: CrudQueryOptions = {}, tx?: TxHandle): Promise<Result<TItem[], DbError>> {
      const whereClause = buildWhereClause(options.where)
      const orderClause = buildOrderClause(options.orderBy)
      const limitClause = buildLimitOffset(options.limit, options.offset)
      const sql = `SELECT ${selectColumns} FROM ${table}${whereClause}${orderClause}${limitClause}`
      const result = await resolveOps(tx).query<QueryRow>(sql, options.params)
      if (!result.success) {
        // 透传查询错误
        return result
      }
      return ok(result.data.map(row => mapRow(row)))
    },

    async findPage(options: CrudPageOptions, tx?: TxHandle): Promise<Result<PaginatedResult<TItem>, DbError>> {
      const whereClause = buildWhereClause(options.where)
      const orderClause = buildOrderClause(options.orderBy)
      const sql = `SELECT ${selectColumns} FROM ${table}${whereClause}${orderClause}`
      const pageResult = await resolveOps(tx).queryPage<QueryRow>({
        sql,
        params: options.params,
        pagination: options.pagination,
        overrides: options.overrides,
      })
      if (!pageResult.success) {
        // 透传分页查询错误
        return pageResult
      }
      return ok({
        ...pageResult.data,
        items: pageResult.data.items.map(row => mapRow(row)),
      })
    },

    async updateById(id: unknown, data: Record<string, unknown>, tx?: TxHandle): Promise<Result<ExecuteResult, DbError>> {
      if (!data || Object.keys(data).length === 0) {
        // 空数据不允许更新
        return createPayloadError()
      }

      const allowList = (config.updateColumns ?? []).filter(column => column !== idColumn)
      const { columns } = pickColumns(data, allowList.length > 0 ? allowList : undefined)
      const filtered = columns.filter(column => column !== idColumn)

      if (filtered.length === 0) {
        // 过滤后无可更新列
        return createColumnsError()
      }

      const setClause = filtered.map(column => `${column} = ?`).join(', ')
      const sql = `UPDATE ${table} SET ${setClause} WHERE ${idColumn} = ?`
      const params = [...filtered.map(column => data[column]), id]
      return resolveOps(tx).execute(sql, params)
    },

    async deleteById(id: unknown, tx?: TxHandle): Promise<Result<ExecuteResult, DbError>> {
      const sql = `DELETE FROM ${table} WHERE ${idColumn} = ?`
      return resolveOps(tx).execute(sql, [id])
    },

    async count(options: CrudCountOptions = {}, tx?: TxHandle): Promise<Result<number, DbError>> {
      const whereClause = buildWhereClause(options.where)
      const sql = `SELECT COUNT(*) as cnt FROM ${table}${whereClause}`
      const result = await resolveOps(tx).get<QueryRow>(sql, options.params)
      if (!result.success) {
        // 透传查询错误
        return result
      }
      return ok(parseCount(result.data ?? null))
    },

    async exists(options: CrudCountOptions = {}, tx?: TxHandle): Promise<Result<boolean, DbError>> {
      const whereClause = buildWhereClause(options.where)
      const sql = `SELECT 1 as exist_flag FROM ${table}${whereClause} LIMIT 1`
      const result = await resolveOps(tx).get<QueryRow>(sql, options.params)
      if (!result.success) {
        // 透传查询错误
        return result
      }
      // 只要命中一行即存在
      return ok(Boolean(result.data))
    },

    async existsById(id: unknown, tx?: TxHandle): Promise<Result<boolean, DbError>> {
      const sql = `SELECT 1 as exist_flag FROM ${table} WHERE ${idColumn} = ? LIMIT 1`
      const result = await resolveOps(tx).get<QueryRow>(sql, [id])
      if (!result.success) {
        // 透传查询错误
        return result
      }
      return ok(Boolean(result.data))
    },
  }
}
