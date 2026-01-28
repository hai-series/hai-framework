/**
 * =============================================================================
 * @hai/db - Repository 基类
 * =============================================================================
 * 提供通用的 CRUD 操作封装
 * =============================================================================
 */

import type { Result } from '@hai/core'
import { createLogger, err, generateId, ok } from '@hai/core'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { eq, sql, type SQL } from 'drizzle-orm'
import type { SQLiteTableWithColumns, TableConfig } from 'drizzle-orm/sqlite-core'

const logger = createLogger({ name: 'db-repository' })

/**
 * Repository 错误类型
 */
export type RepositoryErrorType =
    | 'NOT_FOUND'
    | 'DUPLICATE'
    | 'QUERY_FAILED'
    | 'VALIDATION_FAILED'

/**
 * Repository 错误
 */
export interface RepositoryError {
    type: RepositoryErrorType
    message: string
    cause?: unknown
}

/**
 * 分页参数
 */
export interface PaginationParams {
    /** 页码（从 1 开始） */
    page?: number
    /** 每页数量 */
    pageSize?: number
}

/**
 * 分页结果
 */
export interface PaginatedResult<T> {
    /** 数据列表 */
    data: T[]
    /** 总数 */
    total: number
    /** 当前页码 */
    page: number
    /** 每页数量 */
    pageSize: number
    /** 总页数 */
    totalPages: number
}

/**
 * 基础 Repository
 * 
 * 提供通用的 CRUD 操作
 */
export abstract class BaseRepository<
    TTable extends SQLiteTableWithColumns<TableConfig>,
    TInsert extends Record<string, unknown>,
    TSelect extends Record<string, unknown>,
