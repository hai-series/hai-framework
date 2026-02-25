/**
 * @h-ai/storage — Node.js 服务端入口
 *
 * 导出完整的存储能力：
 * - 存储服务单例 `storage`（init / close / file / dir / presign）
 * - 配置 Schema 与错误码
 * - 公共类型定义
 * - 前端客户端工具（uploadWithPresignedUrl / downloadWithPresignedUrl 等）
 */
export * from './client/index.js'
export * from './storage-config.js'
export * from './storage-main.js'
export * from './storage-types.js'
