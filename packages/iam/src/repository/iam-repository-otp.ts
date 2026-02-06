/**
 * =============================================================================
 * @hai/iam - OTP 存储实现
 * =============================================================================
 *
 * 基于 @hai/db 的 OTP（一次性密码）存储实现。
 *
 * @module iam-repository-otp
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type { DbService } from '@hai/db'
import type { IamError, OtpStore } from '../iam-types.js'
import { err, ok } from '@hai/core'
import { IamErrorCode } from '../iam-config.js'

/**
 * OTP 表名
 */
const TABLE_NAME = 'iam_otp'

/**
 * OTP 表结构
 */
const TABLE_SCHEMA = {
  identifier: { type: 'TEXT' as const, primaryKey: true },
  code: { type: 'TEXT' as const, notNull: true },
  attempts: { type: 'INTEGER' as const, notNull: true },
  expires_at: { type: 'TIMESTAMP' as const, notNull: true },
  created_at: { type: 'TIMESTAMP' as const, notNull: true },
}

/**
 * 数据库行类型
 */
interface OtpRow {
  identifier: string
  code: string
  attempts: number
  expires_at: number
  created_at: number
}

/**
 * 创建数据库 OTP 存储
 */
export async function createDbOtpStore(db: DbService): Promise<OtpStore> {
  // 确保表存在
  async function ensureTable(): Promise<Result<void, IamError>> {
    const result = await db.ddl.createTable(TABLE_NAME, TABLE_SCHEMA, true)
    if (!result.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: `创建 OTP 表失败: ${result.error.message}`,
        cause: result.error,
      })
    }
    return ok(undefined)
  }

  const initResult = await ensureTable()
  if (!initResult.success) {
    throw new Error(initResult.error.message)
  }

  return {
    async set(identifier, code, expiresIn): Promise<Result<void, IamError>> {
      const now = Date.now()
      const expiresAt = now + expiresIn * 1000 // expiresIn 是秒数
      const result = await db.sql.execute(
        `INSERT OR REPLACE INTO ${TABLE_NAME} (identifier, code, attempts, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [identifier, code, 0, expiresAt, now],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `保存 OTP 失败: ${result.error.message}`,
          cause: result.error,
        })
      }

      return ok(undefined)
    },

    async get(identifier): Promise<Result<{ code: string, attempts: number, createdAt: Date } | null, IamError>> {
      const result = await db.sql.query<OtpRow>(
        `SELECT * FROM ${TABLE_NAME} WHERE identifier = ?`,
        [identifier],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `查询 OTP 失败: ${result.error.message}`,
          cause: result.error,
        })
      }

      if (result.data.length === 0) {
        return ok(null)
      }

      const row = result.data[0]

      // 检查是否已过期
      if (Date.now() > row.expires_at) {
        await this.delete(identifier)
        return ok(null)
      }

      return ok({
        code: row.code,
        attempts: row.attempts,
        createdAt: new Date(row.created_at),
      })
    },

    async incrementAttempts(identifier): Promise<Result<number, IamError>> {
      // 先获取当前值
      const getResult = await db.sql.query<OtpRow>(
        `SELECT * FROM ${TABLE_NAME} WHERE identifier = ?`,
        [identifier],
      )

      if (!getResult.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `查询 OTP 失败: ${getResult.error.message}`,
          cause: getResult.error,
        })
      }

      if (getResult.data.length === 0) {
        return ok(0)
      }

      const newAttempts = getResult.data[0].attempts + 1

      // 更新尝试次数
      const updateResult = await db.sql.execute(
        `UPDATE ${TABLE_NAME} SET attempts = ? WHERE identifier = ?`,
        [newAttempts, identifier],
      )

      if (!updateResult.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `更新 OTP 尝试次数失败: ${updateResult.error.message}`,
          cause: updateResult.error,
        })
      }

      return ok(newAttempts)
    },

    async delete(identifier): Promise<Result<void, IamError>> {
      const result = await db.sql.execute(
        `DELETE FROM ${TABLE_NAME} WHERE identifier = ?`,
        [identifier],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `删除 OTP 失败: ${result.error.message}`,
          cause: result.error,
        })
      }

      return ok(undefined)
    },
  }
}
