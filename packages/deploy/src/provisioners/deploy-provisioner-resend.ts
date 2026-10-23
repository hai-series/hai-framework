/**
 * @h-ai/deploy — Resend Email Provisioner
 *
 * 通过 Resend REST API 验证 API Key 并获取域信息。 Resend 不支持通过 API 创建账户，此 Provisioner 仅验证已有凭证。
 * @module deploy-provisioner-resend
 */

import type { HaiResult } from '@h-ai/core'
import type { ServiceProvisioner } from '../deploy-internal-types.js'
import type { ProvisionResult } from '../deploy-types.js'
import { core, err, ok } from '@h-ai/core'

import { deployM } from '../deploy-i18n.js'
import { HaiDeployError } from '../deploy-types.js'

const logger = core.logger.child({ module: 'deploy', scope: 'provisioner-resend' })

/** Resend API 基址 */
const RESEND_API = 'https://api.resend.com'

/**
 * 创建 Resend Email Provisioner
 * 工厂返回内部接口；认证与开通调用必须逐次检查 HaiResult，返回的连接凭据不能直接记录。
 * @returns ServiceProvisioner 实例
 * @example 模块内部上下文
 * ```ts
 * const apiKey = process.env.HAI_DEPLOY_SERVICES_EMAIL_APIKEY
 * if (!apiKey) throw new Error('Provide HAI_DEPLOY_SERVICES_EMAIL_APIKEY privately')
 * const from = process.env.HAI_DEPLOY_SERVICES_EMAIL_FROM
 * if (!from) throw new Error('Provide HAI_DEPLOY_SERVICES_EMAIL_FROM privately')
 * const provisioner = createResendProvisioner()
 * const authenticated = await provisioner.authenticate({ apiKey, from })
 * if (!authenticated.success) throw new Error(authenticated.error.message)
 * const result = await provisioner.provision('shop')
 * if (!result.success) throw new Error(result.error.message)
 * const status = result.data.resourceStatus
 * ```
 */
export function createResendProvisioner(): ServiceProvisioner {
  let token: string | null = null
  let from = ''

  return {
    name: 'resend',
    serviceType: 'email',

    async authenticate(credentials: Record<string, string>): Promise<HaiResult<string>> {
      logger.debug('Authenticating with Resend')
      try {
        const apiToken = credentials.apiKey ?? credentials.api_key ?? credentials.token ?? ''
        if (!apiToken || !credentials.from) {
          throw new Error(deployM('deploy_credentialMissing', { params: { fields: 'apiKey, from' } }))
        }

        const res = await fetch(`${RESEND_API}/domains`, {
          headers: { Authorization: `Bearer ${apiToken}` },
        })
        if (!res.ok) {
          throw new Error(deployM('deploy_apiError', { params: { service: 'Resend', status: String(res.status) } }))
        }
        token = apiToken
        from = credentials.from
        logger.info('Resend authenticated')
        return ok('resend-user')
      }
      catch (error) {
        logger.error('Resend authentication failed', { error })
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
      if (!token) {
        return err(
          HaiDeployError.AUTH_REQUIRED,
          deployM('deploy_authRequired'),
        )
      }

      logger.debug('Provisioning Resend email service')

      // Resend 不支持 API 创建资源，仅返回凭证作为环境变量
      return ok({
        serviceType: 'email',
        provisionerName: 'resend',
        resourceStatus: 'reused',
        envVars: {
          HAI_REACH_PROVIDERS: JSON.stringify([{ name: 'email', type: 'smtp', host: 'smtp.resend.com', port: 465, secure: true, user: 'resend', pass: token, from }]),
        },
        resourceInfo: 'resend:verify-only',
      })
    },
  }
}
