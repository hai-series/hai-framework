/**
 * =============================================================================
 * @hai/skills - 技能定义
 * =============================================================================
 * 提供类型安全的技能定义和执行
 * 
 * 特性:
 * - Zod schema 类型推断
 * - 上下文注入
 * - 生命周期钩子
 * - 权限控制
 * =============================================================================
 */

import type { Result } from '@hai/core'
import { createLogger, err, ok, generateId } from '@hai/core'
import type { z } from 'zod'
import type { ToolDefinition } from '@hai/ai'

const logger = createLogger({ name: 'skills' })

/**
 * 技能错误类型
 */
export type SkillErrorType =
  | 'SKILL_NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'EXECUTION_FAILED'
  | 'PERMISSION_DENIED'
  | 'TIMEOUT'
  | 'DISABLED'

/**
 * 技能错误
 */
export interface SkillError {
  type: SkillErrorType
  message: string
  skillName?: string
  details?: unknown
}

/**
 * 技能执行上下文
 */
export interface SkillContext {
  /** 请求 ID */
  requestId: string
  /** 用户 ID */
  userId?: string
  /** 用户角色 */
  roles?: string[]
  /** 会话 ID */
  sessionId?: string
  /** 追踪 ID */
  traceId?: string
  /** 自定义数据 */
  metadata?: Record<string, unknown>
}

/**
 * 技能执行结果
 */
export interface SkillResult<T = unknown> {
  /** 结果数据 */
  data: T
  /** 执行耗时（毫秒） */
  duration: number
  /** 额外元数据 */
  metadata?: Record<string, unknown>
}

/**
 * 技能定义选项
 */
export interface DefineSkillOptions<
  TInput,
  TOutput,
  TContext extends SkillContext = SkillContext,
> {
  /** 技能名称（唯一标识） */
  name: string
  /** 技能显示名称 */
  displayName?: string
  /** 技能描述 */
  description: string
  /** 技能分类 */
  category?: string
  /** 技能标签 */
  tags?: string[]
  /** 输入参数 schema (Zod) */
  schema: z.ZodType<TInput>
  /** 所需权限 */
  permissions?: string[]
  /** 是否启用 */
  enabled?: boolean
  /** 超时时间（毫秒） */
  timeout?: number
  /** 速率限制（每分钟调用次数） */
  rateLimit?: number
  /** 技能处理函数 */
  handler: (input: TInput, context: TContext) => Promise<TOutput> | TOutput
  /** 执行前钩子 */
  beforeExecute?: (input: TInput, context: TContext) => Promise<void> | void
  /** 执行后钩子 */
  afterExecute?: (
    input: TInput,
    output: TOutput,
    context: TContext,
  ) => Promise<void> | void
  /** 错误处理钩子 */
  onError?: (error: Error, input: TInput, context: TContext) => void
}

/**
 * 技能实例
 */
export interface Skill<
  TInput = unknown,
  TOutput = unknown,
  TContext extends SkillContext = SkillContext,
> {
  /** 技能名称 */
  readonly name: string
  /** 技能显示名称 */
  readonly displayName: string
  /** 技能描述 */
  readonly description: string
  /** 技能分类 */
  readonly category?: string
  /** 技能标签 */
  readonly tags: string[]
  /** 输入 schema */
  readonly schema: z.ZodType<TInput>
  /** 所需权限 */
  readonly permissions: string[]
  /** 是否启用 */
  enabled: boolean
  /** 超时时间 */
  readonly timeout?: number
  /** 速率限制 */
  readonly rateLimit?: number
  
  /**
   * 执行技能
   * 
   * @param input - 输入参数
   * @param context - 执行上下文
   */
  execute(
    input: TInput,
    context?: Partial<TContext>,
  ): Promise<Result<SkillResult<TOutput>, SkillError>>
  
  /**
   * 验证输入参数
   * 
   * @param input - 输入参数
   */
  validate(input: unknown): Result<TInput, SkillError>
  
  /**
   * 检查权限
   * 
   * @param roles - 用户角色
   */
  checkPermission(roles: string[]): boolean
  
  /**
   * 转换为 AI 工具定义
   */
  toToolDefinition(): ToolDefinition
  
  /**
   * 获取技能元数据
   */
  getMetadata(): SkillMetadata
}

/**
 * 技能元数据
 */
export interface SkillMetadata {
  name: string
  displayName: string
  description: string
  category?: string
  tags: string[]
  permissions: string[]
  enabled: boolean
  timeout?: number
  rateLimit?: number
  schema: Record<string, unknown>
}

/**
 * 定义技能
 * 
 * @param options - 技能选项
 * @returns 技能实例
 * 
 * @example
 * ```ts
 * const searchSkill = defineSkill({
 *   name: 'search_documents',
 *   description: 'Search for documents',
 *   schema: z.object({
 *     query: z.string(),
 *     limit: z.number().optional().default(10),
 *   }),
 *   permissions: ['documents:read'],
 *   handler: async ({ query, limit }, ctx) => {
 *     // 搜索逻辑
 *     return { results: [], total: 0 }
 *   },
 * })
 * ```
 */
export function defineSkill<
  TInput,
  TOutput,
  TContext extends SkillContext = SkillContext,
