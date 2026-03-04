/**
 * 创建支付订单 API
 */
import type { RequestHandler } from './$types'
import { kit } from '@h-ai/kit'
import { payment } from '@h-ai/payment'

export const POST: RequestHandler = async ({ request, locals }) => {
  const body = await request.json()
  const { provider, tradeType, outTradeNo, totalAmount, subject, notifyUrl } = body

  if (!provider || !outTradeNo || !totalAmount || !subject) {
    return kit.response.badRequest('Missing required fields: provider, outTradeNo, totalAmount, subject')
  }

  const result = await payment.createOrder({
    provider,
    tradeType: tradeType ?? 'JSAPI',
    outTradeNo,
    totalAmount,
    subject,
    notifyUrl: notifyUrl ?? `${new URL(request.url).origin}/api/v1/payment/notify/${provider}`,
  })

  if (!result.success) {
    return kit.response.internalError(result.error.message)
  }

  return kit.response.ok(result.data, locals.requestId)
}
