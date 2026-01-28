/**
 * =============================================================================
 * @hai/mcp - MCP 客户端
 * =============================================================================
 * 提供 MCP 客户端实现，用于连接 MCP 服务端
 * 
 * 特性:
 * - 服务发现
 * - 工具调用
 * - 资源读取
 * - 提示获取
 * =============================================================================
 */

import type { Result } from '@hai/core'
import { createLogger, err, ok } from '@hai/core'
import type {
  MCPClientInfo,
  MCPPrompt,
  MCPPromptMessage,
  MCPResource,
  MCPResourceContent,
  MCPServerCapabilities,
  MCPServerInfo,
  MCPToolDefinition,
  MCPToolResult,
} from './types.js'

const logger = createLogger({ name: 'mcp-client' })

/**
 * MCP 客户端错误类型
 */
export type MCPClientErrorType =
  | 'CONNECTION_FAILED'
  | 'NOT_CONNECTED'
  | 'TOOL_NOT_FOUND'
  | 'TOOL_CALL_FAILED'
  | 'RESOURCE_NOT_FOUND'
  | 'RESOURCE_READ_FAILED'
  | 'PROMPT_NOT_FOUND'
  | 'PROMPT_GET_FAILED'
  | 'INVALID_RESPONSE'

/**
 * MCP 客户端错误
 */
export interface MCPClientError {
  type: MCPClientErrorType
  message: string
}

/**
 * MCP 客户端配置
 */
export interface MCPClientConfig {
  /** 客户端名称 */
  name: string
  /** 客户端版本 */
  version: string
}

/**
 * MCP 传输接口
 * 抽象传输层，支持多种传输方式
 */
export interface MCPTransport {
  /** 连接 */
  connect(): Promise<void>
  /** 断开 */
  disconnect(): Promise<void>
  /** 发送请求 */
  send(method: string, params?: unknown): Promise<unknown>
  /** 是否已连接 */
  isConnected(): boolean
}

/**
 * 内存传输（用于测试）
 */
export class InMemoryTransport implements MCPTransport {
  private connected: boolean = false
  private handlers: Map<string, (params?: unknown) => Promise<unknown> | unknown> = new Map()
  
  /**
   * 注册请求处理器
   */
  registerHandler(method: string, handler: (params?: unknown) => Promise<unknown> | unknown): void {
    this.handlers.set(method, handler)
  }
  
  async connect(): Promise<void> {
    this.connected = true
  }
  
  async disconnect(): Promise<void> {
    this.connected = false
  }
  
  async send(method: string, params?: unknown): Promise<unknown> {
    if (!this.connected) {
      throw new Error('Not connected')
    }
    
    const handler = this.handlers.get(method)
    if (!handler) {
      throw new Error(`No handler for method: ${method}`)
    }
    
    return handler(params)
  }
  
  isConnected(): boolean {
    return this.connected
  }
}

/**
 * MCP 客户端
 */
export class MCPClient {
  private config: MCPClientConfig
  private transport: MCPTransport | null = null
  private serverInfo: MCPServerInfo | null = null
  private serverCapabilities: MCPServerCapabilities | null = null
  
  constructor(config: MCPClientConfig) {
    this.config = config
    logger.info({ clientName: config.name }, 'MCP client created')
  }
  
  /**
   * 获取客户端信息
   */
  getClientInfo(): MCPClientInfo {
    return {
      name: this.config.name,
      version: this.config.version,
    }
  }
  
