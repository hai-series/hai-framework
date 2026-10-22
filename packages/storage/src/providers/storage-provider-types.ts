/** 内置 storage Provider 共享契约，不属于 package.exports 公共 API。 */
import type { HaiResult } from '@h-ai/core'
import type { StorageConfig } from '../storage-config.js'
import type { DirOperations, FileOperations, PresignOperations } from '../storage-types.js'

/**
 * 存储 Provider 接口
 *
 * 由各具体存储实现（S3、Local）实现此接口。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * async function inspect(provider: StorageProvider, config: StorageConfig) {
 *   const connected = await provider.connect(config)
 *   if (!connected.success) return connected
 *   try { return await provider.dir.list({ maxKeys: 1 }) } finally { await provider.close() }
 * }
 * ```
 */
export interface StorageProvider {
  /** Provider 名称标识（如 's3'、'local'） */
  readonly name: string

  /**
   * 建立与存储服务的连接
   *
   * @param config - 经 Schema 校验后的完整配置
   * @returns 连接结果
   */
  connect: (config: StorageConfig) => Promise<HaiResult<void>>

  /** 关闭连接并释放资源 */
  close: () => Promise<void>

  /** 检查是否已连接 */
  isConnected: () => boolean

  /** 文件操作接口 */
  readonly file: FileOperations

  /** 目录操作接口 */
  readonly dir: DirOperations

  /** 签名 URL 操作接口 */
  readonly presign: PresignOperations
}
