/** 个人资料请求复用统一鉴别动作，页面只处理表单与显示。 */
import { apiFetch } from '$lib/utils/api'
import { sensitiveFetch } from './sensitive-actions.svelte.js'

export function updateProfile(payload: Record<string, unknown>): Promise<Response> {
  return sensitiveFetch('iam.profile.update', '/api/auth/profile', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
}

export function uploadProfileAvatar(file: File): Promise<Response> {
  const form = new FormData()
  form.set('file', file)
  return sensitiveFetch('iam.profile.avatar', '/api/auth/profile/avatar', { method: 'POST', body: form })
}

export function changeProfilePassword(input: { old_password: string, new_password: string, confirm_password: string }): Promise<Response> {
  return apiFetch('/api/auth/profile/password', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
}
