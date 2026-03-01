/**
 * @h-ai/ai — LLM 工具定义与注册表
 *
 * 提供 OpenAI function calling 的工具定义、参数校验和批量执行功能。
 * @module ai-llm-tool
 */

import type { Result } from '@h-ai/core'
import type { z } from 'zod'

import type {
  DefineToolOptions,
  Tool,
  ToolCall,
  ToolDefinition,
  ToolError,
  ToolMessage,
  ToolRegistryOperations,
} from './ai-llm-types.js'

import { err, ok } from '@h-ai/core'
import { z as zod } from 'zod'

import { aiM } from '../ai-i18n.js'

// ─── 工具定义 ───

/**
 * 定义工具（Zod schema 类型推断 + 自动参数校验）
 *
 * 调用 `execute()` 时自动用 Zod schema 校验输入，校验失败返回 `VALIDATION_FAILED` 错误。
 *
 * @param options - 工具选项（名称、描述、参数 schema、处理函数）
 * @returns 工具实例（含 `execute` 和 `toDefinition`）
 *
 * @example
 * ```ts
 * const weatherTool = defineTool({
 *   name: 'getWeather',
 *   description: '获取天气',
 *   parameters: z.object({ city: z.string() }),
 *   handler: async ({ city }) => ({ temp: 25, city }),
 * })
 * const result = await weatherTool.execute({ city: '北京' })
 * ```
 */
export function defineTool<TInput, TOutput>(
  options: DefineToolOptions<TInput, TOutput>,
): Tool<TInput, TOutput> {
  const { name, description, parameters, handler } = options

  return {
    name,
    description,
    parameters,

    async execute(input: TInput): Promise<Result<TOutput, ToolError>> {
      try {
        const parseResult = parameters.safeParse(input)
        if (!parseResult.success) {
          return err({
            type: 'VALIDATION_FAILED',
            message: parseResult.error.message,
            toolName: name,
          })
        }
        const output = await handler(parseResult.data)
        return ok(output)
      }
      catch (error) {
        return err({
          type: 'EXECUTION_FAILED',
          message: error instanceof Error ? error.message : String(error),
          toolName: name,
        })
      }
    },

    toDefinition(): ToolDefinition {
      return {
        type: 'function',
        function: {
          name,
          description,
          parameters: zodToJsonSchema(parameters),
        },
      }
    },
  }
}

// ─── 工具注册表 ───

/**
 * 创建工具注册表（闭包实现，非 class）
 *
 * 注册表支持链式调用（`register` / `registerMany` 返回自身），
 * 同名工具注册时覆盖旧值。
 *
 * @returns 工具注册表实例
 *
 * @example
 * ```ts
 * const registry = createToolRegistry()
 * registry.register(weatherTool).register(searchTool)
 * const defs = registry.getDefinitions() // 用于 ChatCompletionRequest.tools
 * const result = await registry.execute(toolCall)
 * ```
 */
export function createToolRegistry(): ToolRegistryOperations {
  const tools: Map<string, Tool> = new Map()

  const registry: ToolRegistryOperations = {
    /** 注册单个工具（同名覆盖），返回 registry 支持链式调用 */
    register<TInput, TOutput>(tool: Tool<TInput, TOutput>): ToolRegistryOperations {
      tools.set(tool.name, tool as Tool)
      return registry
    },

    /** 批量注册工具，返回 registry 支持链式调用 */
    registerMany(toolList: Tool<unknown, unknown>[]): ToolRegistryOperations {
      for (const tool of toolList) {
        tools.set(tool.name, tool as Tool)
      }
      return registry
    },

    /** 移除指定名称的工具，返回是否成功删除 */
    unregister(name: string): boolean {
      return tools.delete(name)
    },

    /** 按名称获取工具实例（未注册返回 `undefined`） */
    get(name: string): Tool | undefined {
      return tools.get(name)
    },

    /** 判断是否已注册指定名称的工具 */
    has(name: string): boolean {
      return tools.has(name)
    },

    /** 获取所有已注册工具的名称列表 */
    getNames(): string[] {
      return Array.from(tools.keys())
    },

    /** 获取所有工具的 OpenAI function calling 定义 */
    getDefinitions(): ToolDefinition[] {
      return Array.from(tools.values()).map(tool => tool.toDefinition())
    },

    /** 执行单个工具调用，解析 JSON 参数后调用工具的 execute 方法 */
    async execute(toolCall: ToolCall): Promise<Result<ToolMessage, ToolError>> {
      const tool = tools.get(toolCall.function.name)
      if (!tool) {
        return err({
          type: 'TOOL_NOT_FOUND',
          message: aiM('ai_toolNotFound', { params: { name: toolCall.function.name } }),
          toolName: toolCall.function.name,
        })
      }

      let args: unknown
      try {
        args = JSON.parse(toolCall.function.arguments)
      }
      catch {
        return err({
          type: 'VALIDATION_FAILED',
          message: aiM('ai_toolInvalidJson'),
          toolName: toolCall.function.name,
        })
      }

      const result = await tool.execute(args)
      if (!result.success) {
        return result as Result<ToolMessage, ToolError>
      }

      const content = typeof result.data === 'string'
        ? result.data
        : JSON.stringify(result.data)

      return ok({
        role: 'tool',
        content,
        tool_call_id: toolCall.id,
      })
    },

    /** 批量执行工具调用（默认并行），任一失败时立即返回错误 */
    async executeAll(
      toolCalls: ToolCall[],
      options: { parallel?: boolean } = {},
    ): Promise<Result<ToolMessage[], ToolError>> {
      const { parallel = true } = options
      const messages: ToolMessage[] = []

      if (parallel) {
        const results = await Promise.all(
          toolCalls.map(tc => registry.execute(tc)),
        )
        for (const result of results) {
          if (!result.success) {
            return result as Result<ToolMessage[], ToolError>
          }
          messages.push(result.data)
        }
      }
      else {
        for (const toolCall of toolCalls) {
          const result = await registry.execute(toolCall)
          if (!result.success) {
            return result as Result<ToolMessage[], ToolError>
          }
          messages.push(result.data)
        }
      }

      return ok(messages)
    },

    /** 清空所有已注册工具 */
    clear(): void {
      tools.clear()
    },

    /** 已注册工具数量 */
    get size(): number {
      return tools.size
    },
  }

  return registry
}

// ─── Zod → JSON Schema ───

/**
 * 将 Zod schema 转换为 JSON Schema（移除 $schema 字段）
 *
 * @param schema - Zod 类型定义
 * @returns JSON Schema 对象
 */
function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const jsonSchema = zod.toJSONSchema(schema)
  const { $schema: _, ...rest } = jsonSchema as Record<string, unknown>
  return rest
}
