/** 认证表单动作：统一选择登录方式及安全 Token 存储。 */
import type { apiContract, IamLoginInput, IamRegisterInput } from '@h-ai/api-contract'
import type { HaiResult } from '@h-ai/core'
import type { ApiClient } from './api-client-types.js'

/** 与认证场景表单对齐的登录输入。 */
export type IamAuthLoginInput = IamLoginInput & { method?: 'password' | 'ldap' | 'email' | 'sms', code?: string }

/** 绑定任意包含标准 iam contract 的客户端；成功时自动保存 Token。 */
export function createIamAuthActions(client: {
  iam: { auth: Pick<ApiClient<{ iam: typeof apiContract.iam }>['iam']['auth'], 'publicConfig' | 'login' | 'loginWithLdap' | 'loginWithOtp' | 'register' | 'sendOtp' | 'requestPasswordReset' | 'confirmPasswordReset'> }
  auth: Pick<ApiClient<{ iam: typeof apiContract.iam }>['auth'], 'setTokens'>
}) {
  async function save<T extends { tokens: Parameters<typeof client.auth.setTokens>[0] }>(result: HaiResult<T>) {
    if (result.success)
      await client.auth.setTokens(result.data.tokens)
    return result
  }
  return {
    publicConfig: () => client.iam.auth.publicConfig(),
    login: async (input: IamAuthLoginInput) => {
      const result = input.method === 'ldap'
        ? await client.iam.auth.loginWithLdap({ username: input.identifier, password: input.password })
        : input.method === 'email' || input.method === 'sms'
          ? await client.iam.auth.loginWithOtp({ identifier: input.identifier, code: input.code ?? '' })
          : await client.iam.auth.login({ identifier: input.identifier, password: input.password, rememberMe: input.rememberMe })
      return save(result)
    },
    register: async (input: IamRegisterInput) => save(await client.iam.auth.register(input)),
    sendOtp: (identifier: string) => client.iam.auth.sendOtp({ identifier }),
    requestPasswordReset: (identifier: string) => client.iam.auth.requestPasswordReset({ identifier }),
    confirmPasswordReset: (token: string, newPassword: string) => client.iam.auth.confirmPasswordReset({ token, newPassword }),
  }
}
