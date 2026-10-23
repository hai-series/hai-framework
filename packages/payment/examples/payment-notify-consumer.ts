/**
 * 支付通知业务消费者示例；这些 example_* 表属于示例应用，不由 payment 自动创建。
 *
 * 仅将已经 payment.handleNotify 验签成功的结果传入；多节点须共用同一数据库。
 * 数据库内事务保证订单、事件记录和 outbox 原子提交。外部发货/短信等不能纳入此事务，
 * outbox 投递者应携带稳定 outbox id 作为业务幂等键，不能宣称跨系统恰好一次。
 */
import type { HaiResult } from '@h-ai/core'
import type { PaymentNotifyResult } from '@h-ai/payment'
import type { ReldbFunctions } from '@h-ai/reldb'
import { ok } from '@h-ai/core'

/**
 * 初始化示例应用的订单、通知去重和待履约事件表，生产应用应使用自己的迁移机制。
 * @param db - 已初始化的共享数据库
 * @returns 建表结果
 * @example const ready = await initializeExamplePaymentStore(reldb)
 */
export async function initializeExamplePaymentStore(db: ReldbFunctions): Promise<HaiResult<void>> {
  const orders = await db.ddl.createTable('example_payment_orders', {
    id: { type: 'TEXT', primaryKey: true },
    provider: { type: 'TEXT', notNull: true },
    merchant_scope: { type: 'TEXT', notNull: true },
    amount: { type: 'INTEGER', notNull: true },
    currency: { type: 'TEXT', notNull: true },
    status: { type: 'TEXT', notNull: true },
    transaction_id: { type: 'TEXT' },
  }, true)
  if (!orders.success)
    return orders
  const events = await db.ddl.createTable('example_payment_events', {
    id: { type: 'TEXT', primaryKey: true },
    order_no: { type: 'TEXT', notNull: true },
    transaction_id: { type: 'TEXT', notNull: true },
  }, true)
  if (!events.success)
    return events
  return db.ddl.createTable('example_payment_outbox', {
    id: { type: 'TEXT', primaryKey: true },
    order_no: { type: 'TEXT', notNull: true },
    payload: { type: 'TEXT', notNull: true },
  }, true)
}

/**
 * 只读取用于核对和幂等判断的业务订单字段。
 * @example
 * const order: ExamplePaymentOrder = {
 *   provider: 'wechat', merchant_scope: 'configured-mch-id', amount: 100,
 *   currency: 'CNY', status: 'pending', transaction_id: null,
 * }
 */
interface ExamplePaymentOrder {
  /** 创建业务订单时保存的渠道。 */
  provider: string
  /** 可信配置确定的商户命名空间。 */
  merchant_scope: string
  /** 原始订单金额，单位为分。 */
  amount: number
  /** 原始订单币种。 */
  currency: string
  /** 业务状态；仅 pending 可首次确认付款。 */
  status: string
  /** 首次确认付款时绑定的渠道交易号。 */
  transaction_id: string | null
}

/**
 * 核对业务订单后幂等写入已支付状态与履约 outbox；不会直接调用外部服务。
 *
 * 本例只消费 paid，其它状态由应用自己的状态机处理。业务订单号不得删除后复用，
 * 支付配置的商户命名空间须与该业务订单库固定对应；不能切换商户后复用旧订单号。
 * @param db - 所有节点共用的数据库
 * @param provider - 验签时实际选择的渠道名
 * @param merchantScope - 由可信服务端配置确定的商户命名空间，不接受请求参数覆盖
 * @param notify - 仅接收 Provider 验签成功结果，不能直接传客户端 JSON
 * @returns applied 表示事务首次提交，duplicate 为已处理，ignored 为非 paid 事件
 * @example
 * const verified = await payment.handleNotify('wechat', request)
 * if (verified.success) {
 *   const applied = await consumePaymentNotification(reldb, 'wechat', configuredMchId, verified.data)
 *   // applied.success 后才能响应渠道成功；数据库失败应让渠道重试。
 * }
 */
export async function consumePaymentNotification(
  db: ReldbFunctions,
  provider: string,
  merchantScope: string,
  notify: PaymentNotifyResult,
): Promise<HaiResult<'applied' | 'duplicate' | 'ignored'>> {
  if (notify.status !== 'paid')
    return ok('ignored')
  return db.tx.wrap(async (tx) => {
    // 先执行带完整业务条件的 CAS，避免读后写竞态；订单和金额来自共享业务库。
    const updated = await tx.execute(
      `UPDATE example_payment_orders SET status = ?, transaction_id = ?
       WHERE id = ? AND provider = ? AND merchant_scope = ? AND amount = ? AND currency = ?
       AND status = ? AND transaction_id IS NULL`,
      ['paid', notify.transactionId, notify.orderNo, provider, merchantScope, notify.amount, notify.currency, 'pending'],
    )
    if (!updated.success)
      throw new Error('Failed to update payment order', { cause: updated.error })
    if (updated.data.changes === 0) {
      const existing = await tx.get<ExamplePaymentOrder>(
        'SELECT provider, merchant_scope, amount, currency, status, transaction_id FROM example_payment_orders WHERE id = ?',
        [notify.orderNo],
      )
      if (!existing.success)
        throw new Error('Failed to read payment order', { cause: existing.error })
      const order = existing.data
      if (order?.provider === provider && order.merchant_scope === merchantScope && order.amount === notify.amount && order.currency === notify.currency
        && ['paid', 'refunded'].includes(order.status) && order.transaction_id === notify.transactionId) {
        return 'duplicate' as const
      }
      throw new Error('Payment notification does not match a payable business order')
    }

    const event = await tx.execute(
      'INSERT INTO example_payment_events (id, order_no, transaction_id) VALUES (?, ?, ?)',
      [JSON.stringify([provider, merchantScope, notify.eventId]), notify.orderNo, notify.transactionId],
    )
    if (!event.success)
      throw new Error('Failed to persist payment notification', { cause: event.error })
    const outbox = await tx.execute(
      'INSERT INTO example_payment_outbox (id, order_no, payload) VALUES (?, ?, ?)',
      [JSON.stringify([provider, merchantScope, notify.orderNo, 'paid']), notify.orderNo, JSON.stringify({ orderNo: notify.orderNo, transactionId: notify.transactionId })],
    )
    if (!outbox.success)
      throw new Error('Failed to persist payment fulfillment outbox', { cause: outbox.error })
    return 'applied' as const
  })
}
