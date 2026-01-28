/**
 * =============================================================================
 * @hai/ai - AI 消息类型
 * =============================================================================
 * 定义与 LLM 交互的消息类型，兼容 OpenAI 格式
 * =============================================================================
 */

/**
 * 消息角色
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool'

/**
 * 文本内容块
 */
export interface TextContent {
    type: 'text'
    text: string
}

/**
 * 图片内容块
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
    name?: string
}

/**
 * 用户消息
 */
export interface UserMessage {
    role: 'user'
    content: MessageContent
    name?: string
}

/**
 * 工具调用
 */
export interface ToolCall {
    id: string
    type: 'function'
    function: {
        name: string
        arguments: string // JSON 字符串
    }
}

/**
 * 助手消息
 */
export interface AssistantMessage {
    role: 'assistant'
    content: string | null
    name?: string
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
export type ChatMessage =
    | SystemMessage
    | UserMessage
    | AssistantMessage
    | ToolMessage

/**
 * 工具定义
 */
export interface ToolDefinition {
    type: 'function'
    function: {
        name: string
        description: string
        parameters: Record<string, unknown> // JSON Schema
    }
}

/**
 * 聊天完成请求
 */
export interface ChatCompletionRequest {
    /** 消息历史 */
    messages: ChatMessage[]
    /** 模型 ID */
    model?: string
    /** 温度 (0-2) */
    temperature?: number
    /** Top P */
    top_p?: number
    /** 最大令牌数 */
    max_tokens?: number
    /** 是否流式响应 */
    stream?: boolean
    /** 可用工具 */
    tools?: ToolDefinition[]
    /** 工具选择策略 */
    tool_choice?: 'none' | 'auto' | 'required' | { type: 'function', function: { name: string } }
    /** 停止序列 */
    stop?: string | string[]
    /** 频率惩罚 */
    frequency_penalty?: number
    /** 存在惩罚 */
    presence_penalty?: number
    /** 用户标识 */
    user?: string
}

/**
 * Token 使用量
 */
export interface TokenUsage {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
}

/**
 * 聊天完成响应选项
 */
export interface ChatCompletionChoice {
    index: number
    message: AssistantMessage
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null
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
    usage?: TokenUsage
}

/**
 * 流式 Delta
 */
export interface ChatCompletionDelta {
    role?: MessageRole
    content?: string | null
    tool_calls?: Partial<ToolCall>[]
}

/**
 * 流式响应块
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
    usage?: TokenUsage
}

/**
 * 嵌入请求
 */
export interface EmbeddingRequest {
    /** 输入文本 */
    input: string | string[]
    /** 模型 ID */
    model?: string
    /** 编码格式 */
    encoding_format?: 'float' | 'base64'
    /** 降维 */
    dimensions?: number
}

/**
 * 嵌入响应
 */
export interface EmbeddingResponse {
    object: 'list'
    data: Array<{
        object: 'embedding'
        embedding: number[]
        index: number
    }>
    model: string
    usage: {
        prompt_tokens: number
        total_tokens: number
    }
}

/**
 * 模型信息
 */
export interface ModelInfo {
    id: string
    object: 'model'
    created: number
    owned_by: string
}

/**
 * 模型列表响应
 */
export interface ModelListResponse {
    object: 'list'
    data: ModelInfo[]
}
