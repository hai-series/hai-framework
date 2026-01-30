/**
 * =============================================================================
 * @hai/ai - Provider: MCP
 * =============================================================================
 *
 * MCP Provider 实现
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

// =============================================================================
// 内部类型
// =============================================================================

interface ToolRegistration {
  definition: MCPToolDefinition
  handler: MCPToolHandler
}

interface ResourceRegistration {
  resource: MCPResource
  handler: () => Promise<MCPResourceContent>
}

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
 */
class HaiMCPProvider implements MCPProvider {
  private tools: Map<string, ToolRegistration> = new Map()
  private resources: Map<string, ResourceRegistration> = new Map()
  private prompts: Map<string, PromptRegistration> = new Map()

  constructor(_config: AIConfig) {
    // 配置保留供将来使用
  }

  registerTool<TInput, TOutput>(
    definition: MCPToolDefinition,
    handler: MCPToolHandler<TInput, TOutput>,
  ): void {
    this.tools.set(definition.name, {
      definition,
      handler: handler as MCPToolHandler,
    })
  }

  registerResource(
    resource: MCPResource,
    handler: () => Promise<MCPResourceContent>,
  ): void {
    this.resources.set(resource.uri, { resource, handler })
  }

  registerPrompt(
    prompt: MCPPrompt,
    handler: (args: Record<string, string>) => Promise<MCPPromptMessage[]>,
  ): void {
    this.prompts.set(prompt.name, { prompt, handler })
  }

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
          message: `工具 '${name}' 未找到`,
        })
      }

      const ctx: MCPContext = context || { requestId: crypto.randomUUID() }
      const result = await registration.handler(args, ctx)
      return ok(result)
    }
    catch (error) {
      return err({
        code: AIErrorCode.MCP_TOOL_ERROR,
        message: `工具 '${name}' 执行失败：${error instanceof Error ? error.message : 'Unknown error'}`,
        cause: error,
      })
    }
  }

  async readResource(uri: string): Promise<Result<MCPResourceContent, AIError>> {
    try {
      const registration = this.resources.get(uri)
      if (!registration) {
        return err({
          code: AIErrorCode.MCP_RESOURCE_ERROR,
          message: `资源 '${uri}' 未找到`,
        })
      }

      const content = await registration.handler()
      return ok(content)
    }
    catch (error) {
      return err({
        code: AIErrorCode.MCP_RESOURCE_ERROR,
        message: `资源 '${uri}' 读取失败：${error instanceof Error ? error.message : 'Unknown error'}`,
        cause: error,
      })
    }
  }

  async getPrompt(
    name: string,
    args: Record<string, string>,
  ): Promise<Result<MCPPromptMessage[], AIError>> {
    try {
      const registration = this.prompts.get(name)
      if (!registration) {
        return err({
          code: AIErrorCode.MCP_PROTOCOL_ERROR,
          message: `提示词 '${name}' 未找到`,
        })
      }

      // 验证必需参数
      for (const arg of registration.prompt.arguments || []) {
        if (arg.required && !(arg.name in args)) {
          return err({
            code: AIErrorCode.MCP_PROTOCOL_ERROR,
            message: `提示词 '${name}' 缺少必需参数 '${arg.name}'`,
          })
        }
      }

      const messages = await registration.handler(args)
      return ok(messages)
    }
    catch (error) {
      return err({
        code: AIErrorCode.MCP_PROTOCOL_ERROR,
        message: `提示词 '${name}' 执行失败：${error instanceof Error ? error.message : 'Unknown error'}`,
        cause: error,
      })
    }
  }

  // =============================================================================
  // 辅助方法
  // =============================================================================

  /**
   * 获取所有工具定义
   */
  getTools(): MCPToolDefinition[] {
    return Array.from(this.tools.values()).map(r => r.definition)
  }

  /**
   * 获取所有资源
   */
  getResources(): MCPResource[] {
    return Array.from(this.resources.values()).map(r => r.resource)
  }

  /**
   * 获取所有提示词
   */
  getPrompts(): MCPPrompt[] {
    return Array.from(this.prompts.values()).map(r => r.prompt)
  }

  /**
   * 注销工具
   */
  unregisterTool(name: string): boolean {
    return this.tools.delete(name)
  }

  /**
   * 注销资源
   */
  unregisterResource(uri: string): boolean {
    return this.resources.delete(uri)
  }

  /**
   * 注销提示词
   */
  unregisterPrompt(name: string): boolean {
    return this.prompts.delete(name)
  }
}

/**
 * 创建 HAI MCP Provider
 *
 * @param config - AI 配置
 * @returns MCP Provider 实例
 */
export function createHaiMCPProvider(config: AIConfig): MCPProvider {
  return new HaiMCPProvider(config)
}
