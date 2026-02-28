/**
 * =============================================================================
 * @h-ai/deploy - Cloudflare R2 Provisioner
 * =============================================================================
 *
 * 通过 Cloudflare API 自动创建 R2 存储桶。
 *
 * API 端点：
 * - GET  /accounts/{account_id}/r2/buckets          — 列出桶
 * - POST /accounts/{account_id}/r2/buckets           — 创建桶
 * - POST /accounts/{account_id}/r2/buckets/{name}/tokens — 创建桶 Token
 *
 * 输出环境变量：
 * - HAI_STORAGE_S3_ENDPOINT   — R2 S3 兼容端点
 * - HAI_STORAGE_S3_BUCKET     — 桶名称
 * - HAI_STORAGE_S3_ACCESS_KEY — 访问密钥
 * - HAI_STORAGE_S3_SECRET_KEY — 秘密密钥
 *
 * @module deploy-provisioner-r2
 * =============================================================================
 */

import type { Result } from '@h-ai/core'
import type { DeployError, ProvisionResult, ServiceProvisioner } from '../deploy-types.js'
import { core, err, ok } from '@h-ai/core'
import { DeployErrorCode } from '../deploy-config.js'
import { deployM } from '../deploy-i18n.js'

const logger = core.logger.child({ module: 'deploy', scope: 'provisioner-r2' })

/** Cloudflare API 基址 */
const CF_API = 'https://api.cloudflare.com/client/v4'

/**
 * 创建 Cloudflare R2 Provisioner
 *
 * @returns ServiceProvisioner 实例
 */
export function createR2Provisioner(): ServiceProvisioner {
  let token: string | null = null
  let accountId: string | null = null

  return {
    name: 'r2',
    serviceType: 'storage',

    async authenticate(credentials: Record<string, string>): Promise<Result<string, DeployError>> {
      logger.debug('Authenticating with Cloudflare')
      try {
        const acctId = credentials.accountId ?? credentials.account_id ?? ''
        const apiTok = credentials.apiToken ?? credentials.api_token ?? credentials.token ?? ''
        if (!acctId || !apiTok) {
          throw new Error('Missing "account_id" and "api_token" in credentials')
        }

        const res = await fetch(`${CF_API}/accounts/${acctId}/r2/buckets`, {
          headers: { Authorization: `Bearer ${apiTok}` },
        })
        if (!res.ok) {
          throw new Error(`Cloudflare API ${res.status}: ${await res.text()}`)
        }

        accountId = acctId
        token = apiTok
        logger.info('Cloudflare R2 authenticated', { accountId: acctId })
        return ok(acctId)
      }
      catch (error) {
        logger.error('Cloudflare R2 authentication failed', { error })
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
      if (!token || !accountId) {
        return err({
          code: DeployErrorCode.AUTH_REQUIRED,
          message: deployM('deploy_authRequired'),
        })
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
          throw new Error(`Cloudflare API ${createRes.status}: ${await createRes.text()}`)
        }

        // 创建 API Token（S3 兼容访问）
        const tokenRes = await fetch(
          `${CF_API}/user/tokens`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: `${appName}-r2-token`,
              policies: [{
                effect: 'allow',
                permission_groups: [{ id: 'r2-read-write' }],
                resources: { [`com.cloudflare.edge.r2.bucket.${accountId}_default_${bucketName}`]: '*' },
              }],
            }),
          },
        )

        let accessKey = ''
        let secretKey = ''

        if (tokenRes.ok) {
          const tokenData = await tokenRes.json() as {
            result: { id: string, value: string }
          }
          accessKey = tokenData.result.id
          secretKey = tokenData.result.value
        }

        logger.info('R2 bucket provisioned', { bucketName })

        return ok({
          serviceType: 'storage',
          provisionerName: 'r2',
          envVars: {
            HAI_STORAGE_S3_ENDPOINT: `https://${accountId}.r2.cloudflarestorage.com`,
            HAI_STORAGE_S3_BUCKET: bucketName,
            HAI_STORAGE_S3_ACCESS_KEY: accessKey,
            HAI_STORAGE_S3_SECRET_KEY: secretKey,
          },
          resourceInfo: `r2-bucket:${bucketName}`,
        })
      }
      catch (error) {
        logger.error('R2 provisioning failed', { appName, error })
        return err({
          code: DeployErrorCode.PROVISION_FAILED,
          message: deployM('deploy_provisionFailed', {
            params: {
              service: 'r2',
              error: error instanceof Error ? error.message : String(error),
            },
          }),
          cause: error,
        })
      }
    },
  }
}