  /**
   * 连接到 MCP 服务端
   * 
   * @param transport - 传输层
   */
  async connect(transport: MCPTransport): Promise<Result<MCPServerInfo, MCPClientError>> {
    this.transport = transport
    
    try {
      await transport.connect()
      
      // 初始化握手
      const initResult = await transport.send('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: this.getClientInfo(),
      }) as {
        protocolVersion: string
        serverInfo: MCPServerInfo
        capabilities: MCPServerCapabilities
      }
      
      this.serverInfo = initResult.serverInfo
      this.serverCapabilities = initResult.capabilities
      
      // 发送 initialized 通知
      await transport.send('notifications/initialized', {})
      
      logger.info(
        { serverName: this.serverInfo.name },
        'Connected to MCP server',
      )
      
      return ok(this.serverInfo)
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      
      logger.error({ error }, 'Failed to connect to MCP server')
      
      return err({
        type: 'CONNECTION_FAILED',
        message: `Connection failed: ${errorMessage}`,
      })
    }
  }
  
  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.transport.disconnect()
      this.transport = null
      this.serverInfo = null
      this.serverCapabilities = null
      
      logger.info('Disconnected from MCP server')
    }
  }
  
  /**
   * 是否已连接
   */
  isConnected(): boolean {
    return this.transport?.isConnected() ?? false
  }
  
  /**
   * 获取服务器信息
   */
  getServerInfo(): MCPServerInfo | null {
    return this.serverInfo
  }
  
  /**
   * 获取服务器能力
   */
  getServerCapabilities(): MCPServerCapabilities | null {
    return this.serverCapabilities
  }
  
  /**
   * 列出可用工具
   */
  async listTools(): Promise<Result<MCPToolDefinition[], MCPClientError>> {
    if (!this.transport?.isConnected()) {
      return err({
        type: 'NOT_CONNECTED',
        message: 'Not connected to MCP server',
      })
    }
    
    try {
      const result = await this.transport.send('tools/list', {}) as {
        tools: MCPToolDefinition[]
      }
      
      return ok(result.tools)
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      
      return err({
        type: 'INVALID_RESPONSE',
        message: `Failed to list tools: ${errorMessage}`,
      })
    }
  }
  
  /**
   * 调用工具
   * 
   * @param name - 工具名称
   * @param args - 参数
   */
  async callTool(
    name: string,
    args: unknown = {},
  ): Promise<Result<MCPToolResult, MCPClientError>> {
    if (!this.transport?.isConnected()) {
      return err({
        type: 'NOT_CONNECTED',
        message: 'Not connected to MCP server',
      })
    }
    
    try {
      logger.debug({ toolName: name }, 'Calling tool')
      
      const result = await this.transport.send('tools/call', {
        name,
        arguments: args,
      }) as MCPToolResult
      
      if (result.isError) {
        logger.warn({ toolName: name }, 'Tool call returned error')
      }
      
      return ok(result)
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      
      logger.error({ toolName: name, error }, 'Tool call failed')
      
      return err({
        type: 'TOOL_CALL_FAILED',
        message: `Tool call failed: ${errorMessage}`,
      })
    }
  }
  
  /**
   * 列出可用资源
   */
  async listResources(): Promise<Result<MCPResource[], MCPClientError>> {
    if (!this.transport?.isConnected()) {
      return err({
        type: 'NOT_CONNECTED',
        message: 'Not connected to MCP server',
      })
    }
    
    try {
      const result = await this.transport.send('resources/list', {}) as {
        resources: MCPResource[]
      }
      
      return ok(result.resources)
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      
      return err({
        type: 'INVALID_RESPONSE',
        message: `Failed to list resources: ${errorMessage}`,
      })
    }
  }
  
  /**
   * 读取资源
   * 
   * @param uri - 资源 URI
   */
  async readResource(uri: string): Promise<Result<MCPResourceContent, MCPClientError>> {
    if (!this.transport?.isConnected()) {
      return err({
        type: 'NOT_CONNECTED',
        message: 'Not connected to MCP server',
      })
    }
    
    try {
      logger.debug({ resourceUri: uri }, 'Reading resource')
      
      const result = await this.transport.send('resources/read', {
        uri,
      }) as { contents: MCPResourceContent[] }
      
      if (result.contents.length === 0) {
        return err({
          type: 'RESOURCE_NOT_FOUND',
          message: `Resource not found: ${uri}`,
        })
      }
      
      return ok(result.contents[0])
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      
      logger.error({ resourceUri: uri, error }, 'Resource read failed')
      
      return err({
        type: 'RESOURCE_READ_FAILED',
        message: `Resource read failed: ${errorMessage}`,
      })
    }
  }
  
  /**
   * 列出可用提示
   */
  async listPrompts(): Promise<Result<MCPPrompt[], MCPClientError>> {
    if (!this.transport?.isConnected()) {
      return err({
        type: 'NOT_CONNECTED',
        message: 'Not connected to MCP server',
      })
    }
    
    try {
      const result = await this.transport.send('prompts/list', {}) as {
        prompts: MCPPrompt[]
      }
      
      return ok(result.prompts)
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      
      return err({
        type: 'INVALID_RESPONSE',
        message: `Failed to list prompts: ${errorMessage}`,
      })
    }
  }
  
  /**
   * 获取提示
   * 
   * @param name - 提示名称
   * @param args - 参数
   */
  async getPrompt(
    name: string,
    args: Record<string, string> = {},
  ): Promise<Result<MCPPromptMessage[], MCPClientError>> {
    if (!this.transport?.isConnected()) {
      return err({
        type: 'NOT_CONNECTED',
        message: 'Not connected to MCP server',
      })
    }
    
    try {
      logger.debug({ promptName: name }, 'Getting prompt')
      
      const result = await this.transport.send('prompts/get', {
        name,
        arguments: args,
      }) as { messages: MCPPromptMessage[] }
      
      return ok(result.messages)
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      
      logger.error({ promptName: name, error }, 'Prompt get failed')
      
      return err({
        type: 'PROMPT_GET_FAILED',
        message: `Prompt get failed: ${errorMessage}`,
      })
    }
  }
}

/**
 * 创建 MCP 客户端
 * 
 * @param config - 客户端配置
 */
export function createMCPClient(config: MCPClientConfig): MCPClient {
  return new MCPClient(config)
}
