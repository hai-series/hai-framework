/**
 * =============================================================================
 * @h-ai/kit - IAM Actions
 * =============================================================================
 * SvelteKit Form Actions 封装
 *
 * 提供：
 * - login - 登录（密码方式）
 * - logout - 登出
 * - register - 注册
 * - changePassword - 修改密码
 * - updateProfile - 更新个人资料
 *
 * 所有操作直接委托给 @h-ai/iam，不做重复的会话管理。
 * iam.auth.login() 已内部创建会话并返回 AuthResult（含 accessToken）。
 *
 * @example
 * ```ts
 * // src/routes/login/+page.server.ts
 * import { kit } from '@h-ai/kit'
 * import { iam } from '@h-ai/iam'
 *
 * export const actions = kit.iam.createActions({
 *     iam,
 *     sessionCookieName: 'session',
 *     onLoginSuccess: async ({ user, session }) => {
 *         // 登录成功后的处理
 *     }
 * })
 * ```
 * =============================================================================
 */

import type { RequestEvent } from '@sveltejs/kit'
import type { IamActionsConfig } from './iam-types.js'
import { fail, redirect } from '@sveltejs/kit'
import { getKitMessage } from '../../kit-i18n.js'

/**
 * 创建 IAM Form Actions
 *
 * 返回一组 SvelteKit Form Actions（login / logout / register / changePassword / updateProfile），
 * 全部委托给 `@h-ai/iam` 执行，自动处理 Cookie 设置与清理。
 *
 * @param config - Form Actions 配置（含 iam 实例、重定向路由、回调等）
 * @returns `{ login, logout, register, changePassword, updateProfile }`
 *
 * @example
 * ```ts
 * // src/routes/login/+page.server.ts
 * export const actions = kit.iam.createActions({ iam, loginRedirect: '/dashboard' })
 * ```
 */
