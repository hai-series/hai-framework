/** 内置 reldb Provider 共享契约，不属于 package.exports 公共 API。 */
import type { HaiResult } from '@h-ai/core'
import type { ReldbConfig } from '../reldb-config.js'
import type { CrudManager, DdlOperations, DmlOperations, TxManager } from '../reldb-types.js'

/**
 * 数据库 Provider 接口
 *
 * 内部使用，定义各数据库驱动需要实现的接口。
 * 每个数据库类型（SQLite、PostgreSQL、MySQL）都有对应的 Provider 实现。
 * @internal
 * @example
 * ```ts
 * // 模块内部上下文：由内置适配器工厂交付 provider，由模块入口传入已校验配置。
 * async function connectAndClose(provider: ReldbProvider, config: ReldbConfig) {
 *   const connected = await provider.connect(config)
 *   if (!connected.success)
 *     return connected
 *   const active = provider.isConnected()
 *   const closed = await provider.close()
 *   if (!closed.success)
 *     return closed
 *   return active
 * }
 * ```
 */
export interface ReldbProvider {
  /** DDL 操作（表结构管理） */
  readonly ddl: DdlOperations
  /** SQL 操作（数据查询和修改） */
  readonly sql: DmlOperations
  /** CRUD 管理器 */
  readonly crud: CrudManager
  /** 事务管理器 */
  readonly tx: TxManager
  /** 连接数据库 */
  connect: (config: ReldbConfig) => Promise<HaiResult<void>>
  /** 关闭连接 */
  close: () => Promise<HaiResult<void>>
  /** 是否已连接 */
  isConnected: () => boolean
}
