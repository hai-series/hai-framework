/**
 * @h-ai/deploy — Resend Email Provisioner
 *
 * 通过 Resend REST API 验证 API Key 并获取域信息。 Resend 不支持通过 API 创建账户，此 Provisioner 仅验证已有凭证。
 * @module deploy-provisioner-resend
 */

import type { HaiResult } from '@h-ai/core'
import type { ProvisionResult, ServiceProvisioner } from '../deploy-types.js'
import { core, err, ok } from '@h-ai/core'

import { deployM } from '../deploy-i18n.js'
import { HaiDeployError } from '../deploy-types.js'

const logger = core.logger.child({ module: 'deploy', scope: 'provisioner-resend' })

/** Resend API 基址 */
const RESEND_API = 'https://api.resend.com'

/**
 * 创建 Resend Email Provisioner
 *
 * @returns ServiceProvisioner 实例
 */
export function createResendProvisioner(): ServiceProvisioner {
  let token: string | null = null

  return {
    name: 'resend',
    serviceType: 'email',

    async authenticate(credentials: Record<string, string>): Promise<HaiResult<string>> {
      logger.debug('Authenticating with Resend')
      try {
        const apiToken = credentials.apiKey ?? credentials.api_key ?? credentials.token ?? ''
        if (!apiToken) {
          throw new Error('Missing "api_key" in credentials')
        }

        const res = await fetch(`${RESEND_API}/domains`, {
          headers: { Authorization: `Bearer ${apiToken}` },
        })
        if (!res.ok) {
          throw new Error(`Resend API ${res.status}: ${await res.text()}`)
        }
        token = apiToken
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
        envVars: {
          HAI_REACH_RESEND_KEY: token,
        },
        resourceInfo: 'resend:verify-only',
      })
    },
  }
}
