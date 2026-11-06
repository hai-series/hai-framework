/** 与标准 Kit 认证端点配套的表单动作；复用已有 CSRF/transport fetch。 */
import type { IamCreateCaptchaInputSchema, IamLoginInput, IamPublicConfig, IamRegisterInput } from '@h-ai/api-contract'
import type { HaiResult } from '@h-ai/core'
import type { KitClient } from './kit-client.js'
import { apiContract, IamCaptchaChallengeSchema, IamPublicConfigSchema, IamReauthenticationProofSchema } from '@h-ai/api-contract'
import { core, err, ok } from '@h-ai/core'
import { HaiCryptoError, TransportTimeError } from '@h-ai/crypto'
import { z } from 'zod'
import { createKitClient } from './kit-client.js'

/**
 * 创建标准 Cookie 认证表单动作；复用可选 apiFetch 以保留 CSRF 和传输配置。
 * @param options - 可复用的 apiFetch 和标准认证端点 basePath。
 * @param options.apiFetch - 已装配 CSRF/transport 的 fetch；省略时使用默认 Kit 客户端。
 * @param options.basePath - 同源认证端点前缀，默认 /api/auth。
 * @returns 标准表单动作；业务和已认证的时间错误返回 HaiResult，网络/格式错误会拒绝 Promise。
 * @example
 * ```ts
 * import { kit } from '@h-ai/kit'
 *
 * const actions = kit.client.createAuthActions({ basePath: '/api/auth' })
 * void actions
 * ```
 */
export function createKitAuthActions(options: { apiFetch?: KitClient['apiFetch'], basePath?: string } = {}) {
  const apiFetch = options.apiFetch ?? createKitClient().apiFetch
  const base = options.basePath ?? '/api/auth'
  async function request<T>(schema: z.ZodType<T>, ...args: Parameters<KitClient['apiFetch']>): Promise<HaiResult<T>> {
    try {
      const response = await apiFetch(...args)
      return apiContract.haiResultSchema(schema).parse(await response.json())
    }
    catch (error) {
      if (error instanceof TransportTimeError)
        return err(HaiCryptoError.TRANSPORT_TIME_INVALID, error.message, { transportCode: error.code, serverTime: error.serverTime })
      throw error
    }
  }
  async function post(path: string, input: object, init: Pick<RequestInit, 'keepalive'> = {}): Promise<HaiResult<unknown>> {
    // void 成功响应在 JSON 中省略 data，统一还原为 HaiResult 的 data: undefined。
    const result = await request(z.unknown().optional(), `${base}/${path}`, { ...init, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }, { recoverSession: false })
    return result.success ? ok(result.data) : result
  }
  return {
    bindPageExit(options: { enabled?: boolean } = {}) {
      if (!options.enabled || typeof window === 'undefined')
        return () => {}
      const target = window
      let sent = false
      const onPageHide = (event: PageTransitionEvent) => {
        if (event.persisted || sent)
          return
        sent = true
        void post('session/close', {}, { keepalive: true }).then((result) => {
          if (!result.success)
            core.logger.warn('Page exit session revocation failed', { errorCode: result.error.code })
        }).catch(() => core.logger.warn('Page exit session request did not complete'))
      }
      target.addEventListener('pagehide', onPageHide)
      return () => target.removeEventListener('pagehide', onPageHide)
    },
    async createCaptcha(input: z.input<typeof IamCreateCaptchaInputSchema>) {
      const result = await post('captcha', input)
      return result.success ? ok(IamCaptchaChallengeSchema.parse(result.data)) : result
    },
    publicConfig(): Promise<HaiResult<IamPublicConfig | null>> {
      return request(IamPublicConfigSchema.nullable(), `${base}/config`, undefined, { recoverSession: false })
    },
    login(input: IamLoginInput & { method?: 'password' | 'ldap' | 'email' | 'sms', code?: string }) {
      if (input.method === 'ldap')
        return post('login/ldap', { username: input.identifier, password: input.password, captcha: input.captcha, expectedUserId: input.expectedUserId })
      if (input.method === 'email' || input.method === 'sms')
        return post('login/otp', { identifier: input.identifier, code: input.code, captcha: input.captcha, expectedUserId: input.expectedUserId })
      return post('login', { identifier: input.identifier, password: input.password, captcha: input.captcha, expectedUserId: input.expectedUserId })
    },
    register: (input: IamRegisterInput) => post('register', { ...input, confirmPassword: input.password }),
    sendOtp: (identifier: string, options?: { captcha?: string }) => post('otp/send', { identifier, ...options }),
    requestPasswordReset: (identifier: string, options?: { captcha?: string }) => post('password-reset/request', { identifier, ...options }),
    confirmPasswordReset: (token: string, newPassword: string) => post('password-reset/confirm', { token, newPassword }),
    renewPassword: (input: { identifier: string, password: string, newPassword: string, captcha?: string }) => post('password/renew', input),
    reauthenticate(password: string, operation: string) {
      return request(IamReauthenticationProofSchema, `${base}/reauthenticate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password, operation }) })
    },
  }
}
