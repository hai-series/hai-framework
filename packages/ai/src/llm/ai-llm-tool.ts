/**
 * =============================================================================
 * @hai/ai - 工具调用
 * =============================================================================
 *
 * 提供 LLM 工具调用（OpenAI function calling）的定义和执行功能。
 *
 * 特性：
 * - Zod schema 类型推断
 * - 工具注册表
 * - 自动参数验证
 * - 批量执行
 *
 * @example
 * ```ts
 * import { ai } from '@hai/ai'
 * import { z } from 'zod'
 *
 * const weatherTool = ai.tools.define({
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
 * const registry = ai.tools.createRegistry()
 * registry.register(weatherTool)
 *
 * const definitions = registry.getDefinitions()
 * ```
 *
 * @module tool/ai-tool-main
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type { z } from 'zod'
import type { ToolCall, ToolDefinition, ToolMessage } from '../ai-types.js'
import { err, ok } from '@hai/core'
import { z as zod } from 'zod'

import { aiM } from '../ai-i18n.js'

// =============================================================================
// 类型定义
// =============================================================================

/**
 * 工具错误类型
 *
 * - `TOOL_NOT_FOUND` — 注册表中不存在该工具
 * - `VALIDATION_FAILED` — 参数校验失败（Zod 解析失败或 JSON 无效）
 * - `EXECUTION_FAILED` — handler 执行过程中抛出异常
 * - `TIMEOUT` — 执行超时（预留，当前未实现）
 */
export type ToolErrorType
  = | 'TOOL_NOT_FOUND'
    | 'VALIDATION_FAILED'
    | 'EXECUTION_FAILED'
    | 'TIMEOUT'

/**
 * 工具错误
 *
 * 工具执行失败时返回的错误结构。
 * 通过 `type` 字段区分错误类别，`toolName` 标识逻辑来源。
 */
export interface ToolError {
  type: ToolErrorType
  message: string
  toolName?: string
}

/**
 * 工具定义选项
 *
 * 传入 `ai.tools.define()` 的参数。
 *
 * @typeParam TInput - 输入参数类型（由 Zod schema 推断）
 * @typeParam TOutput - handler 返回值类型
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
 *
 * 通过 `ai.tools.define()` 创建。提供参数校验、执行和转换为 OpenAI 格式定义的能力。
 *
 * @typeParam TInput - 输入参数类型
 * @typeParam TOutput - 执行结果类型
 */
export interface Tool<TInput = unknown, TOutput = unknown> {
  /** 工具名称 */
  name: string
  /** 工具描述 */
  description: string
  /** 输入参数 schema */
  parameters: z.ZodType<TInput>
  /** 执行工具：先搜 Zod 校验参数，再调用 handler。校验失败返回 `VALIDATION_FAILED`，handler 抛异常返回 `EXECUTION_FAILED` */
  execute: (input: TInput) => Promise<Result<TOutput, ToolError>>
  /** 转换为 OpenAI function calling 格式的工具定义（自动将 Zod schema 转为 JSON Schema） */
  toDefinition: () => ToolDefinition
}

// =============================================================================
// 操作接口
// =============================================================================

/**
 * Tools 操作接口
 *
 * 通过 `ai.tools` 访问。
 */
export interface ToolsOperations {
  /** 定义工具 */
  define: <TInput, TOutput>(options: DefineToolOptions<TInput, TOutput>) => Tool<TInput, TOutput>
  /** 创建工具注册表 */
  createRegistry: () => ToolRegistry
}

// =============================================================================
// 工具定义
// =============================================================================

/**
 * 定义工具
 *
 * @param options - 工具选项
 * @returns 工具实例
 *
 * @example
 * ```ts
 * const weatherTool = ai.tools.define({
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

// =============================================================================
// 工具注册表
// =============================================================================

/**
 * 工具注册表
 *
 * 管理一组工具的注册与执行，与 LLM function calling 配合使用。
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
   * @returns `this`，支持链式调用
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
   * @returns 是否成功注销（工具不存在时返回 `false`）
   */
  unregister(name: string): boolean {
    return this.tools.delete(name)
  }

  /**
   * 获取工具
   *
   * @param name - 工具名称
   * @returns 工具实例，不存在时返回 `undefined`
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name)
  }

  /**
   * 检查工具是否已注册
   *
   * @param name - 工具名称
   * @returns 工具存在时返回 `true`
   */
  has(name: string): boolean {
    return this.tools.has(name)
  }

  /**
   * 获取所有工具名称
   *
   * @returns 已注册的工具名称数组
   */
  getNames(): string[] {
    return Array.from(this.tools.keys())
  }

  /**
   * 获取所有工具的 OpenAI function calling 定义
   *
   * 直接传入 `ChatCompletionRequest.tools` 即可。
   *
   * @returns 工具定义数组
   */
  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(tool => tool.toDefinition())
  }

  /**
   * 执行单个工具调用
   *
   * 处理流程：查找工具 → 解析 JSON 参数 → Zod 校验 → 执行 handler → 包装为 ToolMessage。
   * 任一步骤失败均返回对应的 ToolError。
   *
   * @param toolCall - 来自 LLM 的工具调用（包含 name 和 JSON 编码的 arguments）
   * @returns 成功返回 `ToolMessage`，失败返回 `ToolError`
   */
  async execute(toolCall: ToolCall): Promise<Result<ToolMessage, ToolError>> {
    const tool = this.tools.get(toolCall.function.name)

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
  }

  /**
   * 批量执行工具调用
   *
   * 支持并行和串行两种模式。
   * 任一工具执行失败即终止并返回该错误。
   *
   * @param toolCalls - 工具调用数组
   * @param options - 执行选项
   * @param options.parallel - 是否并行执行（默认 `true`）；串行模式下遇错立即中断
   * @returns 成功返回所有 `ToolMessage` 数组，失败返回第一个 `ToolError`
   */
  async executeAll(
    toolCalls: ToolCall[],
    options: { parallel?: boolean } = {},
  ): Promise<Result<ToolMessage[], ToolError>> {
    const { parallel = true } = options
    const messages: ToolMessage[] = []

    if (parallel) {
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
 *
 * @returns 空的 ToolRegistry 实例
 */
export function createToolRegistry(): ToolRegistry {
  return new ToolRegistry()
}

// =============================================================================
// Zod to JSON Schema 转换
// =============================================================================

/**
 * 将 Zod schema 转换为 JSON Schema
 *
 * 使用 Zod 4.x 内置的 `z.toJSONSchema()` 方法，
 * 并移除 `$schema` 字段（OpenAI API 不需要）。
 *
 * @param schema - Zod 类型定义
 * @returns 符合 JSON Schema 规范的对象（无 `$schema` 字段）
 */
function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const jsonSchema = zod.toJSONSchema(schema)

  // 移除 $schema 字段（OpenAI 不需要）
  const { $schema: _, ...rest } = jsonSchema as Record<string, unknown>

  return rest
}
