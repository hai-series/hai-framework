/**
 * =============================================================================
 * @hai/iam - 会话工具函数
 * =============================================================================
 *
 * @module session/iam-session-utils
 * =============================================================================
 */

import type { CreateSessionOptions, Session } from './iam-session-types.js'

/**
 * 生成访问令牌
 *
 * 使用 `crypto.randomUUID()` 生成唯一的 UUID v4 令牌。
 *
 * @returns UUID 字符串
 */
export function generateToken(): string {
  return crypto.randomUUID()
}

/**
 * 构建会话数据
 *
 * @param options - 创建会话选项（用户 ID、角色等）
 * @param now - 当前时间
 * @param sessionTtl - 会话有效期（秒）
 * @param accessToken - 访问令牌
 * @returns 完整的 Session 对象
 */
export function buildSession(options: CreateSessionOptions, now: Date, sessionTtl: number, accessToken: string): Session {
  return {
    userId: options.userId,
    username: options.username,
    roles: options.roles,
    source: options.source,
    accessToken,
    createdAt: now,
    lastActiveAt: now,
    expiresAt: new Date(now.getTime() + sessionTtl * 1000),
    data: options.data,
  }
}

/**
 * 计算会话剩余 TTL
 *
 * @param session - 会话对象
 * @param now - 当前时间戳（毫秒，默认 Date.now()）
 * @returns 剩余秒数，最小为 0
 */
export function getSessionTtl(session: Session, now = Date.now()): number {
  return Math.max(0, Math.floor((session.expiresAt.getTime() - now) / 1000))
}

/**
 * 应用会话更新
 *
 * 将 patch 中的字段合并到现有会话，同时更新 lastActiveAt。
 * data 字段采用浅合并策略。
 *
 * @param session - 原始会话
 * @param patch - 要更新的字段
 * @returns 更新后的新会话对象（不修改原对象）
 */
export function applySessionPatch(session: Session, patch: Partial<Session>): Session {
  const nextSession = { ...session }
  if (patch.data !== undefined) {
    nextSession.data = { ...nextSession.data, ...patch.data }
  }
  if (patch.roles !== undefined) {
    nextSession.roles = patch.roles
  }
  if (patch.username !== undefined) {
    nextSession.username = patch.username
  }
  if (patch.source !== undefined) {
    nextSession.source = patch.source
  }
  nextSession.lastActiveAt = new Date()
  return nextSession
}
