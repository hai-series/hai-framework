/**
 * =============================================================================
 * @hai/ai - Provider: MCP
 * =============================================================================
 *
 * MCP Provider 实现。
 * 提供工具、资源、提示词的注册和调用功能。
 * 支持通过 McpServer 对接 MCP 协议传输层（如 HTTP Streamable）。
 *
 * @module ai-provider-mcp
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type {
  AIConfig,
  AIError,
  MCPContext,
  MCPPrompt,
  MCPPromptMessage,
  MCPProvider,
  MCPResource,
  MCPResourceContent,
  MCPToolDefinition,
  MCPToolHandler,
} from '../ai-types.js'
import { err, ok } from '@hai/core'

import { AIErrorCode } from '../ai-config.js'
import { aiM } from '../ai-i18n.js'

// =============================================================================
// 内部类型
// =============================================================================

/** 工具注册记录：保存工具元信息与处理函数 */
interface ToolRegistration {
  definition: MCPToolDefinition
  handler: MCPToolHandler
}

/** 资源注册记录：保存资源元信息与读取函数 */
interface ResourceRegistration {
  resource: MCPResource
  handler: () => Promise<MCPResourceContent>
}

/** 提示词注册记录：保存提示词元信息与渲染函数 */
interface PromptRegistration {
  prompt: MCPPrompt
  handler: (args: Record<string, string>) => Promise<MCPPromptMessage[]>
}

// =============================================================================
// MCP Provider 实现
// =============================================================================

/**
 * HAI MCP Provider 实现
 *
 * 提供工具、资源、提示词的注册和调用功能。
 * 内部使用 Map 存储注册信息，工具按 `name`、资源按 `uri`、提示词按 `name` 索引。
 */
class HaiMCPProvider implements MCPProvider {
  /** 工具注册表（键为工具名称） */
  private tools: Map<string, ToolRegistration> = new Map()
  /** 资源注册表（键为资源 URI） */
  private resources: Map<string, ResourceRegistration> = new Map()
  /** 提示词注册表（键为提示词名称） */
  private prompts: Map<string, PromptRegistration> = new Map()

  /**
   * @param _config - AI 配置（当前保留供将来使用）
   */
  constructor(_config: AIConfig) {
    // 配置保留供将来使用
  }

  /**
   * 注册工具
   *
   * 同名工具会被覆盖。
   *
   * @param definition - 工具元信息（名称、描述、输入 Schema）
   * @param handler - 工具执行函数
   */
  registerTool<TInput, TOutput>(
    definition: MCPToolDefinition,
    handler: MCPToolHandler<TInput, TOutput>,
  ): void {
    this.tools.set(definition.name, {
      definition,
      handler: handler as MCPToolHandler,
    })
  }

  /**
   * 注册资源
   *
   * 同 URI 资源会被覆盖。
   *
   * @param resource - 资源元信息（URI、名称、描述等）
   * @param handler - 资源读取函数
   */
  registerResource(
    resource: MCPResource,
    handler: () => Promise<MCPResourceContent>,
  ): void {
    this.resources.set(resource.uri, { resource, handler })
  }

  /**
   * 注册提示词
   *
   * 同名提示词会被覆盖。
   *
   * @param prompt - 提示词元信息（名称、描述、参数定义）
   * @param handler - 提示词渲染函数，接收参数返回消息数组
   */
  registerPrompt(
    prompt: MCPPrompt,
    handler: (args: Record<string, string>) => Promise<MCPPromptMessage[]>,
  ): void {
    this.prompts.set(prompt.name, { prompt, handler })
  }

  /**
   * 调用工具
   *
   * @param name - 工具名称
   * @param args - 输入参数
   * @param context - 执行上下文（可选，未提供时自动生成包含随机 requestId 的上下文）
   * @returns 成功返回 handler 执行结果，工具不存在或 handler 抛异常时返回 `MCP_TOOL_ERROR`
   */
  async callTool(
    name: string,
    args: unknown,
    context?: MCPContext,
  ): Promise<Result<unknown, AIError>> {
    try {
      const registration = this.tools.get(name)
      if (!registration) {
        return err({
          code: AIErrorCode.MCP_TOOL_ERROR,
          message: aiM('ai_mcpToolNotFound', { params: { name } }),
        })
      }

      const ctx: MCPContext = context || { requestId: crypto.randomUUID() }
      const result = await registration.handler(args, ctx)
      return ok(result)
    }
    catch (error) {
      return err({
        code: AIErrorCode.MCP_TOOL_ERROR,
        message: aiM('ai_mcpToolFailed', { params: { name, error: error instanceof Error ? error.message : 'Unknown error' } }),
        cause: error,
      })
    }
  }

