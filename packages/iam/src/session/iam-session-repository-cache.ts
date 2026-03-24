/**
 * @h-ai/iam — 会话缓存存储实现
 *
 * 基于 @h-ai/cache 的会话存储，统一管理三组缓存键：
 * - `hai:iam:token:{accessToken}` → Session（含 _tokenPair）
 * - `hai:iam:user:{userId}:tokens` → Set\<accessToken\>
 * - `hai:iam:refresh:{refreshToken}` → { userId, accessToken }
 *
 * @module iam-session-repository-cache
 */

import type { HaiResult } from '@h-ai/core'
import type { Session, TokenPair } from './iam-session-types.js'
import { cache } from '@h-ai/cache'
import { err, ok } from '@h-ai/core'

import { iamM } from '../iam-i18n.js'
import { HaiIamError } from '../iam-types.js'
import { applySessionPatch, getSessionTtl } from './iam-session-utils.js'

// ─── 缓存键前缀 ───

const TOKEN_KEY_PREFIX = 'hai:iam:token:'
const USER_TOKENS_KEY_PREFIX = 'hai:iam:user:'
const REFRESH_TOKEN_PREFIX = 'hai:iam:refresh:'

/**
 * 构建令牌对应的缓存 key
 *
 * @param token - 访问令牌
 * @returns 格式：`hai:iam:token:{token}`
 */
export function buildTokenKey(token: string): string {
  return `${TOKEN_KEY_PREFIX}${token}`
}

/**
 * 构建用户令牌集合的缓存 key
 *
 * @param userId - 用户 ID
 * @returns 格式：`hai:iam:user:{userId}:tokens`
 */
export function buildUserTokensKey(userId: string): string {
  return `${USER_TOKENS_KEY_PREFIX}${userId}:tokens`
}

function buildRefreshKey(refreshToken: string): string {
  return `${REFRESH_TOKEN_PREFIX}${refreshToken}`
}

/**
 * 修复从缓存反序列化后的日期字段
 */
function restoreSessionDates(session: Session): Session {
  return {
    ...session,
    createdAt: session.createdAt instanceof Date ? session.createdAt : new Date(session.createdAt),
    lastActiveAt: session.lastActiveAt instanceof Date ? session.lastActiveAt : new Date(session.lastActiveAt),
    expiresAt: session.expiresAt instanceof Date ? session.expiresAt : new Date(session.expiresAt),
  }
}

// ─── 会话存储接口 ───

/**
 * 会话存储接口
 *
 * 统一管理 accessToken、userTokens、refreshToken 三组缓存键，
 * 对上层提供面向会话的操作语义。
 */
export interface SessionRepository {
  /**
   * 保存会话
   *
   * 同时创建三个缓存条目：
   * - accessToken → session（含 _tokenPair）
   * - userId → Set\<accessToken\>
   * - refreshToken → { userId, accessToken }
   *
   * @param session - 会话数据（data 中应已包含 _tokenPair）
   * @param tokenPair - 令牌对（用于存储 refreshToken 映射）
   */
  save: (session: Session, tokenPair: TokenPair) => Promise<HaiResult<void>>

  /**
   * 根据 accessToken 获取会话
   */
  getByAccessToken: (accessToken: string) => Promise<HaiResult<Session | null>>

  /**
   * 根据 accessToken 更新会话
   *
   * 合并 patch 到现有会话后写回缓存，同时保留剩余 TTL。
   *
   * @param accessToken - 访问令牌
   * @param data - 要更新的字段
   */
  updateByAccessToken: (accessToken: string, data: Partial<Session>) => Promise<HaiResult<void>>

  /**
   * 根据 accessToken 删除会话
   *
   * 同时清理三个缓存条目（accessToken 映射、用户令牌集合成员、refreshToken 映射）。
   */
  removeByAccessToken: (accessToken: string) => Promise<HaiResult<void>>

  /**
   * 删除用户的所有会话
   *
   * 遍历用户令牌集合，逐一删除关联的三个缓存条目，最后删除集合本身。
   */
  removeByUserId: (userId: string) => Promise<HaiResult<void>>

