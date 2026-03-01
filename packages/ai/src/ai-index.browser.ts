/**
 * @h-ai/ai — 浏览器入口
 *
 * 仅导出浏览器可用的 API（配置/类型/HTTP 客户端），
 * 不包含 Node.js 专属的 LLM Provider、MCP Server 和 OpenAI SDK 依赖。
 * @module ai-index.browser
 */

export * from './ai-config.js'
export * from './ai-types.js'
export * from './client/index.js'
