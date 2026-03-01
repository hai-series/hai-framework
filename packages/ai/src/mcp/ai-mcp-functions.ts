/**
 * @h-ai/ai — MCP 子功能工厂
 *
 * 提供 MCP 工具/资源/提示词的注册与调用功能。
 * @module ai-mcp-functions
 */

import type { Result } from '@h-ai/core'

import type { AIError } from '../ai-types.js'
import type {
  AIMCPFunctionsDeps,
  MCPContext,
  MCPOperations,
  MCPPrompt,
  MCPPromptMessage,
  MCPResource,
  MCPResourceContent,
  MCPToolDefinition,
  MCPToolHandler,
} from './ai-mcp-types.js'

import { err, ok } from '@h-ai/core'

import { AIErrorCode } from '../ai-config.js'
import { aiM } from '../ai-i18n.js'

// ─── 内部类型 ───

/** 工具注册记录（定义 + 处理器） */
interface ToolRegistration {
  /** 工具元数据 */
  definition: MCPToolDefinition
  /** 工具执行处理器 */
  handler: MCPToolHandler
}

/** 资源注册记录（元数据 + 内容加载器） */
interface ResourceRegistration {
  /** 资源元数据 */
  resource: MCPResource
  /** 内容加载器（延迟读取） */
  handler: () => Promise<MCPResourceContent>
}

/** 提示词注册记录（元数据 + 模板渲染器） */
interface PromptRegistration {
  /** 提示词元数据 */
  prompt: MCPPrompt
  /** 模板渲染器（接收参数，返回消息列表） */
  handler: (args: Record<string, string>) => Promise<MCPPromptMessage[]>
}

// ─── 工厂函数 ───

/**
 * 创建 MCP 子功能
 *
 * 提供工具、资源、提示词的注册与调用功能。
 * 注册是同步，调用是异步。所有调用方法返回 `Result<T, AIError>`。
 *
 * @param _deps - MCP 子功能依赖（config 保留供将来使用）
 * @returns MCPOperations 接口
 *
 * @example
 * ```ts
 * const mcp = createAIMCPFunctions({ config })
 * mcp.registerTool(
 *   { name: 'echo', description: '回音', inputSchema: { type: 'object' } },
 *   async (input) => input,
 * )
 * const result = await mcp.callTool('echo', { msg: 'hi' })
 * ```
 */
export function createAIMCPFunctions(_deps: AIMCPFunctionsDeps): MCPOperations {
  // _deps.config 保留供将来使用

  /** 工具注册表（按 name 索引） */
  const tools = new Map<string, ToolRegistration>()
  /** 资源注册表（按 uri 索引） */
  const resources = new Map<string, ResourceRegistration>()
  /** 提示词注册表（按 name 索引） */
  const prompts = new Map<string, PromptRegistration>()

  return {
    /** 注册 MCP 工具（同名覆盖） */
    registerTool<TInput, TOutput>(
      definition: MCPToolDefinition,
      handler: MCPToolHandler<TInput, TOutput>,
    ): Result<void, AIError> {
      tools.set(definition.name, {
        definition,
        handler: handler as MCPToolHandler,
      })
      return ok(undefined)
    },

    /** 注册 MCP 资源（同 URI 覆盖） */
    registerResource(
      resource: MCPResource,
      handler: () => Promise<MCPResourceContent>,
    ): Result<void, AIError> {
      resources.set(resource.uri, { resource, handler })
      return ok(undefined)
    },

    /** 注册 MCP 提示词模板（同名覆盖） */
    registerPrompt(
      prompt: MCPPrompt,
      handler: (args: Record<string, string>) => Promise<MCPPromptMessage[]>,
    ): Result<void, AIError> {
      prompts.set(prompt.name, { prompt, handler })
      return ok(undefined)
    },

    /**
     * 调用已注册的 MCP 工具
     *
     * @param name - 工具名称
     * @param args - 输入参数
     * @param context - 执行上下文（可选，未传时自动生成 requestId）
     * @returns 工具返回值或 `MCP_TOOL_ERROR`
     */
    async callTool(
      name: string,
      args: unknown,
      context?: MCPContext,
    ): Promise<Result<unknown, AIError>> {
      try {
        const registration = tools.get(name)
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
          message: aiM('ai_mcpToolFailed', {
            params: { name, error: error instanceof Error ? error.message : 'Unknown error' },
          }),
          cause: error,
        })
      }
    },

    /**
     * 读取已注册的 MCP 资源
     *
     * @param uri - 资源 URI
     * @returns 资源内容或 `MCP_RESOURCE_ERROR`
     */
    async readResource(uri: string): Promise<Result<MCPResourceContent, AIError>> {
      try {
        const registration = resources.get(uri)
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
          message: aiM('ai_mcpResourceFailed', {
            params: { uri, error: error instanceof Error ? error.message : 'Unknown error' },
          }),
          cause: error,
        })
      }
    },

    /**
     * 获取已注册的 MCP 提示词
     *
     * 自动校验必填参数，缺少时返回 `MCP_PROTOCOL_ERROR`。
     *
     * @param name - 提示词名称
     * @param args - 模板参数
     * @returns 渲染后的消息列表或错误
     */
    async getPrompt(
      name: string,
      args: Record<string, string>,
    ): Promise<Result<MCPPromptMessage[], AIError>> {
      try {
        const registration = prompts.get(name)
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
          message: aiM('ai_mcpPromptFailed', {
            params: { name, error: error instanceof Error ? error.message : 'Unknown error' },
          }),
          cause: error,
        })
      }
    },
  }
}
