/**
 * @h-ai/storage — 浏览器端入口
 *
 * 不包含服务端 storage 单例（依赖 Node.js fs），
 * 仅导出配置 Schema、类型定义和前端客户端工具。
 * @module storage-index.browser
 */
export * from './client/index.js'
export * from './storage-config.js'
export * from './storage-types.js'
