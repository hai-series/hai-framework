import type { HaiResult } from '@h-ai/core'
/** SvelteKit 标准认证端点，统一验证、Cookie 和 HaiResult 处理。 */
import type { IamFunctions } from '@h-ai/iam'
import {
  IamConfirmPasswordResetInputSchema,
  IamLdapLoginInputSchema,
  IamLoginInputSchema,
  IamOtpLoginInputSchema,
  IamRegisterInputSchema,
  IamRequestPasswordResetInputSchema,
  IamSendOtpInputSchema,
} from '@h-ai/api-contract'
import { login, loginWithLdap, loginWithOtp, registerAndLogin } from './kit-auth.js'
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
export const authApiPublicPaths = ['/api/auth/config', '/api/auth/login', '/api/auth/login/ldap', '/api/auth/login/otp', '/api/auth/register', '/api/auth/otp/send', '/api/auth/password-reset/request', '/api/auth/password-reset/confirm']

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
    publicConfig: handler(() => ok(iam.publicConfig)),
    login: handler(async ({ request, cookies }) => {
      const input = await validateFormOrFail(request, IamLoginInputSchema)
      const result = await login(cookies, input)
      return result.success ? ok({ user: result.data.user }) : fromError(result.error)
    }),
    loginWithLdap: handler(async ({ request, cookies }) => {
      const input = await validateFormOrFail(request, IamLdapLoginInputSchema)
      const result = await loginWithLdap(cookies, input)
      return result.success ? ok({ user: result.data.user }) : fromError(result.error)
    }),
    loginWithOtp: handler(async ({ request, cookies }) => {
      const input = await validateFormOrFail(request, IamOtpLoginInputSchema)
      const result = await loginWithOtp(cookies, input)
      return result.success ? ok({ user: result.data.user }) : fromError(result.error)
    }),
    register: handler(async ({ request, cookies }) => {
      const input = await validateFormOrFail(request, IamRegisterInputSchema)
      const result = await registerAndLogin(cookies, input)
      return result.success ? ok({ user: result.data.user }) : fromError(result.error)
    }),
    sendOtp: handler(async ({ request }) => {
      const input = await validateFormOrFail(request, IamSendOtpInputSchema)
      return response(await iam.auth.sendOtp(input.identifier))
    }),
    requestPasswordReset: handler(async ({ request }) => {
      const input = await validateFormOrFail(request, IamRequestPasswordResetInputSchema)
      return response(await iam.user.requestPasswordReset(input.identifier))
    }),
    confirmPasswordReset: handler(async ({ request }) => {
      const input = await validateFormOrFail(request, IamConfirmPasswordResetInputSchema)
      return response(await iam.user.confirmPasswordReset(input.token, input.newPassword))
    }),
  }
}
