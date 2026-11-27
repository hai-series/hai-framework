/**
 * @h-ai/iam — 会话子功能工厂
 *
 * 基于缓存存储的会话实现：创建、查询、验证、更新、删除。
 * @module iam-session-functions
 */

import type { HaiResult } from '@h-ai/core'
import type { ApiKeyRepository } from '../authn/apikey/iam-authn-apikey-repository.js'
import type { IamConfig } from '../iam-config.js'
import type { SessionRepository } from './iam-session-repository-cache.js'
import type { CreateSessionOptions, Session, SessionOperations, TokenPair } from './iam-session-types.js'
import { core } from '@h-ai/core'
import { createDbApiKeyRepository } from '../authn/apikey/iam-authn-apikey-repository.js'
import { applyApiKeyScopes } from '../authn/apikey/iam-authn-apikey-scope.js'
import { readIamCache } from '../iam-cache.js'
import { SessionConfigSchema } from '../iam-config.js'
import { iamM } from '../iam-i18n.js'
import { HaiIamError } from '../iam-types.js'
import { createCacheSessionRepository } from './iam-session-repository-cache.js'
import { buildSession, generateSessionToken } from './iam-session-utils.js'

const logger = core.logger.child({ module: 'iam', scope: 'session' })

// ─── 子功能依赖 ───

/**
 * 验签使用的账号状态与当前授权。
 * @example 模块内部上下文
 * ```ts
 * const credential: SessionCredential = {
 *   version: 'credential-1',
 *   available: true,
 *   authorization: { roles: ['reader'], permissions: ['orders:read'] },
 * }
 * ```
 */
interface SessionCredential {
  version: string
  available: boolean
  profile?: Pick<Session, 'username' | 'displayName' | 'avatarUrl'>
  /** 只验证会话的调用可提供账号状态；标准鉴权须提供同次读取的授权。 */
  authorization?: Pick<Session, 'roles' | 'permissions'>
}

/**
 * 会话子功能依赖
 * @internal
 * @example 模块内部上下文
 * ```ts
 * async function assemble(config: IamConfig, readCredential: SessionOperationsDeps['readCredential']) {
 *   const deps: SessionOperationsDeps = { config, readCredential }
 *   return createSessionOperations(deps)
 * }
 * ```
 */
export interface SessionOperationsDeps {
  config: IamConfig
  /** 可信用户状态读取口；共享代际缓存与安全回源，缺失/禁用/读失败均拒绝签发和认证。 */
  readCredential: (userId: string) => Promise<HaiResult<SessionCredential | null>>
}

/**
 * 会话运行期内部接口，为账号安全操作提供按凭据代清理。
 * @example 模块内部上下文
 * ```ts
 * async function revokePrevious(runtime: SessionRuntimeOperations, userId: string, previousVersion: string) {
 *   return runtime.revokeCredentialSessions(userId, previousVersion)
 * }
 * ```
 */
interface SessionRuntimeOperations extends SessionOperations {
  revokeCredentialSessions: (userId: string, credentialVersion: string) => Promise<HaiResult<number>>
  /** 标准鉴权在验证会话的同一次账号读取中取得当前角色和权限。 */
  verifyCurrentSession: SessionOperations['verifyToken']
}

/**
 * 创建会话子功能
 *
 * 内部创建缓存会话存储，返回会话管理接口。
 * @param deps - 由 IAM 生命周期按依赖顺序创建的内部组件。
 * @returns 成功返回数据，失败返回业务或基础设施错误；调用方必须先判断 success。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * async function verify(deps: SessionOperationsDeps, token: string) {
 *   const created = await createSessionOperations(deps)
 *   if (!created.success)
 *     return created
 *   return created.data.verifyToken(token)
 * }
 * ```
 */
