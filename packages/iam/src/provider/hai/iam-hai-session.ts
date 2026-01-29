/**
 * =============================================================================
 * @hai/iam - HAI Provider: Session (会话管理)
 * =============================================================================
 * HAI 默认会话管理提供者实现
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type {
  CreateSessionOptions,
  IAMConfig,
  IAMError,
  SessionData,
  SessionProvider,
} from '../../iam-types.js'
import { err, ok } from '@hai/core'

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36)
}

/**
 * 生成安全令牌
 */
function generateToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const length = 64
  let result = ''
  const randomValues = new Uint8Array(length)
  crypto.getRandomValues(randomValues)
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length]
  }
  return result
}

/**
 * HAI 会话管理提供者实现
 */
class HaiSessionProvider implements SessionProvider {
  readonly name = 'hai-session'

  private config: IAMConfig
  private sessions: Map<string, SessionData> = new Map()
  private tokenIndex: Map<string, string> = new Map()
  private userSessionsIndex: Map<string, Set<string>> = new Map()

  constructor(config: IAMConfig) {
    this.config = config
  }

  async create(options: CreateSessionOptions): Promise<Result<SessionData, IAMError>> {
    try {
      const sessionId = generateId()
      const accessToken = generateToken()
      const refreshToken = generateToken()

      const maxAge = options.maxAge ?? this.config.session?.maxAge ?? 86400
      const now = new Date()

      const session: SessionData = {
        id: sessionId,
        userId: options.userId,
        accessToken,
        refreshToken,
        userAgent: options.userAgent,
        ipAddress: options.ipAddress,
        createdAt: now,
        lastActiveAt: now,
        expiresAt: new Date(now.getTime() + maxAge * 1000),
        data: options.data,
      }

      this.sessions.set(sessionId, session)
      this.tokenIndex.set(accessToken, sessionId)

      let userSessions = this.userSessionsIndex.get(options.userId)
      if (!userSessions) {
        userSessions = new Set()
        this.userSessionsIndex.set(options.userId, userSessions)
      }
      userSessions.add(sessionId)

      return ok(session)
    }
    catch (error) {
      return err({ type: 'SESSION_CREATE_FAILED', message: 'Failed to create session', cause: error })
    }
  }

  async get(sessionId: string): Promise<Result<SessionData | null, IAMError>> {
    try {
      const session = this.sessions.get(sessionId)

      if (!session) {
        return ok(null)
      }

      if (new Date() > session.expiresAt) {
        await this.delete(sessionId)
        return ok(null)
      }

      return ok(session)
    }
    catch (error) {
      return err({ type: 'INTERNAL_ERROR', message: 'Failed to get session', cause: error })
    }
  }

  async getByToken(accessToken: string): Promise<Result<SessionData | null, IAMError>> {
    try {
      const sessionId = this.tokenIndex.get(accessToken)
      if (!sessionId) {
        return ok(null)
      }

      return this.get(sessionId)
    }
    catch (error) {
      return err({ type: 'INTERNAL_ERROR', message: 'Failed to get session by token', cause: error })
    }
  }

  async refresh(refreshToken: string): Promise<Result<SessionData, IAMError>> {
    try {
      // 查找包含该 refreshToken 的会话
      let targetSession: SessionData | undefined

      for (const session of this.sessions.values()) {
        if (session.refreshToken === refreshToken) {
          targetSession = session
          break
        }
      }

      if (!targetSession) {
        return err({ type: 'SESSION_NOT_FOUND', message: 'Session not found' })
      }

      if (new Date() > targetSession.expiresAt) {
        await this.delete(targetSession.id)
        return err({ type: 'SESSION_EXPIRED', message: 'Session has expired' })
      }

      // 生成新令牌
      const oldToken = targetSession.accessToken
      const newAccessToken = generateToken()
      const newRefreshToken = generateToken()

      // 更新索引
      this.tokenIndex.delete(oldToken)
      this.tokenIndex.set(newAccessToken, targetSession.id)

      // 更新会话
      const maxAge = this.config.session?.maxAge ?? 86400
      targetSession.accessToken = newAccessToken
      targetSession.refreshToken = newRefreshToken
      targetSession.lastActiveAt = new Date()
      targetSession.expiresAt = new Date(Date.now() + maxAge * 1000)

      return ok(targetSession)
    }
    catch (error) {
      return err({ type: 'INTERNAL_ERROR', message: 'Failed to refresh session', cause: error })
    }
  }

  async update(sessionId: string, data: Partial<SessionData>): Promise<Result<void, IAMError>> {
    try {
      const session = this.sessions.get(sessionId)
      if (!session) {
        return err({ type: 'SESSION_NOT_FOUND', message: 'Session not found' })
      }

      // 更新允许的字段
      if (data.data !== undefined) {
        session.data = { ...session.data, ...data.data }
      }
      if (data.userAgent !== undefined) {
        session.userAgent = data.userAgent
      }
      if (data.ipAddress !== undefined) {
        session.ipAddress = data.ipAddress
      }

      session.lastActiveAt = new Date()

      return ok(undefined)
    }
    catch (error) {
      return err({ type: 'INTERNAL_ERROR', message: 'Failed to update session', cause: error })
    }
  }

  async delete(sessionId: string): Promise<Result<void, IAMError>> {
    try {
      const session = this.sessions.get(sessionId)
      if (session) {
        this.tokenIndex.delete(session.accessToken)
        this.sessions.delete(sessionId)

        const userSessions = this.userSessionsIndex.get(session.userId)
        if (userSessions) {
          userSessions.delete(sessionId)
        }
      }
      return ok(undefined)
    }
    catch (error) {
      return err({ type: 'INTERNAL_ERROR', message: 'Failed to delete session', cause: error })
    }
  }

  async deleteByUserId(userId: string): Promise<Result<number, IAMError>> {
    try {
      const userSessions = this.userSessionsIndex.get(userId)
      if (!userSessions) {
        return ok(0)
      }

      let count = 0
      for (const sessionId of userSessions) {
        const session = this.sessions.get(sessionId)
        if (session) {
          this.tokenIndex.delete(session.accessToken)
          this.sessions.delete(sessionId)
          count++
        }
      }

      this.userSessionsIndex.delete(userId)
      return ok(count)
    }
    catch (error) {
      return err({ type: 'INTERNAL_ERROR', message: 'Failed to delete user sessions', cause: error })
    }
  }

  async cleanup(): Promise<Result<number, IAMError>> {
    try {
      const now = new Date()
      let count = 0

      for (const [sessionId, session] of this.sessions) {
        if (now > session.expiresAt) {
          this.tokenIndex.delete(session.accessToken)
          this.sessions.delete(sessionId)

          const userSessions = this.userSessionsIndex.get(session.userId)
          if (userSessions) {
            userSessions.delete(sessionId)
          }

          count++
        }
      }

      return ok(count)
    }
    catch (error) {
      return err({ type: 'INTERNAL_ERROR', message: 'Failed to cleanup sessions', cause: error })
    }
  }
}

export function createHaiSessionProvider(config: IAMConfig): SessionProvider {
  return new HaiSessionProvider(config)
}
