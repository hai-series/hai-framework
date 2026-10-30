/** 创建支付参数 API；渠道、场景与 openid 必须通过显式校验，禁止回落到其它支付模式。 */
import type { RequestHandler } from './$types'
import { base } from '$app/paths'
import { kit } from '@h-ai/kit'
import { payment } from '@h-ai/payment'
import { z } from 'zod'

/** 本模板的业务字段；服务端仍需从可信订单重新核对金额、描述、订单号和所属用户。 */
const CreatePaymentSchema = z.object({
  provider: z.enum(['wechat', 'alipay', 'stripe']),
  tradeType: z.enum(['jsapi', 'h5']),
  outTradeNo: z.string().min(1),
  totalAmount: z.number().int().positive(),
  subject: z.string().min(1),
  userId: z.string().trim().min(1).max(128).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  notifyUrl: z.url({ protocol: /^https?$/ }).optional(),
}).strict().refine(input => input.tradeType === (input.provider === 'wechat' ? 'jsapi' : 'h5'), { path: ['tradeType'] }).refine(input => input.provider !== 'wechat' || input.userId !== undefined, { path: ['userId'] })

export const POST: RequestHandler = async ({ request, locals }) => {
  const { provider, tradeType, outTradeNo, totalAmount, subject, notifyUrl, userId, metadata } = await kit.validate.body(request, CreatePaymentSchema)
  const result = await payment.createOrder(provider, {
    orderNo: outTradeNo,
    amount: totalAmount,
    description: subject,
    tradeType,
    userId,
    metadata,
    notifyUrl: notifyUrl ?? `${new URL(request.url).origin}${base}/api/v1/payment/notify/${provider}`,
  })
  if (!result.success)
    return kit.response.fromError(result.error, locals.requestId)
  return kit.response.ok(result.data, locals.requestId)
}
