/**
 * @h-ai/deploy — Cloudflare R2 Provisioner
 *
 * 通过 Cloudflare API 自动创建 R2 存储桶。
 * @module deploy-provisioner-r2
 */

import type { HaiResult } from '@h-ai/core'
import type { ServiceProvisioner } from '../deploy-internal-types.js'
import type { ProvisionResult } from '../deploy-types.js'
import { core, err, ok } from '@h-ai/core'
import { deployM } from '../deploy-i18n.js'
import { HaiDeployError } from '../deploy-types.js'

const logger = core.logger.child({ module: 'deploy', scope: 'provisioner-r2' })

/** Cloudflare API 基址 */
const CF_API = 'https://api.cloudflare.com/client/v4'

/**
 * 创建 Cloudflare R2 Provisioner
 * 工厂返回内部接口；认证与开通调用必须逐次检查 HaiResult，返回的连接凭据不能直接记录。
 * @returns ServiceProvisioner 实例
 * @example 模块内部上下文
 * ```ts
 * const accountId = process.env.HAI_DEPLOY_SERVICES_STORAGE_ACCOUNTID
 * if (!accountId) throw new Error('Provide HAI_DEPLOY_SERVICES_STORAGE_ACCOUNTID privately')
 * const apiToken = process.env.HAI_DEPLOY_SERVICES_STORAGE_APITOKEN
 * if (!apiToken) throw new Error('Provide HAI_DEPLOY_SERVICES_STORAGE_APITOKEN privately')
 * const accessKeyId = process.env.HAI_DEPLOY_SERVICES_STORAGE_ACCESSKEYID
 * if (!accessKeyId) throw new Error('Provide HAI_DEPLOY_SERVICES_STORAGE_ACCESSKEYID privately')
 * const secretAccessKey = process.env.HAI_DEPLOY_SERVICES_STORAGE_SECRETACCESSKEY
 * if (!secretAccessKey) throw new Error('Provide HAI_DEPLOY_SERVICES_STORAGE_SECRETACCESSKEY privately')
 * const provisioner = createR2Provisioner()
 * const authenticated = await provisioner.authenticate({ accountId, apiToken, accessKeyId, secretAccessKey })
 * if (!authenticated.success) throw new Error(authenticated.error.message)
 * const result = await provisioner.provision('shop')
 * if (!result.success) throw new Error(result.error.message)
 * const status = result.data.resourceStatus
 * ```
 */
export function createR2Provisioner(): ServiceProvisioner {
  let token: string | null = null
  let accountId: string | null = null
  let accessKey = ''
  let secretKey = ''

  return {
    name: 'r2',
    serviceType: 'storage',

    async authenticate(credentials: Record<string, string>): Promise<HaiResult<string>> {
      logger.debug('Authenticating with Cloudflare')
      try {
        const acctId = credentials.accountId ?? credentials.account_id ?? ''
        const apiTok = credentials.apiToken ?? credentials.api_token ?? credentials.token ?? ''
        if (!acctId || !apiTok || !credentials.accessKeyId || !credentials.secretAccessKey) {
          throw new Error(deployM('deploy_credentialMissing', { params: { fields: 'accountId, apiToken, accessKeyId, secretAccessKey' } }))
        }

        const res = await fetch(`${CF_API}/accounts/${acctId}/r2/buckets`, {
          headers: { Authorization: `Bearer ${apiTok}` },
        })
        if (!res.ok) {
          throw new Error(deployM('deploy_apiError', { params: { service: 'Cloudflare', status: String(res.status) } }))
        }

        accountId = acctId
        token = apiTok
        accessKey = credentials.accessKeyId
        secretKey = credentials.secretAccessKey
        logger.info('Cloudflare R2 authenticated', { accountId: acctId })
        return ok(acctId)
      }
      catch (error) {
        logger.error('Cloudflare R2 authentication failed', { error })
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
      if (!token || !accountId) {
        return err(
          HaiDeployError.AUTH_REQUIRED,
          deployM('deploy_authRequired'),
        )
      }

      const bucketName = `${appName}-storage`.toLowerCase().replace(/[^a-z0-9-]/g, '-')

      logger.debug('Provisioning R2 bucket', { appName, bucketName })
      try {
        // 创建桶
        const createRes = await fetch(
          `${CF_API}/accounts/${accountId}/r2/buckets`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name: bucketName }),
          },
        )

        // 409 表示桶已存在，可继续
        if (!createRes.ok && createRes.status !== 409) {
          throw new Error(deployM('deploy_apiError', { params: { service: 'Cloudflare', status: String(createRes.status) } }))
        }

        logger.info('R2 bucket provisioned', { bucketName })

        return ok({
          serviceType: 'storage',
          provisionerName: 'r2',
          resourceStatus: createRes.status === 409 ? 'reused' : 'created',
          envVars: {
            HAI_STORAGE: JSON.stringify({
              type: 's3',
              endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
              bucket: bucketName,
              region: 'auto',
              accessKeyId: accessKey,
              secretAccessKey: secretKey,
            }),
          },
          resourceInfo: `r2-bucket:${bucketName}`,
        })
      }
      catch (error) {
        logger.error('R2 provisioning failed', { appName, error })
        return err(
          HaiDeployError.PROVISION_FAILED,
          deployM('deploy_provisionFailed', {
            params: {
              service: 'r2',
              error: error instanceof Error ? error.message : String(error),
            },
          }),
          error,
        )
      }
    },
  }
}
