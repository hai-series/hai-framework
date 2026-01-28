/**
 * =============================================================================
 * @hai/ai - 主入口
 * =============================================================================
 * AI 模块，提供:
 * - LLM 适配器（OpenAI 兼容）
 * - 流式响应处理
 * - 工具调用
 * =============================================================================
 */

// 类型
export type {
    MessageRole,
    TextContent,
    ImageContent,
    MessageContent,
    SystemMessage,
    UserMessage,
    AssistantMessage,
    ToolMessage,
    ToolCall,
    ChatMessage,
    ToolDefinition,
    ChatCompletionRequest,
    TokenUsage,
    ChatCompletionChoice,
    ChatCompletionResponse,
    ChatCompletionDelta,
    ChatCompletionChunk,
    EmbeddingRequest,
    EmbeddingResponse,
    ModelInfo,
    ModelListResponse,
} from './types.js'

// LLM 适配器
export {
    createLLMAdapter,
    createOpenAIAdapter,
    LLMAdapter,
    type AdapterOptions,
    type AIError,
    type AIErrorType,
    type ProviderConfig,
} from './adapter.js'

// 流式响应
export {
    collectStream,
    createSSEDecoder,
    createSSEReadableStream,
    createStreamProcessor,
    encodeSSE,
    parseSSEStream,
    SSEDecoder,
    StreamProcessor,
    type SSEEvent,
    type StreamAccumulator,
} from './stream.js'

// 工具调用
export {
    createToolRegistry,
    defineTool,
    ToolRegistry,
    type DefineToolOptions,
    type Tool,
    type ToolError,
    type ToolErrorType,
} from './tools.js'
