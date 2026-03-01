/**
 * @h-ai/ai — MCP 子功能类型
 *
 * 定义 MCP 工具、资源、提示词的注册与调用接口。
 * @module ai-mcp-types
 */

import type { Result } from '@h-ai/core'

import type { AIConfig } from '../ai-config.js'
import type { AIError } from '../ai-types.js'

// ─── MCP 业务类型 ───

/** MCP 工具定义（注册工具时的元数据） */
export interface MCPToolDefinition {
  /** 工具名称（需唯一） */
  name: string
  /** 工具功能描述 */
  description: string
  /** 输入参数的 JSON Schema */
  inputSchema: Record<string, unknown>
}

/** MCP 工具处理器，接收输入参数和执行上下文 */
export type MCPToolHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  context: MCPContext,
) => Promise<TOutput> | TOutput

/** MCP 执行上下文，携带请求元数据 */
export interface MCPContext {
  /** 请求唯一标识（未传入时自动生成 UUID） */
  requestId?: string
  /** 客户端信息（可选） */
  clientInfo?: {
    name: string
    version: string
  }
  /** 自定义元数据（可选） */
  metadata?: Record<string, unknown>
}

/** MCP 资源描述（注册资源时的元数据） */
export interface MCPResource {
  /** 资源 URI（唯一标识） */
  uri: string
  /** 资源名称 */
  name: string
  /** 资源描述（可选） */
  description?: string
  /** MIME 类型（可选，如 `'application/json'`） */
  mimeType?: string
}

/** MCP 资源内容（readResource 的返回值） */
export interface MCPResourceContent {
  /** 资源 URI */
  uri: string
  /** MIME 类型（可选） */
  mimeType?: string
  /** 文本内容（与 blob 二选一） */
  text?: string
  /** Base64 编码的二进制内容（与 text 二选一） */
  blob?: string
}

/** MCP 提示词模板描述 */
export interface MCPPrompt {
  /** 提示词名称（唯一标识） */
  name: string
  /** 提示词描述（可选） */
  description?: string
  /** 参数定义列表（可选） */
  arguments?: MCPPromptArgument[]
}

/** MCP 提示词参数定义 */
export interface MCPPromptArgument {
  /** 参数名称 */
  name: string
  /** 参数描述（可选） */
  description?: string
  /** 是否必填（默认 `false`） */
  required?: boolean
}

/** MCP 提示词消息（getPrompt 的返回值元素） */
export interface MCPPromptMessage {
  /** 消息角色 */
  role: 'user' | 'assistant'
  /** 消息内容 */
  content: MCPPromptContent
}

/** MCP 提示词内容（支持纯文本或资源引用） */
export interface MCPPromptContent {
  /** 内容类型：`'text'` 纯文本 | `'resource'` 资源引用 */
  type: 'text' | 'resource'
  /** 文本内容（type 为 `'text'` 时） */
  text?: string
  /** 资源引用（type 为 `'resource'` 时） */
  resource?: {
    uri: string
    text?: string
    blob?: string
    mimeType?: string
  }
}

// ─── MCP Server 类型 ───

/** MCP 服务器创建选项 */
export interface McpServerOptions {
  /** 服务器名称 */
  name: string
  /** 服务器版本（默认 `'1.0.0'`） */
  version?: string
}

// ─── MCP Provider 接口 ───

/**
 * MCP Provider 接口
 *
 * 定义 MCP 工具/资源/提示词的注册与调用能力。
 */
export interface MCPProvider {
  registerTool: <TInput, TOutput>(
    definition: MCPToolDefinition,
    handler: MCPToolHandler<TInput, TOutput>,
  ) => Result<void, AIError>
  registerResource: (
    resource: MCPResource,
    handler: () => Promise<MCPResourceContent>,
  ) => Result<void, AIError>
  registerPrompt: (
    prompt: MCPPrompt,
    handler: (args: Record<string, string>) => Promise<MCPPromptMessage[]>,
  ) => Result<void, AIError>
  callTool: (name: string, args: unknown, context?: MCPContext) => Promise<Result<unknown, AIError>>
  readResource: (uri: string) => Promise<Result<MCPResourceContent, AIError>>
  getPrompt: (name: string, args: Record<string, string>) => Promise<Result<MCPPromptMessage[], AIError>>
}

// ─── MCP 操作接口 ───

/**
 * MCP 操作接口（通过 `ai.mcp` 访问）
 *
 * 需要先调用 `ai.init()` 初始化，否则所有方法返回 `NOT_INITIALIZED` 错误。
 */
export interface MCPOperations {
  registerTool: <TInput, TOutput>(
    definition: MCPToolDefinition,
    handler: MCPToolHandler<TInput, TOutput>,
  ) => Result<void, AIError>
  registerResource: (
    resource: MCPResource,
    handler: () => Promise<MCPResourceContent>,
  ) => Result<void, AIError>
  registerPrompt: (
    prompt: MCPPrompt,
    handler: (args: Record<string, string>) => Promise<MCPPromptMessage[]>,
  ) => Result<void, AIError>
  callTool: (name: string, args: unknown, context?: MCPContext) => Promise<Result<unknown, AIError>>
  readResource: (uri: string) => Promise<Result<MCPResourceContent, AIError>>
  getPrompt: (name: string, args: Record<string, string>) => Promise<Result<MCPPromptMessage[], AIError>>
}

// ─── MCP 工厂依赖 ───

/** MCP 子功能工厂依赖（内部使用） */
export interface AIMCPFunctionsDeps {
  /** 校验后的 AI 配置 */
  config: AIConfig
}