  /**
   * 根据 refreshToken 获取关联的会话
   *
   * 先查 refreshToken 映射获取 accessToken，再查 accessToken 获取会话。
   * 若 refreshToken 有效但 session 已过期（TTL 到期），返回 null。
   */
  getByRefreshToken: (refreshToken: string) => Promise<HaiResult<Session | null>>

  /**
   * 仅删除 refreshToken 映射（不影响 accessToken 会话）
   */
  removeRefreshToken: (refreshToken: string) => Promise<HaiResult<void>>

  /**
   * 批量更新用户所有活跃会话的指定字段
   *
   * 遍历用户令牌集合，合并 updates 到每个会话后写回缓存，
   * 同时清理已失效的令牌。
   *
   * @param userId - 用户 ID
   * @param updates - 要合并到会话的字段（如 { roles, permissions }）
   */
  patchUserSessions: (userId: string, updates: Record<string, unknown>) => Promise<HaiResult<void>>
}

/**
 * 创建基于缓存的会话存储
 *
 * @param sessionMaxAge - 会话最大有效期（秒），用于设置用户令牌集合的 TTL
 * @param refreshTokenMaxAge - refreshToken 最大有效期（秒）
 * @returns 会话存储接口实现
 */
export function createCacheSessionRepository(
  sessionMaxAge: number,
  refreshTokenMaxAge: number,
): SessionRepository {
  const repo: SessionRepository = {
    async save(session, tokenPair): Promise<HaiResult<void>> {
      const accessToken = session.accessToken
      const userId = session.userId
      const ttl = getSessionTtl(session)

      // 1. accessToken → session（带 TTL）
      const setResult = await cache.kv.set(buildTokenKey(accessToken), session, { ex: ttl })
      if (!setResult.success) {
        return err(
          HaiIamError.REPOSITORY_ERROR,
          iamM('iam_saveSessionMappingCacheFailed', { params: { message: setResult.error.message } }),
          setResult.error,
        )
      }

      // 2. userId → Set<accessToken>
      const saddResult = await cache.set_.sadd(buildUserTokensKey(userId), accessToken)
      if (!saddResult.success) {
        return err(
          HaiIamError.REPOSITORY_ERROR,
          iamM('iam_saveUserSessionCacheFailed', { params: { message: saddResult.error.message } }),
          saddResult.error,
        )
      }
      // 刷新集合 TTL（2 倍会话最大有效期，防止僵尸键）
      await cache.kv.expire(buildUserTokensKey(userId), sessionMaxAge * 2)

      // 3. refreshToken → { userId, accessToken }
      const refreshResult = await cache.kv.set(
        buildRefreshKey(tokenPair.refreshToken),
        { userId, accessToken },
        { ex: refreshTokenMaxAge },
      )
      if (!refreshResult.success) {
        return err(
          HaiIamError.REPOSITORY_ERROR,
          iamM('iam_saveSessionMappingCacheFailed', { params: { message: refreshResult.error.message } }),
          refreshResult.error,
        )
      }

      return ok(undefined)
    },

    async getByAccessToken(accessToken): Promise<HaiResult<Session | null>> {
      const result = await cache.kv.get<Session>(buildTokenKey(accessToken))
      if (!result.success) {
        return err(
          HaiIamError.REPOSITORY_ERROR,
          iamM('iam_querySessionMappingCacheFailed', { params: { message: result.error.message } }),
          result.error,
        )
      }
      if (!result.data) {
        return ok(null)
      }
      return ok(restoreSessionDates(result.data))
    },

    async updateByAccessToken(accessToken, data): Promise<HaiResult<void>> {
      const sessionResult = await repo.getByAccessToken(accessToken)
      if (!sessionResult.success) {
        return sessionResult as HaiResult<void>
      }
      if (!sessionResult.data) {
        return err(
          HaiIamError.SESSION_NOT_FOUND,
          iamM('iam_sessionNotExist'),
        )
      }

      const nextSession = applySessionPatch(sessionResult.data, data)
      const ttl = getSessionTtl(nextSession)

      const setResult = await cache.kv.set(buildTokenKey(accessToken), nextSession, { ex: ttl })
      if (!setResult.success) {
        return err(
          HaiIamError.REPOSITORY_ERROR,
          iamM('iam_saveSessionMappingCacheFailed', { params: { message: setResult.error.message } }),
          setResult.error,
        )
      }
      return ok(undefined)
    },

    async removeByAccessToken(accessToken): Promise<HaiResult<void>> {
      // 读取 session 以获取 userId 和 _tokenPair.refreshToken
      const sessionResult = await cache.kv.get<Session>(buildTokenKey(accessToken))
      if (sessionResult.success && sessionResult.data) {
        const session = sessionResult.data as Session & { data?: { _tokenPair?: TokenPair } }

        // 从用户令牌集合中移除
        await cache.set_.srem(buildUserTokensKey(session.userId), accessToken)

        // 删除 refreshToken 映射
        const tokenPair = session.data?._tokenPair
        if (tokenPair?.refreshToken) {
          await cache.kv.del(buildRefreshKey(tokenPair.refreshToken))
        }
      }

      // 删除 session 本身
      await cache.kv.del(buildTokenKey(accessToken))
      return ok(undefined)
    },

    async removeByUserId(userId): Promise<HaiResult<void>> {
      const tokensResult = await cache.set_.smembers<string>(buildUserTokensKey(userId))
      if (tokensResult.success) {
        for (const token of tokensResult.data) {
          await repo.removeByAccessToken(token)
        }
      }
      // 清理用户令牌集合本身
      await cache.kv.del(buildUserTokensKey(userId))
      return ok(undefined)
    },

    async getByRefreshToken(refreshToken): Promise<HaiResult<Session | null>> {
      const mappingResult = await cache.kv.get<{ userId: string, accessToken: string }>(buildRefreshKey(refreshToken))
      if (!mappingResult.success) {
        return err(
          HaiIamError.REPOSITORY_ERROR,
          iamM('iam_querySessionMappingCacheFailed', { params: { message: mappingResult.error.message } }),
          mappingResult.error,
        )
      }
      if (!mappingResult.data) {
        return ok(null)
      }

      return repo.getByAccessToken(mappingResult.data.accessToken)
    },

    async removeRefreshToken(refreshToken): Promise<HaiResult<void>> {
      const result = await cache.kv.del(buildRefreshKey(refreshToken))
      if (!result.success) {
        return err(
          HaiIamError.REPOSITORY_ERROR,
          iamM('iam_deleteSessionMappingCacheFailed', { params: { message: result.error.message } }),
          result.error,
        )
      }
      return ok(undefined)
    },

    async patchUserSessions(userId, updates): Promise<HaiResult<void>> {
      const tokensResult = await cache.set_.smembers<string>(buildUserTokensKey(userId))
      if (!tokensResult.success) {
        return err(
          HaiIamError.REPOSITORY_ERROR,
          iamM('iam_queryUserSessionCacheFailed', { params: { message: tokensResult.error.message } }),
          tokensResult.error,
        )
      }

      const staleTokens: string[] = []

      for (const token of tokensResult.data) {
        const sessionKey = buildTokenKey(token)
        const sessionResult = await cache.kv.get<Record<string, unknown>>(sessionKey)
        if (!sessionResult.success || !sessionResult.data) {
          staleTokens.push(token)
          continue
        }

        const ttlResult = await cache.kv.ttl(sessionKey)
        if (!ttlResult.success || ttlResult.data <= 0) {
          staleTokens.push(token)
          continue
        }

        const updated = { ...sessionResult.data, ...updates }
        const setResult = await cache.kv.set(sessionKey, updated, { ex: ttlResult.data })
        if (!setResult.success) {
          return err(
            HaiIamError.REPOSITORY_ERROR,
            iamM('iam_saveUserSessionCacheFailed', { params: { message: setResult.error.message } }),
            setResult.error,
          )
        }
      }

      // 清理已失效的令牌
      if (staleTokens.length > 0) {
        await cache.set_.srem(buildUserTokensKey(userId), ...staleTokens)
      }

      return ok(undefined)
    },
  }

  return repo
}
