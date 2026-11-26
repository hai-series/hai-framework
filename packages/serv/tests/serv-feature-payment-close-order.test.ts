import type { PaymentCloseOrderProcedureDeps, ServContext } from '../src/index.js'
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'
import { core, HaiCommonError } from '@h-ai/core'
import { describe, expect, it, vi } from 'vitest'
import { serv } from '../src/index.js'

const logger = core.logger.child({ module: 'serv-test', scope: 'feature-payment' })

function setup(session?: ServContext['session']) {
  const closeOrder = vi.fn<PaymentCloseOrderProcedureDeps['payment']['closeOrder']>(async () => core.ok(undefined))
  const authorizeClose = vi.fn<PaymentCloseOrderProcedureDeps['authorizeClose']>((input, context) => {
    if (context.session.userId !== 'merchant-owner' || input.orderNo !== 'order-1')
      return core.err(HaiCommonError.NOT_FOUND, 'Order not found')
    return core.ok({ provider: 'stripe', orderNo: 'order-1' })
  })
  const contract = apiContract.create({ payment: apiContract.extensions.payment })
  const app = serv.createApp({
    contract,
    procedures: {
      payment: serv.createPaymentCloseOrderProcedures({
        payment: { closeOrder },
        authorizeClose,
      }),
    },
    createContext: ({ request }): ServContext => ({
      request,
      requestId: 'payment-test',
      locale: 'en-US',
      logger,
      session,
    }),
    http: { openapi: false, docs: false },
  })
  const client = apiClient.create(contract)
  return {
    app,
    client,
    closeOrder,
    authorizeClose,
  }
}

async function withClient<T>(fixture: ReturnType<typeof setup>, callback: (client: ReturnType<typeof setup>['client']) => Promise<T>) {
  const { client, app } = fixture
  const started = await client.init({
    baseUrl: 'https://payment.test/api/v1',
    fetch: serv.toFetch(app),
  })
  expect(started.success).toBe(true)
  try {
    return await callback(client)
  }
  finally {
    await client.close()
  }
}

describe('payment order closing HTTP', () => {
  it('closes only an owned merchant order with a matching provider and preserves provider failures', async () => {
    const fixture = setup({ userId: 'merchant-owner', roles: [], permissions: [] })
    await withClient(fixture, async ({ payment }) => {
      expect(await payment.orders.close({ provider: 'wechat', orderNo: 'order-1' })).toMatchObject({
        success: false,
        error: { code: HaiCommonError.FORBIDDEN.code },
      })
      expect(await payment.orders.close({ provider: 'stripe', orderNo: 'other-order' })).toMatchObject({
        success: false,
        error: { code: HaiCommonError.NOT_FOUND.code },
      })
      fixture.authorizeClose.mockReturnValueOnce(core.ok({ provider: 'stripe', orderNo: 'different-order' }))
      expect(await payment.orders.close({ provider: 'stripe', orderNo: 'order-1' })).toMatchObject({
        success: false,
        error: { code: HaiCommonError.FORBIDDEN.code },
      })
      expect(fixture.closeOrder).not.toHaveBeenCalled()
      expect(await payment.orders.close({ provider: 'stripe', orderNo: 'order-1' })).toEqual({ success: true, data: undefined })
      expect(fixture.closeOrder).toHaveBeenCalledExactlyOnceWith('stripe', 'order-1')

      fixture.closeOrder.mockResolvedValueOnce(core.err(HaiCommonError.CONFLICT, 'Order is already paid'))
      expect(await payment.orders.close({ provider: 'stripe', orderNo: 'order-1' })).toMatchObject({
        success: false,
        error: { code: HaiCommonError.CONFLICT.code },
      })
    })
  })

  it('denies anonymous callers before order authorization', async () => {
    const fixture = setup()
    await withClient(fixture, async ({ payment }) => {
      expect(await payment.orders.close({ provider: 'stripe', orderNo: 'order-1' })).toMatchObject({
        success: false,
        error: { code: HaiCommonError.UNAUTHORIZED.code },
      })
    })
    expect(fixture.authorizeClose).not.toHaveBeenCalled()
    expect(fixture.closeOrder).not.toHaveBeenCalled()
  })
})
