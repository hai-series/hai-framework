/**
 * @h-ai/db — CRUD 抽象
 *
 * 提供基于单表的通用 CRUD 操作封装，支持在 db.sql 与事务 tx 中复用。
 * @module db-crud-kernel
 */

import type { PaginatedResult, Result } from '@h-ai/core'
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
} from './db-types.js'
import { err, ok } from '@h-ai/core'

import { DbErrorCode } from './db-config.js'
import { dbM } from './db-i18n.js'
import { parseCount } from './db-pagination.js'
import { validateIdentifier, validateIdentifiers } from './db-security.js'

// ─── CRUD 工具方法 ───

/**
 * 构建查询列字符串
 *
 * @param select - 列名数组（空或未提供时返回 '*'）
 * @returns SQL SELECT 列片段
 */
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

// ─── CRUD 工厂 ───

/**
 * 创建一个所有方法均返回同一错误的 CrudRepository，用于配置校验失败时短路返回
 *
 * @param configError - 校验失败产生的 DbError
 * @returns 所有操作均返回 configError 的 CrudRepository
 */
function createFailCrudRepository<TItem>(configError: DbError): CrudRepository<TItem> {
  const failResult = <T>(): Promise<Result<T, DbError>> => Promise.resolve(err(configError))
  return {
    create: () => failResult(),
    createMany: () => failResult(),
    findById: () => failResult(),
    findAll: () => failResult(),
    findPage: () => failResult(),
    updateById: () => failResult(),
    deleteById: () => failResult(),
    count: () => failResult(),
    exists: () => failResult(),
    existsById: () => failResult(),
  }
}

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

  // 校验表名与主键列名，防止标识符注入
  const tableValid = validateIdentifier(table)
  if (!tableValid.success) {
    return createFailCrudRepository(tableValid.error)
  }
  const idColumnValid = validateIdentifier(idColumn)
  if (!idColumnValid.success) {
    return createFailCrudRepository(idColumnValid.error)
  }
  // 校验 select / createColumns / updateColumns 列名
  if (config.select) {
    const selectValid = validateIdentifiers(config.select)
    if (!selectValid.success) {
      return createFailCrudRepository(selectValid.error)
    }
  }
  if (config.createColumns) {
    const createColsValid = validateIdentifiers(config.createColumns)
    if (!createColsValid.success) {
      return createFailCrudRepository(createColsValid.error)
    }
  }
  if (config.updateColumns) {
    const updateColsValid = validateIdentifiers(config.updateColumns)
    if (!updateColsValid.success) {
      return createFailCrudRepository(updateColsValid.error)
    }
  }

  // SQL 片段拼接工具（仅在传入值时附加）

  /** 构建 WHERE 子句，无条件时返回空字符串 */
  const buildWhereClause = (where?: string): string => (where ? ` WHERE ${where}` : '')

  /**
   * 构建 ORDER BY 子句
   *
   * 对 orderBy 中的标识符逐一校验，防止 SQL 注入。
   * 仅允许 `column`、`column ASC`、`column DESC` 格式。
   * 校验失败时返回空字符串（静默忽略非法排序）。
   */
  const buildOrderClause = (orderBy?: string): string => {
    if (!orderBy)
      return ''
    // 解析并校验每个排序字段
    const parts = orderBy.split(',').map(s => s.trim()).filter(Boolean)
    const safeParts: string[] = []
    for (const part of parts) {
      // 匹配 "column" 或 "column ASC/DESC" 格式
      const match = part.match(/^(\w+)(?:\s+(ASC|DESC))?$/i)
      if (!match)
        continue
      const colName = match[1]
      const direction = match[2] ?? ''
      const colValid = validateIdentifier(colName)
      if (!colValid.success)
        continue
      safeParts.push(direction ? `${colName} ${direction.toUpperCase()}` : colName)
    }
    if (safeParts.length === 0)
      return ''
    return ` ORDER BY ${safeParts.join(', ')}`
  }
  /** 构建 LIMIT/OFFSET 子句，仅在传入值时生效 */
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

  /** 构建空负载错误结果（数据为空时报错） */
  const createPayloadError = (): Result<ExecuteResult, DbError> => err({
    code: DbErrorCode.CONFIG_ERROR,
    message: dbM('db_crudEmptyPayload'),
  })

  /** 构建无有效列错误结果（白名单过滤后无可写列时报错） */
  const createColumnsError = (): Result<ExecuteResult, DbError> => err({
    code: DbErrorCode.CONFIG_ERROR,
    message: dbM('db_crudNoValidColumns'),
  })

  /** 解析实际数据操作接口：传入事务时使用事务接口，否则使用 db.sql */
  const resolveOps = (tx?: TxHandle): DataOperations => tx ?? ops

  return {
    /**
     * 创建单条记录
     *
     * @param data - 列名与值的映射（会根据 createColumns 白名单过滤）
     * @param tx - 可选事务句柄
     * @returns 插入结果（含 changes、lastInsertRowid）
     */
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

      // 校验列名合法性，防止通过 data key 注入
      const colValid = validateIdentifiers(columns)
      if (!colValid.success) {
        return colValid as unknown as Result<ExecuteResult, DbError>
      }

      const placeholders = columns.map(() => '?').join(', ')
      const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`
      return resolveOps(tx).execute(sql, values)
    },

    /**
     * 批量创建记录
     *
     * 所有记录在同一 batch 中执行，任意一条失败则整体失败。
     *
     * @param items - 待插入的数据数组
     * @param tx - 可选事务句柄
     * @returns 批量插入结果
     */
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

        // 校验列名合法性
        const colValid = validateIdentifiers(columns)
        if (!colValid.success) {
          return colValid as unknown as Result<void, DbError>
        }

        const placeholders = columns.map(() => '?').join(', ')
        const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`
        statements.push({ sql, params: values })
      }

      return resolveOps(tx).batch(statements)
    },

    /**
     * 根据主键查找单条记录
     *
     * @param id - 主键值
     * @param tx - 可选事务句柄
     * @returns 记录对象或 null（未找到）
     */
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

    /**
     * 条件查询多条记录
     *
     * @param options - 查询条件（where、orderBy、limit、offset）
     * @param tx - 可选事务句柄
     * @returns 记录数组
     */
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

    /**
     * 分页查询记录
     *
     * @param options - 分页查询条件（where、orderBy、pagination、overrides）
     * @param tx - 可选事务句柄
     * @returns 分页结果（含 items、total、page、pageSize）
     */
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

    /**
     * 根据主键更新记录
     *
     * 主键列不可更新，会自动排除。
     *
     * @param id - 主键值
     * @param data - 待更新的列值映射（会根据 updateColumns 白名单过滤）
     * @param tx - 可选事务句柄
     * @returns 更新结果（含 changes）
     */
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

      // 校验列名合法性，防止通过 data key 注入
      const colValid = validateIdentifiers(filtered)
      if (!colValid.success) {
        return colValid as unknown as Result<ExecuteResult, DbError>
      }

      const setClause = filtered.map(column => `${column} = ?`).join(', ')
      const sql = `UPDATE ${table} SET ${setClause} WHERE ${idColumn} = ?`
      const params = [...filtered.map(column => data[column]), id]
      return resolveOps(tx).execute(sql, params)
    },

    /**
     * 根据主键删除记录
     *
     * @param id - 主键值
     * @param tx - 可选事务句柄
     * @returns 删除结果（含 changes）
     */
    async deleteById(id: unknown, tx?: TxHandle): Promise<Result<ExecuteResult, DbError>> {
      const sql = `DELETE FROM ${table} WHERE ${idColumn} = ?`
      return resolveOps(tx).execute(sql, [id])
    },

    /**
     * 统计符合条件的记录数
     *
     * @param options - 查询条件（where、params）
     * @param tx - 可选事务句柄
     * @returns 记录数
     */
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

    /**
     * 检查是否存在符合条件的记录
     *
     * @param options - 查询条件（where、params）
     * @param tx - 可选事务句柄
     * @returns 是否存在
     */
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

    /**
     * 根据主键检查记录是否存在
     *
     * @param id - 主键值
     * @param tx - 可选事务句柄
     * @returns 是否存在
     */
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
