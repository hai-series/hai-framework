/**
 * =============================================================================
 * @hai/mcp - MCP 服务端
 * =============================================================================
 * 提供 MCP 服务端实现
 * 
 * 特性:
 * - 工具注册
 * - 资源管理
 * - 提示管理
 * - 传输层抽象
 * =============================================================================
 */

import { createLogger, generateId } from '@hai/core'
import type { z } from 'zod'
import type {
  MCPContext,
  MCPPrompt,
  MCPPromptMessage,
  MCPPromptOptions,
  MCPResource,
  MCPResourceContent,
  MCPResourceOptions,
  MCPServerCapabilities,
  MCPServerInfo,
  MCPToolDefinition,
  MCPToolHandler,
  MCPToolOptions,
  MCPToolResult,
} from './types.js'

const logger = createLogger({ name: 'mcp-server' })

/**
 * MCP 服务端配置
 */
export interface MCPServerConfig {
  /** 服务器名称 */
  name: string
  /** 服务器版本 */
  version: string
  /** 能力配置 */
  capabilities?: MCPServerCapabilities
}

/**
 * 注册的工具
 */
interface RegisteredTool {
  definition: MCPToolDefinition
  handler: MCPToolHandler
  schema: z.ZodType
}

/**
 * 注册的资源
 */
interface RegisteredResource {
  definition: MCPResource
  uriTemplate: string
  handler: (uri: string, context: MCPContext) => Promise<MCPResourceContent> | MCPResourceContent
}

/**
 * 注册的提示
 */
interface RegisteredPrompt {
  definition: MCPPrompt
  handler: (
    args: Record<string, string>,
    context: MCPContext,
  ) => Promise<MCPPromptMessage[]> | MCPPromptMessage[]
}

/**
 * MCP 服务端
 */
export class MCPServer {
  private config: MCPServerConfig
  private tools: Map<string, RegisteredTool> = new Map()
  private resources: Map<string, RegisteredResource> = new Map()
  private prompts: Map<string, RegisteredPrompt> = new Map()
  
  constructor(config: MCPServerConfig) {
    this.config = {
      ...config,
      capabilities: config.capabilities ?? {
        tools: {},
        resources: {},
        prompts: {},
      },
    }
    
    logger.info({ serverName: config.name }, 'MCP server created')
  }
  
  /**
   * 获取服务器信息
   */
  getServerInfo(): MCPServerInfo {
    return {
      name: this.config.name,
      version: this.config.version,
      protocolVersion: '2024-11-05',
    }
  }
  
  /**
   * 获取服务器能力
   */
  getCapabilities(): MCPServerCapabilities {
    return this.config.capabilities ?? {}
  }
  
  /**
   * 注册工具
   * 
   * @param options - 工具选项
   */
  registerTool<TInput>(options: MCPToolOptions<TInput>): this {
    const { name, description, schema, handler } = options
    
    if (this.tools.has(name)) {
      logger.warn({ toolName: name }, 'Overwriting existing tool')
    }
    
    const definition: MCPToolDefinition = {
      name,
      description,
      inputSchema: zodToJsonSchema(schema),
    }
    
    this.tools.set(name, {
      definition,
      handler: handler as MCPToolHandler,
      schema,
    })
    
    logger.info({ toolName: name }, 'Tool registered')
    
    return this
  }
  
  /**
   * 注销工具
   * 
   * @param name - 工具名称
   */
  unregisterTool(name: string): boolean {
    const deleted = this.tools.delete(name)
    
    if (deleted) {
      logger.info({ toolName: name }, 'Tool unregistered')
    }
    
    return deleted
  }
  
  /**
   * 获取所有工具定义
   */
  listTools(): MCPToolDefinition[] {
    return Array.from(this.tools.values()).map(t => t.definition)
  }
  
