/** 认证表单动作：统一选择登录方式及安全 Token 存储。 */
import type { apiContract, IamLoginInput, IamRegisterInput } from '@h-ai/api-contract'
import type { HaiResult } from '@h-ai/core'
import type { ApiClient } from './api-client-types.js'
import { core } from '@h-ai/core'

// 仅持有本机 DOM 监听器；业务会话真值仍由服务端撤销与超时决定。
const pageExitBindings = new WeakMap<object, Set<() => void>>()

/**
 * 客户端关闭时清理本实例安装的页面监听器，不清理其它实例。
 * @example 模块内部上下文
 * ```ts
 * clearIamPageExitBindings({}) // 没有绑定时幂等。
 * ```
 */
export function clearIamPageExitBindings(auth: object): void {
  for (const stop of pageExitBindings.get(auth) ?? [])
    stop()
  pageExitBindings.delete(auth)
}

/**
 * 认证表单登录输入；默认 password，ldap 使用 identifier/password，email/sms 使用 identifier/code。
 * method/code 为客户端表单辅助字段，按所选方式映射到标准 IAM procedure。
 *
 * @example
 * ```ts
 * import type { IamAuthLoginInput } from '@h-ai/api-client'
 * const input: IamAuthLoginInput = { identifier: 'alice@example.com', password: '', method: 'email', code: '123456' }
 * ```
 */
export type IamAuthLoginInput = IamLoginInput & { method?: 'password' | 'ldap' | 'email' | 'sms', code?: string }

/**
 * 将含标准 IAM 契约的客户端绑定为认证表单动作；包用户通过 apiClient.createAuthActions 调用。
 * 登录/注册成功后等待 client.auth.setTokens，失败 HaiResult 原样返回；存储失败拒绝 Promise，不能据服务端成功就显示已登录。
 * 调用方必须先 init 并启用 auth；未启用 auth 时客户端 setTokens 不会建立 Token 管理器。
 * @param client - 具有标准 IAM procedure 与 setTokens 能力的已初始化客户端。
 * @param client.iam - 标准 IAM 契约的领域分组。
 * @param client.iam.auth - 公开配置、登录、注册、验证码和密码重置 procedure。
 * @param client.auth - 认证成功后的凭据写入能力（setTokens）。
 * @returns publicConfig、按方式登录、注册、验证码和密码重置动作。
 *
 * @example
 * ```ts
 * import { apiClient } from '@h-ai/api-client'
 * const initialized = await apiClient.init({ baseUrl: 'https://api.example.com/api/v1', auth: {} })
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const actions = apiClient.createAuthActions(apiClient)
 *   // 运行时凭据来自已验证的表单；此处只请求公开配置，不提交示例密码。
 *   const config = await actions.publicConfig()
 *   if (!config.success) throw new Error(config.error.message)
 * }
 * finally { await apiClient.close() }
 * ```
 */
export function createIamAuthActions(client: {
  iam: { auth: Pick<ApiClient<{ iam: typeof apiContract.iam }>['iam']['auth'], 'publicConfig' | 'login' | 'loginWithLdap' | 'loginWithOtp' | 'register' | 'sendOtp' | 'requestPasswordReset' | 'confirmPasswordReset'> }
  auth: Pick<ApiClient<{ iam: typeof apiContract.iam }>['auth'], 'setTokens'>
}) {
  /**
   * 认证成功后等待凭据保存；失败 HaiResult 不写存储，写入失败向调用方拒绝。
   * @param result - 标准 IAM 登录/注册结果，成功数据含 TokenPair。
   * @returns 同一结果；不能把服务端成功与本地安全存储成功混为一谈。
   *
   * @example 模块内部上下文
   * ```ts
   * const failure = { success: false as const, error: { code: 'test:denied', message: 'Denied', httpStatus: 401 } }
   * const result = await save(failure)
   * if (!result.success) { const message = result.error.message }
   * ```
   */
  async function save<T extends { tokens: Parameters<typeof client.auth.setTokens>[0] }>(result: HaiResult<T>) {
    if (result.success)
      await client.auth.setTokens(result.data.tokens)
    return result
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
        // 不清理 Cookie/本地存储，避免迟到响应覆盖下一文档刚建立的新身份。
        void client.iam.auth.closeSession({}, { context: { keepalive: true, autoRefresh: false } }).then((result) => {
          if (!result.success)
            core.logger.warn('Page exit session revocation failed', { errorCode: result.error.code })
        }).catch(() => core.logger.warn('Page exit session request did not complete'))
      }
      target.addEventListener('pagehide', onPageHide)
      const bindings = pageExitBindings.get(client.auth) ?? new Set<() => void>()
      const stop = () => {
        target.removeEventListener('pagehide', onPageHide)
        bindings.delete(stop)
        if (!bindings.size)
          pageExitBindings.delete(client.auth)
      }
      bindings.add(stop)
      pageExitBindings.set(client.auth, bindings)
      return stop
    },
    publicConfig: () => client.iam.auth.publicConfig(),
    login: async (input: IamAuthLoginInput) => {
      const result = input.method === 'ldap'
        ? await client.iam.auth.loginWithLdap({ username: input.identifier, password: input.password })
        : input.method === 'email' || input.method === 'sms'
          ? await client.iam.auth.loginWithOtp({ identifier: input.identifier, code: input.code ?? '' })
          : await client.iam.auth.login({ identifier: input.identifier, password: input.password })
      return save(result)
    },
    register: async (input: IamRegisterInput) => save(await client.iam.auth.register(input)),
    sendOtp: (identifier: string) => client.iam.auth.sendOtp({ identifier }),
    requestPasswordReset: (identifier: string) => client.iam.auth.requestPasswordReset({ identifier }),
    confirmPasswordReset: (token: string, newPassword: string) => client.iam.auth.confirmPasswordReset({ token, newPassword }),
  }
}
