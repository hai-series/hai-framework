/**
 * =============================================================================
 * @hai/ai - 统一类型定义
 * =============================================================================
 * AI 模块所有子模块的类型定义
 * =============================================================================
 */

// =============================================================================
// AI 提供者类型
// =============================================================================

/**
 * AI 提供者类型
 */
export type AIProvider = 'hai' | 'openai' | 'azure' | 'anthropic' | 'google' | 'custom'

/**
 * AI 错误类型
 */
export type AIErrorType =
    // LLM 错误
    | 'API_ERROR'
    | 'INVALID_REQUEST'
    | 'RATE_LIMITED'
    | 'TIMEOUT'
    | 'MODEL_NOT_FOUND'
    | 'CONTEXT_LENGTH_EXCEEDED'
    // MCP 错误
    | 'MCP_CONNECTION_ERROR'
    | 'MCP_PROTOCOL_ERROR'
    | 'MCP_TOOL_ERROR'
    | 'MCP_RESOURCE_ERROR'
    // 技能错误
    | 'SKILL_NOT_FOUND'
    | 'SKILL_EXECUTION_ERROR'
    | 'SKILL_VALIDATION_ERROR'
    // 通用错误
    | 'CONFIGURATION_ERROR'
    | 'INTERNAL_ERROR'

/**
 * AI 错误
 */
export interface AIError {
    type: AIErrorType
    message: string
    code?: string
    cause?: unknown
}

// =============================================================================
// LLM 相关类型
// =============================================================================

/**
 * 消息角色
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool'

/**
 * 文本内容
 */
export interface TextContent {
    type: 'text'
    text: string
}

/**
 * 图片内容
 */
export interface ImageContent {
    type: 'image_url'
    image_url: {
        url: string
        detail?: 'auto' | 'low' | 'high'
    }
}

/**
 * 消息内容
 */
export type MessageContent = string | (TextContent | ImageContent)[]

/**
 * 系统消息
 */
export interface SystemMessage {
    role: 'system'
    content: string
}

/**
 * 用户消息
 */
export interface UserMessage {
    role: 'user'
    content: MessageContent
}

/**
 * 工具调用
 */
export interface ToolCall {
    id: string
    type: 'function'
    function: {
        name: string
        arguments: string
    }
}

/**
 * 助手消息
 */
export interface AssistantMessage {
    role: 'assistant'
    content: string | null
    tool_calls?: ToolCall[]
}

/**
 * 工具消息
 */
export interface ToolMessage {
    role: 'tool'
    content: string
    tool_call_id: string
}

/**
 * 聊天消息
 */
export type ChatMessage = SystemMessage | UserMessage | AssistantMessage | ToolMessage

/**
 * 工具定义
 */
export interface ToolDefinition {
    type: 'function'
    function: {
        name: string
        description: string
        parameters: Record<string, unknown>
    }
}

/**
 * 聊天完成请求
 */
export interface ChatCompletionRequest {
    model: string
    messages: ChatMessage[]
    temperature?: number
    top_p?: number
    max_tokens?: number
    stream?: boolean
    tools?: ToolDefinition[]
    tool_choice?: 'auto' | 'none' | { type: 'function', function: { name: string } }
}

/**
 * Token 使用统计
 */
export interface TokenUsage {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
}

/**
 * 聊天完成选择
 */
export interface ChatCompletionChoice {
    index: number
    message: AssistantMessage
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter'
}

/**
 * 聊天完成响应
 */
export interface ChatCompletionResponse {
    id: string
    object: 'chat.completion'
    created: number
    model: string
    choices: ChatCompletionChoice[]
    usage: TokenUsage
}

/**
 * 流式增量
 */
export interface ChatCompletionDelta {
    role?: 'assistant'
    content?: string
    tool_calls?: Array<{
        index: number
        id?: string
        type?: 'function'
        function?: {
            name?: string
            arguments?: string
        }
    }>
}

/**
 * 流式块
 */
export interface ChatCompletionChunk {
    id: string
    object: 'chat.completion.chunk'
    created: number
    model: string
    choices: Array<{
        index: number
        delta: ChatCompletionDelta
        finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null
    }>
}

// =============================================================================
// MCP 相关类型
// =============================================================================

/**
 * MCP 工具定义
 */
export interface MCPToolDefinition {
    name: string
    description: string
    inputSchema: Record<string, unknown>
}

/**
 * MCP 工具处理器
 */
export type MCPToolHandler<TInput = unknown, TOutput = unknown> = (
    input: TInput,
    context: MCPContext,
) => Promise<TOutput> | TOutput

/**
 * MCP 执行上下文
 */
export interface MCPContext {
    requestId?: string
    clientInfo?: {
        name: string
        version: string
    }
    metadata?: Record<string, unknown>
}

/**
 * MCP 资源
 */
export interface MCPResource {
    uri: string
    name: string
    description?: string
    mimeType?: string
}

/**
 * MCP 资源内容
 */
export interface MCPResourceContent {
    uri: string
    mimeType?: string
    text?: string
    blob?: string
}

/**
 * MCP 提示
 */
export interface MCPPrompt {
    name: string
    description?: string
    arguments?: MCPPromptArgument[]
}

