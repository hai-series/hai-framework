/**
 * =============================================================================
 * @hai/mcp - MCP 类型定义
 * =============================================================================
 * Model Context Protocol 相关类型
 * =============================================================================
 */

import type { z } from 'zod'

/**
 * MCP 工具定义
 */
export interface MCPToolDefinition {
  /** 工具名称 */
  name: string
  /** 工具描述 */
  description: string
  /** 输入参数 schema (JSON Schema) */
  inputSchema: Record<string, unknown>
}

/**
 * MCP 工具处理器
 */
export type MCPToolHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  context: MCPContext,
) => Promise<TOutput> | TOutput

/**
 * MCP 执行上下文
 */
export interface MCPContext {
  /** 请求 ID */
  requestId?: string
  /** 客户端信息 */
  clientInfo?: {
    name: string
    version: string
  }
  /** 自定义元数据 */
  metadata?: Record<string, unknown>
}

/**
 * MCP 资源定义
 */
export interface MCPResource {
  /** 资源 URI */
  uri: string
  /** 资源名称 */
  name: string
  /** 资源描述 */
  description?: string
  /** MIME 类型 */
  mimeType?: string
}

/**
 * MCP 资源内容
 */
export interface MCPResourceContent {
  /** 资源 URI */
  uri: string
  /** MIME 类型 */
  mimeType?: string
  /** 文本内容 */
  text?: string
  /** 二进制内容 (base64) */
  blob?: string
}

/**
 * MCP 提示定义
 */
export interface MCPPrompt {
  /** 提示名称 */
  name: string
  /** 提示描述 */
  description?: string
  /** 提示参数 */
  arguments?: MCPPromptArgument[]
}

/**
 * MCP 提示参数
 */
export interface MCPPromptArgument {
  /** 参数名称 */
  name: string
  /** 参数描述 */
  description?: string
  /** 是否必需 */
  required?: boolean
}

/**
 * MCP 提示消息
 */
export interface MCPPromptMessage {
  /** 角色 */
  role: 'user' | 'assistant'
  /** 内容 */
  content: MCPPromptContent
}

/**
 * MCP 提示内容
 */
export interface MCPPromptContent {
  /** 内容类型 */
  type: 'text' | 'image' | 'resource'
  /** 文本 */
  text?: string
  /** 图片数据 */
  data?: string
  /** MIME 类型 */
  mimeType?: string
  /** 资源 URI */
  uri?: string
}

/**
 * MCP 服务器信息
 */
export interface MCPServerInfo {
  /** 服务器名称 */
  name: string
  /** 服务器版本 */
  version: string
  /** 协议版本 */
  protocolVersion?: string
}

/**
 * MCP 客户端信息
 */
export interface MCPClientInfo {
  /** 客户端名称 */
  name: string
  /** 客户端版本 */
  version: string
}

/**
 * MCP 服务器能力
 */
export interface MCPServerCapabilities {
  /** 工具能力 */
  tools?: {
    listChanged?: boolean
  }
  /** 资源能力 */
  resources?: {
    subscribe?: boolean
    listChanged?: boolean
  }
  /** 提示能力 */
  prompts?: {
    listChanged?: boolean
  }
  /** 日志能力 */
  logging?: Record<string, never>
}

/**
 * 工具调用结果
 */
export interface MCPToolResult {
  /** 是否为错误 */
  isError?: boolean
  /** 结果内容 */
  content: MCPToolResultContent[]
}

/**
 * 工具结果内容
 */
export interface MCPToolResultContent {
  /** 内容类型 */
  type: 'text' | 'image' | 'resource'
  /** 文本 */
  text?: string
  /** 图片数据 */
  data?: string
  /** MIME 类型 */
  mimeType?: string
  /** 资源 URI */
  uri?: string
}

/**
 * MCP 错误
 */
export interface MCPError {
  /** 错误代码 */
  code: number
  /** 错误消息 */
  message: string
  /** 错误数据 */
  data?: unknown
}

/**
 * MCP 工具选项
 */
export interface MCPToolOptions<TInput> {
  /** 工具名称 */
  name: string
  /** 工具描述 */
  description: string
  /** Zod schema */
  schema: z.ZodType<TInput>
  /** 处理函数 */
  handler: MCPToolHandler<TInput>
}

/**
 * MCP 资源选项
 */
export interface MCPResourceOptions {
  /** 资源 URI 模板 */
  uriTemplate: string
  /** 资源名称 */
  name: string
  /** 资源描述 */
  description?: string
  /** MIME 类型 */
  mimeType?: string
  /** 读取处理器 */
  handler: (uri: string, context: MCPContext) => Promise<MCPResourceContent> | MCPResourceContent
}

/**
 * MCP 提示选项
 */
export interface MCPPromptOptions {
  /** 提示名称 */
  name: string
  /** 提示描述 */
  description?: string
  /** 提示参数 */
  arguments?: MCPPromptArgument[]
  /** 处理器 */
  handler: (
    args: Record<string, string>,
    context: MCPContext,
  ) => Promise<MCPPromptMessage[]> | MCPPromptMessage[]
}
