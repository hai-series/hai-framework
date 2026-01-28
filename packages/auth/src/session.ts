/**
 * =============================================================================
 * @hai/auth - 会话管理
 * =============================================================================
 * 提供基于 Cookie 的会话管理
 * 
 * 特性:
 * - 安全的会话令牌生成
 * - 可配置的过期时间
 * - 会话存储（数据库/内存）
 * =============================================================================
 */

import type { Result } from '@hai/core'
import { createLogger, err, generateId, ok } from '@hai/core'
import { sm3Hash } from '@hai/crypto'
import type { SessionConfig } from '@hai/config'

const logger = createLogger({ name: 'auth-session' })

/**
 * 会话错误类型
 */
export type SessionErrorType =
    | 'SESSION_NOT_FOUND'
    | 'SESSION_EXPIRED'
    | 'SESSION_INVALID'
    | 'SESSION_CREATE_FAILED'
    | 'SESSION_UPDATE_FAILED'

/**
 * 会话错误
 */
export interface SessionError {
    type: SessionErrorType
    message: string
}

/**
 * 会话数据
 */
export interface SessionData {
    /** 会话 ID */
    id: string
    /** 用户 ID */
    userId: string
    /** 会话令牌（仅在创建时返回，不存储） */
    token?: string
    /** 令牌哈希（存储用于验证） */
    tokenHash: string
    /** 用户代理 */
    userAgent?: string
    /** IP 地址 */
    ipAddress?: string
    /** 创建时间 */
    createdAt: Date
    /** 最后活动时间 */
    lastActiveAt: Date
    /** 过期时间 */
    expiresAt: Date
}

/**
 * 创建会话选项
 */
export interface CreateSessionOptions {
    /** 用户 ID */
    userId: string
    /** 用户代理 */
    userAgent?: string
    /** IP 地址 */
    ipAddress?: string
    /** 过期时间（秒），覆盖配置 */
    maxAge?: number
}

/**
 * 会话存储接口
 * 实现此接口以支持不同的存储后端
 */
export interface SessionStore {
    /** 创建会话 */
    create(data: Omit<SessionData, 'token'>): Promise<Result<void, SessionError>>
    /** 根据 ID 获取会话 */
    get(id: string): Promise<Result<SessionData | null, SessionError>>
    /** 根据令牌哈希获取会话 */
    getByTokenHash(tokenHash: string): Promise<Result<SessionData | null, SessionError>>
    /** 更新会话 */
    update(id: string, data: Partial<SessionData>): Promise<Result<void, SessionError>>
    /** 删除会话 */
    delete(id: string): Promise<Result<void, SessionError>>
    /** 删除用户的所有会话 */
    deleteByUserId(userId: string): Promise<Result<number, SessionError>>
    /** 清理过期会话 */
    cleanup(): Promise<Result<number, SessionError>>
}

/**
 * 内存会话存储（仅用于开发/测试）
 */
export class MemorySessionStore implements SessionStore {
    private sessions: Map<string, SessionData> = new Map()

    async create(data: Omit<SessionData, 'token'>): Promise<Result<void, SessionError>> {
        this.sessions.set(data.id, data as SessionData)
        return ok(undefined)
    }

    async get(id: string): Promise<Result<SessionData | null, SessionError>> {
        const session = this.sessions.get(id) ?? null
        return ok(session)
    }

    async getByTokenHash(tokenHash: string): Promise<Result<SessionData | null, SessionError>> {
        for (const session of this.sessions.values()) {
            if (session.tokenHash === tokenHash) {
                return ok(session)
            }
        }
        return ok(null)
    }

    async update(id: string, data: Partial<SessionData>): Promise<Result<void, SessionError>> {
        const session = this.sessions.get(id)
        if (!session) {
            return err({
                type: 'SESSION_NOT_FOUND',
                message: `Session ${id} not found`,
            })
        }
        this.sessions.set(id, { ...session, ...data })
        return ok(undefined)
    }

    async delete(id: string): Promise<Result<void, SessionError>> {
        this.sessions.delete(id)
        return ok(undefined)
    }

    async deleteByUserId(userId: string): Promise<Result<number, SessionError>> {
        let count = 0
        for (const [id, session] of this.sessions) {
            if (session.userId === userId) {
                this.sessions.delete(id)
                count++
            }
        }
        return ok(count)
    }

    async cleanup(): Promise<Result<number, SessionError>> {
        const now = new Date()
        let count = 0
        for (const [id, session] of this.sessions) {
            if (session.expiresAt < now) {
                this.sessions.delete(id)
                count++
            }
        }
        return ok(count)
    }
}

/**
 * 会话管理器
 */
export class SessionManager {
    private store: SessionStore
    private config: SessionConfig

    constructor(store: SessionStore, config: SessionConfig) {
        this.store = store
        this.config = config
    }

