/**
 * =============================================================================
 * @h-ai/deploy - Neon PostgreSQL Provisioner
 * =============================================================================
 *
 * 通过 Neon REST API 自动创建 PostgreSQL 数据库。
 *
 * API 端点：
 * - GET  /projects          — 列出项目（验证 Token）
 * - POST /projects          — 创建项目
 *
 * 输出环境变量：
 * - HAI_DB_URL — 数据库连接字符串
 *
 * @module deploy-provisioner-neon
 * =============================================================================
 */

import type { Result } from '@h-ai/core'
import type { DeployError, ProvisionResult, ServiceProvisioner } from '../deploy-types.js'
import { core, err, ok } from '@h-ai/core'
import { DeployErrorCode } from '../deploy-config.js'
import { deployM } from '../deploy-i18n.js'

const logger = core.logger.child({ module: 'deploy', scope: 'provisioner-neon' })

/** Neon API 基址 */
const NEON_API = 'https://console.neon.tech/api/v2'

/**
 * 创建 Neon PostgreSQL Provisioner
 *
 * @returns ServiceProvisioner 实例
 *
 * @example
 * ```ts
 * const neon = createNeonProvisioner()
 * await neon.authenticate('neon_xxx')
 * const result = await neon.provision('my-app')
 * ```
 */
export function createNeonProvisioner(): ServiceProvisioner {
  let token: string | null = null

  return {
    name: 'neon',
    serviceType: 'db',

    async authenticate(credentials: Record<string, string>): Promise<Result<string, DeployError>> {
      logger.debug('Authenticating with Neon')
      try {
        const apiToken = credentials.token ?? credentials.api_key ?? ''
        if (!apiToken) {
          throw new Error('Missing "token" in credentials')
        }

        const res = await fetch(`${NEON_API}/projects`, {
          headers: { Authorization: `Bearer ${apiToken}` },
        })
        if (!res.ok) {
          throw new Error(`Neon API ${res.status}: ${await res.text()}`)
        }
        token = apiToken
        logger.info('Neon authenticated')
        return ok('neon-user')
      }
      catch (error) {
        logger.error('Neon authentication failed', { error })
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
      if (!token) {
        return err({
          code: DeployErrorCode.AUTH_REQUIRED,
          message: deployM('deploy_authRequired'),
        })
      }

      logger.debug('Provisioning Neon database', { appName })
      try {
        const res = await fetch(`${NEON_API}/projects`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            project: {
              name: `${appName}-db`,
              pg_version: 16,
            },
          }),
        })

        if (!res.ok) {
          throw new Error(`Neon API ${res.status}: ${await res.text()}`)
        }

        const data = await res.json() as {
          connection_uris: Array<{ connection_uri: string }>
          project: { id: string }
        }

        const connectionUri = data.connection_uris?.[0]?.connection_uri
        if (!connectionUri) {
          throw new Error('No connection URI returned from Neon')
        }

        logger.info('Neon database provisioned', { projectId: data.project.id })

        return ok({
          serviceType: 'db',
          provisionerName: 'neon',
          envVars: {
            HAI_DB_URL: connectionUri,
          },
          resourceInfo: `neon-project:${data.project.id}`,
        })
      }
      catch (error) {
        logger.error('Neon provisioning failed', { appName, error })
        return err({
          code: DeployErrorCode.PROVISION_FAILED,
          message: deployM('deploy_provisionFailed', {
            params: {
              service: 'neon',
              error: error instanceof Error ? error.message : String(error),
            },
          }),
          cause: error,
        })
      }
    },
  }
}
