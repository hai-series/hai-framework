/** 个人资料请求复用统一鉴别动作，页面只处理表单与显示。 */
import { apiFetch } from '$lib/utils/api'
import { apiContract } from '@h-ai/api-contract'
import { err, HaiCommonError } from '@h-ai/core'
import { z } from 'zod'
import { sensitiveFetch } from './sensitive-actions.svelte.js'

const passwordResultSchema = apiContract.haiResultSchema(z.object({ reloginRequired: z.boolean() }))

export function updateProfile(payload: Record<string, unknown>): Promise<Response> {
  return sensitiveFetch('iam.profile.update', '/api/auth/profile', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
}

export function uploadProfileAvatar(file: File): Promise<Response> {
  const form = new FormData()
  form.set('file', file)
  return sensitiveFetch('iam.profile.avatar', '/api/auth/profile/avatar', { method: 'POST', body: form })
}

/** 改密只接受标准结果包络；异常响应不能被当作成功并清理会话。 */
export async function changeProfilePassword(input: { old_password: string, new_password: string, confirm_password: string }) {
  const response = await apiFetch('/api/auth/profile/password', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
  try {
    const parsed = passwordResultSchema.safeParse(await response.json())
    if (parsed.success && (response.ok || !parsed.data.success))
      return parsed.data
  }
  catch { /* 非 JSON 响应只显示安全通用提示，网络拒绝由调用方处理。 */ }
  return err(HaiCommonError.INTERNAL_ERROR, '')
}
