/**
 * =============================================================================
 * Admin Console - 会话服务
 * =============================================================================
 */

import { core } from '@hai/core'
import { crypto } from '@hai/crypto'
import { getDb } from './database.js'
import { getEnv } from './env.js'
import { userService } from './services/user.js'

export interface Session {
  id: string
  user_id: string
  token: string
  ip_address: string | null
  user_agent: string | null
  expires_at: string
  created_at: string
}

export interface SessionData {
  userId: string
  username: string
  roles: string[]
  permissions: string[]
}

/**
 * 会话服务
 */
export const sessionService = {
  /**
   * 创建会话
   */
  async create(userId: string, ipAddress?: string, userAgent?: string): Promise<string> {
    const db = getDb()
    const env = getEnv()

    const id = core.id.withPrefix('sess_')
    const tokenResult = crypto.sm3.hash(`${id}-${Date.now()}-${Math.random()}`)
    if (!tokenResult.success) {
      throw new Error('生成会话令牌失败')
    }

    const token = tokenResult.data
    const expiresAt = new Date(Date.now() + env.SESSION_MAX_AGE * 1000).toISOString()

    const insertResult = db.sql.execute(
      `INSERT INTO sessions (id, user_id, token, ip_address, user_agent, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, userId, token, ipAddress ?? null, userAgent ?? null, expiresAt],
    )
    if (!insertResult.success) {
      throw new Error(`创建会话失败: ${insertResult.error.message}`)
    }

    return token
  },

  /**
   * 验证会话令牌
   */
  async validate(token: string): Promise<SessionData | null> {
    const db = getDb()

    const sessionsResult = db.sql.query<Session>(
      `SELECT * FROM sessions WHERE token = ? AND expires_at > datetime('now')`,
      [token],
    )

    if (!sessionsResult.success || !sessionsResult.data.length)
      return null

    const session = sessionsResult.data[0]
    const user = await userService.getById(session.user_id)
    if (!user)
      return null

    return {
      userId: user.id,
      username: user.username,
      roles: user.roles,
      permissions: user.permissions,
    }
  },

  /**
   * 删除会话（登出）
   */
  async destroy(token: string): Promise<boolean> {
    const db = getDb()
    const result = db.sql.execute(`DELETE FROM sessions WHERE token = ?`, [token])
    return result.success && result.data.changes > 0
  },

  /**
   * 删除用户所有会话
   */
  async destroyAllForUser(userId: string): Promise<void> {
    const db = getDb()
    db.sql.execute(`DELETE FROM sessions WHERE user_id = ?`, [userId])
  },

  /**
   * 清理过期会话
   */
  async cleanup(): Promise<number> {
    const db = getDb()
    const result = db.sql.execute(`DELETE FROM sessions WHERE expires_at <= datetime('now')`)
    return result.success ? result.data.changes : 0
  },

  /**
   * 获取用户活跃会话数
   */
  async getActiveSessionCount(userId: string): Promise<number> {
    const db = getDb()
    const result = db.sql.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM sessions WHERE user_id = ? AND expires_at > datetime('now')`,
      [userId],
    )
    return result.success ? (result.data[0]?.count ?? 0) : 0
  },
}

/**
 * 密码重置服务
 */
export const passwordResetService = {
  /**
   * 创建重置令牌
   */
  async create(userId: string): Promise<string> {
    const db = getDb()

    const id = core.id.withPrefix('reset_')
    const tokenResult = crypto.sm3.hash(`${id}-${Date.now()}-${Math.random()}`)
    if (!tokenResult.success) {
      throw new Error('生成重置令牌失败')
    }

    const token = tokenResult.data.substring(0, 32) // 缩短令牌长度
    const expiresAt = new Date(Date.now() + 3600000).toISOString() // 1小时后过期

    const insertResult = db.sql.execute(
      `INSERT INTO password_resets (id, user_id, token, expires_at)
       VALUES (?, ?, ?, ?)`,
      [id, userId, token, expiresAt],
    )
    if (!insertResult.success) {
      throw new Error(`创建重置令牌失败: ${insertResult.error.message}`)
    }

    return token
  },

  /**
   * 验证重置令牌
   */
  async validate(token: string): Promise<string | null> {
    const db = getDb()

    const resetsResult = db.sql.query<{ user_id: string }>(
      `SELECT user_id FROM password_resets
       WHERE token = ? AND expires_at > datetime('now') AND used = 0`,
      [token],
    )

    return resetsResult.success ? (resetsResult.data[0]?.user_id ?? null) : null
  },

  /**
   * 使用令牌（标记为已使用）
   */
  async markUsed(token: string): Promise<void> {
    const db = getDb()
    db.sql.execute(`UPDATE password_resets SET used = 1 WHERE token = ?`, [token])
  },

  /**
   * 清理过期令牌
   */
  async cleanup(): Promise<number> {
    const db = getDb()
    const result = db.sql.execute(`DELETE FROM password_resets WHERE expires_at <= datetime('now') OR used = 1`)
    return result.success ? result.data.changes : 0
  },
}
