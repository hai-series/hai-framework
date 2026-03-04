/**
 * 查询支付订单 API
 *
 * 路由：GET /api/v1/payment/query/:orderNo
 */
import type { RequestHandler } from './$types'
import { kit } from '@h-ai/kit'
import { payment } from '@h-ai/payment'

export const GET: RequestHandler = async ({ params, url, locals }) => {
  const orderNo = params.orderNo
  const provider = url.searchParams.get('provider')

  if (!orderNo || !provider) {
    return kit.response.badRequest('Missing orderNo or provider parameter')
  }

  const result = await payment.queryOrder(provider, orderNo)

  if (!result.success) {
    return kit.response.internalError(result.error.message)
  }

  return kit.response.ok(result.data, locals.requestId)
}
