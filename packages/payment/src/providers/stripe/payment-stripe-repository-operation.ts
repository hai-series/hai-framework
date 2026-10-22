/** Stripe 操作的持久预留、结果和支付渠道标识；不是业务订单仓库。 */
import type { HaiResult } from '@h-ai/core'
import type { ReldbFunctions } from '@h-ai/reldb'

const STRIPE_OPERATION_TABLE = 'hai_payment_stripe_operations'
/** 比 Stripe API v1 最短 24 小时保留期留出一小时安全余量。 */
const SAFE_RETRY_SECONDS = 23 * 60 * 60

/**
 * 数据库中的幂等操作记录。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * function mayRetryUnknown(record: StripeOperationRecord): boolean {
 *   return record.result === null && record.canRetry
 *   // result=null 是结果未知，不能据此创建新幂等键；超窗必须人工核对渠道。
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

/**
 * SQL 读取结果；驱动可能将 JSON 返回对象或字符串。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const row: StripeOperationRow = {
 *   request_hash: 'canonical-request-digest', result_json: null,
 *   payment_intent: null, can_retry: 1,
 * }
 * const retryWindowOpen = row.can_retry === true || row.can_retry === 1 || row.can_retry === '1'
 * ```
 */
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
 * @internal
 * @example 模块内部上下文
 * ```ts
 * async function initializeOperations(db: ReldbFunctions) {
 *   const repository = new StripeOperationRepository(db)
 *   const initialized = await repository.initialize()
 *   if (!initialized.success) throw new Error(initialized.error.message)
 *   const operation = await repository.reserve('stable-account-mode-order-digest', 'canonical-request-digest')
 *   // 未确认结果保留预留；只能沿用原幂等键，不删除记录后盲重试。
 *   return { repository, operation }
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

  /**
   * 读取持久操作记录，以共享数据库时间计算安全重试窗口，不根据渠道 metadata 列表猜订单。
   * @param id - 按账户、模式、操作类型和业务标识生成的稳定摘要 ID。
   * @returns 已保留的记录；无记录时为 null，result 为 null 仅代表结果未知。
   * @throws 查询失败或持久结果 JSON 非法时抛错，由最近的 Provider 边界转为 HaiResult。
   * @example 模块内部上下文
   * ```ts
   * async function lookup(repository: StripeOperationRepository, operationId: string) {
   *   const record = await repository.load(operationId)
   *   if (record?.result === null && !record.canRetry) {
   *     throw new Error('Reconcile the channel outcome before retrying')
   *   }
   *   return record
   * }
   * ```
   */
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

  /**
   * 通过主键插入原子预留；并发节点只接受相同请求摘要，不覆盖已有参数或删除未知操作。
   * @param id - 所有节点复用的稳定操作 ID，也是渠道幂等键。
   * @param requestHash - 路径和排序后表单参数的规范摘要。
   * @returns 数据库中唯一的操作记录；已有 result 必须复用而非重新请求渠道。
   * @throws 预留/读取失败或同标识复用不同参数时抛错，由 Provider 转为操作失败。
   * @example 模块内部上下文
   * ```ts
   * async function reserveOnce(repository: StripeOperationRepository, id: string, requestHash: string) {
   *   const record = await repository.reserve(id, requestHash)
   *   // result=null 可能是渠道执行后回执丢失；重试仍须原 id 且 canRetry=true。
   *   if (record.result === null && !record.canRetry) throw new Error('Channel reconciliation required')
   *   return record
   * }
   * ```
   */
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

  /**
   * 以请求摘要和未完成状态作 CAS 发布渠道结果，再读取已持久化的唯一结果。
   * @param id - 已成功预留的稳定操作 ID。
   * @param requestHash - 与预留完全一致的规范请求摘要。
   * @param result - 已经由渠道结果 Schema 校验、允许持久化的最小结果。
   * @param paymentIntent - 已核对身份的 PaymentIntent；创建时尚未知可省略。
   * @returns 数据库确认的结果，可能由并发完成者先写入；调用者须再按结果 Schema 解析。
   * @throws 更新、重读或持久状态核对失败时抛错；不将未知状态伪装为成功。
   * @example 模块内部上下文
   * ```ts
   * async function persistConfirmed(repository: StripeOperationRepository, id: string, digest: string, confirmedMapping: unknown) {
   *   // 调用前渠道响应已校验；digest 来自首次预留，不能以新参数覆盖旧操作。
   *   return repository.complete(id, digest, confirmedMapping)
   * }
   * ```
   */
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

  /**
   * 只在订单映射已完成时首次补全或幂等确认同一 PaymentIntent，禁止迟到写覆盖渠道身份。
   * @param id - 已确认 Checkout Session 映射的订单操作 ID。
   * @param paymentIntent - 从该 Session 读取且通过订单/金额/币种核对的渠道标识。
   * @throws 写入失败、订单未完成或已绑定不同 PaymentIntent 时抛错，由 Provider 转为失败。
   * @example 模块内部上下文
   * ```ts
   * async function bindVerifiedIntent(repository: StripeOperationRepository, orderOperationId: string, verifiedIntentId: string) {
   *   await repository.rememberPaymentIntent(orderOperationId, verifiedIntentId)
   *   // 仅确认渠道身份映射，不代表宿主业务已履约。
   * }
   * ```
   */
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
