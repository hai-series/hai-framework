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
import { core, err, ok } from '@h-ai/core'
import { createDbApiKeyRepository } from '../authn/apikey/iam-authn-apikey-repository.js'
import { applyApiKeyScopes } from '../authn/apikey/iam-authn-apikey-scope.js'
import { SessionConfigSchema } from '../iam-config.js'
import { iamM } from '../iam-i18n.js'
import { HaiIamError } from '../iam-types.js'
import { createCacheSessionRepository } from './iam-session-repository-cache.js'
import { buildSession, generateSessionToken } from './iam-session-utils.js'

/**
 * 移除 session 中仅供内部使用的敏感保留字段（如 _tokenPair 中的 refreshToken）。
 *
 * 内部路径（如 authn.buildAuthResult、session.refresh）仍可从 create/repo 原始返回
 * 值读取 _tokenPair；此函数仅作用于对外暴露的 get / verifyToken 出口。
 */
function stripInternalSessionFields(session: Session): Session {
  if (!session.data || !('_tokenPair' in session.data))
    return session
  const { _tokenPair, ...rest } = session.data as { _tokenPair?: unknown, [key: string]: unknown }
  void _tokenPair
  const hasExtraKeys = Object.keys(rest).length > 0
  return { ...session, data: hasExtraKeys ? rest : undefined }
}

const logger = core.logger.child({ module: 'iam', scope: 'session' })

