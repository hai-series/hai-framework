/** 与标准 Kit 认证端点配套的表单动作；复用已有 CSRF/transport fetch。 */
import type { IamLoginInput, IamPublicConfig, IamRegisterInput } from '@h-ai/api-contract'
import type { HaiResult } from '@h-ai/core'
import type { KitClient } from './kit-client.js'
import { apiContract, IamPublicConfigSchema } from '@h-ai/api-contract'
import { ok } from '@h-ai/core'
import { z } from 'zod'
import { createKitClient } from './kit-client.js'

export function createKitAuthActions(options: { apiFetch?: KitClient['apiFetch'], basePath?: string } = {}) {
  const apiFetch = options.apiFetch ?? createKitClient().apiFetch
  const base = options.basePath ?? '/api/auth'
  async function post(path: string, input: object): Promise<HaiResult<unknown>> {
    const response = await apiFetch(`${base}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
    // void 成功响应在 JSON 中省略 data，统一还原为 HaiResult 的 data: undefined。
    const result = apiContract.haiResultSchema(z.unknown().optional()).parse(await response.json())
    return result.success ? ok(result.data) : result
  }
  return {
    async publicConfig(): Promise<HaiResult<IamPublicConfig | null>> {
      const response = await apiFetch(`${base}/config`)
      return apiContract.haiResultSchema(IamPublicConfigSchema.nullable()).parse(await response.json())
    },
    login(input: IamLoginInput & { method?: 'password' | 'ldap' | 'email' | 'sms', code?: string }) {
      if (input.method === 'ldap')
        return post('login/ldap', { username: input.identifier, password: input.password })
      if (input.method === 'email' || input.method === 'sms')
        return post('login/otp', { identifier: input.identifier, code: input.code })
      return post('login', { identifier: input.identifier, password: input.password, rememberMe: input.rememberMe })
    },
    register: (input: IamRegisterInput) => post('register', { ...input, confirmPassword: input.password }),
    sendOtp: (identifier: string) => post('otp/send', { identifier }),
    requestPasswordReset: (identifier: string) => post('password-reset/request', { identifier }),
    confirmPasswordReset: (token: string, newPassword: string) => post('password-reset/confirm', { token, newPassword }),
  }
}