>(
  options: DefineSkillOptions<TInput, TOutput, TContext>,
): Skill<TInput, TOutput, TContext> {
  const {
    name,
    displayName = name,
    description,
    category,
    tags = [],
    schema,
    permissions = [],
    enabled = true,
    timeout,
    rateLimit,
    handler,
    beforeExecute,
    afterExecute,
    onError,
  } = options
  
  let isEnabled = enabled
  
  return {
    name,
    displayName,
    description,
    category,
    tags,
    schema,
    permissions,
    timeout,
    rateLimit,
    
    get enabled() {
      return isEnabled
    },
    set enabled(value: boolean) {
      isEnabled = value
    },
    
    async execute(
      input: TInput,
      contextOverrides?: Partial<TContext>,
    ): Promise<Result<SkillResult<TOutput>, SkillError>> {
      // 检查是否启用
      if (!isEnabled) {
        return err({
          type: 'DISABLED',
          message: `Skill '${name}' is disabled`,
          skillName: name,
        })
      }
      
      // 构建完整上下文
      const context: TContext = {
        requestId: generateId(),
        ...contextOverrides,
      } as TContext
      
      // 检查权限
      if (permissions.length > 0 && context.roles) {
        if (!this.checkPermission(context.roles)) {
          return err({
            type: 'PERMISSION_DENIED',
            message: `Permission denied for skill '${name}'`,
            skillName: name,
          })
        }
      }
      
      // 验证输入
      const validateResult = this.validate(input)
      if (!validateResult.ok) {
        return validateResult as Result<SkillResult<TOutput>, SkillError>
      }
      
      const validatedInput = validateResult.value
      const startTime = performance.now()
      
      try {
        // 执行前钩子
        if (beforeExecute) {
          await beforeExecute(validatedInput, context)
        }
        
        // 执行技能
        logger.debug({ skillName: name, requestId: context.requestId }, 'Executing skill')
        
        let output: TOutput
        
        if (timeout) {
          // 带超时执行
          output = await Promise.race([
            Promise.resolve(handler(validatedInput, context)),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Skill execution timeout')), timeout),
            ),
          ])
        }
        else {
          output = await handler(validatedInput, context)
        }
        
        const duration = performance.now() - startTime
        
        // 执行后钩子
        if (afterExecute) {
          await afterExecute(validatedInput, output, context)
        }
        
        logger.debug(
          { skillName: name, requestId: context.requestId, duration },
          'Skill executed successfully',
        )
        
        return ok({
          data: output,
          duration,
        })
      }
      catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error))
        
        logger.error(
          { skillName: name, requestId: context.requestId, error: errorObj },
          'Skill execution failed',
        )
        
        // 错误钩子
        if (onError) {
          try {
            onError(errorObj, validatedInput, context)
          }
          catch {
            // 忽略钩子错误
          }
        }
        
        if (errorObj.message.includes('timeout')) {
          return err({
            type: 'TIMEOUT',
            message: `Skill '${name}' execution timed out`,
            skillName: name,
          })
        }
        
        return err({
          type: 'EXECUTION_FAILED',
          message: errorObj.message,
          skillName: name,
          details: errorObj,
        })
      }
    },
    
    validate(input: unknown): Result<TInput, SkillError> {
      const result = schema.safeParse(input)
      
      if (!result.success) {
        return err({
          type: 'VALIDATION_FAILED',
          message: result.error.message,
          skillName: name,
          details: result.error.errors,
        })
      }
      
      return ok(result.data)
    },
    
    checkPermission(roles: string[]): boolean {
      if (permissions.length === 0) {
        return true
      }
      
      // 检查是否有任一所需权限
      return permissions.some(perm => roles.includes(perm))
    },
    
    toToolDefinition(): ToolDefinition {
      return {
        type: 'function',
        function: {
          name,
          description,
          parameters: zodToJsonSchema(schema),
        },
      }
    },
    
    getMetadata(): SkillMetadata {
      return {
        name,
        displayName,
        description,
        category,
        tags,
        permissions,
        enabled: isEnabled,
        timeout,
        rateLimit,
        schema: zodToJsonSchema(schema),
      }
    },
  }
}

/**
 * 将 Zod schema 转换为 JSON Schema
 */
function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
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
      return { const: def.value }
    default:
      return { type: 'object' }
  }
}

function buildStringSchema(def: any): Record<string, unknown> {
  const schema: Record<string, unknown> = { type: 'string' }
  
  if (def.checks) {
    for (const check of def.checks) {
      if (check.kind === 'min') schema.minLength = check.value
      else if (check.kind === 'max') schema.maxLength = check.value
      else if (check.kind === 'regex') schema.pattern = check.regex.source
      else if (check.kind === 'email') schema.format = 'email'
      else if (check.kind === 'url') schema.format = 'uri'
    }
  }
  
  if (def.description) schema.description = def.description
  return schema
}

function buildNumberSchema(def: any): Record<string, unknown> {
  const schema: Record<string, unknown> = { type: 'number' }
  
  if (def.checks) {
    for (const check of def.checks) {
      if (check.kind === 'min') schema.minimum = check.value
      else if (check.kind === 'max') schema.maximum = check.value
      else if (check.kind === 'int') schema.type = 'integer'
    }
  }
  
  if (def.description) schema.description = def.description
  return schema
}

function buildObjectSchema(def: any): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  const required: string[] = []
  
  for (const [key, value] of Object.entries(def.shape())) {
    properties[key] = zodToJsonSchema(value as z.ZodType)
    
    const valueDef = (value as any)._def
    if (valueDef.typeName !== 'ZodOptional' && valueDef.typeName !== 'ZodDefault') {
      required.push(key)
    }
  }
  
  const schema: Record<string, unknown> = { type: 'object', properties }
  if (required.length > 0) schema.required = required
  if (def.description) schema.description = def.description
  
  return schema
}
