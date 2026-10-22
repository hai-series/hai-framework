/**
 * @h-ai/crypto — 传输加密关系数据库 key store
 *
 * 通过 `@h-ai/reldb` 保存客户端公钥，适用于需要跨节点共享状态的服务端部署。
 * @module crypto-transport-store-reldb
 */

import type { HaiError, HaiResult } from '@h-ai/core'
import type { DmlWithTxOperations, ReldbFunctions } from '@h-ai/reldb'
import type { TransportKeyStore } from '../crypto-transport-types.js'
import { cryptoM } from '../../crypto-i18n.js'
import { isValidSM2PublicKey } from '../../crypto-public-key.js'

const TRANSPORT_KEY_TABLE = 'hai_crypto_transport_client_keys'
const TRANSPORT_REQUEST_TABLE = 'hai_crypto_transport_requests'
const TRANSPORT_CAPACITY_TABLE = 'hai_crypto_transport_capacity'
const PRUNE_BATCH_SIZE = 100

/**
 * 关系数据库 registry 配置；连接由应用持有和关闭。
 * @example `createReldbTransportKeyStore({ reldb, ttlSeconds: 3600, maxClients: 10000 })`
 */
export interface CreateReldbTransportKeyStoreOptions {
  /** 已初始化的 `@h-ai/reldb` 实例。 */
  readonly reldb: ReldbFunctions
  /** 公钥 TTL，正整数秒且最大 2147483647；省略则不过期。 */
  readonly ttlSeconds?: number
  /** 所有节点共享的有效公钥容量，正安全整数，默认 10000；各节点必须一致。 */
  readonly maxClients?: number
}

/**
 * 带有界过期维护入口的数据库 registry。
 * @example `const removed = await registry.pruneExpired()`
 */
export interface ReldbTransportKeyStore extends TransportKeyStore {
  /**
   * 按数据库时钟最多删除 100 条过期公钥和 100 条过期 nonce，返回实际删除总数。
   * 不驱逐有效记录；建表或维护故障会 reject，之后允许重新调用。应用可以定期调度本方法。
   * @example `await registry.pruneExpired()`
   */
  pruneExpired: () => Promise<number>
}

function toOperationError(operation: string, error: HaiError): Error {
  // 不把驱动错误、连接串或公钥附加到可被 HTTP 适配器记录的异常。
  return Object.assign(new Error(cryptoM('crypto_transportKeyStoreOperationFailed')), { operation, code: error.code })
}

function unwrapResult<T>(operation: string, result: HaiResult<T>): T {
  if (result.success)
    return result.data
  throw toOperationError(operation, result.error)
}

/**
 * 创建基于 `@h-ai/reldb` 的传输 key store。
 *
 * 首次操作惰性建表，失败后可重试。注册在事务中锁定持久容量行再计数、写入，跨节点不会超额。
 * 每次注册自动清理一批过期数据；无注册流量时应用须定期调用 pruneExpired。时间使用数据库 epoch 毫秒。
 * 不关闭注入的数据库，不创建后台计时器。旧 timestamp 表需要停机迁移，不能提前删除有效 nonce。
 * @param options - 已初始化数据库、可选 TTL 和共享容量。
 * @returns registry；配置非法时同步抛出 TypeError，数据库操作故障通过对应 Promise reject。
 * @example
 * ```ts
 * const registry = createReldbTransportKeyStore({ reldb, ttlSeconds: 3600, maxClients: 10000 })
 * const clientId = await registry.register(clientPublicKey)
 * await registry.pruneExpired()
 * ```
 */