/**
 * MCP 提示参数
 */
export interface MCPPromptArgument {
    name: string
    description?: string
    required?: boolean
}

/**
 * MCP 提示消息
 */
export interface MCPPromptMessage {
    role: 'user' | 'assistant'
    content: MCPPromptContent
}

/**
 * MCP 提示内容
 */
export interface MCPPromptContent {
    type: 'text' | 'resource'
    text?: string
    resource?: {
        uri: string
        text?: string
        blob?: string
        mimeType?: string
    }
}

/**
 * MCP 服务器能力
 */
export interface MCPServerCapabilities {
    tools?: boolean
    resources?: boolean
    prompts?: boolean
}

/**
 * MCP 服务器信息
 */
export interface MCPServerInfo {
    name: string
    version: string
    capabilities: MCPServerCapabilities
}

/**
 * MCP 客户端信息
 */
export interface MCPClientInfo {
    name: string
    version: string
}

// =============================================================================
// 技能相关类型
// =============================================================================

/**
 * 技能元数据
 */
export interface SkillMetadata {
    name: string
    description?: string
    version?: string
    tags?: string[]
    author?: string
}

/**
 * 技能上下文
 */
export interface SkillContext {
    requestId?: string
    userId?: string
    metadata?: Record<string, unknown>
}

/**
 * 技能结果
 */
export interface SkillResult<T = unknown> {
    success: boolean
    data?: T
    error?: string
}

/**
 * 技能定义
 */
export interface Skill<TInput = unknown, TOutput = unknown> {
    metadata: SkillMetadata
    execute: (input: TInput, context: SkillContext) => Promise<SkillResult<TOutput>>
}

/**
 * 技能查询
 */
export interface SkillQuery {
    name?: string
    tags?: string[]
    author?: string
}

// =============================================================================
// AI 配置
// =============================================================================

/**
 * LLM 配置
 */
export interface LLMConfig {
    provider: AIProvider
    apiKey?: string
    baseUrl?: string
    model?: string
    maxTokens?: number
    temperature?: number
}

/**
 * MCP 服务器配置
 */
export interface MCPServerConfig {
    name: string
    version: string
    capabilities?: MCPServerCapabilities
}

/**
 * MCP 客户端配置
 */
export interface MCPClientConfig {
    serverUrl?: string
    timeout?: number
}

/**
 * AI 模块配置
 */
export interface AIConfig {
    provider: AIProvider
    llm?: LLMConfig
    mcp?: {
        server?: MCPServerConfig
        client?: MCPClientConfig
    }
}

// =============================================================================
// 提供者接口
// =============================================================================

/**
 * LLM 提供者接口
 */
export interface LLMProvider {
    /** 聊天完成 */
    chat(request: ChatCompletionRequest): Promise<import('@hai/core').Result<ChatCompletionResponse, AIError>>
    /** 流式聊天完成 */
    chatStream(request: ChatCompletionRequest): AsyncIterable<ChatCompletionChunk>
    /** 获取模型列表 */
    listModels(): Promise<import('@hai/core').Result<string[], AIError>>
}

/**
 * MCP 提供者接口
 */
export interface MCPProvider {
    /** 注册工具 */
    registerTool<TInput, TOutput>(
        definition: MCPToolDefinition,
        handler: MCPToolHandler<TInput, TOutput>,
    ): void
    /** 注册资源 */
    registerResource(
        resource: MCPResource,
        handler: () => Promise<MCPResourceContent>,
    ): void
    /** 注册提示 */
    registerPrompt(
        prompt: MCPPrompt,
        handler: (args: Record<string, string>) => Promise<MCPPromptMessage[]>,
    ): void
    /** 调用工具 */
    callTool(name: string, args: unknown, context?: MCPContext): Promise<import('@hai/core').Result<unknown, AIError>>
    /** 读取资源 */
    readResource(uri: string): Promise<import('@hai/core').Result<MCPResourceContent, AIError>>
    /** 获取提示 */
    getPrompt(name: string, args: Record<string, string>): Promise<import('@hai/core').Result<MCPPromptMessage[], AIError>>
}

/**
 * 技能提供者接口
 */
export interface SkillsProvider {
    /** 注册技能 */
    register<TInput, TOutput>(skill: Skill<TInput, TOutput>): void
    /** 注销技能 */
    unregister(name: string): void
    /** 获取技能 */
    get(name: string): Skill | undefined
    /** 查询技能 */
    query(query: SkillQuery): Skill[]
    /** 执行技能 */
    execute<TInput, TOutput>(
        name: string,
        input: TInput,
        context?: SkillContext,
    ): Promise<import('@hai/core').Result<SkillResult<TOutput>, AIError>>
}

/**
 * AI 服务接口
 */
export interface AIService {
    /** LLM 服务 */
    readonly llm: LLMProvider
    /** MCP 服务 */
    readonly mcp: MCPProvider
    /** 技能服务 */
    readonly skills: SkillsProvider
    /** 初始化 */
    initialize(): Promise<import('@hai/core').Result<void, AIError>>
    /** 关闭 */
    shutdown(): Promise<import('@hai/core').Result<void, AIError>>
}
