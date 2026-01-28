/**
 * =============================================================================
 * @hai/ai - LLM 适配器
 * =============================================================================
 * 提供统一的 LLM 适配层，支持 OpenAI 兼容 API
 * 
 * 特性:
 * - OpenAI 兼容 API
 * - 多 Provider 支持
 * - 速率限制
 * - 重试机制
 * =============================================================================
 */

import type { Result } from '@hai/core'
import { createLogger, err, ok, retry, type RetryOptions } from '@hai/core'
import OpenAI from 'openai'
import type {
    ChatCompletionRequest,
    ChatCompletionResponse,
    ChatCompletionChunk,
    EmbeddingRequest,
    EmbeddingResponse,
    ModelListResponse,
} from './types.js'

const logger = createLogger({ name: 'ai-adapter' })

/**
 * AI 错误类型
 */
export type AIErrorType =
    | 'INITIALIZATION_FAILED'
    | 'REQUEST_FAILED'
    | 'RATE_LIMITED'
    | 'AUTH_FAILED'
    | 'MODEL_NOT_FOUND'
    | 'CONTEXT_LENGTH_EXCEEDED'
    | 'CONTENT_FILTERED'
    | 'INVALID_REQUEST'
    | 'NETWORK_ERROR'
    | 'UNKNOWN'

/**
 * AI 错误
 */
export interface AIError {
    type: AIErrorType
    message: string
    code?: string
    statusCode?: number
}

/**
 * Provider 配置
 */
export interface ProviderConfig {
    /** Provider 名称 */
    name: string
    /** API 端点 */
    baseURL: string
    /** API 密钥 */
    apiKey: string
    /** 默认模型 */
    defaultModel?: string
    /** 请求超时（毫秒） */
    timeout?: number
    /** 自定义请求头 */
    headers?: Record<string, string>
}

/**
 * 适配器选项
 */
export interface AdapterOptions {
    /** Provider 配置 */
    provider: ProviderConfig
    /** 重试选项 */
    retry?: RetryOptions
    /** 是否启用 debug */
    debug?: boolean
}

/**
 * LLM 适配器
 * 提供统一的 OpenAI 兼容接口
 */
export class LLMAdapter {
    private client: OpenAI
    private config: ProviderConfig
    private retryOptions: RetryOptions
    private debug: boolean

    constructor(options: AdapterOptions) {
        this.config = options.provider
        this.retryOptions = options.retry ?? {
            maxAttempts: 3,
            delayMs: 1000,
            backoff: 'exponential',
        }
        this.debug = options.debug ?? false

        this.client = new OpenAI({
            apiKey: this.config.apiKey,
            baseURL: this.config.baseURL,
            timeout: this.config.timeout ?? 60000,
            defaultHeaders: this.config.headers,
        })

        logger.info({ provider: this.config.name }, 'LLM adapter initialized')
    }

    /**
     * 发送聊天完成请求
     * 
     * @param request - 请求参数
     */
    async chat(
        request: ChatCompletionRequest,
    ): Promise<Result<ChatCompletionResponse, AIError>> {
        const model = request.model ?? this.config.defaultModel

        if (!model) {
            return err({
                type: 'INVALID_REQUEST',
                message: 'Model is required',
            })
        }

        if (this.debug) {
            logger.debug({ model, messageCount: request.messages.length }, 'Chat request')
        }

        return this.executeWithRetry(async () => {
            try {
                const response = await this.client.chat.completions.create({
                    ...request,
                    model,
                    stream: false,
                }) as OpenAI.Chat.ChatCompletion

                if (this.debug) {
                    logger.debug(
                        { model, usage: response.usage },
                        'Chat response received',
                    )
                }

                return ok(this.mapChatResponse(response))
            }
            catch (error) {
                return err(this.mapError(error))
            }
        })
    }

    /**
     * 发送流式聊天请求
     * 
     * @param request - 请求参数
     * @yields 流式响应块
     */
    async *chatStream(
        request: ChatCompletionRequest,
    ): AsyncGenerator<Result<ChatCompletionChunk, AIError>> {
        const model = request.model ?? this.config.defaultModel

        if (!model) {
            yield Err({
                type: 'INVALID_REQUEST',
                message: 'Model is required',
            })
            return
        }

        if (this.debug) {
            logger.debug({ model, messageCount: request.messages.length }, 'Chat stream request')
        }

        try {
            const stream = await this.client.chat.completions.create({
                ...request,
                model,
                stream: true,
            })

            for await (const chunk of stream) {
                yield Ok(this.mapChunk(chunk))
            }

            if (this.debug) {
                logger.debug({ model }, 'Chat stream completed')
            }
        }
        catch (error) {
            yield Err(this.mapError(error))
        }
    }

    /**
     * 生成文本嵌入
     * 
     * @param request - 请求参数
     */
    async embed(
        request: EmbeddingRequest,
    ): Promise<Result<EmbeddingResponse, AIError>> {
        const model = request.model ?? this.config.defaultModel

        if (!model) {
            return err({
                type: 'INVALID_REQUEST',
                message: 'Model is required',
            })
        }

        if (this.debug) {
            logger.debug({ model }, 'Embedding request')
        }

        return this.executeWithRetry(async () => {
            try {
                const response = await this.client.embeddings.create({
                    ...request,
                    model,
                })

                return ok({
                    object: 'list',
                    data: response.data,
                    model: response.model,
                    usage: response.usage,
                })
            }
            catch (error) {
                return err(this.mapError(error))
            }
        })
    }

