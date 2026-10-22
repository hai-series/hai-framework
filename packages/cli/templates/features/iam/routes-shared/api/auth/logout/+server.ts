/**
 * 登出 API
 */
import type { RequestHandler } from './$types'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

export const POST: RequestHandler = kit.handler(async ({ cookies, locals }) => {
  const token = cookies.get('session_token')
  try {
    if (token) {
      const result = await iam.auth.logout(token)
      if (!result.success)
        return kit.response.fromError(result.error, locals.requestId)
    }
    return kit.response.ok({ authenticated: false }, locals.requestId)
  }
  finally {
    // 本地Cookie清理不代表服务端撤销成功，失败响应必须保留。
    cookies.delete('session_token', { path: '/' })
  }
})
