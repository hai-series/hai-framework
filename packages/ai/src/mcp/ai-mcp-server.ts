/**
 * @h-ai/ai — MCP Server 创建与传输层
 *
 * 基于 `@modelcontextprotocol/sdk` 封装，提供便捷的 MCP 服务器创建。
 */

import type { McpServerOptions } from './ai-mcp-types.js'

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

// ─── 核心类导出 ───

export { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

// ─── 传输层导出 ───

/** SSE 传输层 */
export { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'

/** Stdio 传输层 */
export { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

/** Streamable HTTP 传输层（推荐） */
export { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'

// ─── 便捷工厂 ───

/**
 * 创建 MCP 服务器
 *
 * @param options - 服务器选项（名称、版本）
 * @returns McpServer 实例
 *
 * @example
 * ```ts
 * import { createMcpServer, StdioServerTransport } from '@h-ai/ai'
 *
 * const server = createMcpServer({ name: 'my-server', version: '1.0.0' })
 * // 注册工具 / 资源 ...
 * const transport = new StdioServerTransport()
 * await server.connect(transport)
 * ```
 */
export function createMcpServer(options: McpServerOptions): McpServer {
  return new McpServer(
    { name: options.name, version: options.version ?? '1.0.0' },
  )
}
