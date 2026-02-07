/**
 * =============================================================================
 * @hai/iam - 角色存储实现
 * =============================================================================
 *
 * 基于 @hai/db 的角色存储实现。
 *
 * @module iam-repository-role
 * =============================================================================
 */

import type { PaginatedResult, PaginationOptionsInput, Result } from '@hai/core'
import type { DbService } from '@hai/db'
import type { IamError, Role, RoleRepository } from '../iam-types.js'
import { err, ok } from '@hai/core'
import { IamErrorCode } from '../iam-config.js'
import { iamM } from '../iam-i18n.js'

/**
 * 角色表名
 */
const TABLE_NAME = 'iam_roles'

/**
 * 角色表结构
 */
const TABLE_SCHEMA = {
  id: { type: 'TEXT' as const, primaryKey: true },
  code: { type: 'TEXT' as const, notNull: true, unique: true },
  name: { type: 'TEXT' as const, notNull: true },
  description: { type: 'TEXT' as const },
  is_system: { type: 'BOOLEAN' as const, defaultValue: 0 },
  created_at: { type: 'TIMESTAMP' as const, notNull: true },
  updated_at: { type: 'TIMESTAMP' as const, notNull: true },
}

/**
 * 数据库行类型
 */
interface RoleRow {
  id: string
  code: string
  name: string
  description: string | null
  is_system: number
  created_at: number
  updated_at: number
}

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return crypto.randomUUID()
}

/**
 * 将数据库行转换为 Role
 */
function rowToRole(row: RoleRow): Role {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description ?? undefined,
    isSystem: Boolean(row.is_system),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

/**
 * 创建数据库角色存储
 */
export async function createDbRoleRepository(db: DbService): Promise<RoleRepository> {
  // 确保表存在
  async function ensureTable(): Promise<Result<void, IamError>> {
    const result = await db.ddl.createTable(TABLE_NAME, TABLE_SCHEMA, true)
    if (!result.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: iamM('iam_createRoleTableFailed', { params: { message: result.error.message } }),
        cause: result.error,
      })
    }
    return ok(undefined)
  }

  // 初始化表
  const initResult = await ensureTable()
  if (!initResult.success) {
    throw new Error(initResult.error.message)
  }

  async function findByIdInternal(id: string): Promise<Result<Role | null, IamError>> {
    const result = await db.sql.query<RoleRow>(
      `SELECT * FROM ${TABLE_NAME} WHERE id = ?`,
      [id],
    )

    if (!result.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: iamM('iam_queryRoleFailed', { params: { message: result.error.message } }),
        cause: result.error,
      })
    }

    if (result.data.length === 0) {
      return ok(null)
    }

    return ok(rowToRole(result.data[0]))
  }


  return {
    async create(role): Promise<Result<Role, IamError>> {
      const id = generateId()
      const now = Date.now()

      const result = await db.sql.execute(
        `INSERT INTO ${TABLE_NAME} (id, code, name, description, is_system, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          role.code,
          role.name,
          role.description ?? null,
          role.isSystem ? 1 : 0,
          now,
          now,
        ],
      )

      if (!result.success) {
        const errorMsg = result.error.message.toLowerCase()
        if (errorMsg.includes('unique') || errorMsg.includes('duplicate')) {
          return err({
            code: IamErrorCode.ROLE_ALREADY_EXISTS,
            message: iamM('iam_roleAlreadyExist'),
            cause: result.error,
          })
        }
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_createRoleFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }

      return ok({
        id,
        code: role.code,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      })
    },

    findById: findByIdInternal,

    async findByCode(code): Promise<Result<Role | null, IamError>> {
      const result = await db.sql.query<RoleRow>(
        `SELECT * FROM ${TABLE_NAME} WHERE code = ?`,
        [code],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryRoleFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }

      if (result.data.length === 0) {
        return ok(null)
      }

      return ok(rowToRole(result.data[0]))
    },

    async findAll(options?: PaginationOptionsInput): Promise<Result<PaginatedResult<Role>, IamError>> {
      const result = await db.sql.queryPage<RoleRow>({
        sql: `SELECT * FROM ${TABLE_NAME} ORDER BY created_at DESC`,
        pagination: options,
      })

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryRoleFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }

      return ok({
        items: result.data.items.map(rowToRole),
        total: result.data.total,
        page: result.data.page,
        pageSize: result.data.pageSize,
      })
    },

    async update(id, data): Promise<Result<Role, IamError>> {
      const setClauses: string[] = []
      const values: unknown[] = []

      if (data.code !== undefined) {
        setClauses.push('code = ?')
        values.push(data.code)
      }
      if (data.name !== undefined) {
        setClauses.push('name = ?')
        values.push(data.name)
      }
      if (data.description !== undefined) {
        setClauses.push('description = ?')
        values.push(data.description ?? null)
      }
      if (data.isSystem !== undefined) {
        setClauses.push('is_system = ?')
        values.push(data.isSystem ? 1 : 0)
      }

      if (setClauses.length === 0) {
        const current = await findByIdInternal(id)
        if (!current.success)
          return current
        if (!current.data) {
          return err({
            code: IamErrorCode.ROLE_NOT_FOUND,
            message: iamM('iam_roleNotExist'),
          })
        }
        return ok(current.data)
      }

      const now = Date.now()
      setClauses.push('updated_at = ?')
      values.push(now)
      values.push(id)

      const result = await db.sql.execute(
        `UPDATE ${TABLE_NAME} SET ${setClauses.join(', ')} WHERE id = ?`,
        values,
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_updateRoleFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }

      if (result.data.changes === 0) {
        return err({
          code: IamErrorCode.ROLE_NOT_FOUND,
          message: iamM('iam_roleNotExist'),
        })
      }

      const findResult = await findByIdInternal(id)
      if (!findResult.success)
        return findResult
      if (!findResult.data) {
        return err({
          code: IamErrorCode.ROLE_NOT_FOUND,
          message: iamM('iam_roleNotExist'),
        })
      }

      return ok(findResult.data)
    },

    async delete(id): Promise<Result<void, IamError>> {
      // 检查是否为系统角色
      const roleResult = await findByIdInternal(id)
      if (roleResult.success && roleResult.data?.isSystem) {
        return err({
          code: IamErrorCode.FORBIDDEN,
          message: iamM('iam_cannotDeleteSystemRole'),
        })
      }

      const result = await db.sql.execute(
        `DELETE FROM ${TABLE_NAME} WHERE id = ?`,
        [id],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_deleteRoleFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }

      return ok(undefined)
    },

    async exists(id): Promise<Result<boolean, IamError>> {
      const result = await db.sql.query<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM ${TABLE_NAME} WHERE id = ?`,
        [id],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryRoleFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }

      return ok(result.data[0].cnt > 0)
    },
  }
}