  /**
   * 调用工具
   * 
   * @param name - 工具名称
   * @param args - 参数
   * @param context - 上下文
   */
  async callTool(
    name: string,
    args: unknown,
    context: MCPContext = {},
  ): Promise<MCPToolResult> {
    const tool = this.tools.get(name)
    
    if (!tool) {
      logger.warn({ toolName: name }, 'Tool not found')
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Tool '${name}' not found`,
          },
        ],
      }
    }
    
    // 验证输入
    const parseResult = tool.schema.safeParse(args)
    
    if (!parseResult.success) {
      logger.warn(
        { toolName: name, errors: parseResult.error.errors },
        'Tool input validation failed',
      )
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Validation error: ${parseResult.error.message}`,
          },
        ],
      }
    }
    
    try {
      logger.debug({ toolName: name }, 'Calling tool')
      
      const result = await tool.handler(parseResult.data, {
        ...context,
        requestId: context.requestId ?? generateId(),
      })
      
      logger.debug({ toolName: name }, 'Tool call completed')
      
      // 格式化结果
      return {
        content: [
          {
            type: 'text',
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
          },
        ],
      }
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      
      logger.error({ toolName: name, error }, 'Tool call failed')
      
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error: ${errorMessage}`,
          },
        ],
      }
    }
  }
  
  /**
   * 注册资源
   * 
   * @param options - 资源选项
   */
  registerResource(options: MCPResourceOptions): this {
    const { uriTemplate, name, description, mimeType, handler } = options
    
    if (this.resources.has(name)) {
      logger.warn({ resourceName: name }, 'Overwriting existing resource')
    }
    
    const definition: MCPResource = {
      uri: uriTemplate,
      name,
      description,
      mimeType,
    }
    
    this.resources.set(name, {
      definition,
      uriTemplate,
      handler,
    })
    
    logger.info({ resourceName: name }, 'Resource registered')
    
    return this
  }
  
  /**
   * 注销资源
   * 
   * @param name - 资源名称
   */
  unregisterResource(name: string): boolean {
    const deleted = this.resources.delete(name)
    
    if (deleted) {
      logger.info({ resourceName: name }, 'Resource unregistered')
    }
    
    return deleted
  }
  
  /**
   * 获取所有资源定义
   */
  listResources(): MCPResource[] {
    return Array.from(this.resources.values()).map(r => r.definition)
  }
  
  /**
   * 读取资源
   * 
   * @param uri - 资源 URI
   * @param context - 上下文
   */
  async readResource(
    uri: string,
    context: MCPContext = {},
  ): Promise<MCPResourceContent | null> {
    // 查找匹配的资源
    for (const resource of this.resources.values()) {
      if (this.matchUri(uri, resource.uriTemplate)) {
        try {
          logger.debug({ resourceUri: uri }, 'Reading resource')
          
          const content = await resource.handler(uri, {
            ...context,
            requestId: context.requestId ?? generateId(),
          })
          
          return content
        }
        catch (error) {
          logger.error({ resourceUri: uri, error }, 'Resource read failed')
          return null
        }
      }
    }
    
    logger.warn({ resourceUri: uri }, 'Resource not found')
    return null
  }
  
  /**
   * 匹配 URI 模板
   */
  private matchUri(uri: string, template: string): boolean {
    // 简单实现：将模板中的 {param} 转换为正则
    const pattern = template.replace(/\{[^}]+\}/g, '[^/]+')
    const regex = new RegExp(`^${pattern}$`)
    return regex.test(uri)
  }
  
  /**
   * 注册提示
   * 
   * @param options - 提示选项
   */
  registerPrompt(options: MCPPromptOptions): this {
    const { name, description, arguments: args, handler } = options
    
    if (this.prompts.has(name)) {
      logger.warn({ promptName: name }, 'Overwriting existing prompt')
    }
    
    const definition: MCPPrompt = {
      name,
      description,
      arguments: args,
    }
    
    this.prompts.set(name, {
      definition,
      handler,
    })
    
    logger.info({ promptName: name }, 'Prompt registered')
    
    return this
  }
  
  /**
   * 注销提示
   * 
   * @param name - 提示名称
   */
  unregisterPrompt(name: string): boolean {
    const deleted = this.prompts.delete(name)
    
    if (deleted) {
      logger.info({ promptName: name }, 'Prompt unregistered')
    }
    
    return deleted
  }
  
  /**
   * 获取所有提示定义
   */
  listPrompts(): MCPPrompt[] {
    return Array.from(this.prompts.values()).map(p => p.definition)
  }
  
  /**
   * 获取提示
   * 
   * @param name - 提示名称
   * @param args - 参数
   * @param context - 上下文
   */
  async getPrompt(
    name: string,
    args: Record<string, string> = {},
    context: MCPContext = {},
  ): Promise<MCPPromptMessage[] | null> {
    const prompt = this.prompts.get(name)
    
    if (!prompt) {
      logger.warn({ promptName: name }, 'Prompt not found')
      return null
    }
    
    try {
      logger.debug({ promptName: name }, 'Getting prompt')
      
      const messages = await prompt.handler(args, {
        ...context,
        requestId: context.requestId ?? generateId(),
      })
      
      return messages
    }
    catch (error) {
      logger.error({ promptName: name, error }, 'Prompt get failed')
      return null
    }
  }
  
  /**
   * 获取工具数量
   */
  get toolCount(): number {
    return this.tools.size
  }
  
  /**
   * 获取资源数量
   */
  get resourceCount(): number {
    return this.resources.size
  }
  
  /**
   * 获取提示数量
   */
  get promptCount(): number {
    return this.prompts.size
  }
}

/**
 * 创建 MCP 服务端
 * 
 * @param config - 服务端配置
 */
export function createMCPServer(config: MCPServerConfig): MCPServer {
  return new MCPServer(config)
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
