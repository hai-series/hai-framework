/**
 * @h-ai/iam — 用户分区会话仓库。
 * 同一用户的会话、refresh 消费状态与索引放入一个版本化文档，单键 CAS 原子提交。
 * Cluster 只访问一个 slot，不使用进程锁、租约或跨 key 补偿发布认证状态。
 * @module iam-session-repository-cache
 */

import type { HaiResult } from '@h-ai/core'
import type { SessionConfig } from '../iam-config.js'
import type { Session, SessionFieldUpdates, TokenPair } from './iam-session-types.js'
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { iamM } from '../iam-i18n.js'
import { HaiIamError } from '../iam-types.js'
import { applySessionPatch, getTokenSessionScope, getUserSessionScope } from './iam-session-utils.js'

/**
 * 访问令牌作为会话键保存，签发时的令牌对只在调用期间传递。
 * @example 模块内部上下文
 * ```ts
 * function firstIssueTime(session: Session) {
 *   const snapshot: SessionSnapshot = snapshotSession(session)
 *   return snapshot.startedAt
 * }
 * ```
 */
type SessionSnapshot = Omit<Session, 'accessToken' | 'data'> & {
  accessToken?: never
  data?: Record<string, unknown> & { _tokenPair?: never }
}

/**
 * 文档内单个会话及 refresh 凭据，不建立可能失配的第二份索引。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * function accessExpired(record: StoredSession, now: Date): boolean {
 *   return record.session.expiresAt <= now
 * }
 * ```
 */
interface StoredSession {
  session: SessionSnapshot
  refreshToken?: string
  refreshExpiresAt: number
}

/** 单条记录的保留期限；刷新凭据不延长 access 的认证期限。 */
function retainedUntil(entry: StoredSession): number {
  return Math.max(new Date(entry.session.expiresAt).getTime(), entry.refreshToken ? entry.refreshExpiresAt : 0)
}

/**
 * 用户状态快照；revision 防止删除/重建或同值写入产生 ABA。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const state: SessionState = { revision: crypto.randomUUID(), sessions: {} }
 * const recordCount = Object.keys(state.sessions).length
 * ```
 */
interface SessionState {
  revision: string
  sessions: Record<string, StoredSession>
}

/** 从键恢复访问令牌，并把私有 JSON 日期转成运行时日期。 */
function restoreSession(accessToken: string, session: SessionSnapshot): Session {
  const result = {
    ...session,
    accessToken,
    createdAt: new Date(session.createdAt),
    startedAt: new Date(session.startedAt),
    lastActiveAt: new Date(session.lastActiveAt),
    expiresAt: new Date(session.expiresAt),
  }
  if (!['web', 'app', 'desktop', 'api'].includes(result.terminalType)
    || (typeof session.startedAt !== 'string' && !(session.startedAt instanceof Date))
    || typeof result.credentialVersion !== 'string' || !result.version || !Number.isSafeInteger(result.maxAge) || result.maxAge <= 0 || !Array.isArray(result.roles) || !result.roles.every(role => typeof role === 'string')
    || !Array.isArray(result.permissions) || !result.permissions.every(permission => typeof permission === 'string')
    || ![
      result.createdAt,
      result.startedAt,
      result.lastActiveAt,
      result.expiresAt,
    ].every(date => Number.isFinite(date.getTime()))) {
    throw new TypeError('Invalid session state')
  }
  return result
}

/** 保存会话扩展字段，过滤仅用于签发的令牌对。 */
function snapshotSession({ accessToken, data, ...snapshot }: Session): SessionSnapshot {
  void accessToken
  if (!data)
    return snapshot
  const { _tokenPair, ...fields } = data
  void _tokenPair
  return Object.keys(fields).length
    ? { ...snapshot, data: fields }
    : snapshot
}

/** 分区仅由经过格式约束的 SHA-256 提示构成，不接受任意 key/hash tag。 */
function stateKey(scope: string): string {
  return `hai:iam:sessions:{${scope}}`
}

/** 保存基础设施原因，面向调用方的错误不包含认证快照。 */
function repositoryFailure(cause: unknown): HaiResult<never> {
  return core.err(HaiIamError.REPOSITORY_ERROR, iamM('iam_sessionStateFailed'), cause)
}

/**
 * 会话共享仓库；保存与轮换具有原子发布语义。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const repository = createCacheSessionRepository(604800)
 * const found = await repository.getByAccessToken('token-from-authorization-header')
 * if (!found.success)
 *   return found
 * return found.data?.userId ?? null
 * ```
 */
