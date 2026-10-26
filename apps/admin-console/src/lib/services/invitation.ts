import { apiContract } from '@h-ai/api-contract'
import { z } from 'zod'
import { sensitiveFetch } from './sensitive-actions.svelte.js'

/** 只请求一次安全邀请，不在浏览器生成或显示初始密码。 */
export async function inviteUser(input: { username: string, email?: string, phone?: string, roles?: string[] }) {
  const response = await sensitiveFetch('iam.users.invite', '/api/iam/users/invite', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
  return apiContract.haiResultSchema(z.unknown()).parse(await response.json())
}
