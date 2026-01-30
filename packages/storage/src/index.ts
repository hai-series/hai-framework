/**
 * =============================================================================
 * @hai/storage - 存储模块
 * =============================================================================
 *
 * 提供统一的对象存储服务，支持 S3 协议（AWS S3、MinIO、阿里云 OSS 等）和本地文件系统。
 *
 * 主要功能：
 * - 文件上传下载
 * - 目录列表管理
 * - 签名 URL 生成（支持前端直传）
 *
 * @example
 * ```ts
 * import { storage } from '@hai/storage'
 *
 * // 初始化 S3 存储
 * await storage.init({
 *     type: 's3',
 *     bucket: 'my-bucket',
 *     region: 'us-east-1',
 *     accessKeyId: 'xxx',
 *     secretAccessKey: 'xxx'
 * })
 *
 * // 上传文件
 * await storage.file.put('test.txt', 'Hello World')
 *
 * // 生成签名 URL
 * const url = await storage.presign.getUrl('test.txt')
 *
 * // 关闭连接
 * await storage.close()
 * ```
 *
 * @packageDocumentation
 * =============================================================================
 */

// =============================================================================
// 自动注册 Schema 到 @hai/core
// =============================================================================
import { core } from '@hai/core'
import { StorageConfigSchema } from './storage-config.js'

// =============================================================================
// 主入口
// =============================================================================

export * from './storage-client.js'

// =============================================================================
// 类型和配置
// =============================================================================

// 配置 Schema 和常量
export * from './storage-config.js'

export * from './storage-main.js'

// =============================================================================
// 前端客户端
// =============================================================================

export * from './storage-types.js'

// 注册 storage 模块的配置 Schema
core.registerBuiltinSchema('storage', StorageConfigSchema)
