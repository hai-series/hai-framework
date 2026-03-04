/**
 * 支付回调通知 API
 *
 * 处理各支付渠道的异步通知。
 * 路由：POST /api/v1/payment/notify/:provider
 */
import type { RequestHandler } from './$types'
import { kit } from '@h-ai/kit'
import { payment } from '@h-ai/payment'

export const POST: RequestHandler = async ({ request, params }) => {
  const provider = params.provider

  if (!provider) {
    return kit.response.badRequest('Missing provider parameter')
  }

  const body = await request.text()
  const headers: Record<string, string> = {}
  request.headers.forEach((value, key) => {
    headers[key] = value
  })

  const result = await payment.handleNotify({
    provider,
    headers,
    body,
  })

  if (!result.success) {
    return new Response('FAIL', { status: 500 })
  }

  // 微信支付要求返回 JSON，支付宝要求返回 "success"
  if (provider === 'wechat') {
    return new Response(JSON.stringify({ code: 'SUCCESS', message: '' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response('success', { status: 200 })
}
