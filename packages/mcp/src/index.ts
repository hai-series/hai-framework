/**
 * =============================================================================
 * @hai/mcp - 主入口
 * =============================================================================
 * MCP 模块，提供:
 * - MCP 服务端
 * - MCP 客户端
 * - 类型定义
 * =============================================================================
 */

// 类型
export type {
  MCPClientInfo,
  MCPContext,
  MCPError,
  MCPPrompt,
  MCPPromptArgument,
  MCPPromptContent,
  MCPPromptMessage,
  MCPPromptOptions,
  MCPResource,
  MCPResourceContent,
  MCPResourceOptions,
  MCPServerCapabilities,
  MCPServerInfo,
  MCPToolDefinition,
  MCPToolHandler,
  MCPToolOptions,
  MCPToolResult,
  MCPToolResultContent,
} from './types.js'

// 服务端
export {
  createMCPServer,
  MCPServer,
  type MCPServerConfig,
} from './server.js'

// 客户端
export {
  createMCPClient,
  InMemoryTransport,
  MCPClient,
  type MCPClientConfig,
  type MCPClientError,
  type MCPClientErrorType,
  type MCPTransport,
} from './client.js'