export function createReldbTransportKeyStore(options: CreateReldbTransportKeyStoreOptions): ReldbTransportKeyStore {
  const { ttlSeconds } = options
  if (ttlSeconds !== undefined && (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > 2_147_483_647))
    throw new TypeError(cryptoM('crypto_transportKeyStoreTtlInvalid'))
  const maxClients = options.maxClients ?? 10000
  if (!Number.isSafeInteger(maxClients) || maxClients <= 0)
    throw new TypeError(cryptoM('crypto_transportKeyStoreCapacityInvalid'))
  let ensureTablePromise: Promise<void> | null = null

  function nowSql(): string {
    switch (options.reldb.config?.type) {
      case 'postgresql': return 'CAST(FLOOR(EXTRACT(EPOCH FROM clock_timestamp()) * 1000) AS BIGINT)'
      case 'mysql': return 'CAST(FLOOR(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000) AS SIGNED)'
      default: return '(CAST(strftime(\'%s\', \'now\') AS INTEGER) * 1000 + CAST(substr(strftime(\'%f\', \'now\'), 4, 3) AS INTEGER))'
    }
  }

  function insertIfAbsent(table: string, columns: string, placeholders: string, key: string): string {
    return options.reldb.config?.type === 'mysql'
      ? `INSERT IGNORE INTO ${table} (${columns}) VALUES (${placeholders})`
      : `INSERT INTO ${table} (${columns}) VALUES (${placeholders}) ON CONFLICT (${key}) DO NOTHING`
  }

  async function ensureTable(): Promise<void> {
    if (!ensureTablePromise) {
      const initialization = (async () => {
        unwrapResult(
          'reldb.ddl.createTable',
          await options.reldb.ddl.createTable(TRANSPORT_KEY_TABLE, {
            client_id: { type: 'TEXT', primaryKey: true },
            public_key: { type: 'TEXT', notNull: true },
            created_at_ms: { type: 'BIGINT', notNull: true },
            expires_at_ms: { type: 'BIGINT' },
          }, true),
        )
        unwrapResult('reldb.ddl.createTable', await options.reldb.ddl.createTable(TRANSPORT_REQUEST_TABLE, {
          request_key: { type: 'TEXT', primaryKey: true },
          expires_at: { type: 'BIGINT', notNull: true },
        }, true))
        unwrapResult('reldb.ddl.createTable', await options.reldb.ddl.createTable(TRANSPORT_CAPACITY_TABLE, {
          id: { type: 'INTEGER', primaryKey: true },
          max_clients: { type: 'BIGINT', notNull: true },
          revision: { type: 'BIGINT', notNull: true },
        }, true))
        unwrapResult('reldb.sql.execute', await options.reldb.sql.execute(
          insertIfAbsent(TRANSPORT_CAPACITY_TABLE, 'id, max_clients, revision', '?, ?, ?', 'id'),
          [1, maxClients, 0],
        ))
        const capacity = unwrapResult('reldb.sql.get', await options.reldb.sql.get<{ max_clients: number | string | bigint }>(
          `SELECT max_clients FROM ${TRANSPORT_CAPACITY_TABLE} WHERE id = ?`,
          [1],
        ))
        if (!capacity || Number(capacity.max_clients) !== maxClients)
          throw new Error(cryptoM('crypto_transportKeyStoreCapacityMismatch'))
      })()
      ensureTablePromise = initialization
      try {
        await initialization
      }
      catch (error) {
        // 只复位自己持有的失败 promise；并发等待者得到同一次失败，后续调用重新初始化。
        if (ensureTablePromise === initialization)
          ensureTablePromise = null
        throw error
      }
    }

    return ensureTablePromise
  }

  async function deleteClientKey(clientId: string): Promise<void> {
    unwrapResult(
      'reldb.sql.execute',
      await options.reldb.sql.execute(
        `DELETE FROM ${TRANSPORT_KEY_TABLE} WHERE client_id = ?`,
        [clientId],
      ),
    )
  }

  async function withCapacityLock<T>(operation: (tx: DmlWithTxOperations) => Promise<T>): Promise<T> {
    await ensureTable()
    const result = await options.reldb.tx.wrap(async (tx) => {
      // 注册与维护使用同一持久行锁，避免 MySQL 两个清理批次互相争用行/间隙锁。
      const locked = unwrapResult('tx.execute', await tx.execute(
        `UPDATE ${TRANSPORT_CAPACITY_TABLE} SET revision = revision + 1 WHERE id = ? AND max_clients = ?`,
        [1, maxClients],
      ))
      if (locked.changes !== 1)
        throw new Error(cryptoM('crypto_transportKeyStoreCapacityMismatch'))
      return operation(tx)
    })
    return unwrapResult('reldb.tx.wrap', result)
  }

  async function pruneRows(tx: DmlWithTxOperations): Promise<number> {
    let removed = 0
    for (const [table, id, expiry] of [[TRANSPORT_KEY_TABLE, 'client_id', 'expires_at_ms'], [TRANSPORT_REQUEST_TABLE, 'request_key', 'expires_at']]) {
      // 内外层都检查过期条件；派生表兼容 MySQL 同表删除，并发维护不按旧快照删除有效行。
      removed += unwrapResult('tx.execute', await tx.execute(
        `DELETE FROM ${table} WHERE ${expiry} <= ${nowSql()} AND ${id} IN (SELECT ${id} FROM (SELECT ${id} FROM ${table} WHERE ${expiry} <= ${nowSql()} LIMIT ${PRUNE_BATCH_SIZE}) AS expired)`,
      )).changes
    }
    return removed
  }

  async function pruneExpired(): Promise<number> {
    return withCapacityLock(pruneRows)
  }

  return {
    get stateScope() { return options.reldb.config?.type && options.reldb.config.type !== 'sqlite' ? 'shared' : 'local' },
    async register(publicKey) {
      if (!isValidSM2PublicKey(publicKey))
        throw new TypeError(cryptoM('crypto_sm2PublicKeyInvalid'))
      const clientId = `c_${globalThis.crypto.randomUUID()}`
      return withCapacityLock(async (tx) => {
        await pruneRows(tx)
        const count = unwrapResult('tx.get', await tx.get<{ total: number | string | bigint }>(
          `SELECT COUNT(*) AS total FROM ${TRANSPORT_KEY_TABLE} WHERE expires_at_ms IS NULL OR expires_at_ms > ${nowSql()}`,
        ))
        const total = Number(count?.total)
        if (!Number.isSafeInteger(total) || total < 0)
          throw new Error(cryptoM('crypto_transportKeyStoreOperationFailed'))
        if (total >= maxClients)
          throw new Error(cryptoM('crypto_transportKeyStoreCapacityReached'))
        const inserted = unwrapResult('tx.execute', await tx.execute(
          `INSERT INTO ${TRANSPORT_KEY_TABLE} (client_id, public_key, created_at_ms, expires_at_ms) VALUES (?, ?, ${nowSql()}, ${ttlSeconds === undefined ? 'NULL' : `${nowSql()} + ?`})`,
          ttlSeconds === undefined ? [clientId, publicKey] : [clientId, publicKey, ttlSeconds * 1000],
        ))
        if (inserted.changes !== 1)
          throw new Error(cryptoM('crypto_transportClientNotRegistered'))
        return clientId
      })
    },

    async get(clientId) {
      await ensureTable()

      const row = unwrapResult(
        'reldb.sql.get',
        await options.reldb.sql.get<{ public_key: string }>(
          `SELECT public_key FROM ${TRANSPORT_KEY_TABLE} WHERE client_id = ? AND (expires_at_ms IS NULL OR expires_at_ms > ${nowSql()})`,
          [clientId],
        ),
      )

      return row?.public_key
    },

    async claimRequest(clientId, requestId, expiresAt) {
      await ensureTable()
      if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now())
        return false
      const insertSql = options.reldb.config?.type === 'mysql'
        ? `INSERT IGNORE INTO ${TRANSPORT_REQUEST_TABLE} (request_key, expires_at) VALUES (?, ?)`
        : `INSERT INTO ${TRANSPORT_REQUEST_TABLE} (request_key, expires_at) VALUES (?, ?) ON CONFLICT (request_key) DO NOTHING`
      const inserted = unwrapResult('reldb.sql.execute', await options.reldb.sql.execute(
        insertSql,
        [JSON.stringify([clientId, requestId]), expiresAt],
      ))
      // 唯一主键约束决定胜者；连接、权限和其它 SQL 故障必须 fail-closed。
      return inserted.changes === 1
    },

    async delete(clientId) {
      await ensureTable()
      await deleteClientKey(clientId)
    },
    pruneExpired,
  }
}
