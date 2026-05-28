/**
 * @h-ai/crypto — 传输加密关系数据库 key store
 *
 * 通过 `@h-ai/reldb` 保存客户端公钥，适用于需要跨节点共享状态的服务端部署。
 * @module crypto-transport-store-reldb
 */

import type { HaiError, HaiResult } from '@h-ai/core'
import type { ReldbFunctions } from '@h-ai/reldb'
import type { TransportKeyStore } from '../crypto-transport-types.js'

const TRANSPORT_KEY_TABLE = 'hai_crypto_transport_client_keys'

interface TransportClientKeyRow {
  readonly public_key: string
  readonly expires_at: string | null
}

/** 创建关系数据库版传输 key store 的配置。 */
export interface CreateReldbTransportKeyStoreOptions {
  /** 已初始化的 `@h-ai/reldb` 实例。 */
  readonly reldb: ReldbFunctions
  /** 客户端公钥的 TTL（秒）；未传则保持不过期。 */
  readonly ttlSeconds?: number
}

function normalizeTtlSeconds(ttlSeconds: number | undefined): number | undefined {
  if (ttlSeconds === undefined || !Number.isFinite(ttlSeconds) || ttlSeconds <= 0)
    return undefined
  return Math.floor(ttlSeconds)
}

function createClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return `c_${crypto.randomUUID()}`

  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`
}

function toOperationError(operation: string, error: HaiError): Error {
  const wrapped = new Error(`${operation} failed: ${error.message}`, { cause: error }) as Error & { code?: string | number }
  wrapped.code = error.code
  return wrapped
}

function unwrapResult<T>(operation: string, result: HaiResult<T>): T {
  if (result.success)
    return result.data
  throw toOperationError(operation, result.error)
}

/**
 * 创建基于 `@h-ai/reldb` 的传输 key store。
 *
 * 首次读写时会自动创建 `hai_crypto_transport_client_keys` 表。
 */
export function createReldbTransportKeyStore(options: CreateReldbTransportKeyStoreOptions): TransportKeyStore {
  const ttlSeconds = normalizeTtlSeconds(options.ttlSeconds)
  let ensureTablePromise: Promise<void> | null = null

  async function ensureTable(): Promise<void> {
    if (!ensureTablePromise) {
      ensureTablePromise = (async () => {
        unwrapResult(
          'reldb.ddl.createTable',
          await options.reldb.ddl.createTable(TRANSPORT_KEY_TABLE, {
            client_id: { type: 'TEXT', primaryKey: true },
            public_key: { type: 'TEXT', notNull: true },
            created_at: { type: 'TIMESTAMP', notNull: true },
            expires_at: { type: 'TIMESTAMP' },
          }, true),
        )
      })()
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

  return {
    async register(publicKey) {
      await ensureTable()

      const clientId = createClientId()
      const createdAt = new Date().toISOString()
      const expiresAt = ttlSeconds === undefined
        ? null
        : new Date(Date.now() + ttlSeconds * 1000).toISOString()

      unwrapResult(
        'reldb.sql.execute',
        await options.reldb.sql.execute(
          `INSERT INTO ${TRANSPORT_KEY_TABLE} (client_id, public_key, created_at, expires_at) VALUES (?, ?, ?, ?)`,
          [clientId, publicKey, createdAt, expiresAt],
        ),
      )

      return clientId
    },

    async get(clientId) {
      await ensureTable()

      const row = unwrapResult(
        'reldb.sql.get',
        await options.reldb.sql.get<TransportClientKeyRow>(
          `SELECT public_key, expires_at FROM ${TRANSPORT_KEY_TABLE} WHERE client_id = ?`,
          [clientId],
        ),
      )

      if (!row)
        return undefined

      if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) {
        await deleteClientKey(clientId)
        return undefined
      }

      return row.public_key
    },

    async delete(clientId) {
      await ensureTable()
      await deleteClientKey(clientId)
    },
  }
}