    /**
     * 创建新会话
     * 
     * @param options - 创建选项
     * @returns 会话数据（包含令牌）
     */
    async createSession(options: CreateSessionOptions): Promise<Result<SessionData, SessionError>> {
        const { userId, userAgent, ipAddress, maxAge } = options
        const sessionMaxAge = maxAge ?? this.config.maxAge

        try {
            // 生成会话 ID 和令牌
            const sessionId = generateId()
            const token = generateSecureToken()

            // 计算令牌哈希
            const tokenHashResult = sm3Hash(token)
            if (!tokenHashResult.ok) {
                return err({
                    type: 'SESSION_CREATE_FAILED',
                    message: 'Failed to hash session token',
                })
            }

            const now = new Date()
            const expiresAt = new Date(now.getTime() + sessionMaxAge * 1000)

            const sessionData: SessionData = {
                id: sessionId,
                userId,
                token, // 仅在返回时包含
                tokenHash: tokenHashResult.value,
                userAgent,
                ipAddress,
                createdAt: now,
                lastActiveAt: now,
                expiresAt,
            }

            // 存储会话（不存储明文令牌）
            const { token: _, ...dataToStore } = sessionData
            const storeResult = await this.store.create(dataToStore)

            if (!storeResult.ok) {
                return storeResult as Result<SessionData, SessionError>
            }

            logger.info({ sessionId, userId }, 'Session created')

            return ok(sessionData)
        }
        catch (error) {
            logger.error({ error }, 'Failed to create session')
            return err({
                type: 'SESSION_CREATE_FAILED',
                message: `Failed to create session: ${error}`,
            })
        }
    }

    /**
     * 验证会话令牌
     * 
     * @param token - 会话令牌
     * @returns 会话数据
     */
    async validateSession(token: string): Promise<Result<SessionData, SessionError>> {
        try {
            // 计算令牌哈希
            const tokenHashResult = sm3Hash(token)
            if (!tokenHashResult.ok) {
                return err({
                    type: 'SESSION_INVALID',
                    message: 'Invalid session token',
                })
            }

            // 查找会话
            const sessionResult = await this.store.getByTokenHash(tokenHashResult.value)
            if (!sessionResult.ok) {
                return sessionResult as Result<SessionData, SessionError>
            }

            const session = sessionResult.value

            if (!session) {
                return err({
                    type: 'SESSION_NOT_FOUND',
                    message: 'Session not found',
                })
            }

            // 检查是否过期
            if (session.expiresAt < new Date()) {
                // 删除过期会话
                await this.store.delete(session.id)
                return err({
                    type: 'SESSION_EXPIRED',
                    message: 'Session has expired',
                })
            }

            // 更新最后活动时间
            await this.store.update(session.id, {
                lastActiveAt: new Date(),
            })

            return ok(session)
        }
        catch (error) {
            logger.error({ error }, 'Failed to validate session')
            return err({
                type: 'SESSION_INVALID',
                message: `Session validation failed: ${error}`,
            })
        }
    }

    /**
     * 刷新会话（延长过期时间）
     * 
     * @param sessionId - 会话 ID
     * @param maxAge - 新的过期时间（秒）
     * @returns 更新后的会话
     */
    async refreshSession(
        sessionId: string,
        maxAge?: number,
    ): Promise<Result<SessionData, SessionError>> {
        const sessionMaxAge = maxAge ?? this.config.maxAge

        const sessionResult = await this.store.get(sessionId)
        if (!sessionResult.ok) {
            return sessionResult as Result<SessionData, SessionError>
        }

        const session = sessionResult.value
        if (!session) {
            return err({
                type: 'SESSION_NOT_FOUND',
                message: `Session ${sessionId} not found`,
            })
        }

        const now = new Date()
        const newExpiresAt = new Date(now.getTime() + sessionMaxAge * 1000)

        const updateResult = await this.store.update(sessionId, {
            lastActiveAt: now,
            expiresAt: newExpiresAt,
        })

        if (!updateResult.ok) {
            return updateResult as Result<SessionData, SessionError>
        }

        logger.debug({ sessionId }, 'Session refreshed')

        return ok({
            ...session,
            lastActiveAt: now,
            expiresAt: newExpiresAt,
        })
    }

    /**
     * 销毁会话
     * 
     * @param sessionId - 会话 ID
     */
    async destroySession(sessionId: string): Promise<Result<void, SessionError>> {
        const result = await this.store.delete(sessionId)

        if (result.ok) {
            logger.info({ sessionId }, 'Session destroyed')
        }

        return result
    }

    /**
     * 销毁用户的所有会话
     * 
     * @param userId - 用户 ID
     * @returns 销毁的会话数量
     */
    async destroyUserSessions(userId: string): Promise<Result<number, SessionError>> {
        const result = await this.store.deleteByUserId(userId)

        if (result.ok) {
            logger.info({ userId, count: result.value }, 'User sessions destroyed')
        }

        return result
    }

    /**
     * 清理过期会话
     * 
     * @returns 清理的会话数量
     */
    async cleanupExpiredSessions(): Promise<Result<number, SessionError>> {
        const result = await this.store.cleanup()

        if (result.ok && result.value > 0) {
            logger.info({ count: result.value }, 'Expired sessions cleaned up')
        }

        return result
    }

    /**
     * 获取 Cookie 配置
     * 用于设置会话 Cookie
     */
    getCookieOptions(): {
        name: string
        path: string
        httpOnly: boolean
        secure: boolean
        sameSite: 'strict' | 'lax' | 'none'
        maxAge: number
    } {
        return {
            name: this.config.name,
            path: this.config.path,
            httpOnly: this.config.httpOnly,
            secure: this.config.secure,
            sameSite: this.config.sameSite,
            maxAge: this.config.maxAge,
        }
    }
}

/**
 * 生成安全的会话令牌
 */
function generateSecureToken(): string {
    const bytes = new Uint8Array(32)
    crypto.getRandomValues(bytes)
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
}

/**
 * 创建会话管理器
 * 
 * @param store - 会话存储
 * @param config - 会话配置
 */
export function createSessionManager(
    store: SessionStore,
    config: SessionConfig,
): SessionManager {
    return new SessionManager(store, config)
}
