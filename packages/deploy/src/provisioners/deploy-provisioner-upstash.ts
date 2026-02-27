/**
 * =============================================================================
 * @h-ai/deploy - Upstash Redis Provisioner
 * =============================================================================
 *
 * 通过 Upstash REST API 自动创建 Redis 数据库。
 *
 * API 端点：
 * - GET  /v2/redis/databases       — 列出数据库（验证 Token）
 * - POST /v2/redis/database         — 创建数据库
 *
 * 输出环境变量：
 * - HAI_CACHE_UPSTASH_URL   — Upstash Redis REST URL
 * - HAI_CACHE_UPSTASH_TOKEN — Upstash Redis REST Token
 *
 * @module deploy-provisioner-upstash
 * =============================================================================
 */

import type { Result } from '@h-ai/core'
import type { DeployError, ProvisionResult, ServiceProvisioner } from '../deploy-types.js'
import { core, err, ok } from '@h-ai/core'
import { DeployErrorCode } from '../deploy-config.js'
import { deployM } from '../deploy-i18n.js'

const logger = core.logger.child({ module: 'deploy', scope: 'provisioner-upstash' })

/** Upstash API 基址 */
const UPSTASH_API = 'https://api.upstash.com'

/**
 * 创建 Upstash Redis Provisioner
 *
 * @returns ServiceProvisioner 实例
 */
export function createUpstashProvisioner(): ServiceProvisioner {
  let apiKey: string | null = null
  let email: string | null = null

  return {
    name: 'upstash',
    serviceType: 'cache',

    async authenticate(credentials: Record<string, string>): Promise<Result<string, DeployError>> {
      logger.debug('Authenticating with Upstash')
      try {
        const userEmail = credentials.email ?? ''
        const userKey = credentials.api_key ?? credentials.token ?? ''
        if (!userEmail || !userKey) {
          throw new Error('Missing "email" and "api_key" in credentials')
        }

        const res = await fetch(`${UPSTASH_API}/v2/redis/databases`, {
          headers: {
            Authorization: `Basic ${btoa(`${userEmail}:${userKey}`)}`,
          },
        })
        if (!res.ok) {
          throw new Error(`Upstash API ${res.status}: ${await res.text()}`)
        }

        email = userEmail
        apiKey = userKey
        logger.info('Upstash authenticated', { email: userEmail })
        return ok(userEmail)
      }
      catch (error) {
        logger.error('Upstash authentication failed', { error })
        return err({
          code: DeployErrorCode.AUTH_FAILED,
          message: deployM('deploy_authFailed', {
            params: { error: error instanceof Error ? error.message : String(error) },
          }),
          cause: error,
        })
      }
    },

    async provision(appName: string): Promise<Result<ProvisionResult, DeployError>> {
      if (!apiKey || !email) {
        return err({
          code: DeployErrorCode.AUTH_REQUIRED,
          message: deployM('deploy_authRequired'),
        })
      }

      logger.debug('Provisioning Upstash Redis', { appName })
      try {
        const res = await fetch(`${UPSTASH_API}/v2/redis/database`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${btoa(`${email}:${apiKey}`)}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: `${appName}-cache`,
            region: 'global',
            tls: true,
          }),
        })

        if (!res.ok) {
          throw new Error(`Upstash API ${res.status}: ${await res.text()}`)
        }

        const data = await res.json() as {
          database_id: string
          rest_url: string
          rest_token: string
        }

        logger.info('Upstash Redis provisioned', { databaseId: data.database_id })

        return ok({
          serviceType: 'cache',
          provisionerName: 'upstash',
          envVars: {
            HAI_CACHE_UPSTASH_URL: data.rest_url,
            HAI_CACHE_UPSTASH_TOKEN: data.rest_token,
          },
          resourceInfo: `upstash-db:${data.database_id}`,
        })
      }
      catch (error) {
        logger.error('Upstash provisioning failed', { appName, error })
        return err({
          code: DeployErrorCode.PROVISION_FAILED,
          message: deployM('deploy_provisionFailed', {
            params: {
              service: 'upstash',
              error: error instanceof Error ? error.message : String(error),
            },
          }),
          cause: error,
        })
      }
    },
  }
}
