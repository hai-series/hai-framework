import type { PaymentCloseOrderInput } from '@h-ai/api-contract'
import type { HaiResult } from '@h-ai/core'
import type { PaymentFunctions } from '@h-ai/payment'
import type { ServContext } from '../serv-context.js'
import type { AuthenticatedServContext } from '../serv-router.js'
import { apiContract } from '@h-ai/api-contract'
import { core, HaiCommonError } from '@h-ai/core'
import { servM } from '../serv-i18n.js'
import { implement } from '../serv-router.js'

/**
 * 支付关单使用的已初始化 Payment 与宿主订单授权。
 * @example
 * ```ts
 * import type { PaymentCloseOrderProcedureDeps } from '@h-ai/serv'
 * import { payment } from '@h-ai/payment'
 *
 * function paymentDeps(authorizeClose: PaymentCloseOrderProcedureDeps['authorizeClose']): PaymentCloseOrderProcedureDeps {
 *   return { payment, authorizeClose }
 * }
 * ```
 */
export interface PaymentCloseOrderProcedureDeps {
  readonly payment: Pick<PaymentFunctions, 'closeOrder'>
  /** 核验当前会话能否操作该订单，成功时返回可信业务记录中的渠道和商户订单号。 */
  readonly authorizeClose: (
    input: PaymentCloseOrderInput,
    context: AuthenticatedServContext,
  ) => HaiResult<PaymentCloseOrderInput> | Promise<HaiResult<PaymentCloseOrderInput>>
}

/**
 * 创建由宿主订单策略授权的关单 procedure。校验客户端声明的渠道和订单号后，使用可信记录调用支付渠道。
 * @example
 * ```ts
 * import type { PaymentCloseOrderProcedureDeps } from '@h-ai/serv'
 * import { apiContract } from '@h-ai/api-contract'
 * import { serv } from '@h-ai/serv'
 *
 * function createPaymentApp(deps: PaymentCloseOrderProcedureDeps) {
 *   return serv.createApp({
 *     contract: apiContract.extensions.payment,
 *     procedures: serv.createPaymentCloseOrderProcedures(deps),
 *   })
 * }
 * ```
 */
export function createPaymentCloseOrderProcedures(deps: PaymentCloseOrderProcedureDeps) {
  return implement(apiContract.extensions.payment)
    .context<ServContext>()
    .route('orders.close')
    .auth()
    .handle(async ({ input, context }) => {
      const authorized = await deps.authorizeClose(input, context)
      if (!authorized.success)
        return authorized

      const { provider, orderNo } = authorized.data
      if (provider !== input.provider || orderNo !== input.orderNo)
        return core.err(HaiCommonError.FORBIDDEN, servM('serv_errorForbidden', { locale: context.locale }))

      return deps.payment.closeOrder(provider, orderNo)
    })
    .build()
}
