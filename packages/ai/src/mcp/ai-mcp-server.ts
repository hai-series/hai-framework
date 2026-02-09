/**
 * =============================================================================
 * @hai/ai - MCP Server
 * =============================================================================
 *
 * 提供 MCP 服务器创建与传输层支持。
 *
 * 基于 `@modelcontextprotocol/sdk` 封装，提供便捷的服务器创建方式，
 * 并统一导出常用的传输层实现，避免使用者直接引用 SDK 深层路径。
 *
 * 支持：
 * - Streamable HTTP 传输（推荐，适合 Web 服务）
 * - SSE 传输（兼容旧客户端）
 * - Stdio 传输（适合 CLI 工具）
 *
 * @example
 * ```ts
 * import { ai, StreamableHTTPServerTransport } from '@hai/ai'
 * import { z } from 'zod'
 * import { randomUUID } from 'node:crypto'
 *
 * // 1. 创建 MCP 服务器
 * const mcp = ai.server.create({ name: 'my-app' })
 *
 * // 2. 注册工具
 * mcp.registerTool('search', {
 *     description: '搜索',
 *     inputSchema: { query: z.string() },
 * }, async ({ query }) => ({
 *     content: [{ type: 'text', text: `Results for ${query}` }]
 * }))
 *
 * // 3. 注册资源
 * mcp.registerResource('config', 'config://app', {
 *     description: '应用配置',
 * }, async (uri) => ({
 *     contents: [{ uri: uri.href, text: '{}' }]
 * }))
 *
 * // 4. 注册提示词
 * mcp.registerPrompt('summarize', {
 *     description: '总结文本',
 *     argsSchema: { text: z.string() },
 * }, async ({ text }) => ({
 *     messages: [{ role: 'user', content: { type: 'text', text } }]
 * }))
 *
 * // 5. 连接 HTTP 传输层（以 Express 为例）
 * app.post('/mcp', async (req, res) => {
 *     const transport = new StreamableHTTPServerTransport({
 *         sessionIdGenerator: () => randomUUID(),
 *     })
 *     await mcp.connect(transport)
 *     await transport.handleRequest(req, res, req.body)
 * })
 * ```
 *
 * @module server/ai-server-main
 * =============================================================================
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import type { McpServerOptions } from '../ai-types.js'

// =============================================================================
// 核心类导出
// =============================================================================

/**
 * MCP Server 类
 *
 * 来自 `@modelcontextprotocol/sdk` 的高层 API，
 * 提供工具、资源、提示词的注册与协议处理。
 *
 * @see https://modelcontextprotocol.io/docs
 */
export { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

// =============================================================================
// 传输层导出
// =============================================================================

/**
 * SSE 传输层
 *
 * 基于 Server-Sent Events 的传输，
 * 适用于需要 SSE 兼容的旧版客户端。
 */
export { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'

/**
 * Stdio 传输层
 *
 * 基于标准输入输出的传输，
 * 适用于 CLI 工具和进程间通信。
 */
export { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

/**
 * Streamable HTTP 传输层（推荐）
 *
 * 支持 HTTP POST 请求处理 MCP 协议消息，
 * 适用于 Web 应用场景。
 */
export { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'

// =============================================================================
// 便捷工厂
// =============================================================================

/**
 * 创建 MCP 服务器
 *
 * 基于 `@modelcontextprotocol/sdk` 的 McpServer 封装，
 * 提供合理的默认值。
 *
 * @param options - 服务器选项
 * @returns McpServer 实例
 *
 * @example
 * ```ts
 * import { ai } from '@hai/ai'
 * import { z } from 'zod'
 *
 * const mcp = ai.server.create({ name: 'my-app', version: '2.0.0' })
 *
 * mcp.registerTool('echo', {
 *     description: '回声',
 *     inputSchema: { message: z.string() },
 * }, async ({ message }) => ({
 *     content: [{ type: 'text', text: message }]
 * }))
 * ```
 */
export function createMcpServer(options: McpServerOptions): McpServer {
  return new McpServer(
    { name: options.name, version: options.version ?? '1.0.0' },
  )
}
