/**
 * @h-ai/iam — 用户分区会话仓库。
 * 同一用户的会话、refresh 消费状态与索引放入一个版本化文档，单键 CAS 原子提交。
 * Cluster 只访问一个 slot，不使用进程锁、租约或跨 key 补偿发布认证状态。
 * @module iam-session-repository-cache
 */
import type { HaiResult } from '@h-ai/core'
import type { Session, TokenPair } from './iam-session-types.js'
import { cache } from '@h-ai/cache'
import { err, ok } from '@h-ai/core'
import { iamM } from '../iam-i18n.js'
import { HaiIamError } from '../iam-types.js'
import { applySessionPatch, getTokenSessionScope, getUserSessionScope } from './iam-session-utils.js'

/** 文档内单个会话及 refresh 凭据，不建立可能失配的第二份索引。 */
interface StoredSession {
  session: Session
  refreshToken?: string
  refreshExpiresAt: number
}

/** 单条记录的保留期限；刷新凭据不延长 access 的认证期限。 */
function retainedUntil(entry: StoredSession): number {
  return Math.max(new Date(entry.session.expiresAt).getTime(), entry.refreshToken ? entry.refreshExpiresAt : 0)
}

/** 用户状态快照；revision 防止删除/重建或同值写入产生 ABA。 */
interface SessionState {
  revision: string
  sessions: Record<string, StoredSession>
}

/** 恢复私有 JSON 日期，拒绝损坏的授权数据；错误不包含认证快照。 */
function restoreSession(session: Session): Session {
  const result = { ...session, createdAt: new Date(session.createdAt), lastActiveAt: new Date(session.lastActiveAt), expiresAt: new Date(session.expiresAt) }
  if (!result.version || !Number.isSafeInteger(result.maxAge) || result.maxAge <= 0 || !Array.isArray(result.roles) || !result.roles.every(role => typeof role === 'string')
    || !Array.isArray(result.permissions) || !result.permissions.every(permission => typeof permission === 'string')
    || ![result.createdAt, result.lastActiveAt, result.expiresAt].every(date => Number.isFinite(date.getTime()))) {
    throw new TypeError('Invalid session state')
  }
  return result
}

/** 分区仅由经过格式约束的 SHA-256 提示构成，不接受任意 key/hash tag。 */
function stateKey(scope: string): string {
  return `hai:iam:sessions:{${scope}}`
}

/** 保存基础设施原因，面向调用方的错误不包含认证快照。 */
function repositoryFailure(cause: unknown): HaiResult<never> {
  return err(HaiIamError.REPOSITORY_ERROR, iamM('iam_sessionStateFailed'), cause)
}

/**
 * 会话共享仓库；保存与轮换具有原子发布语义。
 * @example const repository = createCacheSessionRepository(604800)
 */
export interface SessionRepository {
  /** 原子保存；singleDevice 同一次提交替换该用户全部旧会话。 */
  save: (session: Session, tokens: TokenPair, singleDevice?: boolean) => Promise<HaiResult<void>>
  /** 比较旧版本与 refresh 凭据，原子撤销旧会话并发布唯一后继。 */
  rotate: (previous: Session, refreshToken: string, session: Session, tokens: TokenPair) => Promise<HaiResult<void>>
  /** 查询未过期 access；基础设施故障失败关闭。 */
  getByAccessToken: (token: string) => Promise<HaiResult<Session | null>>
  /** 查询待轮换会话，rotate 提交时必须再次核验。 */
  getByRefreshToken: (token: string) => Promise<HaiResult<Session | null>>
  /** 从最新状态合并更新，不重新创建已撤销 token。 */
  updateByAccessToken: (token: string, patch: Partial<Session>, expectedVersion: string) => Promise<HaiResult<void>>
  /** 从最新快照按会话固有 maxAge 单调滑动，返回已提交的真实时间字段。 */
  touchByAccessToken: (token: string, expectedVersion: string, now: Date) => Promise<HaiResult<Session>>
  /** 原子撤销 access 与 refresh，重复操作成功。 */
  removeByAccessToken: (token: string) => Promise<HaiResult<void>>
  /** 原子撤销用户全部会话，返回记录数。 */
  removeByUserId: (userId: string) => Promise<HaiResult<number>>
  /** 原子移除 refresh 凭据，保留 access。 */
  removeRefreshToken: (token: string) => Promise<HaiResult<void>>
  /** 在同一最新文档更新会话，缓存故障不会触发索引清理。 */
  patchUserSessions: (userId: string, patch: Record<string, unknown>) => Promise<HaiResult<void>>
}