  /**
   * 读取资源
   *
   * @param uri - 资源 URI
   * @returns 成功返回资源内容，资源不存在或 handler 抛异常时返回 `MCP_RESOURCE_ERROR`
   */
  async readResource(uri: string): Promise<Result<MCPResourceContent, AIError>> {
    try {
      const registration = this.resources.get(uri)
      if (!registration) {
        return err({
          code: AIErrorCode.MCP_RESOURCE_ERROR,
          message: aiM('ai_mcpResourceNotFound', { params: { uri } }),
        })
      }

      const content = await registration.handler()
      return ok(content)
    }
    catch (error) {
      return err({
        code: AIErrorCode.MCP_RESOURCE_ERROR,
        message: aiM('ai_mcpResourceFailed', { params: { uri, error: error instanceof Error ? error.message : 'Unknown error' } }),
        cause: error,
      })
    }
  }

  /**
   * 获取提示词
   *
   * 会验证必需参数（`required: true`）是否已提供。
   *
   * @param name - 提示词名称
   * @param args - 提示词参数（key-value 形式）
   * @returns 成功返回渲染后的消息数组，失败返回 `MCP_PROTOCOL_ERROR`
   */
  async getPrompt(
    name: string,
    args: Record<string, string>,
  ): Promise<Result<MCPPromptMessage[], AIError>> {
    try {
      const registration = this.prompts.get(name)
      if (!registration) {
        return err({
          code: AIErrorCode.MCP_PROTOCOL_ERROR,
          message: aiM('ai_mcpPromptNotFound', { params: { name } }),
        })
      }

      // 验证必需参数
      for (const arg of registration.prompt.arguments || []) {
        if (arg.required && !(arg.name in args)) {
          return err({
            code: AIErrorCode.MCP_PROTOCOL_ERROR,
            message: aiM('ai_mcpPromptMissingArg', { params: { name, arg: arg.name } }),
          })
        }
      }

      const messages = await registration.handler(args)
      return ok(messages)
    }
    catch (error) {
      return err({
        code: AIErrorCode.MCP_PROTOCOL_ERROR,
        message: aiM('ai_mcpPromptFailed', { params: { name, error: error instanceof Error ? error.message : 'Unknown error' } }),
        cause: error,
      })
    }
  }

  // =============================================================================
  // 辅助方法
  // =============================================================================

  /**
   * 获取所有工具定义
   *
   * @returns 已注册的工具元信息数组
   */
  getTools(): MCPToolDefinition[] {
    return Array.from(this.tools.values()).map(r => r.definition)
  }

  /**
   * 获取所有资源
   *
   * @returns 已注册的资源元信息数组
   */
  getResources(): MCPResource[] {
    return Array.from(this.resources.values()).map(r => r.resource)
  }

  /**
   * 获取所有提示词
   *
   * @returns 已注册的提示词元信息数组
   */
  getPrompts(): MCPPrompt[] {
    return Array.from(this.prompts.values()).map(r => r.prompt)
  }

  /**
   * 注销工具
   *
   * @param name - 工具名称
   * @returns 是否成功注销
   */
  unregisterTool(name: string): boolean {
    return this.tools.delete(name)
  }

  /**
   * 注销资源
   *
   * @param uri - 资源 URI
   * @returns 是否成功注销
   */
  unregisterResource(uri: string): boolean {
    return this.resources.delete(uri)
  }

  /**
   * 注销提示词
   *
   * @param name - 提示词名称
   * @returns 是否成功注销
   */
  unregisterPrompt(name: string): boolean {
    return this.prompts.delete(name)
  }
}

/**
 * 创建 HAI MCP Provider
 *
 * 工厂函数，内部使用，由 `ai.init()` 调用。
 *
 * @param config - 经过 Zod 校验的 AI 配置
 * @returns 实现了 `MCPProvider` 接口的实例
 */
export function createHaiMCPProvider(config: AIConfig): MCPProvider {
  return new HaiMCPProvider(config)
}