export async function createSessionOperations(deps: SessionOperationsDeps): Promise<HaiResult<SessionRuntimeOperations>> {
  try {
    const { config } = deps
    const sessionConfig = SessionConfigSchema.parse(config.session ?? {})
    const sessionRepository = createCacheSessionRepository(
      sessionConfig.refreshTokenMaxAge ?? 604800,
      sessionConfig,
    )

    const functions = buildSessionFunctions({
      readCredential: deps.readCredential,
      maxAge: sessionConfig.maxAge,
      sliding: sessionConfig.sliding,
      singleDevice: sessionConfig.singleDevice,
      idleTimeout: sessionConfig.idleTimeout,
      sessionRepository,
      apiKeyRepository: config.login.apikey
        ? await createDbApiKeyRepository()
        : undefined,
    })

    logger.info('Session sub-feature initialized')
    return core.ok(functions)
  }
  catch (error) {
    logger.error('Session sub-feature initialization failed', { error })
    return core.err(
      HaiIamError.CONFIG_ERROR,
      iamM('iam_initComponentFailed'),
      error,
    )
  }
}

// ─── 内部实现 ───

/**
 * 内部会话构建器配置
 * @internal
 * @example 模块内部上下文
 * ```ts
 * function lifetime(config: SessionBuilderConfig) {
 *   return { maxAgeSeconds: config.maxAge ?? 86400, singleDevice: config.singleDevice ?? false }
 * }
 * ```
 */
interface SessionBuilderConfig {
  readCredential: SessionOperationsDeps['readCredential']
  apiKeyRepository?: ApiKeyRepository
  /** 会话最大有效期（秒，默认 86400 = 24小时） */
  maxAge?: number
  /** 是否滑动窗口 */
  sliding?: boolean
  /** 单设备登录（踢掉其他设备） */
  singleDevice?: boolean
  /** access 不滑动时仍需记录活动，以执行独立闲置期限。 */
  idleTimeout?: number
  /** 会话存储 */
  sessionRepository: SessionRepository
}

/**
 * 组装会话操作
 */
