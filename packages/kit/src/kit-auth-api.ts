import type { HaiResult } from '@h-ai/core'
/** SvelteKit 标准认证端点，统一验证、Cookie 和 HaiResult 处理。 */
import type { AuthRequestContext, IamFunctions } from '@h-ai/iam'
import type { RequestEvent } from '@sveltejs/kit'
import {
  IamConfirmPasswordResetInputSchema,
  IamCreateCaptchaInputSchema,
  IamLdapLoginInputSchema,
  IamLoginInputSchema,
  IamLogoutInputSchema,
  IamOtpLoginInputSchema,
  IamReauthenticateInputSchema,
  IamRegisterInputSchema,
  IamRenewPasswordInputSchema,
  IamRequestPasswordResetInputSchema,
  IamSendOtpInputSchema,
} from '@h-ai/api-contract'
import { getAccessToken, login, loginWithLdap, loginWithOtp, registerAndLogin } from './kit-auth.js'
import { handler } from './kit-handler.js'
import { fromError, ok } from './kit-response.js'
import { validateFormOrFail } from './kit-validation.js'

/**
 * 标准匿名认证端点；不会放开 /me、改密等账户端点。
 * @example
 * ```ts
 * import { kit } from '@h-ai/kit'
 *
 * const publicPaths = kit.auth.publicPaths
 * void publicPaths
 * ```
 */
export const authApiPublicPaths = ['/api/auth/session/close', '/api/auth/logout', '/api/auth/captcha', '/api/auth/config', '/api/auth/login', '/api/auth/login/ldap', '/api/auth/login/otp', '/api/auth/register', '/api/auth/otp/send', '/api/auth/password-reset/request', '/api/auth/password-reset/confirm', '/api/auth/password/renew']

function requestContext(event: Pick<RequestEvent, 'request' | 'getClientAddress'>): AuthRequestContext {
  let ip: string | undefined
  try {
    ip = event.getClientAddress()
  }
  catch { /* 未配置可信连接地址时保持未知，启用 IP 限制将拒绝登录。 */ }
  const terminal = event.request.headers.get('x-hai-terminal')
  return { ip, userAgent: event.request.headers.get('user-agent') ?? undefined, terminalType: terminal === 'app' || terminal === 'desktop' || terminal === 'api' ? terminal : 'web' }
}

/**
 * 应用路由直接导出对应 handler；认证 ops 仍由 createHandle 注入。
 * @param iam - 已由应用初始化的 IAM 服务对象。
 * @returns 标准认证端点的 RequestHandler 集合。
 * @example 模块内部上下文
 * ```ts
 * function build(iam: IamFunctions) {
 *   return createAuthApi(iam) // 调用方负责初始化 IAM；工厂只装配 handler。
 * }
 * ```
 */
export function createAuthApi(iam: IamFunctions) {
  function response<T>(result: HaiResult<T>) {
    return result.success ? ok(result.data) : fromError(result.error)
  }
  return {
    closeSession: handler(async ({ request, cookies }) => {
      const input = await validateFormOrFail(request, IamLogoutInputSchema)
      // 此入口不能清除 Cookie：页面离开响应可能晚于下一文档的新登录。
      return response(await iam.auth.logout(input.accessToken ?? getAccessToken(request, cookies) ?? ''))
    }),
    createCaptcha: handler(async ({ request }) => {
      const input = await validateFormOrFail(request, IamCreateCaptchaInputSchema)
      return response(await iam.auth.createCaptcha(input))
    }),
    reauthenticate: handler(async ({ request, cookies }) => {
      const input = await validateFormOrFail(request, IamReauthenticateInputSchema)
      return response(await iam.auth.reauthenticate(getAccessToken(request, cookies) ?? '', input.password, input.operation))
    }),
    publicConfig: handler(async () => response(await iam.getPublicConfig())),
    renewPassword: handler(async ({ request }) => {
      const input = await validateFormOrFail(request, IamRenewPasswordInputSchema)
      return response(await iam.user.renewPassword(input))
    }),
    login: handler(async (event) => {
      const { request, cookies } = event
      const input = await validateFormOrFail(request, IamLoginInputSchema)
      const result = await login(cookies, input, requestContext(event))
      return result.success ? ok({ user: result.data.user }) : fromError(result.error)
    }),
    loginWithLdap: handler(async (event) => {
      const { request, cookies } = event
      const input = await validateFormOrFail(request, IamLdapLoginInputSchema)
      const result = await loginWithLdap(cookies, input, requestContext(event))
      return result.success ? ok({ user: result.data.user }) : fromError(result.error)
    }),
    loginWithOtp: handler(async (event) => {
      const { request, cookies } = event
      const input = await validateFormOrFail(request, IamOtpLoginInputSchema)
      const result = await loginWithOtp(cookies, input, requestContext(event))
      return result.success ? ok({ user: result.data.user }) : fromError(result.error)
    }),
    register: handler(async (event) => {
      const { request, cookies } = event
      const input = await validateFormOrFail(request, IamRegisterInputSchema)
      const result = await registerAndLogin(cookies, input, requestContext(event))
      return result.success ? ok({ user: result.data.user }) : fromError(result.error)
    }),
    sendOtp: handler(async ({ request }) => {
      const input = await validateFormOrFail(request, IamSendOtpInputSchema)
      return response(await iam.auth.sendOtp(input.identifier, input))
    }),
    requestPasswordReset: handler(async ({ request }) => {
      const input = await validateFormOrFail(request, IamRequestPasswordResetInputSchema)
      return response(await iam.user.requestPasswordReset(input.identifier, input))
    }),
    confirmPasswordReset: handler(async ({ request }) => {
      const input = await validateFormOrFail(request, IamConfirmPasswordResetInputSchema)
      return response(await iam.user.confirmPasswordReset(input.token, input.newPassword))
    }),
  }
}
