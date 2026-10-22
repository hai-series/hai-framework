/** Stripe 操作的持久预留、结果和支付渠道标识；不是业务订单仓库。 */
import type { HaiResult } from '@h-ai/core'
import type { ReldbFunctions } from '@h-ai/reldb'

const STRIPE_OPERATION_TABLE = 'hai_payment_stripe_operations'
/** 比 Stripe API v1 最短 24 小时保留期留出一小时安全余量。 */
const SAFE_RETRY_SECONDS = 23 * 60 * 60

/**
 * 数据库中的幂等操作记录。
 *
 * @example
 * ```ts
 * const record: StripeOperationRecord = {
 *   requestHash: 'request-digest', result: null, paymentIntent: null, canRetry: true,
 * }
 * ```
 */
export interface StripeOperationRecord {
  /** 首次预留的规范请求摘要，后续重试不得改变参数。 */
  requestHash: string
  /** 成功持久化的渠道结果；null 表示尚未确认，不能等同于未执行。 */
  result: unknown | null
  /** Checkout Session 对应的 PaymentIntent，查单时可原子补全。 */
  paymentIntent: string | null
  /** 由共享数据库时间计算的安全重试窗口。 */
  canRetry: boolean
}

/** SQL 读取结果；驱动可能将 JSON 返回对象或字符串。 */
interface StripeOperationRow {
  request_hash: string
  result_json: unknown | null
  payment_intent: string | null
  can_retry: number | string | boolean
}

/**
 * Stripe 幂等操作仓库，使用数据库主键预留和条件更新协调节点。
 *
 * @remarks 内部 helper 可抛错，最近的 Provider 边界负责转换为 HaiResult。
 * @example
 * ```ts
 * const repository = new StripeOperationRepository(reldb)
 * const initialized = await repository.initialize()
 * if (initialized.success) {
 *   const operation = await repository.reserve('hashed-operation-id', 'request-hash')
 *   // operation.result 为 null 时仍可能已在 Stripe 执行，必须沿用同一幂等键。
 * }
 * ```
 */
export class StripeOperationRepository {
  constructor(private readonly db: ReldbFunctions) {}

  /** 建表成功后才能发布 Provider；失败由 payment.init 返回。 */
  async initialize(): Promise<HaiResult<void>> {
    return this.db.ddl.createTable(STRIPE_OPERATION_TABLE, {
      id: { type: 'TEXT', primaryKey: true },
      request_hash: { type: 'TEXT', notNull: true },
      result_json: { type: 'JSON' },
      payment_intent: { type: 'TEXT' },
      created_at: { type: 'BIGINT', notNull: true },
    }, true)
  }

  /** 数据库时间避免不同应用节点的系统时钟影响安全重试窗口。 */
  private nowSql(): string {
    switch (this.db.config?.type) {
      case 'sqlite': return 'CAST(strftime(\'%s\', \'now\') AS INTEGER)'
      case 'postgresql': return 'CAST(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) AS BIGINT)'
      case 'mysql': return 'UNIX_TIMESTAMP()'
      default: throw new Error('Stripe operation repository requires an initialized database')
    }
  }

  /** 读取可信映射，不根据 metadata 列表猜测订单。 */
  async load(id: string): Promise<StripeOperationRecord | null> {
    const result = await this.db.sql.get<StripeOperationRow>(
      `SELECT request_hash, result_json, payment_intent,
       CASE WHEN created_at > (${this.nowSql()} - ${SAFE_RETRY_SECONDS}) THEN 1 ELSE 0 END AS can_retry
       FROM ${STRIPE_OPERATION_TABLE} WHERE id = ?`,
      [id],
    )
    if (!result.success)
      throw new Error('Failed to load Stripe operation', { cause: result.error })
    if (!result.data)
      return null
    const row = result.data
    return {
      requestHash: row.request_hash,
      result: typeof row.result_json === 'string' ? JSON.parse(row.result_json) : row.result_json,
      paymentIntent: row.payment_intent,
      canRetry: row.can_retry === true || row.can_retry === 1 || row.can_retry === '1',
    }
  }

  /** 原子预留；并发冲突只接受相同请求摘要，失败不删除未知操作。 */
  async reserve(id: string, requestHash: string): Promise<StripeOperationRecord> {
    let record = await this.load(id)
    if (!record) {
      const inserted = await this.db.sql.execute(
        `INSERT INTO ${STRIPE_OPERATION_TABLE} (id, request_hash, created_at) VALUES (?, ?, ${this.nowSql()})`,
        [id, requestHash],
      )
      record = await this.load(id)
      if (!record)
        throw new Error('Failed to reserve Stripe operation', { cause: inserted.success ? undefined : inserted.error })
    }
    if (record.requestHash !== requestHash)
      throw new Error('Stripe operation identifier was reused with different parameters')
    return record
  }

  /** CAS 发布结果；并发完成者必须读取数据库中唯一的最终结果。 */
  async complete(id: string, requestHash: string, result: unknown, paymentIntent?: string | null): Promise<unknown> {
    const updated = await this.db.sql.execute(
      `UPDATE ${STRIPE_OPERATION_TABLE} SET result_json = ?, payment_intent = ?
       WHERE id = ? AND request_hash = ? AND result_json IS NULL`,
      [JSON.stringify(result), paymentIntent ?? null, id, requestHash],
    )
    if (!updated.success)
      throw new Error('Failed to persist Stripe operation result', { cause: updated.error })
    const persisted = await this.load(id)
    if (!persisted || persisted.requestHash !== requestHash || persisted.result === null)
      throw new Error('Stripe operation result was not persisted')
    return persisted.result
  }

  /** 只允许首次补全或幂等确认同一个 PaymentIntent，禁止迟到写覆盖渠道身份。 */
  async rememberPaymentIntent(id: string, paymentIntent: string): Promise<void> {
    const result = await this.db.sql.execute(
      `UPDATE ${STRIPE_OPERATION_TABLE} SET payment_intent = ?
       WHERE id = ? AND result_json IS NOT NULL AND (payment_intent IS NULL OR payment_intent = ?)`,
      [paymentIntent, id, paymentIntent],
    )
    if (!result.success)
      throw new Error('Failed to persist Stripe PaymentIntent', { cause: result.error })
    const record = await this.load(id)
    if (!record || record.paymentIntent !== paymentIntent)
      throw new Error('Stripe PaymentIntent conflicts with the persisted mapping')
  }
}
