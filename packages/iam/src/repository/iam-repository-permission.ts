/**
 * =============================================================================
 * @hai/iam - 权限存储实现
 * =============================================================================
 *
 * 基于 @hai/db 的权限存储实现。
 *
 * @module iam-repository-permission
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type { DbService } from '@hai/db'
import type { IamError, Permission, PermissionRepository } from '../iam-types.js'
import { err, ok } from '@hai/core'
import { IamErrorCode } from '../iam-config.js'

/**
 * 权限表名
 */
const TABLE_NAME = 'iam_permissions'

/**
 * 权限表结构
 */
const TABLE_SCHEMA = {
  id: { type: 'TEXT' as const, primaryKey: true },
  code: { type: 'TEXT' as const, notNull: true, unique: true },
  name: { type: 'TEXT' as const, notNull: true },
  description: { type: 'TEXT' as const },
  resource: { type: 'TEXT' as const },
  action: { type: 'TEXT' as const },
  created_at: { type: 'TIMESTAMP' as const, notNull: true },
  updated_at: { type: 'TIMESTAMP' as const, notNull: true },
}

/**
 * 数据库行类型
 */
interface PermissionRow {
  id: string
  code: string
  name: string
  description: string | null
  resource: string | null
  action: string | null
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
 * 将数据库行转换为 Permission
 */
function rowToPermission(row: PermissionRow): Permission {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description ?? undefined,
    resource: row.resource ?? undefined,
    action: row.action ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

/**
 * 创建数据库权限存储
 */
export function createDbPermissionRepository(db: DbService): PermissionRepository {
  // 确保表存在
  function ensureTable(): Result<void, IamError> {
    const result = db.ddl.createTable(TABLE_NAME, TABLE_SCHEMA, true)
    if (!result.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: `创建权限表失败: ${result.error.message}`,
        cause: result.error,
      })
    }
    return ok(undefined)
  }

  // 初始化表
  const initResult = ensureTable()
  if (!initResult.success) {
    throw new Error(initResult.error.message)
  }

  return {
    async create(permission): Promise<Result<Permission, IamError>> {
      const id = generateId()
      const now = Date.now()

      const result = db.sql.execute(
        `INSERT INTO ${TABLE_NAME} (id, code, name, description, resource, action, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          permission.code,
          permission.name,
          permission.description ?? null,
          permission.resource ?? null,
          permission.action ?? null,
          now,
          now,
        ],
      )

      if (!result.success) {
        const errorMsg = result.error.message.toLowerCase()
        if (errorMsg.includes('unique') || errorMsg.includes('duplicate')) {
          return err({
            code: IamErrorCode.PERMISSION_ALREADY_EXISTS,
            message: '权限已存在',
            cause: result.error,
          })
        }
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `创建权限失败: ${result.error.message}`,
          cause: result.error,
        })
      }

      return ok({
        id,
        code: permission.code,
        name: permission.name,
        description: permission.description,
        resource: permission.resource,
        action: permission.action,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      })
    },

    async findById(id): Promise<Result<Permission | null, IamError>> {
      const result = db.sql.query<PermissionRow>(
        `SELECT * FROM ${TABLE_NAME} WHERE id = ?`,
        [id],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `查询权限失败: ${result.error.message}`,
          cause: result.error,
        })
      }

      if (result.data.length === 0) {
        return ok(null)
      }

      return ok(rowToPermission(result.data[0]))
    },

    async findByCode(code): Promise<Result<Permission | null, IamError>> {
      const result = db.sql.query<PermissionRow>(
        `SELECT * FROM ${TABLE_NAME} WHERE code = ?`,
        [code],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `查询权限失败: ${result.error.message}`,
          cause: result.error,
        })
      }

      if (result.data.length === 0) {
        return ok(null)
      }

      return ok(rowToPermission(result.data[0]))
    },

    async findAll(): Promise<Result<Permission[], IamError>> {
      const result = db.sql.query<PermissionRow>(`SELECT * FROM ${TABLE_NAME}`)

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `查询权限失败: ${result.error.message}`,
          cause: result.error,
        })
      }

      return ok(result.data.map(rowToPermission))
    },

    async delete(id): Promise<Result<void, IamError>> {
      const result = db.sql.execute(
        `DELETE FROM ${TABLE_NAME} WHERE id = ?`,
        [id],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `删除权限失败: ${result.error.message}`,
          cause: result.error,
        })
      }

      return ok(undefined)
    },
  }
}
