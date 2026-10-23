/**
 * @h-ai/deploy — Aliyun SMS Provisioner
 *
 * 验证阿里云 API 凭证用于短信服务。 阿里云短信资源（签名/模板）通常在控制台预配置，此 Provisioner 仅验证凭证。
 * @module deploy-provisioner-aliyun
 */

import type { HaiResult } from '@h-ai/core'
import type { ServiceProvisioner } from '../deploy-internal-types.js'
import type { ProvisionResult } from '../deploy-types.js'
import { core, err, ok } from '@h-ai/core'
import { deployM } from '../deploy-i18n.js'
import { HaiDeployError } from '../deploy-types.js'

const logger = core.logger.child({ module: 'deploy', scope: 'provisioner-aliyun' })

/**
 * 创建 Aliyun SMS Provisioner
 * 工厂返回内部接口；认证与开通调用必须逐次检查 HaiResult，返回的连接凭据不能直接记录。
 * @returns ServiceProvisioner 实例
 * @example 模块内部上下文
 * ```ts
 * const accessKeyId = process.env.HAI_DEPLOY_SERVICES_SMS_ACCESSKEYID
 * if (!accessKeyId) throw new Error('Provide HAI_DEPLOY_SERVICES_SMS_ACCESSKEYID privately')
 * const accessKeySecret = process.env.HAI_DEPLOY_SERVICES_SMS_ACCESSKEYSECRET
 * if (!accessKeySecret) throw new Error('Provide HAI_DEPLOY_SERVICES_SMS_ACCESSKEYSECRET privately')
 * const signName = process.env.HAI_DEPLOY_SERVICES_SMS_SIGNNAME
 * if (!signName) throw new Error('Provide HAI_DEPLOY_SERVICES_SMS_SIGNNAME privately')
 * const provisioner = createAliyunProvisioner()
 * const authenticated = await provisioner.authenticate({ accessKeyId, accessKeySecret, signName })
 * if (!authenticated.success) throw new Error(authenticated.error.message)
 * const result = await provisioner.provision('shop')
 * if (!result.success) throw new Error(result.error.message)
 * const status = result.data.resourceStatus
 * ```
 */
export function createAliyunProvisioner(): ServiceProvisioner {
  let accessKey: string | null = null
  let secretKey: string | null = null
  let signName = ''

  return {
    name: 'aliyun',
    serviceType: 'sms',

    async authenticate(credentials: Record<string, string>): Promise<HaiResult<string>> {
      logger.debug('Authenticating with Aliyun')
      try {
        const akId = credentials.accessKeyId ?? credentials.access_key_id ?? credentials.access_key ?? ''
        const akSecret = credentials.accessKeySecret ?? credentials.access_key_secret ?? credentials.secret_key ?? ''

        if (!akId || !akSecret || !credentials.signName) {
          throw new Error(deployM('deploy_credentialMissing', { params: { fields: 'accessKeyId, accessKeySecret, signName' } }))
        }

        accessKey = akId
        secretKey = akSecret
        signName = credentials.signName
        logger.info('Aliyun authenticated', { accessKeyId: `${akId.slice(0, 6)}***` })
        return ok(akId)
      }
      catch (error) {
        logger.error('Aliyun authentication failed', { error })
        return err(
          HaiDeployError.AUTH_FAILED,
          deployM('deploy_authFailed', {
            params: { error: error instanceof Error ? error.message : String(error) },
          }),
          error,
        )
      }
    },

    async provision(_appName: string): Promise<HaiResult<ProvisionResult>> {
      if (!accessKey || !secretKey) {
        return err(
          HaiDeployError.AUTH_REQUIRED,
          deployM('deploy_authRequired'),
        )
      }

      logger.debug('Provisioning Aliyun SMS service')

      // 阿里云短信不支持 API 创建资源，仅返回凭证作为环境变量
      return ok({
        serviceType: 'sms',
        provisionerName: 'aliyun',
        resourceStatus: 'reused',
        envVars: {
          HAI_REACH_PROVIDERS: JSON.stringify([{ name: 'sms', type: 'aliyun-sms', accessKeyId: accessKey, accessKeySecret: secretKey, signName }]),
        },
        resourceInfo: 'aliyun:verify-only',
      })
    },
  }
}
