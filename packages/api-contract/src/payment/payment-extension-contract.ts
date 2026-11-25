import { HaiVoidResultSchema } from '../common/result-schemas.js'
import { route } from '../common/route.js'
import { PaymentCloseOrderInputSchema } from './payment-schemas.js'

/**
 * 宿主按需开启的支付关单接口。
 * @example
 * ```ts
 * import { apiContract } from '@h-ai/api-contract'
 *
 * const contract = apiContract.create({ payment: apiContract.extensions.payment })
 * ```
 */
export const paymentExtensionContract = {
  orders: {
    close: route({
      method: 'POST',
      path: '/payment/orders/{orderNo}/close',
      operationId: 'payment.orders.close',
      summary: 'Close an unpaid payment order',
      tags: ['payment', 'orders'],
    })
      .input(PaymentCloseOrderInputSchema)
      .output(HaiVoidResultSchema),
  },
}

/**
 * 供应用组合的支付扩展契约。
 * @example
 * ```ts
 * import { type PaymentExtensionContract, apiContract } from '@h-ai/api-contract'
 *
 * const contract: PaymentExtensionContract = apiContract.extensions.payment
 * ```
 */
export type PaymentExtensionContract = typeof paymentExtensionContract