// ─── 子功能依赖 ───

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
  /** 可信持久用户读取口；生产绑定RelDB，缺失/禁用/读失败均拒绝签发和认证。 */
  readCredential: (userId: string) => Promise<HaiResult<{ version: string, enabled: boolean } | null>>
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
export async function createSessionOperations(deps: SessionOperationsDeps): Promise<HaiResult<SessionOperations>> {
  try {
    const { config } = deps
    const sessionConfig = SessionConfigSchema.parse(config.session ?? {})
    const sessionRepository = createCacheSessionRepository(
      sessionConfig.refreshTokenMaxAge ?? 604800,
    )

    const functions = buildSessionFunctions({
      readCredential: deps.readCredential,
      maxAge: sessionConfig.maxAge,
      sliding: sessionConfig.sliding,
      singleDevice: sessionConfig.singleDevice,
      sessionRepository,
      apiKeyRepository: config.login.apikey ? await createDbApiKeyRepository() : undefined,
    })

    logger.info('Session sub-feature initialized')
    return ok(functions)
  }
  catch (error) {
    logger.error('Session sub-feature initialization failed', { error })
    return err(
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
  /** 会话存储 */
  sessionRepository: SessionRepository
}

/**
 * 组装会话操作
 */
function buildSessionFunctions(config: SessionBuilderConfig): SessionOperations {
  const maxAge = config.maxAge ?? 86400
  const sliding = config.sliding ?? true
  const singleDevice = config.singleDevice ?? false
  const repo = config.sessionRepository

  /** 只构造候选值；旧凭据撤销与新凭据发布必须由仓库一次原子提交。 */
  function candidate(options: CreateSessionOptions, credentialVersion: string): HaiResult<{ session: Session, tokens: TokenPair }> {
    const now = new Date()
    const ttl = options.maxAge ?? maxAge
    if (!Number.isSafeInteger(ttl) || ttl <= 0 || !Number.isFinite(new Date(now.getTime() + ttl * 1000).getTime()))
      return err(HaiIamError.INVALID_ARGUMENT, iamM('iam_sessionMaxAgeInvalid'))
    const accessToken = generateSessionToken(options.userId)
    const tokens: TokenPair = { accessToken, refreshToken: generateSessionToken(options.userId), expiresIn: ttl, tokenType: 'Bearer' }
    const session = buildSession(options, now, ttl, accessToken, credentialVersion)
    session.data = { ...session.data, _tokenPair: tokens }
    return ok({ session, tokens })
  }

  /**
   * 凭据代只能来自可信数据库；读取和签发跨库不能同事务，因此会话始终保留旧代，后续认证再次核对。
   * @example await credential('user-1', authenticated.credentialVersion)
   */
  async function credential(userId: string, expected?: string): Promise<HaiResult<string>> {
    try {
      const current = await config.readCredential(userId)
      if (!current.success)
        return current
      if (!current.data || current.data.enabled !== true)
        return err(HaiIamError.USER_DISABLED, iamM('iam_accountDisabled'))
      if (typeof current.data.version !== 'string' || (expected !== undefined && current.data.version !== expected))
        return err(HaiIamError.SESSION_INVALID, iamM('iam_sessionExpired'))
      return ok(current.data.version)
    }
    catch {
      return err(HaiIamError.REPOSITORY_ERROR, iamM('iam_sessionExpired'))
    }
  }

  /** 持久化 key 是派生会话的授权上限；撤销、禁用、到期与读取失败均拒绝访问。 */
  async function validateApiKey(session: Session): Promise<HaiResult<Session>> {
    if (!session.apiKeyId)
      return ok(session)
    if (!config.apiKeyRepository)
      return err(HaiIamError.APIKEY_INVALID, iamM('iam_apikeyInvalid'))
    const found = await config.apiKeyRepository.findOneById(session.apiKeyId)
    if (!found.success)
      return found
    const key = found.data
    if (!key || key.userId !== session.userId)
      return err(HaiIamError.APIKEY_INVALID, iamM('iam_apikeyInvalid'))
    if (!key.enabled)
      return err(HaiIamError.APIKEY_DISABLED, iamM('iam_apikeyDisabled'))
    if (key.expiresAt && new Date() >= key.expiresAt)
      return err(HaiIamError.APIKEY_EXPIRED, iamM('iam_apikeyExpired'))
    return ok(applyApiKeyScopes({ ...session, apiKeyScopes: key.scopes }, key.scopes))
  }

  return {
    async create(options: CreateSessionOptions): Promise<HaiResult<Session>> {
      try {
        const bound = await credential(options.userId, options.expectedCredentialVersion)
        if (!bound.success)
          return bound
        const built = candidate(options, bound.data)
        if (!built.success)
          return built
        const { session, tokens } = built.data
        const saveResult = await repo.save(session, tokens, singleDevice)
        if (!saveResult.success) {
          return saveResult as HaiResult<Session>
        }

        logger.debug('Session created', { userId: options.userId })
        return ok(session)
      }
      catch (error) {
        return err(
          HaiIamError.SESSION_CREATE_FAILED,
          iamM('iam_createSessionFailed'),
          error,
        )
      }
    },

    async get(accessToken: string): Promise<HaiResult<Session | null>> {
      const sessionResult = await repo.getByAccessToken(accessToken)
      if (!sessionResult.success) {
        return sessionResult
      }

      const session = sessionResult.data
      if (!session) {
        return ok(null)
      }

      if (new Date() > session.expiresAt) {
        const removeResult = await repo.removeByAccessToken(accessToken)
        if (!removeResult.success) {
          return removeResult as HaiResult<Session | null>
        }
        return ok(null)
      }

      if (typeof session.credentialVersion !== 'string')
        return err(HaiIamError.SESSION_INVALID, iamM('iam_sessionExpired'))
      const bound = await credential(session.userId, session.credentialVersion)
      if (!bound.success)
        return bound
      const validated = await validateApiKey(session)
      if (!validated.success)
        return validated
      let output = validated.data

      if (sliding) {
        const updateResult = await repo.touchByAccessToken(accessToken, session.version, new Date())
        if (!updateResult.success) {
          return updateResult as HaiResult<Session | null>
        }
        // 保留 API Key 已收敛的权限，只使用成功提交后的时间字段。
        output = { ...output, lastActiveAt: updateResult.data.lastActiveAt, expiresAt: updateResult.data.expiresAt }
      }

      // 对外不暴露内部保留的 _tokenPair（含 refreshToken），
      // 防止调用方（包括 event.locals.session 等上下文）意外泄漏刷新令牌。
      return ok(stripInternalSessionFields(output))
    },

    async verifyToken(accessToken: string): Promise<HaiResult<Session>> {
      const sessionResult = await this.get(accessToken)
      if (!sessionResult.success) {
        return sessionResult as HaiResult<Session>
      }

      if (!sessionResult.data) {
        return err(
          HaiIamError.SESSION_INVALID,
          iamM('iam_sessionExpired'),
        )
      }

      return ok(sessionResult.data)
    },

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
      return ok(result.data)
    },

    async refresh(refreshToken: string): Promise<HaiResult<TokenPair>> {
      try {
        // 根据 refreshToken 获取旧会话
        const oldSessionResult = await repo.getByRefreshToken(refreshToken)
        if (!oldSessionResult.success) {
          return oldSessionResult as HaiResult<TokenPair>
        }

        const oldSession = oldSessionResult.data
        if (!oldSession) {
          return err(
            HaiIamError.TOKEN_EXPIRED,
            iamM('iam_refreshTokenExpired'),
          )
        }

        if (typeof oldSession.credentialVersion !== 'string')
          return err(HaiIamError.SESSION_INVALID, iamM('iam_sessionExpired'))
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
          maxAge: oldSession.maxAge,
          data: oldSession.data ? { ...oldSession.data, _tokenPair: undefined } : undefined,
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
        return ok(next.data.tokens)
      }
      catch (error) {
        return err(
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
