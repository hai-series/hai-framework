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

import type { Result } from '@hai/core'
import type { DbService } from '@hai/db'
import type { IamError, Role, RoleRepository } from '../iam-types.js'
import { err, ok } from '@hai/core'
import { IamErrorCode } from '../iam-config.js'
import { getIamMessage } from '../index.js'

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
export function createDbRoleRepository(db: DbService): RoleRepository {
  // 确保表存在
  function ensureTable(): Result<void, IamError> {
    const result = db.ddl.createTable(TABLE_NAME, TABLE_SCHEMA, true)
    if (!result.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: `创建角色表失败: ${result.error.message}`,
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
    async create(role): Promise<Result<Role, IamError>> {
      const id = generateId()
      const now = Date.now()

      const result = db.sql.execute(
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
            message: getIamMessage('iam_roleAlreadyExist'),
            cause: result.error,
          })
        }
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `创建角色失败: ${result.error.message}`,
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

    async findById(id): Promise<Result<Role | null, IamError>> {
      const result = db.sql.query<RoleRow>(
        `SELECT * FROM ${TABLE_NAME} WHERE id = ?`,
        [id],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `查询角色失败: ${result.error.message}`,
          cause: result.error,
        })
      }

      if (result.data.length === 0) {
        return ok(null)
      }

      return ok(rowToRole(result.data[0]))
    },

    async findByCode(code): Promise<Result<Role | null, IamError>> {
      const result = db.sql.query<RoleRow>(
        `SELECT * FROM ${TABLE_NAME} WHERE code = ?`,
        [code],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `查询角色失败: ${result.error.message}`,
          cause: result.error,
        })
      }

      if (result.data.length === 0) {
        return ok(null)
      }

      return ok(rowToRole(result.data[0]))
    },

    async findAll(): Promise<Result<Role[], IamError>> {
      const result = db.sql.query<RoleRow>(`SELECT * FROM ${TABLE_NAME}`)

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `查询角色失败: ${result.error.message}`,
          cause: result.error,
        })
      }

      return ok(result.data.map(rowToRole))
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
        return this.findById(id).then((r) => {
          if (!r.success)
            return r
          if (!r.data) {
            return err({
              code: IamErrorCode.ROLE_NOT_FOUND,
              message: getIamMessage('iam_roleNotExist'),
            })
          }
          return ok(r.data)
        })
      }

      const now = Date.now()
      setClauses.push('updated_at = ?')
      values.push(now)
      values.push(id)

      const result = db.sql.execute(
        `UPDATE ${TABLE_NAME} SET ${setClauses.join(', ')} WHERE id = ?`,
        values,
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `更新角色失败: ${result.error.message}`,
          cause: result.error,
        })
      }

      if (result.data.changes === 0) {
        return err({
          code: IamErrorCode.ROLE_NOT_FOUND,
          message: getIamMessage('iam_roleNotExist'),
        })
      }

      const findResult = await this.findById(id)
      if (!findResult.success)
        return findResult
      if (!findResult.data) {
        return err({
          code: IamErrorCode.ROLE_NOT_FOUND,
          message: getIamMessage('iam_roleNotExist'),
        })
      }

      return ok(findResult.data)
    },

    async delete(id): Promise<Result<void, IamError>> {
      // 检查是否为系统角色
      const roleResult = await this.findById(id)
      if (roleResult.success && roleResult.data?.isSystem) {
        return err({
          code: IamErrorCode.FORBIDDEN,
          message: getIamMessage('iam_cannotDeleteSystemRole'),
        })
      }

      const result = db.sql.execute(
        `DELETE FROM ${TABLE_NAME} WHERE id = ?`,
        [id],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `删除角色失败: ${result.error.message}`,
          cause: result.error,
        })
      }

      return ok(undefined)
    },

    async exists(id): Promise<Result<boolean, IamError>> {
      const result = db.sql.query<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM ${TABLE_NAME} WHERE id = ?`,
        [id],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `查询角色失败: ${result.error.message}`,
          cause: result.error,
        })
      }

      return ok(result.data[0].cnt > 0)
    },
  }
}