export interface SessionRepository {
  /** 原子保存；singleDevice 在同一次提交替换同一凭据代的旧会话。 */
  save: (session: Session, tokens: TokenPair, singleDevice?: boolean) => Promise<HaiResult<void>>
  /** 比较旧版本与 refresh 凭据，原子撤销旧会话并发布唯一后继。 */
  rotate: (previous: Session, refreshToken: string, session: Session, tokens: TokenPair) => Promise<HaiResult<void>>
  /** 查询未过期 access；基础设施故障失败关闭。 */
  getByAccessToken: (token: string) => Promise<HaiResult<Session | null>>
  /** 查询待轮换会话，rotate 提交时必须再次核验。 */
  getByRefreshToken: (token: string) => Promise<HaiResult<Session | null>>
  /** 从最新状态合并更新，不重新创建已撤销 token。 */
  updateByAccessToken: (token: string, patch: Partial<Session>, expectedVersion: string) => Promise<HaiResult<void>>
  /** 核对最新快照后按会话固有 maxAge 单调滑动，返回共享记录中已提交的时间字段。 */
  touchByAccessToken: (token: string, expectedVersion: string, now: Date) => Promise<HaiResult<Session>>
  /** 原子撤销 access 与 refresh，重复操作成功。 */
  removeByAccessToken: (token: string) => Promise<HaiResult<void>>
  /** 原子撤销用户会话，指定凭据代时只撤销该代。 */
  removeByUserId: (userId: string, credentialVersion?: string) => Promise<HaiResult<number>>
  /** 原子移除 refresh 凭据，保留 access。 */
  removeRefreshToken: (token: string) => Promise<HaiResult<void>>
  /** 在同一最新文档更新会话，缓存故障返回失败并保留整个分区；损坏数据同样失败关闭，不当作不存在。 */
  patchUserSessions: (userId: string, patch: SessionFieldUpdates) => Promise<HaiResult<void>>
}

/**
 * 创建单键 CAS 会话仓库，支持共享 Redis 和显式测试 Memory provider。
 * @param refreshTokenMaxAge - 新 refresh 的有效期，单位秒
 * @returns 不保存进程会话状态的仓库
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const repository = createCacheSessionRepository(604800)
 * const found = await repository.getByAccessToken('token-from-authorization-header')
 * if (!found.success)
 *   return found
 * return found.data?.userId ?? null
 * ```
 */
