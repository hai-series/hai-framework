/**
 * =============================================================================
 * @hai/ai - 工具调用
 * =============================================================================
 * 提供 LLM 工具调用的定义和执行功能
 * 
 * 特性:
 * - Zod schema 类型推断
 * - 工具注册
 * - 自动参数验证
 * - 执行追踪
 * =============================================================================
 */

import type { Result } from '@hai/core'
import { err, ok } from '@hai/core'
import type { z } from 'zod'
import type { ToolDefinition, ToolCall, ToolMessage } from './types.js'

/**
 * 工具错误类型
 */
export type ToolErrorType =
    | 'TOOL_NOT_FOUND'
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
                    console.warn(
                        JSON.stringify({ toolName: name, errors: parseResult.error.errors, message: 'Tool input validation failed' }),
                    )
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
                console.error(JSON.stringify({ toolName: name, error: error instanceof Error ? error.message : error, message: 'Tool execution failed' }))
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
        if (this.tools.has(tool.name)) {
            logger.warn({ toolName: tool.name }, 'Overwriting existing tool')
        }

        this.tools.set(tool.name, tool as Tool)
        logger.info({ toolName: tool.name }, 'Tool registered')

        return this
    }

    /**
     * 批量注册工具
     * 
     * @param tools - 工具数组
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerMany(tools: Tool<any, any>[]): this {
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
        const deleted = this.tools.delete(name)
        if (deleted) {
            logger.info({ toolName: name }, 'Tool unregistered')
        }
        return deleted
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

/**
 * 将 Zod schema 转换为 JSON Schema
 * 简化实现，支持常用类型
 */
function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
    // 使用 Zod 内置的 _def 来获取类型信息
    const def = (schema as any)._def

    switch (def.typeName) {
        case 'ZodString':
            return buildStringSchema(def)
        case 'ZodNumber':
            return buildNumberSchema(def)
        case 'ZodBoolean':
            return { type: 'boolean' }
        case 'ZodArray':
            return {
                type: 'array',
                items: zodToJsonSchema(def.type),
            }
        case 'ZodObject':
            return buildObjectSchema(def)
        case 'ZodEnum':
            return {
                type: 'string',
                enum: def.values,
            }
        case 'ZodOptional':
            return zodToJsonSchema(def.innerType)
        case 'ZodNullable':
            return {
                anyOf: [
                    zodToJsonSchema(def.innerType),
                    { type: 'null' },
                ],
            }
        case 'ZodDefault':
            return {
                ...zodToJsonSchema(def.innerType),
                default: def.defaultValue(),
            }
        case 'ZodUnion':
            return {
                anyOf: def.options.map((opt: z.ZodType) => zodToJsonSchema(opt)),
            }
        case 'ZodLiteral':
            return {
                const: def.value,
            }
        default:
            // 回退到基本对象类型
            return { type: 'object' }
    }
}

/**
 * 构建字符串 schema
 */
function buildStringSchema(def: any): Record<string, unknown> {
    const schema: Record<string, unknown> = { type: 'string' }

    if (def.checks) {
        for (const check of def.checks) {
            if (check.kind === 'min') {
                schema.minLength = check.value
            }
            else if (check.kind === 'max') {
                schema.maxLength = check.value
            }
            else if (check.kind === 'regex') {
                schema.pattern = check.regex.source
            }
            else if (check.kind === 'email') {
                schema.format = 'email'
            }
            else if (check.kind === 'url') {
                schema.format = 'uri'
            }
        }
    }

    // 获取描述
    if (def.description) {
        schema.description = def.description
    }

    return schema
}

/**
 * 构建数字 schema
 */
function buildNumberSchema(def: any): Record<string, unknown> {
    const schema: Record<string, unknown> = { type: 'number' }

    if (def.checks) {
        for (const check of def.checks) {
            if (check.kind === 'min') {
                schema.minimum = check.value
            }
            else if (check.kind === 'max') {
                schema.maximum = check.value
            }
            else if (check.kind === 'int') {
                schema.type = 'integer'
            }
        }
    }

    if (def.description) {
        schema.description = def.description
    }

    return schema
}

/**
 * 构建对象 schema
 */
function buildObjectSchema(def: any): Record<string, unknown> {
    const properties: Record<string, unknown> = {}
    const required: string[] = []

    for (const [key, value] of Object.entries(def.shape())) {
        properties[key] = zodToJsonSchema(value as z.ZodType)

        // 检查是否必需
        const valueDef = (value as any)._def
        if (valueDef.typeName !== 'ZodOptional' && valueDef.typeName !== 'ZodDefault') {
            required.push(key)
        }
    }

    const schema: Record<string, unknown> = {
        type: 'object',
        properties,
    }

    if (required.length > 0) {
        schema.required = required
    }

    if (def.description) {
        schema.description = def.description
    }

    return schema
}
