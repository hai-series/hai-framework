import type { HaiResult } from '@h-ai/core'
/** SvelteKit 标准认证端点，统一验证、Cookie 和 HaiResult 处理。 */
import type { AuthRequestContext, AuthResult, IamFunctions } from '@h-ai/iam'
import type { RequestEvent } from '@sveltejs/kit'
import type { AuthCookieWriter } from './kit-types.js'
import { createHash } from 'node:crypto'
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
import { z } from 'zod'
import { getAccessToken, getCookieAccessToken, setAuthTokenCookie } from './kit-auth.js'
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
export const authApiPublicPaths = [
  '/api/auth/session/close',
  '/api/auth/logout',
  '/api/auth/captcha',
  '/api/auth/config',
  '/api/auth/login',
  '/api/auth/login/ldap',
  '/api/auth/login/otp',
  '/api/auth/register',
  '/api/auth/otp/send',
  '/api/auth/password-reset/request',
  '/api/auth/password-reset/confirm',
  '/api/auth/password/renew',
]

const CloseSessionInputSchema = IamLogoutInputSchema.extend({
  sessionFingerprint: z.string().regex(/^[\da-f]{64}$/).optional(),
})

/**
 * 为已鉴别页面派生退出会话指纹，可由当前页面发送，不能用于鉴别或代替令牌。
 * @param accessToken - 当前请求已验证的 IAM 访问令牌。
 * @returns 该令牌的退出会话指纹；未提供令牌时返回 undefined。
 * @example
 * ```ts
 * import { kit } from '@h-ai/kit'
 *
 * const fingerprint = kit.auth.sessionFingerprint('example-access-token')
 * void fingerprint
 * ```
 */
export function createSessionFingerprint(accessToken?: string | null): string | undefined {
  return accessToken
    ? createHash('sha256').update('hai:kit:session-close:v1:').update(accessToken).digest('hex')
    : undefined
}

function requestContext(event: Pick<RequestEvent, 'request' | 'getClientAddress'>): AuthRequestContext {
  let ip: string | undefined
  try {
    ip = event.getClientAddress()
  }
  catch { /* 未配置可信连接地址时保持未知，启用 IP 限制将拒绝登录。 */ }
  const terminal = event.request.headers.get('x-hai-terminal')
  return {
    ip,
    userAgent: event.request.headers.get('user-agent') ?? undefined,
    terminalType: terminal === 'app' || terminal === 'desktop' || terminal === 'api'
      ? terminal
      : 'web',
  }
}

/**
 * 应用路由直接导出对应 handler；Cookie 名称由当前请求的 Handle 配置确定。
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
    return result.success
      ? ok(result.data)
      : fromError(result.error)
  }
  function loginResponse(cookies: AuthCookieWriter, result: HaiResult<AuthResult>): Response {
    if (!result.success)
      return fromError(result.error)
    const { tokens, user } = result.data
    setAuthTokenCookie(cookies, tokens.accessToken, tokens.expiresIn)
    return ok({ user })
  }

  return {
    closeSession: handler(async ({ request, cookies }) => {
      const input = await validateFormOrFail(request, CloseSessionInputSchema)
      const explicitToken = input.accessToken ?? (input.sessionFingerprint
        ? undefined
        : getAccessToken(request))
      if (explicitToken)
        return response(await iam.auth.logout(explicitToken))

      const cookieToken = getCookieAccessToken(cookies)
      // 页面离开只能撤销原页面所属令牌。其他标签页的新 Cookie 不参与撤销。
      if (!cookieToken || !input.sessionFingerprint || createSessionFingerprint(cookieToken) !== input.sessionFingerprint)
        return ok(undefined)
      return response(await iam.auth.logout(cookieToken))
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
      return loginResponse(cookies, await iam.auth.login(input, requestContext(event)))
    }),
    loginWithLdap: handler(async (event) => {
      const { request, cookies } = event
      const input = await validateFormOrFail(request, IamLdapLoginInputSchema)
      return loginResponse(cookies, await iam.auth.loginWithLdap(input, requestContext(event)))
    }),
    loginWithOtp: handler(async (event) => {
      const { request, cookies } = event
      const input = await validateFormOrFail(request, IamOtpLoginInputSchema)
      return loginResponse(cookies, await iam.auth.loginWithOtp(input, requestContext(event)))
    }),
    register: handler(async (event) => {
      const { request, cookies } = event
      const input = await validateFormOrFail(request, IamRegisterInputSchema)
      return loginResponse(cookies, await iam.auth.registerAndLogin(input, requestContext(event)))
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