export function createCacheSessionRepository(
  refreshTokenMaxAge: number,
  policy: Partial<Pick<SessionConfig, 'idleTimeout' | 'absoluteTimeout' | 'maxSessions' | 'singleDeviceMode' | 'sliding' | 'terminalLimits' | 'terminalLimitMode' | 'touchMinInterval'>> = {},
): SessionRepository {
  const idleTimeout = policy.idleTimeout ?? 0
  const absoluteTimeout = policy.absoluteTimeout ?? 0
  const maxSessions = policy.maxSessions ?? 0
  const sliding = policy.sliding !== false
  const touchMinInterval = sliding && idleTimeout === 0
    ? (policy.touchMinInterval ?? 5) * 1000
    : 0

  /** 在读取及最终 CAS 提交时重复检查，防止迟到请求或刷新复活过期会话。 */
  function policyExpired(session: Pick<Session, 'lastActiveAt' | 'startedAt'>, now = Date.now()): boolean {
    const activeAt = new Date(session.lastActiveAt).getTime()
    const startedAt = new Date(session.startedAt).getTime()
    return (idleTimeout > 0 && activeAt + idleTimeout * 1000 <= now)
      || (absoluteTimeout > 0 && startedAt + absoluteTimeout * 1000 <= now)
  }
  /** 校验缓存快照的路由、主体和日期；损坏数据不能转为认证成功。 */
  async function read(scope: string): Promise<HaiResult<SessionState | undefined>> {
    try {
      const result = await cache.kv.get<SessionState>(stateKey(scope))
      if (!result.success)
        return repositoryFailure(result.error)
      if (result.data === null)
        return core.ok(undefined)
      const state = result.data
      if (typeof state.revision !== 'string' || !state.revision || !state.sessions || typeof state.sessions !== 'object' || Array.isArray(state.sessions))
        throw new TypeError('Invalid session state')
      for (const [token, entry] of Object.entries(state.sessions)) {
        const session = restoreSession(token, entry.session)
        if (getTokenSessionScope(token) !== scope || getUserSessionScope(session.userId) !== scope
          || 'accessToken' in entry.session || (session.data && '_tokenPair' in session.data)
          || !Number.isSafeInteger(entry.refreshExpiresAt) || (entry.refreshToken !== undefined && getTokenSessionScope(entry.refreshToken) !== scope)) {
          throw new TypeError('Invalid session state')
        }
      }
      return core.ok(state)
    }
    catch (cause) { return repositoryFailure(cause) }
  }

  /**
   * 读取共享快照后进行单 key CAS；冲突只重新执行无外部副作用的同步状态变换。
   * 缓存读取或提交失败立即传播，不把损坏/未知状态覆盖为空；同值重建由 revision 防止 ABA。
   * @param scope - 已约束为 SHA-256 十六进制的用户分区提示。
   * @param operation - 同步计算候选状态；可在确认无需提交时调用 skipWrite，仅返回最新读取对应的结果。
   * @returns 返回共享读取或确认提交的操作结果；缓存失败或冲突耗尽时返回错误。
   * @example 模块内部上下文
   * ```ts
   * import { core } from '@h-ai/core'
   * const revoked = await mutate(getUserSessionScope('user-1'), (state) => {
   *   const count = Object.keys(state.sessions).length
   *   state.sessions = {}
   *   return core.ok(count)
   * })
   * if (!revoked.success)
   *   return revoked
   * return revoked.data
   * ```
   */
  async function mutate<T>(scope: string, operation: (state: SessionState, skipWrite: () => void) => HaiResult<T>): Promise<HaiResult<T>> {
    try {
      for (let attempt = 0; attempt < 16; attempt++) {
        const current = await read(scope)
        if (!current.success)
          return current
        // 私有快照由本仓库生成并经 read 校验；复制后修改，避免 Memory 引用别名。
        const next: SessionState = current.data
          ? JSON.parse(JSON.stringify(current.data))
          : { revision: '', sessions: {} }
        for (const [token, entry] of Object.entries(next.sessions)) {
          if (retainedUntil(entry) <= Date.now() || policyExpired(entry.session))
            delete next.sessions[token]
        }
        let shouldWrite = true
        const outcome = operation(next, () => {
          shouldWrite = false
        })
        if (!outcome.success || !shouldWrite)
          return outcome
        next.revision = crypto.randomUUID()
        const entries = Object.values(next.sessions)
        const px = entries.reduce((ttl, entry) => Math.max(ttl, retainedUntil(entry) - Date.now()), 1)
        const written = await cache.kv.compareAndSwap(stateKey(scope), current.data, entries.length ? next : undefined, { px })
        if (!written.success)
          return repositoryFailure(written.error)
        if (written.data)
          return outcome
      }
      return core.err(HaiIamError.CONFLICT, iamM('iam_sessionStateConflict'))
    }
    catch (cause) { return repositoryFailure(cause) }
  }

  /** 完整随机 token 必须属于当前用户；分区提示本身不构成认证。 */
  function storeSession(state: SessionState, session: Session, tokens: TokenPair): HaiResult<void> {
    const scope = getUserSessionScope(session.userId)
    if (getTokenSessionScope(session.accessToken) !== scope || tokens.accessToken !== session.accessToken || getTokenSessionScope(tokens.refreshToken) !== scope)
      return core.err(HaiIamError.TOKEN_INVALID, iamM('iam_sessionStateFailed'))
    state.sessions[session.accessToken] = {
      session: snapshotSession(session),
      refreshToken: tokens.refreshToken,
      refreshExpiresAt: session.createdAt.getTime() + refreshTokenMaxAge * 1000,
    }
    return core.ok(undefined)
  }

  return {
    save: (session, tokens, singleDevice = false) => mutate(getUserSessionScope(session.userId), (state) => {
      // 已被数据库凭据代际撤销的旧记录不占用有效会话配额。
      const active = Object.entries(state.sessions).filter(([, entry]) => entry.session.credentialVersion === session.credentialVersion)
      const terminal = session.terminalType
      const limits = policy.terminalLimits ?? {}
      const cap = limits[terminal]
      if (Object.keys(limits).length && cap === undefined)
        return core.err(HaiIamError.SESSION_LIMIT_EXCEEDED, iamM('iam_sessionLimitExceeded'))
      const removed = new Set<string>()
      if (singleDevice) {
        if (policy.singleDeviceMode === 'reject' && active.length)
          return core.err(HaiIamError.SESSION_LIMIT_EXCEEDED, iamM('iam_sessionLimitExceeded'))
        if (policy.singleDeviceMode !== 'reject')
          active.forEach(([token]) => removed.add(token))
      }
      else if (cap) {
        const same = active.filter(([, entry]) => entry.session.terminalType === terminal)
          .sort(([firstToken, first], [secondToken, second]) => new Date(first.session.startedAt).getTime() - new Date(second.session.startedAt).getTime() || firstToken.localeCompare(secondToken))
        if (same.length >= cap) {
          if (policy.terminalLimitMode !== 'replace')
            return core.err(HaiIamError.SESSION_LIMIT_EXCEEDED, iamM('iam_sessionLimitExceeded'))
          same.slice(0, same.length - cap + 1).forEach(([token]) => removed.add(token))
        }
      }
      if (maxSessions > 0 && active.filter(([token]) => !removed.has(token)).length >= maxSessions)
        return core.err(HaiIamError.SESSION_LIMIT_EXCEEDED, iamM('iam_sessionLimitExceeded'))
      // 所有配额确认后再改候选状态；失败不能撤销已存在的任何终端会话。
      removed.forEach(token => delete state.sessions[token])
      return storeSession(state, session, tokens)
    }),
    rotate: (previous, refreshToken, session, tokens) => mutate(getUserSessionScope(previous.userId), (state) => {
      const old = state.sessions[previous.accessToken]
      if (!old || old.refreshToken !== refreshToken || old.refreshExpiresAt <= Date.now() || policyExpired(old.session))
        return core.err(HaiIamError.TOKEN_EXPIRED, iamM('iam_refreshTokenExpired'))
      if (old.session.version !== previous.version || session.userId !== previous.userId)
        return core.err(HaiIamError.CONFLICT, iamM('iam_sessionStateConflict'))
      // 绝对期限从首次签发计算，不随 refresh 创建新 access 重新计时。
      session.startedAt = new Date(old.session.startedAt)
      // 自动换票不算业务活动，避免后台定时 refresh 无限延长闲置期限。
      if (idleTimeout > 0)
        session.lastActiveAt = new Date(old.session.lastActiveAt)
      delete state.sessions[previous.accessToken]
      return storeSession(state, session, tokens)
    }),
    async getByAccessToken(token) {
      const scope = getTokenSessionScope(token)
      if (!scope)
        return core.ok(null)
      const result = await read(scope)
      if (!result.success)
        return result
      const record = result.data?.sessions[token]
      if (!record)
        return core.ok(null)
      const session = restoreSession(token, record.session)
      return core.ok(session.expiresAt.getTime() <= Date.now() || policyExpired(session)
        ? null
        : session)
    },
    async getByRefreshToken(token) {
      const scope = getTokenSessionScope(token)
      if (!scope)
        return core.ok(null)
      const result = await read(scope)
      if (!result.success)
        return result
      const sessions = result.data?.sessions
      if (!sessions)
        return core.ok(null)
      for (const accessToken of Object.keys(sessions)) {
        const entry = sessions[accessToken]
        if (entry.refreshToken !== token || entry.refreshExpiresAt <= Date.now())
          continue
        const session = restoreSession(accessToken, entry.session)
        return core.ok(policyExpired(session)
          ? null
          : session)
      }
      return core.ok(null)
    },
    async updateByAccessToken(token, patch, expectedVersion) {
      const scope = getTokenSessionScope(token)
      if (!scope)
        return core.err(HaiIamError.SESSION_NOT_FOUND, iamM('iam_sessionNotExist'))
      return mutate(scope, (state) => {
        const entry = state.sessions[token]
        if (!entry || new Date(entry.session.expiresAt).getTime() <= Date.now() || policyExpired(entry.session))
          return core.err(HaiIamError.SESSION_NOT_FOUND, iamM('iam_sessionNotExist'))
        if (!expectedVersion || entry.session.version !== expectedVersion)
          return core.err(HaiIamError.CONFLICT, iamM('iam_sessionStateConflict'))
        if (patch.terminalType !== undefined && patch.terminalType !== entry.session.terminalType)
          return core.err(HaiIamError.CONFLICT, iamM('iam_sessionStateConflict'))
        const updated = applySessionPatch(restoreSession(token, entry.session), patch)
        if (![updated.expiresAt, updated.lastActiveAt].every(date => Number.isFinite(date.getTime())))
          return core.err(HaiIamError.INVALID_ARGUMENT, iamM('iam_sessionMaxAgeInvalid'))
        updated.version = crypto.randomUUID()
        entry.session = snapshotSession(updated)
        return core.ok(undefined)
      })
    },
    async touchByAccessToken(token, expectedVersion, now) {
      const scope = getTokenSessionScope(token)
      if (!scope)
        return core.err(HaiIamError.SESSION_NOT_FOUND, iamM('iam_sessionNotExist'))
      return mutate(scope, (state, skipWrite) => {
        const entry = state.sessions[token]
        const checkedAt = Date.now()
        if (!entry || new Date(entry.session.expiresAt).getTime() <= checkedAt || policyExpired(entry.session, checkedAt))
          return core.err(HaiIamError.SESSION_NOT_FOUND, iamM('iam_sessionNotExist'))
        if (entry.session.version !== expectedVersion)
          return core.err(HaiIamError.CONFLICT, iamM('iam_sessionStateConflict'))
        const current = restoreSession(token, entry.session)
        // 迟到节点只允许延长时间，不能覆盖较晚请求已提交的活动/过期点。
        const lastActiveAt = current.lastActiveAt.getTime()
        const expiresAt = current.expiresAt.getTime()
        const touchedAt = now.getTime()
        const nextActiveAt = Math.max(lastActiveAt, touchedAt)
        const nextExpiresAt = sliding
          ? Math.max(expiresAt, touchedAt + current.maxAge * 1000)
          : expiresAt
        const gap = Math.min(touchMinInterval, current.maxAge * 1000 / 10)
        // 临近 access 自身到期时及时续期；闲置策略开着时每次真实访问都精确更新。
        if ((nextActiveAt === lastActiveAt && nextExpiresAt === expiresAt)
          || (nextActiveAt - lastActiveAt < gap && nextExpiresAt - expiresAt < gap && expiresAt - checkedAt > gap)) {
          skipWrite()
          return core.ok(current)
        }
        current.lastActiveAt = new Date(nextActiveAt)
        current.expiresAt = new Date(nextExpiresAt)
        entry.session.lastActiveAt = current.lastActiveAt
        entry.session.expiresAt = current.expiresAt
        return core.ok(current)
      })
    },
    async removeByAccessToken(token) {
      const scope = getTokenSessionScope(token)
      if (!scope)
        return core.ok(undefined)
      return mutate(scope, (state) => {
        delete state.sessions[token]
        return core.ok(undefined)
      })
    },
    removeByUserId: (userId, credentialVersion) => mutate(getUserSessionScope(userId), (state) => {
      const matching = Object.entries(state.sessions).filter(([, entry]) =>
        credentialVersion === undefined || entry.session.credentialVersion === credentialVersion)
      for (const [token] of matching)
        delete state.sessions[token]
      return core.ok(matching.length)
    }),
    async removeRefreshToken(token) {
      const scope = getTokenSessionScope(token)
      if (!scope)
        return core.ok(undefined)
      return mutate(scope, (state) => {
        for (const entry of Object.values(state.sessions)) {
          if (entry.refreshToken === token)
            delete entry.refreshToken
        }
        return core.ok(undefined)
      })
    },
    patchUserSessions(userId, { roles, permissions }) {
      // 重试绑定最初读取的会话代际；不能把迟到授权覆盖到后续登录或新内容版本。
      let targets: Map<string, string> | undefined
      return mutate(getUserSessionScope(userId), (state, skipWrite) => {
        targets ??= new Map(Object.entries(state.sessions).map(([token, entry]) => [token, entry.session.version]))
        let changed = false
        for (const [token, version] of targets) {
          const entry = state.sessions[token]
          if (!entry)
            continue
          if (entry.session.version !== version)
            return core.err(HaiIamError.CONFLICT, iamM('iam_sessionStateConflict'))
          const sameRoles = roles === undefined || (roles.length === entry.session.roles.length && roles.every((role, index) => role === entry.session.roles[index]))
          const samePermissions = permissions === undefined || (permissions.length === entry.session.permissions.length && permissions.every((permission, index) => permission === entry.session.permissions[index]))
          if (sameRoles && samePermissions)
            continue
          entry.session = {
            ...entry.session,
            roles: roles ?? entry.session.roles,
            permissions: permissions ?? entry.session.permissions,
            version: crypto.randomUUID(),
          }
          changed = true
        }
        if (!changed)
          skipWrite()
        return core.ok(undefined)
      })
    },
  }
}
