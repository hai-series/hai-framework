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
 */
export interface SessionOperationsDeps {
  config: IamConfig
}

/**
 * 创建会话子功能
 *
 * 内部创建缓存会话存储，返回会话管理接口。
 */
export async function createSessionOperations(deps: SessionOperationsDeps): Promise<HaiResult<SessionOperations>> {
  try {
    const { config } = deps
    const sessionConfig = SessionConfigSchema.parse(config.session ?? {})
    const sessionRepository = createCacheSessionRepository(
      sessionConfig.refreshTokenMaxAge ?? 604800,
    )

    const functions = buildSessionFunctions({
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
 */
interface SessionBuilderConfig {
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
  function candidate(options: CreateSessionOptions): { session: Session, tokens: TokenPair } {
    const accessToken = generateSessionToken(options.userId)
    const tokens: TokenPair = { accessToken, refreshToken: generateSessionToken(options.userId), expiresIn: maxAge, tokenType: 'Bearer' }
    const session = buildSession(options, new Date(), options.maxAge ?? maxAge, accessToken)
    session.data = { ...session.data, _tokenPair: tokens }
    return { session, tokens }
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
    if (key.expiresAt && new Date() > key.expiresAt)
      return err(HaiIamError.APIKEY_EXPIRED, iamM('iam_apikeyExpired'))
    return ok(applyApiKeyScopes({ ...session, apiKeyScopes: key.scopes }, key.scopes))
  }

  return {
    async create(options: CreateSessionOptions): Promise<HaiResult<Session>> {
      try {
        const { session, tokens } = candidate(options)
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

      const validated = await validateApiKey(session)
      if (!validated.success)
        return validated

      if (sliding) {
        const now = new Date()
        const updateResult = await repo.updateByAccessToken(accessToken, {
          lastActiveAt: now,
          expiresAt: new Date(now.getTime() + maxAge * 1000),
        }, session.version)
        if (!updateResult.success) {
          return updateResult as HaiResult<Session | null>
        }
      }

      // 对外不暴露内部保留的 _tokenPair（含 refreshToken），
      // 防止调用方（包括 event.locals.session 等上下文）意外泄漏刷新令牌。
      return ok(stripInternalSessionFields(validated.data))
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
          data: oldSession.data ? { ...oldSession.data, _tokenPair: undefined } : undefined,
        })

        const rotated = await repo.rotate(oldSession, refreshToken, next.session, next.tokens)
        if (!rotated.success)
          return rotated

        logger.debug('Token refreshed', { userId: oldSession.userId })
        return ok(next.tokens)
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