export function createIamActions(config: IamActionsConfig) {
  const {
    iam,
    sessionCookieName = 'hai_session',
    loginRedirect = '/',
    logoutRedirect = '/login',
    registerRedirect = '/login',
    onLoginSuccess,
    onRegisterSuccess,
    onLogoutSuccess,
  } = config

  // 从 IAM 配置读取会话有效期
  const sessionMaxAge = iam.config?.session?.maxAge ?? 7 * 24 * 60 * 60 // 7 天
  const rememberMeMaxAge = config.rememberMeMaxAge ?? 30 * 24 * 60 * 60 // 30 天

  // 从 IAM 配置读取密码最小长度
  const passwordMinLength = iam.config?.password?.minLength ?? 8

  return {
    /**
     * 登录 Action
     *
     * 使用 iam.auth.login() 完成认证和会话创建，
     * 从返回的 AuthResult 中获取 accessToken 设置到 Cookie。
     */
    login: async (event: RequestEvent) => {
      const formData = await event.request.formData()
      const identifier = formData.get('username') as string ?? formData.get('identifier') as string
      const password = formData.get('password') as string
      const rememberMe = formData.get('rememberMe') === 'on'

      if (!identifier || !password) {
        return fail(400, {
          error: getKitMessage('kit_loginUsernamePasswordRequired'),
          username: identifier,
        })
      }

      // 使用 iam.auth.login — 内部完成认证+创建会话，返回 AuthResult
      const loginResult = await iam.auth.login({ identifier, password, rememberMe })

      if (!loginResult.success) {
        return fail(401, {
          error: loginResult.error.message,
          username: identifier,
        })
      }

      const { user, accessToken } = loginResult.data

      // 设置 Cookie（使用 iam 返回的令牌）
      const maxAge = rememberMe ? rememberMeMaxAge : sessionMaxAge
      event.cookies.set(sessionCookieName, accessToken, {
        path: '/',
        httpOnly: true,
        secure: event.url.protocol === 'https:',
        sameSite: 'lax',
        maxAge,
      })

      // 回调
      if (onLoginSuccess) {
        // 查询完整会话信息
        const sessionResult = await iam.session.get(accessToken)
        if (sessionResult.success && sessionResult.data) {
          await onLoginSuccess({ user, session: sessionResult.data, event })
        }
      }

      // 重定向
      redirect(303, loginRedirect)
    },

    /**
     * 登出 Action
     *
     * 使用 iam.auth.logout() 注销会话。
     */
    logout: async (event: RequestEvent) => {
      const sessionToken = event.cookies.get(sessionCookieName)

      if (sessionToken) {
        await iam.auth.logout(sessionToken)
        event.cookies.delete(sessionCookieName, { path: '/' })
      }

      // 回调
      await onLogoutSuccess?.({ event })

      // 重定向
      redirect(303, logoutRedirect)
    },

    /**
     * 注册 Action
     *
     * 使用 iam.user.register() 注册用户（内部自动分配默认角色）。
     */
    register: async (event: RequestEvent) => {
      const formData = await event.request.formData()
      const username = formData.get('username') as string
      const email = formData.get('email') as string
      const password = formData.get('password') as string
      const confirmPassword = formData.get('confirmPassword') as string

      // 验证
      if (!username || !email || !password) {
        return fail(400, {
          error: getKitMessage('kit_registerFieldsRequired'),
          username,
          email,
        })
      }

      if (password !== confirmPassword) {
        return fail(400, {
          error: getKitMessage('kit_passwordMismatch'),
          username,
          email,
        })
      }

      if (password.length < passwordMinLength) {
        return fail(400, {
          error: getKitMessage('kit_passwordMinLength', { params: { minLength: passwordMinLength } }),
          username,
          email,
        })
      }

      // 注册（iam 内部会自动分配默认角色）
      const registerResult = await iam.user.register({ username, email, password })

      if (!registerResult.success) {
        return fail(400, {
          error: registerResult.error.message,
          username,
          email,
        })
      }

      const { user } = registerResult.data

      // 回调
      if (onRegisterSuccess) {
        await onRegisterSuccess({ user, event })
      }

      // 重定向
      redirect(303, registerRedirect)
    },

    /**
     * 修改密码 Action
     *
     * 优先使用 iam.user.changeCurrentUserPassword（通过 token），
     * 回退到 iam.user.changePassword（通过 userId）。
     */
    changePassword: async (event: RequestEvent) => {
      const formData = await event.request.formData()
      const oldPassword = formData.get('oldPassword') as string
      const newPassword = formData.get('newPassword') as string
      const confirmPassword = formData.get('confirmPassword') as string

      // 验证
      if (!oldPassword || !newPassword) {
        return fail(400, {
          error: getKitMessage('kit_registerFieldsRequired'),
        })
      }

      if (newPassword !== confirmPassword) {
        return fail(400, {
          error: getKitMessage('kit_passwordMismatch'),
        })
      }

      if (newPassword.length < passwordMinLength) {
        return fail(400, {
          error: getKitMessage('kit_passwordMinLength', { params: { minLength: passwordMinLength } }),
        })
      }

      // 优先使用 token 修改密码
      const token = event.cookies.get(sessionCookieName)
      if (token) {
        const result = await iam.user.changeCurrentUserPassword(token, oldPassword, newPassword)
        if (!result.success) {
          return fail(400, { error: result.error.message })
        }
        return { success: true, message: getKitMessage('kit_changePasswordSuccess') }
      }

      // 回退：通过 locals 获取 userId
      const locals = event.locals as { user?: { id: string } }
      if (!locals.user) {
        return fail(401, { error: getKitMessage('kit_loginRequired') })
      }

      const result = await iam.user.changePassword(locals.user.id, oldPassword, newPassword)
      if (!result.success) {
        return fail(400, { error: result.error.message })
      }

      return { success: true, message: getKitMessage('kit_changePasswordSuccess') }
    },

    /**
     * 更新当前用户资料 Action
     *
     * 使用 iam.user.updateCurrentUser（通过 token）。
     */
    updateProfile: async (event: RequestEvent) => {
      const formData = await event.request.formData()
      const displayNameRaw = formData.get('displayName')
      const emailRaw = formData.get('email')
      const phoneRaw = formData.get('phone')
      const avatarUrlRaw = formData.get('avatarUrl')

      const displayName = typeof displayNameRaw === 'string' ? displayNameRaw.trim() || undefined : undefined
      const email = typeof emailRaw === 'string' ? emailRaw.trim() || undefined : undefined
      const phone = typeof phoneRaw === 'string' ? phoneRaw.trim() || undefined : undefined
      const avatarUrl = typeof avatarUrlRaw === 'string' ? avatarUrlRaw.trim() || undefined : undefined

      if (!displayName && !email && !phone && !avatarUrl) {
        return fail(400, {
          error: getKitMessage('kit_registerFieldsRequired'),
        })
      }

      if (email && !/^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/.test(email)) {
        return fail(400, {
          error: getKitMessage('kit_emailInvalid'),
        })
      }

      const token = event.cookies.get(sessionCookieName)
      if (!token) {
        return fail(401, {
          error: getKitMessage('kit_loginRequired'),
        })
      }

      const updateResult = await iam.user.updateCurrentUser(token, {
        displayName,
        phone,
        avatarUrl,
      })

      if (!updateResult.success) {
        return fail(400, {
          error: updateResult.error.message,
        })
      }

      return {
        success: true,
        message: getKitMessage('kit_commonSuccess'),
        user: updateResult.data,
      }
    },
  }
}
