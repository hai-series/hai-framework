import { createKitClient } from '@h-ai/kit/client'
import { z } from 'zod'

const client = createKitClient()
const LogoutResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    loggedOut: z.literal(true),
  }),
})

/** 撤销管理员会话；服务端拒绝或响应不完整时保留页面供用户重试。 */
export async function logoutPartnerAdmin(): Promise<void> {
  const response = await client.apiFetch('/api/partners/admin/logout', { method: 'POST' })
  if (!response.ok || !LogoutResponseSchema.safeParse(await response.json()).success)
    throw new Error('Partner administrator logout failed')
}
