/**
 * @h-ai/deploy — Aliyun SMS Provisioner
 *
 * 验证阿里云 API 凭证用于短信服务。 阿里云短信资源（签名/模板）通常在控制台预配置，此 Provisioner 仅验证凭证。
 * @module deploy-provisioner-aliyun
 */

import type { Result } from '@h-ai/core'
import type { DeployError, ProvisionResult, ServiceProvisioner } from '../deploy-types.js'
import { core, err, ok } from '@h-ai/core'
import { DeployErrorCode } from '../deploy-config.js'
import { deployM } from '../deploy-i18n.js'

const logger = core.logger.child({ module: 'deploy', scope: 'provisioner-aliyun' })

/**
 * 创建 Aliyun SMS Provisioner
 *
 * @returns ServiceProvisioner 实例
 */
export function createAliyunProvisioner(): ServiceProvisioner {
  let accessKey: string | null = null
  let secretKey: string | null = null

  return {
    name: 'aliyun',
    serviceType: 'sms',

    async authenticate(credentials: Record<string, string>): Promise<Result<string, DeployError>> {
      logger.debug('Authenticating with Aliyun')
      try {
        const akId = credentials.accessKeyId ?? credentials.access_key_id ?? credentials.access_key ?? ''
        const akSecret = credentials.accessKeySecret ?? credentials.access_key_secret ?? credentials.secret_key ?? ''

        if (!akId || !akSecret) {
          throw new Error(deployM('deploy_credentialMissing', { params: { fields: 'access_key_id, access_key_secret' } }))
        }

        accessKey = akId
        secretKey = akSecret
        logger.info('Aliyun authenticated', { accessKeyId: `${akId.slice(0, 6)}***` })
        return ok(akId)
      }
      catch (error) {
        logger.error('Aliyun authentication failed', { error })
        return err({
          code: DeployErrorCode.AUTH_FAILED,
          message: deployM('deploy_authFailed', {
            params: { error: error instanceof Error ? error.message : String(error) },
          }),
          cause: error,
        })
      }
    },

    async provision(_appName: string): Promise<Result<ProvisionResult, DeployError>> {
      if (!accessKey || !secretKey) {
        return err({
          code: DeployErrorCode.AUTH_REQUIRED,
          message: deployM('deploy_authRequired'),
        })
      }

      logger.debug('Provisioning Aliyun SMS service')

      // 阿里云短信不支持 API 创建资源，仅返回凭证作为环境变量
      return ok({
        serviceType: 'sms',
        provisionerName: 'aliyun',
        envVars: {
          HAI_REACH_SMS_ACCESS_KEY: accessKey,
          HAI_REACH_SMS_SECRET_KEY: secretKey,
        },
        resourceInfo: 'aliyun:verify-only',
      })
    },
  }
}
