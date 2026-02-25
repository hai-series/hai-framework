/**
 * =============================================================================
 * @h-ai/kit - IAM Actions
 * =============================================================================
 * SvelteKit Form Actions 封装
 *
 * 提供：
 * - login - 登录
 * - logout - 登出
 * - register - 注册
 * - changePassword - 修改密码
 *
 * @example
 * ```ts
 * // src/routes/login/+page.server.ts
 * import { kit } from '@h-ai/kit'
 * import { iam } from '$lib/server/iam'
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
 */
export function createIamActions(config: IamActionsConfig) {
  const {
    iam,
    sessionCookieName = 'hai_session',
    sessionMaxAge = 7 * 24 * 60 * 60, // 7 天
    rememberMeMaxAge = 30 * 24 * 60 * 60, // 30 天
    loginRedirect = '/',
    logoutRedirect = '/login',
    registerRedirect = '/login',
    onLoginSuccess,
    onRegisterSuccess,
    onLogoutSuccess,
  } = config

  return {
    /**
     * 登录 Action
     */
    login: async (event: RequestEvent) => {
      const formData = await event.request.formData()
      const username = formData.get('username') as string
      const password = formData.get('password') as string
      const rememberMe = formData.get('rememberMe') === 'on'

      if (!username || !password) {
        return fail(400, {
          error: getKitMessage('kit_loginUsernamePasswordRequired'),
          username,
        })
      }

      // 认证
      const authResult = await iam.auth.authenticate({
        type: 'password',
        username,
        password,
      })

      if (!authResult.success || !authResult.data) {
        // 直接使用 iam 模块返回的错误消息（已经过 i18n 处理）
        return fail(401, {
          error: authResult.error!.message,
          username,
        })
      }

      const user = authResult.data

      const rolesResult = await iam.authz.getUserRoles(user.id)
      if (!rolesResult.success || !rolesResult.data) {
        return fail(500, {
          error: getKitMessage('kit_sessionCreateFailed'),
          username,
        })
      }
      const roles = rolesResult.data.map(role => role.id)

      // 创建会话
      const sessionResult = await iam.session.create({
        userId: user.id,
        roles,
        source: 'pc',
        maxAge: rememberMe ? rememberMeMaxAge : sessionMaxAge,
      })

      if (!sessionResult.success || !sessionResult.data) {
        return fail(500, {
          error: getKitMessage('kit_sessionCreateFailed'),
          username,
        })
      }

      const session = sessionResult.data

      // 设置 Cookie
      event.cookies.set(sessionCookieName, session.accessToken, {
        path: '/',
        httpOnly: true,
        secure: event.url.protocol === 'https:',
        sameSite: 'lax',
        maxAge: rememberMe ? rememberMeMaxAge : sessionMaxAge,
      })

      // 回调
      if (onLoginSuccess) {
        await onLoginSuccess({
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            enabled: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          session: {
            userId: user.id,
            roles,
            source: session.source,
            accessToken: session.accessToken,
            expiresAt: session.expiresAt,
            createdAt: new Date(),
          },
          event,
        })
      }

      // 重定向
      redirect(303, loginRedirect)
    },

    /**
     * 登出 Action
     */
    logout: async (event: RequestEvent) => {
      const sessionToken = event.cookies.get(sessionCookieName)

      if (sessionToken) {
        // 获取并删除会话
        const sessionResult = await iam.session.get(sessionToken)
        if (sessionResult.success && sessionResult.data) {
          await iam.session.delete(sessionResult.data.accessToken)
        }

        // 清除 Cookie
        event.cookies.delete(sessionCookieName, { path: '/' })
      }

      // 回调
      await onLogoutSuccess?.({ event })

      // 重定向
      redirect(303, logoutRedirect)
    },

    /**
     * 注册 Action
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

      if (password.length < 8) {
        return fail(400, {
          error: getKitMessage('kit_passwordMinLength', { params: { minLength: 8 } }),
          username,
          email,
        })
      }

      // 注册
      const registerResult = await iam.user.register({
        username,
        email,
        password,
      })

      if (!registerResult.success || !registerResult.data) {
        return fail(400, {
          error: registerResult.error!.message,
          username,
          email,
        })
      }

      const user = registerResult.data

      // 回调
      if (onRegisterSuccess) {
        await onRegisterSuccess({ user, event })
      }

      // 重定向
      redirect(303, registerRedirect)
    },

    /**
     * 修改密码 Action
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

      if (newPassword.length < 8) {
        return fail(400, {
          error: getKitMessage('kit_passwordMinLength', { params: { minLength: 8 } }),
        })
      }

      // 获取当前用户
      const locals = event.locals as { user?: { id: string } }
      if (!locals.user) {
        return fail(401, {
          error: getKitMessage('kit_loginRequired'),
        })
      }

      // 修改密码
      const result = await iam.user.changePassword(locals.user.id, oldPassword, newPassword)

      if (!result.success) {
        return fail(400, {
          error: result.error!.message,
        })
      }

      return {
        success: true,
        message: getKitMessage('kit_changePasswordSuccess'),
      }
    },

    /**
     * 更新当前用户资料 Action
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

      const updatePayload = {
        displayName,
        email,
        phone,
        avatarUrl,
      }

      if (iam.user.updateCurrentUser) {
        const updateResult = await iam.user.updateCurrentUser(token, updatePayload)
        if (!updateResult.success) {
          return fail(400, {
            error: updateResult.error?.message ?? getKitMessage('kit_internalError'),
          })
        }
        return {
          success: true,
          message: getKitMessage('kit_commonSuccess'),
          user: updateResult.data,
        }
      }

      const currentUserResult = iam.user.getCurrentUser
        ? await iam.user.getCurrentUser(token)
        : null
      const currentUserId = currentUserResult?.success ? currentUserResult.data?.id : undefined
      if (!currentUserId || !iam.user.updateUser) {
        return fail(500, {
          error: getKitMessage('kit_internalError'),
        })
      }

      const updateResult = await iam.user.updateUser(currentUserId, updatePayload)
      if (!updateResult.success) {
        return fail(400, {
          error: updateResult.error?.message ?? getKitMessage('kit_internalError'),
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