> {
    protected db: BetterSQLite3Database<Record<string, never>>
    protected table: TTable
    protected tableName: string
    protected idColumn: keyof TSelect

    constructor(
        db: BetterSQLite3Database<Record<string, never>>,
        table: TTable,
        tableName: string,
        idColumn: keyof TSelect = 'id' as keyof TSelect,
    ) {
        this.db = db
        this.table = table
        this.tableName = tableName
        this.idColumn = idColumn
    }

    /**
     * 创建记录
     * 
     * @param data - 要插入的数据
     * @returns 创建的记录
     */
    async create(data: TInsert): Promise<Result<TSelect, RepositoryError>> {
        try {
            // 如果没有 ID，自动生成
            const insertData = {
                ...data,
                [this.idColumn]: (data as Record<string, unknown>)[this.idColumn as string] ?? generateId(),
            }

            const result = this.db
                .insert(this.table)
                .values(insertData as never)
                .returning()
                .get()

            logger.debug({ table: this.tableName, id: (result as Record<string, unknown>)[this.idColumn as string] }, 'Record created')

            return ok(result as TSelect)
        }
        catch (error) {
            // 检查是否为唯一约束违反
            if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
                return err({
                    type: 'DUPLICATE',
                    message: `Duplicate record in ${this.tableName}`,
                    cause: error,
                })
            }

            logger.error({ error, table: this.tableName }, 'Failed to create record')
            return err({
                type: 'QUERY_FAILED',
                message: `Failed to create record: ${error}`,
                cause: error,
            })
        }
    }

    /**
     * 批量创建记录
     * 
     * @param dataList - 要插入的数据列表
     * @returns 创建的记录列表
     */
    async createMany(dataList: TInsert[]): Promise<Result<TSelect[], RepositoryError>> {
        try {
            const insertDataList = dataList.map(data => ({
                ...data,
                [this.idColumn]: (data as Record<string, unknown>)[this.idColumn as string] ?? generateId(),
            }))

            const results = this.db
                .insert(this.table)
                .values(insertDataList as never[])
                .returning()
                .all()

            logger.debug({ table: this.tableName, count: results.length }, 'Records created')

            return ok(results as TSelect[])
        }
        catch (error) {
            logger.error({ error, table: this.tableName }, 'Failed to create records')
            return err({
                type: 'QUERY_FAILED',
                message: `Failed to create records: ${error}`,
                cause: error,
            })
        }
    }

    /**
     * 根据 ID 查找记录
     * 
     * @param id - 记录 ID
     * @returns 记录或 undefined
     */
    async findById(id: string): Promise<Result<TSelect | undefined, RepositoryError>> {
        try {
            const idColumnRef = (this.table as Record<string, unknown>)[this.idColumn as string] as SQL
            const result = this.db
                .select()
                .from(this.table)
                .where(eq(idColumnRef, id))
                .get()

            return ok(result as TSelect | undefined)
        }
        catch (error) {
            logger.error({ error, table: this.tableName, id }, 'Failed to find record')
            return err({
                type: 'QUERY_FAILED',
                message: `Failed to find record: ${error}`,
                cause: error,
            })
        }
    }

    /**
     * 根据 ID 查找记录（必须存在）
     * 
     * @param id - 记录 ID
     * @returns 记录
     */
    async findByIdOrFail(id: string): Promise<Result<TSelect, RepositoryError>> {
        const result = await this.findById(id)

        if (!result.ok) {
            return result as Result<TSelect, RepositoryError>
        }

        if (!result.value) {
            return err({
                type: 'NOT_FOUND',
                message: `${this.tableName} with id '${id}' not found`,
            })
        }

        return ok(result.value)
    }

    /**
     * 查找所有记录
     * 
     * @returns 所有记录
     */
    async findAll(): Promise<Result<TSelect[], RepositoryError>> {
        try {
            const results = this.db
                .select()
                .from(this.table)
                .all()

            return ok(results as TSelect[])
        }
        catch (error) {
            logger.error({ error, table: this.tableName }, 'Failed to find records')
            return err({
                type: 'QUERY_FAILED',
                message: `Failed to find records: ${error}`,
                cause: error,
            })
        }
    }

    /**
     * 分页查询
     * 
     * @param params - 分页参数
     * @returns 分页结果
     */
    async findPaginated(params: PaginationParams = {}): Promise<Result<PaginatedResult<TSelect>, RepositoryError>> {
        const { page = 1, pageSize = 20 } = params
        const offset = (page - 1) * pageSize

        try {
            // 获取总数
            const countResult = this.db
                .select({ count: sql<number>`count(*)` })
                .from(this.table)
                .get()

            const total = countResult?.count ?? 0

            // 获取分页数据
            const data = this.db
                .select()
                .from(this.table)
                .limit(pageSize)
                .offset(offset)
                .all()

            return ok({
                data: data as TSelect[],
                total,
                page,
                pageSize,
                totalPages: Math.ceil(total / pageSize),
            })
        }
        catch (error) {
            logger.error({ error, table: this.tableName }, 'Failed to find paginated records')
            return err({
                type: 'QUERY_FAILED',
                message: `Failed to find paginated records: ${error}`,
                cause: error,
            })
        }
    }

    /**
     * 更新记录
     * 
     * @param id - 记录 ID
     * @param data - 要更新的数据
     * @returns 更新后的记录
     */
    async update(id: string, data: Partial<TInsert>): Promise<Result<TSelect, RepositoryError>> {
        try {
            const idColumnRef = (this.table as Record<string, unknown>)[this.idColumn as string] as SQL

            // 添加更新时间
            const updateData = {
                ...data,
                updatedAt: new Date(),
            }

            const result = this.db
                .update(this.table)
                .set(updateData as never)
                .where(eq(idColumnRef, id))
                .returning()
                .get()

            if (!result) {
                return err({
                    type: 'NOT_FOUND',
                    message: `${this.tableName} with id '${id}' not found`,
                })
            }

            logger.debug({ table: this.tableName, id }, 'Record updated')

            return ok(result as TSelect)
        }
        catch (error) {
            logger.error({ error, table: this.tableName, id }, 'Failed to update record')
            return err({
                type: 'QUERY_FAILED',
                message: `Failed to update record: ${error}`,
                cause: error,
            })
        }
    }

    /**
     * 删除记录
     * 
     * @param id - 记录 ID
     * @returns 是否删除成功
     */
    async delete(id: string): Promise<Result<boolean, RepositoryError>> {
        try {
            const idColumnRef = (this.table as Record<string, unknown>)[this.idColumn as string] as SQL

            const result = this.db
                .delete(this.table)
                .where(eq(idColumnRef, id))
                .returning()
                .get()

            if (!result) {
                return ok(false)
            }

            logger.debug({ table: this.tableName, id }, 'Record deleted')

            return ok(true)
        }
        catch (error) {
            logger.error({ error, table: this.tableName, id }, 'Failed to delete record')
            return err({
                type: 'QUERY_FAILED',
                message: `Failed to delete record: ${error}`,
                cause: error,
            })
        }
    }

    /**
     * 检查记录是否存在
     * 
     * @param id - 记录 ID
     * @returns 是否存在
     */
    async exists(id: string): Promise<Result<boolean, RepositoryError>> {
        const result = await this.findById(id)

        if (!result.ok) {
            return result as Result<boolean, RepositoryError>
        }

        return ok(result.value !== undefined)
    }

    /**
     * 统计记录数
     * 
     * @returns 记录数
     */
    async count(): Promise<Result<number, RepositoryError>> {
        try {
            const result = this.db
                .select({ count: sql<number>`count(*)` })
                .from(this.table)
                .get()

            return ok(result?.count ?? 0)
        }
        catch (error) {
            logger.error({ error, table: this.tableName }, 'Failed to count records')
            return err({
                type: 'QUERY_FAILED',
                message: `Failed to count records: ${error}`,
                cause: error,
            })
        }
    }
}
