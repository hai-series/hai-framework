/**
 * =============================================================================
 * @hai/ai - 工具调用
 * =============================================================================
 *
 * 提供 LLM 工具调用的定义和执行功能。
 *
 * 特性：
 * - Zod schema 类型推断
 * - 工具注册表
 * - 自动参数验证
 * - 执行追踪
 *
 * @example
 * ```ts
 * import { defineTool, createToolRegistry } from '@hai/ai'
 * import { z } from 'zod'
 *
 * // 定义工具
 * const weatherTool = defineTool({
 *     name: 'get_weather',
 *     description: '获取天气信息',
 *     parameters: z.object({
 *         city: z.string().describe('城市名称'),
 *     }),
 *     handler: async ({ city }) => {
 *         return { temperature: 20, city }
 *     }
 * })
 *
 * // 创建注册表
 * const registry = createToolRegistry()
 * registry.register(weatherTool)
 *
 * // 获取工具定义（用于 LLM）
 * const definitions = registry.getDefinitions()
 * ```
 *
 * @module ai-tools
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type { z } from 'zod'
import type { ToolCall, ToolDefinition, ToolMessage } from './ai-types.js'
import { err, ok } from '@hai/core'
import { z as zod } from 'zod'

/**
 * 工具错误类型
 */
export type ToolErrorType
  = | 'TOOL_NOT_FOUND'
    | 'VALIDATION_FAILED'
    | 'EXECUTION_FAILED'
    | 'TIMEOUT'

/**
 * 工具错误
 */
export interface ToolError {
  type: ToolErrorType
  message: string
  toolName?: string
}

/**
 * 工具定义选项
 */
export interface DefineToolOptions<TInput, TOutput> {
  /** 工具名称 */
  name: string
  /** 工具描述 */
  description: string
  /** 输入参数 schema (Zod) */
  parameters: z.ZodType<TInput>
  /** 工具处理函数 */
  handler: (input: TInput) => Promise<TOutput> | TOutput
}

/**
 * 工具实例
 */
export interface Tool<TInput = unknown, TOutput = unknown> {
  /** 工具名称 */
  name: string
  /** 工具描述 */
  description: string
  /** 输入参数 schema */
  parameters: z.ZodType<TInput>
  /** 执行工具 */
  execute: (input: TInput) => Promise<Result<TOutput, ToolError>>
  /** 转换为 OpenAI 工具定义 */
  toDefinition: () => ToolDefinition
}

/**
 * 定义工具
 *
 * @param options - 工具选项
 * @returns 工具实例
 *
 * @example
 * ```ts
 * const weatherTool = defineTool({
 *   name: 'get_weather',
 *   description: 'Get the current weather for a location',
 *   parameters: z.object({
 *     location: z.string().describe('City name'),
 *     unit: z.enum(['celsius', 'fahrenheit']).optional(),
 *   }),
 *   handler: async ({ location, unit }) => {
 *     return { temperature: 20, unit: unit ?? 'celsius' }
 *   },
 * })
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
        // 验证输入
        const parseResult = parameters.safeParse(input)

        if (!parseResult.success) {
          return err({
            type: 'VALIDATION_FAILED',
            message: parseResult.error.message,
            toolName: name,
          })
        }

        // 执行工具
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

/**
 * 工具注册表
 */
export class ToolRegistry {
  private tools: Map<string, Tool> = new Map()

  /**
   * 注册工具
   *
   * @param tool - 工具实例
   */
  register<TInput, TOutput>(tool: Tool<TInput, TOutput>): this {
    this.tools.set(tool.name, tool as Tool)
    return this
  }

  /**
   * 批量注册工具
   *
   * @param tools - 工具数组
   */
  registerMany(tools: Tool<unknown, unknown>[]): this {
    for (const tool of tools) {
      this.register(tool)
    }
    return this
  }

  /**
   * 注销工具
   *
   * @param name - 工具名称
   */
  unregister(name: string): boolean {
    return this.tools.delete(name)
  }

  /**
   * 获取工具
   *
   * @param name - 工具名称
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name)
  }

  /**
   * 检查工具是否存在
   *
   * @param name - 工具名称
   */
  has(name: string): boolean {
    return this.tools.has(name)
  }

  /**
   * 获取所有工具名称
   */
  getNames(): string[] {
    return Array.from(this.tools.keys())
  }

  /**
   * 获取所有工具定义
   */
  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(tool => tool.toDefinition())
  }

  /**
   * 执行工具调用
   *
   * @param toolCall - 工具调用
   */
  async execute(toolCall: ToolCall): Promise<Result<ToolMessage, ToolError>> {
    const tool = this.tools.get(toolCall.function.name)

    if (!tool) {
      return err({
        type: 'TOOL_NOT_FOUND',
        message: `Tool '${toolCall.function.name}' not found`,
        toolName: toolCall.function.name,
      })
    }

    // 解析参数
    let args: unknown
    try {
      args = JSON.parse(toolCall.function.arguments)
    }
    catch {
      return err({
        type: 'VALIDATION_FAILED',
        message: 'Invalid JSON in tool call arguments',
        toolName: toolCall.function.name,
      })
    }

    // 执行工具
    const result = await tool.execute(args)

    if (!result.success) {
      return result as Result<ToolMessage, ToolError>
    }

    // 构建工具消息
    const content = typeof result.data === 'string'
      ? result.data
      : JSON.stringify(result.data)

    return ok({
      role: 'tool',
      content,
      tool_call_id: toolCall.id,
    })
  }

  /**
   * 批量执行工具调用
   *
   * @param toolCalls - 工具调用数组
   * @param options - 执行选项
   * @param options.parallel - 是否并行执行（默认 true）
   */
  async executeAll(
    toolCalls: ToolCall[],
    options: { parallel?: boolean } = {},
  ): Promise<Result<ToolMessage[], ToolError>> {
    const { parallel = true } = options
    const messages: ToolMessage[] = []

    if (parallel) {
      // 并行执行
      const results = await Promise.all(
        toolCalls.map(tc => this.execute(tc)),
      )

      for (const result of results) {
        if (!result.success) {
          return result as Result<ToolMessage[], ToolError>
        }
        messages.push(result.data)
      }
    }
    else {
      // 顺序执行
      for (const toolCall of toolCalls) {
        const result = await this.execute(toolCall)
        if (!result.success) {
          return result as Result<ToolMessage[], ToolError>
        }
        messages.push(result.data)
      }
    }

    return ok(messages)
  }

  /**
   * 清空所有工具
   */
  clear(): void {
    this.tools.clear()
  }

  /**
   * 获取工具数量
   */
  get size(): number {
    return this.tools.size
  }
}

/**
 * 创建工具注册表
 */
export function createToolRegistry(): ToolRegistry {
  return new ToolRegistry()
}

// =============================================================================
// Zod to JSON Schema 转换
// =============================================================================

/**
 * 将 Zod schema 转换为 JSON Schema（用于 OpenAI 工具定义）
 *
 * 使用 Zod 4.x 内置的 toJSONSchema 方法
 */
function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const jsonSchema = zod.toJSONSchema(schema)

  // 移除 $schema 字段（OpenAI 不需要）
  const { $schema: _, ...rest } = jsonSchema as Record<string, unknown>

  return rest
}