/**
 * 创建单键 CAS 会话仓库，支持共享 Redis 和显式测试 Memory provider。
 * @param refreshTokenMaxAge - 新 refresh 的有效期，单位秒
 * @returns 不保存进程会话状态的仓库
 * @example
 * ```ts
 * const repo = createCacheSessionRepository(604800)
 * const saved = await repo.save(session, tokens, true)
 * if (!saved.success) return saved
 * ```
 */
export function createCacheSessionRepository(refreshTokenMaxAge: number): SessionRepository {
  /** 校验缓存快照的路由、主体和日期；损坏数据不能转为认证成功。 */
  async function read(scope: string): Promise<HaiResult<SessionState | undefined>> {
    try {
      const result = await cache.kv.get<SessionState>(stateKey(scope))
      if (!result.success)
        return repositoryFailure(result.error)
      if (result.data === null)
        return ok(undefined)
      const state = result.data
      if (typeof state.revision !== 'string' || !state.sessions || typeof state.sessions !== 'object')
        throw new TypeError('Invalid session state')
      for (const [token, entry] of Object.entries(state.sessions)) {
        const session = restoreSession(entry.session)
        if (getTokenSessionScope(token) !== scope || token !== session.accessToken || getUserSessionScope(session.userId) !== scope
          || !Number.isFinite(entry.refreshExpiresAt) || (entry.refreshToken !== undefined && getTokenSessionScope(entry.refreshToken) !== scope)) {
          throw new TypeError('Invalid session state')
        }
      }
      return ok(state)
    }
    catch (cause) { return repositoryFailure(cause) }
  }

  /** 冲突后重新读取；操作闭包必须同步且不包含外部副作用。 */
  async function mutate<T>(scope: string, operation: (state: SessionState) => HaiResult<T>): Promise<HaiResult<T>> {
    try {
      for (let attempt = 0; attempt < 16; attempt++) {
        const current = await read(scope)
        if (!current.success)
          return current
        // 私有快照由本仓库生成并经 read 校验；复制后修改，避免 Memory 引用别名。
        const next: SessionState = current.data ? JSON.parse(JSON.stringify(current.data)) : { revision: '', sessions: {} }
        for (const [token, entry] of Object.entries(next.sessions)) {
          if (retainedUntil(entry) <= Date.now())
            delete next.sessions[token]
        }
        const outcome = operation(next)
        if (!outcome.success)
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
      return err(HaiIamError.CONFLICT, iamM('iam_sessionStateConflict'))
    }
    catch (cause) { return repositoryFailure(cause) }
  }

  /** 完整随机 token 必须属于当前用户；分区提示本身不构成认证。 */
  function storeSession(state: SessionState, session: Session, tokens: TokenPair): HaiResult<void> {
    const scope = getUserSessionScope(session.userId)
    if (getTokenSessionScope(session.accessToken) !== scope || tokens.accessToken !== session.accessToken || getTokenSessionScope(tokens.refreshToken) !== scope)
      return err(HaiIamError.TOKEN_INVALID, iamM('iam_sessionStateFailed'))
    state.sessions[session.accessToken] = { session, refreshToken: tokens.refreshToken, refreshExpiresAt: session.createdAt.getTime() + refreshTokenMaxAge * 1000 }
    return ok(undefined)
  }

  return {
    save: (session, tokens, singleDevice = false) => mutate(getUserSessionScope(session.userId), (state) => {
      if (singleDevice)
        state.sessions = {}
      return storeSession(state, session, tokens)
    }),
    rotate: (previous, refreshToken, session, tokens) => mutate(getUserSessionScope(previous.userId), (state) => {
      const old = state.sessions[previous.accessToken]
      if (!old || old.refreshToken !== refreshToken || old.refreshExpiresAt <= Date.now())
        return err(HaiIamError.TOKEN_EXPIRED, iamM('iam_refreshTokenExpired'))
      if (old.session.version !== previous.version || session.userId !== previous.userId)
        return err(HaiIamError.CONFLICT, iamM('iam_sessionStateConflict'))
      delete state.sessions[previous.accessToken]
      return storeSession(state, session, tokens)
    }),
    async getByAccessToken(token) {
      const scope = getTokenSessionScope(token)
      if (!scope)
        return ok(null)
      const result = await read(scope)
      if (!result.success)
        return result
      const record = result.data?.sessions[token]
      if (!record)
        return ok(null)
      const session = restoreSession(record.session)
      return ok(session.expiresAt.getTime() <= Date.now() ? null : session)
    },
    async getByRefreshToken(token) {
      const scope = getTokenSessionScope(token)
      if (!scope)
        return ok(null)
      const result = await read(scope)
      if (!result.success)
        return result
      const record = Object.values(result.data?.sessions ?? {}).find(entry => entry.refreshToken === token && entry.refreshExpiresAt > Date.now())
      if (!record)
        return ok(null)
      return ok(restoreSession(record.session))
    },
    async updateByAccessToken(token, patch, expectedVersion) {
      const scope = getTokenSessionScope(token)
      if (!scope)
        return err(HaiIamError.SESSION_NOT_FOUND, iamM('iam_sessionNotExist'))
      return mutate(scope, (state) => {
        const entry = state.sessions[token]
        if (!entry || new Date(entry.session.expiresAt).getTime() <= Date.now())
          return err(HaiIamError.SESSION_NOT_FOUND, iamM('iam_sessionNotExist'))
        if (!expectedVersion || entry.session.version !== expectedVersion)
          return err(HaiIamError.CONFLICT, iamM('iam_sessionStateConflict'))
        const updated = applySessionPatch(restoreSession(entry.session), patch)
        if (![updated.expiresAt, updated.lastActiveAt].every(date => Number.isFinite(date.getTime())))
          return err(HaiIamError.INVALID_ARGUMENT, iamM('iam_sessionMaxAgeInvalid'))
        entry.session = { ...updated, version: crypto.randomUUID() }
        return ok(undefined)
      })
    },
    async touchByAccessToken(token, expectedVersion, now) {
      const scope = getTokenSessionScope(token)
      if (!scope)
        return err(HaiIamError.SESSION_NOT_FOUND, iamM('iam_sessionNotExist'))
      return mutate(scope, (state) => {
        const entry = state.sessions[token]
        if (!entry || new Date(entry.session.expiresAt).getTime() <= Date.now())
          return err(HaiIamError.SESSION_NOT_FOUND, iamM('iam_sessionNotExist'))
        if (entry.session.version !== expectedVersion)
          return err(HaiIamError.CONFLICT, iamM('iam_sessionStateConflict'))
        const current = restoreSession(entry.session)
        // 迟到节点只允许延长时间，不能覆盖较晚请求已提交的活动/过期点。
        const next = {
          ...current,
          lastActiveAt: new Date(Math.max(current.lastActiveAt.getTime(), now.getTime())),
          expiresAt: new Date(Math.max(current.expiresAt.getTime(), now.getTime() + current.maxAge * 1000)),
        }
        entry.session = next
        return ok(next)
      })
    },
    async removeByAccessToken(token) {
      const scope = getTokenSessionScope(token)
      if (!scope)
        return ok(undefined)
      return mutate(scope, (state) => {
        delete state.sessions[token]
        return ok(undefined)
      })
    },
    removeByUserId: userId => mutate(getUserSessionScope(userId), (state) => {
      const count = Object.keys(state.sessions).length
      state.sessions = {}
      return ok(count)
    }),
    async removeRefreshToken(token) {
      const scope = getTokenSessionScope(token)
      if (!scope)
        return ok(undefined)
      return mutate(scope, (state) => {
        for (const entry of Object.values(state.sessions)) {
          if (entry.refreshToken === token)
            delete entry.refreshToken
        }
        return ok(undefined)
      })
    },
    patchUserSessions(userId, patch) {
      // 重试绑定最初读取的会话代际；不能把迟到授权覆盖到后续登录或新内容版本。
      let targets: Map<string, string> | undefined
      return mutate(getUserSessionScope(userId), (state) => {
        targets ??= new Map(Object.entries(state.sessions).map(([token, entry]) => [token, entry.session.version]))
        for (const [token, version] of targets) {
          const entry = state.sessions[token]
          if (!entry)
            continue
          if (entry.session.version !== version)
            return err(HaiIamError.CONFLICT, iamM('iam_sessionStateConflict'))
          entry.session = { ...applySessionPatch(restoreSession(entry.session), patch), version: crypto.randomUUID() }
        }
        return ok(undefined)
      })
    },
  }
}