function buildSessionFunctions(config: SessionBuilderConfig): SessionRuntimeOperations {
  const maxAge = config.maxAge ?? 86400
  const sliding = config.sliding ?? true
  const singleDevice = config.singleDevice ?? false
  const repo = config.sessionRepository

  /** 只构造候选值；旧凭据撤销与新凭据发布必须由仓库一次原子提交。 */
  function candidate(options: CreateSessionOptions, credentialVersion: string): HaiResult<{ session: Session, tokens: TokenPair }> {
    if (options.terminalType !== undefined && !['web', 'app', 'desktop', 'api'].includes(options.terminalType))
      return core.err(HaiIamError.INVALID_ARGUMENT, iamM('iam_terminalTypeInvalid'))
    const now = new Date()
    const ttl = options.maxAge ?? maxAge
    if (!Number.isSafeInteger(ttl) || ttl <= 0 || !Number.isFinite(new Date(now.getTime() + ttl * 1000).getTime()))
      return core.err(HaiIamError.INVALID_ARGUMENT, iamM('iam_sessionMaxAgeInvalid'))
    const accessToken = generateSessionToken(options.userId)
    const tokens: TokenPair = {
      accessToken,
      refreshToken: generateSessionToken(options.userId),
      expiresIn: ttl,
      tokenType: 'Bearer',
    }
    const session = buildSession(options, now, ttl, accessToken, credentialVersion)
    return core.ok({ session, tokens })
  }

  /**
   * 凭据代只能来自可信数据库；读取和签发跨库不能同事务，因此会话始终保留旧代，后续认证再次核对。
   * @example await credential('user-1', authenticated.credentialVersion)
   */
  async function credential(userId: string, expected?: string): Promise<HaiResult<SessionCredential>> {
    try {
      const current = await config.readCredential(userId)
      if (!current.success)
        return current
      if (!current.data || current.data.available !== true)
        return core.err(HaiIamError.ACCOUNT_UNAVAILABLE, iamM('iam_accountUnavailable'))
      if (typeof current.data.version !== 'string' || (expected !== undefined && current.data.version !== expected))
        return core.err(HaiIamError.SESSION_INVALID, iamM('iam_sessionExpired'))
      return core.ok(current.data)
    }
    catch {
      return core.err(HaiIamError.REPOSITORY_ERROR, iamM('iam_sessionExpired'))
    }
  }

  /** 持久化 key 是派生会话的授权上限；撤销、禁用、到期与读取失败均拒绝访问。 */
  async function validateApiKey(session: Session): Promise<HaiResult<Session>> {
    if (!session.apiKeyId)
      return core.ok(session)
    if (!config.apiKeyRepository)
      return core.err(HaiIamError.APIKEY_INVALID, iamM('iam_apikeyInvalid'))
    const found = await readIamCache(`apikey:${session.apiKeyId}`, async () => {
      const row = await config.apiKeyRepository!.findOneById(session.apiKeyId!)
      return row.success
        ? core.ok(row.data
            ? {
                userId: row.data.userId,
                enabled: row.data.enabled,
                expiresAt: row.data.expiresAt?.getTime() ?? null,
                scopes: row.data.scopes,
              }
            : null)
        : row
    })
    if (!found.success)
      return found
    const key = found.data
    if (!key || key.userId !== session.userId)
      return core.err(HaiIamError.APIKEY_INVALID, iamM('iam_apikeyInvalid'))
    if (!key.enabled)
      return core.err(HaiIamError.APIKEY_DISABLED, iamM('iam_apikeyDisabled'))
    if (key.expiresAt && Date.now() >= key.expiresAt)
      return core.err(HaiIamError.APIKEY_EXPIRED, iamM('iam_apikeyExpired'))
    return core.ok(applyApiKeyScopes({ ...session, apiKeyScopes: key.scopes }, key.scopes))
  }

  async function getSession(accessToken: string, includeAuthorization = false): Promise<HaiResult<Session | null>> {
    const sessionResult = await repo.getByAccessToken(accessToken)
    if (!sessionResult.success) {
      return sessionResult
    }

    const session = sessionResult.data
    if (!session) {
      return core.ok(null)
    }

    // access 到期后仍可能有有效的 refresh，读会话不撤销整条记录。
    if (session.expiresAt <= new Date())
      return core.ok(null)

    if (typeof session.credentialVersion !== 'string')
      return core.err(HaiIamError.SESSION_INVALID, iamM('iam_sessionExpired'))
    const bound = await credential(session.userId, session.credentialVersion)
    if (!bound.success)
      return bound
    const authorization = includeAuthorization ? bound.data.authorization : undefined
    if (includeAuthorization && !authorization)
      return core.err(HaiIamError.REPOSITORY_ERROR, iamM('iam_sessionExpired'))
    const validated = await validateApiKey({
      ...session,
      ...bound.data.profile,
      ...authorization,
    })
    if (!validated.success)
      return validated
    let output = validated.data

    if (sliding || (config.idleTimeout ?? 0) > 0) {
      const updateResult = await repo.touchByAccessToken(accessToken, session.version, new Date())
      if (!updateResult.success)
        return updateResult
      // 保留 API Key 已收敛的权限，只用共享记录中已提交的会话时间。
      output = { ...output, lastActiveAt: updateResult.data.lastActiveAt, expiresAt: updateResult.data.expiresAt }
    }

    return core.ok(output)
  }

  async function verifySession(accessToken: string, includeAuthorization = false): Promise<HaiResult<Session>> {
    const sessionResult = await getSession(accessToken, includeAuthorization)
    if (!sessionResult.success)
      return sessionResult

    if (!sessionResult.data) {
      return core.err(
        HaiIamError.SESSION_INVALID,
        iamM('iam_sessionExpired'),
      )
    }

    return core.ok(sessionResult.data)
  }

  return {
    async create(options: CreateSessionOptions): Promise<HaiResult<Session>> {
      try {
        const bound = await credential(options.userId, options.expectedCredentialVersion)
        if (!bound.success)
          return bound
        const built = candidate(options, bound.data.version)
        if (!built.success)
          return built
        const { session, tokens } = built.data
        const saveResult = await repo.save(session, tokens, singleDevice)
        if (!saveResult.success)
          return saveResult

        const current = await credential(options.userId, bound.data.version)
        if (!current.success) {
          const revoked = await repo.removeByAccessToken(session.accessToken)
          if (!revoked.success)
            logger.warn('Failed to remove session after credential recheck', { userId: options.userId, code: revoked.error.code })
          return current
        }

        logger.debug('Session created', { userId: options.userId })
        return core.ok({
          ...session,
          data: { ...session.data, _tokenPair: tokens },
        })
      }
      catch (error) {
        return core.err(
          HaiIamError.SESSION_CREATE_FAILED,
          iamM('iam_createSessionFailed'),
          error,
        )
      }
    },

    get: accessToken => getSession(accessToken),
    verifyToken: accessToken => verifySession(accessToken),
    verifyCurrentSession: accessToken => verifySession(accessToken, true),

    async update(accessToken: string, data: Partial<Session>, expectedVersion: string): Promise<HaiResult<void>> {
      return repo.updateByAccessToken(accessToken, data, expectedVersion)
    },

    async delete(accessToken: string): Promise<HaiResult<void>> {
      // 注意：不要记录原始 accessToken，token 属于敏感凭据
      logger.debug('Session delete requested')
      return repo.removeByAccessToken(accessToken)
    },

    async deleteByUserId(userId: string): Promise<HaiResult<number>> {
      const result = await repo.removeByUserId(userId)
      if (!result.success) {
        return result as HaiResult<number>
      }
      return core.ok(result.data)
    },

    revokeCredentialSessions: (userId, credentialVersion) => repo.removeByUserId(userId, credentialVersion),

    async refresh(refreshToken: string): Promise<HaiResult<TokenPair>> {
      try {
        // 根据 refreshToken 获取旧会话
        const oldSessionResult = await repo.getByRefreshToken(refreshToken)
        if (!oldSessionResult.success) {
          return oldSessionResult as HaiResult<TokenPair>
        }

        const oldSession = oldSessionResult.data
        if (!oldSession) {
          return core.err(
            HaiIamError.TOKEN_EXPIRED,
            iamM('iam_refreshTokenExpired'),
          )
        }

        if (typeof oldSession.credentialVersion !== 'string')
          return core.err(HaiIamError.SESSION_INVALID, iamM('iam_sessionExpired'))
        const bound = await credential(oldSession.userId, oldSession.credentialVersion)
        if (!bound.success)
          return bound
        const validated = await validateApiKey(oldSession)
        if (!validated.success)
          return validated
        const effectiveSession = validated.data

        // 只构建候选会话；消费旧 refresh 与发布新会话在同一用户分区 CAS 中完成。
        const next = candidate({
          userId: oldSession.userId,
          username: oldSession.username,
          displayName: oldSession.displayName,
          avatarUrl: oldSession.avatarUrl,
          roles: effectiveSession.roles,
          permissions: effectiveSession.permissions,
          apiKeyId: effectiveSession.apiKeyId,
          apiKeyScopes: effectiveSession.apiKeyScopes,
          source: oldSession.source,
          terminalType: oldSession.terminalType,
          maxAge: oldSession.maxAge,
          data: oldSession.data,
        }, oldSession.credentialVersion)

        if (!next.success)
          return next
        const rotated = await repo.rotate(oldSession, refreshToken, next.data.session, next.data.tokens)
        if (!rotated.success)
          return rotated

        // 改密可能发生在最后一次读取与cache CAS之间；绝不把旧refresh升级到新凭据代。
        const current = await credential(oldSession.userId, oldSession.credentialVersion)
        if (!current.success)
          return current
        logger.debug('Token refreshed', { userId: oldSession.userId })
        return core.ok(next.data.tokens)
      }
      catch (error) {
        return core.err(
          HaiIamError.TOKEN_REFRESH_FAILED,
          iamM('iam_refreshTokenFailed'),
          error,
        )
      }
    },

    async revokeRefresh(refreshToken: string): Promise<HaiResult<void>> {
      return repo.removeRefreshToken(refreshToken)
    },

    async patchUserSessions(userId, updates): Promise<HaiResult<void>> {
      return repo.patchUserSessions(userId, { ...updates })
    },
  }
}
