/**
 * @h-ai/deploy — Neon PostgreSQL Provisioner
 *
 * 通过 Neon REST API 自动创建 PostgreSQL 数据库。
 * @module deploy-provisioner-neon
 */

import type { HaiResult } from '@h-ai/core'
import type { ProvisionResult, ServiceProvisioner } from '../deploy-types.js'
import { core, err, ok } from '@h-ai/core'
import { deployM } from '../deploy-i18n.js'
import { HaiDeployError } from '../deploy-types.js'

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

    async authenticate(credentials: Record<string, string>): Promise<HaiResult<string>> {
      logger.debug('Authenticating with Neon')
      try {
        const apiToken = credentials.apiKey ?? credentials.token ?? credentials.api_key ?? ''
        if (!apiToken) {
          throw new Error(deployM('deploy_credentialMissing', { params: { fields: 'token' } }))
        }

        const res = await fetch(`${NEON_API}/projects`, {
          headers: { Authorization: `Bearer ${apiToken}` },
        })
        if (!res.ok) {
          throw new Error(deployM('deploy_apiError', { params: { service: 'Neon', status: String(res.status), body: await res.text() } }))
        }
        token = apiToken
        logger.info('Neon authenticated')
        return ok('neon-user')
      }
      catch (error) {
        logger.error('Neon authentication failed', { error })
        return err(
          HaiDeployError.AUTH_FAILED,
          deployM('deploy_authFailed', {
            params: { error: error instanceof Error ? error.message : String(error) },
          }),
          error,
        )
      }
    },

    async provision(appName: string): Promise<HaiResult<ProvisionResult>> {
      if (!token) {
        return err(
          HaiDeployError.AUTH_REQUIRED,
          deployM('deploy_authRequired'),
        )
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
          throw new Error(deployM('deploy_apiError', { params: { service: 'Neon', status: String(res.status), body: await res.text() } }))
        }

        const data = await res.json() as {
          connection_uris: Array<{ connection_uri: string }>
          project: { id: string }
        }

        const connectionUri = data.connection_uris?.[0]?.connection_uri
        if (!connectionUri) {
          throw new Error(deployM('deploy_provisionNoResult', { params: { service: 'Neon' } }))
        }

        logger.info('Neon database provisioned', { projectId: data.project.id })

        return ok({
          serviceType: 'db',
          provisionerName: 'neon',
          envVars: {
            HAI_RELDB_URL: connectionUri,
          },
          resourceInfo: `neon-project:${data.project.id}`,
        })
      }
      catch (error) {
        logger.error('Neon provisioning failed', { appName, error })
        return err(
          HaiDeployError.PROVISION_FAILED,
          deployM('deploy_provisionFailed', {
            params: {
              service: 'neon',
              error: error instanceof Error ? error.message : String(error),
            },
          }),
          error,
        )
      }
    },
  }
}