    /**
     * 获取可用模型列表
     */
    async listModels(): Promise<Result<ModelListResponse, AIError>> {
        return this.executeWithRetry(async () => {
            try {
                const response = await this.client.models.list()

                return ok({
                    object: 'list',
                    data: response.data.map(m => ({
                        id: m.id,
                        object: 'model',
                        created: m.created,
                        owned_by: m.owned_by,
                    })),
                })
            }
            catch (error) {
                return err(this.mapError(error))
            }
        })
    }

    /**
     * 带重试的执行
     */
    private async executeWithRetry<T>(
        fn: () => Promise<Result<T, AIError>>,
    ): Promise<Result<T, AIError>> {
        const result = await retry(
            async () => {
                const r = await fn()
                if (!r.ok && this.shouldRetry(r.error)) {
                    throw new Error(r.error.message)
                }
                return r
            },
            this.retryOptions,
        )

        if (!result.ok) {
            return err({
                type: 'REQUEST_FAILED',
                message: result.error.message,
            })
        }

        return result.value
    }

    /**
     * 判断是否应该重试
     */
    private shouldRetry(error: AIError): boolean {
        // 网络错误和速率限制可以重试
        return error.type === 'NETWORK_ERROR' || error.type === 'RATE_LIMITED'
    }

    /**
     * 映射 OpenAI 响应
     */
    private mapChatResponse(response: OpenAI.Chat.ChatCompletion): ChatCompletionResponse {
        return {
            id: response.id,
            object: 'chat.completion',
            created: response.created,
            model: response.model,
            choices: response.choices.map(choice => ({
                index: choice.index,
                message: {
                    role: 'assistant',
                    content: choice.message.content,
                    tool_calls: choice.message.tool_calls?.map(tc => ({
                        id: tc.id,
                        type: 'function' as const,
                        function: {
                            name: tc.function.name,
                            arguments: tc.function.arguments,
                        },
                    })),
                },
                finish_reason: choice.finish_reason as any,
            })),
            usage: response.usage ? {
                prompt_tokens: response.usage.prompt_tokens,
                completion_tokens: response.usage.completion_tokens,
                total_tokens: response.usage.total_tokens,
            } : undefined,
        }
    }

    /**
     * 映射流式响应块
     */
    private mapChunk(chunk: OpenAI.Chat.ChatCompletionChunk): ChatCompletionChunk {
        return {
            id: chunk.id,
            object: 'chat.completion.chunk',
            created: chunk.created,
            model: chunk.model,
            choices: chunk.choices.map(choice => ({
                index: choice.index,
                delta: {
                    role: choice.delta.role as any,
                    content: choice.delta.content,
                    tool_calls: choice.delta.tool_calls?.map(tc => ({
                        id: tc.id,
                        type: 'function' as const,
                        function: tc.function ? {
                            name: tc.function.name ?? '',
                            arguments: tc.function.arguments ?? '',
                        } : undefined,
                    })),
                },
                finish_reason: choice.finish_reason as any,
            })),
            usage: chunk.usage ? {
                prompt_tokens: chunk.usage.prompt_tokens,
                completion_tokens: chunk.usage.completion_tokens,
                total_tokens: chunk.usage.total_tokens,
            } : undefined,
        }
    }

    /**
     * 映射错误
     */
    private mapError(error: unknown): AIError {
        if (error instanceof OpenAI.APIError) {
            const statusCode = error.status

            // 根据状态码判断错误类型
            let type: AIErrorType = 'REQUEST_FAILED'

            if (statusCode === 401) {
                type = 'AUTH_FAILED'
            }
            else if (statusCode === 404) {
                type = 'MODEL_NOT_FOUND'
            }
            else if (statusCode === 429) {
                type = 'RATE_LIMITED'
            }
            else if (statusCode === 400) {
                // 检查是否是上下文长度超限
                if (error.message?.includes('context_length_exceeded')) {
                    type = 'CONTEXT_LENGTH_EXCEEDED'
                }
                else {
                    type = 'INVALID_REQUEST'
                }
            }

            logger.warn(
                { type, statusCode, message: error.message },
                'API error',
            )

            return {
                type,
                message: error.message,
                code: error.code ?? undefined,
                statusCode,
            }
        }

        if (error instanceof Error) {
            // 网络错误
            if (error.message.includes('fetch') || error.message.includes('network')) {
                return {
                    type: 'NETWORK_ERROR',
                    message: error.message,
                }
            }

            return {
                type: 'UNKNOWN',
                message: error.message,
            }
        }

        return {
            type: 'UNKNOWN',
            message: String(error),
        }
    }
}

/**
 * 创建 LLM 适配器
 * 
 * @param options - 适配器选项
 */
export function createLLMAdapter(options: AdapterOptions): LLMAdapter {
    return new LLMAdapter(options)
}

/**
 * 创建 OpenAI 适配器
 * 
 * @param apiKey - API 密钥
 * @param options - 额外选项
 */
export function createOpenAIAdapter(
    apiKey: string,
    options: Partial<Omit<ProviderConfig, 'name' | 'apiKey'>> = {},
): LLMAdapter {
    return createLLMAdapter({
        provider: {
            name: 'openai',
            baseURL: options.baseURL ?? 'https://api.openai.com/v1',
            apiKey,
            defaultModel: options.defaultModel ?? 'gpt-4o-mini',
            timeout: options.timeout,
            headers: options.headers,
        },
    })
}
