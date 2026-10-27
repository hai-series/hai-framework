/**
 * @h-ai/iam — 会话工具函数
 * @module iam-session-utils
 */

import type { CreateSessionOptions, Session } from './iam-session-types.js'
import { createHash } from 'node:crypto'

const BASE64_PLUS_REGEX = /\+/g
const BASE64_SLASH_REGEX = /\//g
const BASE64_TRAILING_PADDING_REGEX = /=+$/

/**
 * 生成访问令牌
 *
 * 使用 256 位（32 字节）加密安全随机数，编码为 base64url 格式。
 * 相比 UUID v4（122 位），提供更高的熵值和抗碰撞能力。
 *
 * @returns base64url 编码的 256 位随机令牌
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const token = generateToken()
 * const isBase64Url = /^[\w-]{43}$/.test(token)
 * ```
 */
export function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  // base64url 编码（RFC 4648 §5）
  const base64 = btoa(String.fromCharCode(...bytes))
  return base64.replace(BASE64_PLUS_REGEX, '-').replace(BASE64_SLASH_REGEX, '_').replace(BASE64_TRAILING_PADDING_REGEX, '')
}

/**
 * 获取用户会话分区；SHA-256 路由提示不包含原始用户 ID，也不充当认证凭据。
 * @param userId - 可信用户 ID；不能用路由提示替代完整令牌认证。
 * @returns 用户 ID 的 SHA-256 十六进制分区提示，同一用户在所有节点得到相同值。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const scope = getUserSessionScope('user-1')
 * const samePartition = scope === getUserSessionScope('user-1')
 * ```
 */
export function getUserSessionScope(userId: string): string {
  return createHash('sha256').update(userId).digest('hex')
}

/**
 * 生成携带分区提示的随机会话令牌；认证仍须匹配共享状态中的完整 256 位随机值。
 * @param userId - 已核验用户 ID，作为共享会话的分区路由来源。
 * @returns s1 前缀、用户分区提示与 256 位安全随机值组成的不透明令牌。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const token = generateSessionToken('user-1')
 * const partition = getTokenSessionScope(token)
 * ```
 */
export function generateSessionToken(userId: string): string {
  return `s1.${getUserSessionScope(userId)}.${generateToken()}`
}

/**
 * 解析经过格式约束的路由提示；非法 token 不访问共享存储。
 * @param token - 请求携带的完整访问或刷新令牌。
 * @returns 格式有效时返回分区提示；非法格式返回 undefined，不授予身份权限。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const token = generateSessionToken('user-1')
 * const samePartition = getTokenSessionScope(token) === getUserSessionScope('user-1')
 * const invalid = getTokenSessionScope('malformed-token') // undefined，不访问共享缓存。
 * ```
 */
export function getTokenSessionScope(token: string): string | undefined {
  return /^s1\.([a-f0-9]{64})\.[\w-]{43}$/.exec(token)?.[1]
}

/**
 * 构建会话数据
 *
 * @param options - 创建会话选项（用户 ID、角色等）
 * @param now - 当前时间
 * @param sessionTtl - 会话有效期（秒）
 * @param accessToken - 访问令牌
 * @param credentialVersion - 已核对当前数据库的可信凭据代
 * @returns 完整的 Session 对象
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const session = buildSession({ userId: 'user-1', source: 'server' }, new Date(), 3600, generateSessionToken('user-1'), 'verified-credential-version')
 * const expiresInSeconds = getSessionTtl(session)
 * ```
 */
export function buildSession(options: CreateSessionOptions, now: Date, sessionTtl: number, accessToken: string, credentialVersion: string): Session {
  return {
    version: crypto.randomUUID(),
    credentialVersion,
    apiKeyId: options.apiKeyId,
    apiKeyScopes: options.apiKeyScopes,
    userId: options.userId,
    username: options.username,
    displayName: options.displayName,
    avatarUrl: options.avatarUrl,
    roles: options.roles ?? [],
    permissions: options.permissions ?? [],
    source: options.source,
    terminalType: options.terminalType ?? 'web',
    accessToken,
    createdAt: now,
    startedAt: now,
    lastActiveAt: now,
    expiresAt: new Date(now.getTime() + sessionTtl * 1000),
    maxAge: sessionTtl,
    data: options.data,
  }
}

/**
 * 计算会话剩余 TTL
 *
 * @param session - 会话对象
 * @param now - 当前时间戳（毫秒，默认 Date.now()）
 * @returns 剩余秒数，最小为 0
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const session = buildSession({ userId: 'user-1', source: 'server' }, new Date(), 3600, generateSessionToken('user-1'), 'verified-credential-version')
 * const remaining = getSessionTtl(session, session.createdAt.getTime() + 1000) // 3599
 * ```
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
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const session = buildSession({ userId: 'user-1', source: 'server' }, new Date(), 3600, generateSessionToken('user-1'), 'verified-credential-version')
 * const updated = applySessionPatch(session, { data: { theme: 'dark' } })
 * const originalUnchanged = session.data === undefined
 * ```
 */
export function applySessionPatch(session: Session, patch: Partial<Session>): Session {
  const nextSession = { ...session }
  if (patch.data !== undefined) {
    nextSession.data = { ...nextSession.data, ...patch.data }
  }
  if (patch.roles !== undefined) {
    nextSession.roles = patch.roles
  }
  if (patch.permissions !== undefined) {
    nextSession.permissions = patch.permissions
  }
  if (patch.username !== undefined) {
    nextSession.username = patch.username
  }
  if (patch.displayName !== undefined) {
    nextSession.displayName = patch.displayName
  }
  if (patch.avatarUrl !== undefined) {
    nextSession.avatarUrl = patch.avatarUrl
  }
  if (patch.source !== undefined) {
    nextSession.source = patch.source
  }
  if (patch.expiresAt !== undefined)
    nextSession.expiresAt = new Date(patch.expiresAt)
  nextSession.lastActiveAt = patch.lastActiveAt !== undefined ? new Date(patch.lastActiveAt) : new Date()
  return nextSession
}
