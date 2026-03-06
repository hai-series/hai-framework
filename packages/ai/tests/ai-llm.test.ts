/**
 * ai.llm — LLM Provider（OpenAI 兼容）测试
 *
 * 通过 vi.mock 模拟 OpenAI SDK，验证 ai.llm.chat / chatStream / listModels
 * 的实际行为：请求参数组装、响应映射、错误映射、环境变量回退等。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// vi.hoisted 确保变量在 vi.mock 工厂执行时已可用
const { mockCreate, mockListModels, MockAPIError, constructorCalls } = vi.hoisted(() => {
  class _MockAPIError extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.name = 'APIError'
      this.status = status
    }
  }
  return {
    mockCreate: vi.fn(),
    mockListModels: vi.fn(),
    MockAPIError: _MockAPIError,
    constructorCalls: [] as unknown[][],
  }
})

vi.mock('openai', () => {
  /** 使用普通函数模拟 OpenAI 构造函数，捕获参数 */
  function MockOpenAI(...args: unknown[]) {
    constructorCalls.push(args)
    return {
      chat: { completions: { create: mockCreate } },
      models: { list: mockListModels },
    }
  }
  MockOpenAI.APIError = MockAPIError
  return { default: MockOpenAI }
})

// eslint-disable-next-line import/first -- vi.mock 需在 import 之前，确保 mock 生效
import { ai, AIErrorCode } from '../src/index.js'

// ─── 辅助工厂 ───

/** 构造 OpenAI SDK 的 ChatCompletion 响应 */
function makeSDKChatCompletion(content: string, options?: {
  model?: string
  toolCalls?: Array<{ id: string, function: { name: string, arguments: string } }>
  finishReason?: string
  usage?: { prompt_tokens: number, completion_tokens: number, total_tokens: number }
}) {
  return {
    id: 'chatcmpl-test',
    object: 'chat.completion',
    created: 1700000000,
    model: options?.model ?? 'gpt-4o-mini',
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content,
        tool_calls: options?.toolCalls?.map(tc => ({
          id: tc.id,
          type: 'function',
          function: tc.function,
        })),
      },
      finish_reason: options?.finishReason ?? 'stop',
    }],
    usage: options?.usage ?? {
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    },
  }
}

/** 构造 OpenAI SDK 的流式 chunk */
function makeSDKChunk(content: string | undefined, options?: {
  finishReason?: string | null
  role?: string
  toolCalls?: Array<{
    index: number
    id?: string
    type?: string
    function?: { name?: string, arguments?: string }
  }>
}) {
  return {
    id: 'chatcmpl-stream',
    object: 'chat.completion.chunk',
    created: 1700000000,
    model: 'gpt-4o-mini',
    choices: [{
      index: 0,
      delta: {
        role: options?.role ?? undefined,
        content: content ?? undefined,
        tool_calls: options?.toolCalls,
      },
      finish_reason: options?.finishReason ?? null,
    }],
  }
}

// =============================================================================
// ai.llm.chat
// =============================================================================

describe('ai.llm.chat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    constructorCalls.length = 0
    const initResult = ai.init({ llm: { apiKey: 'sk-test', model: 'gpt-4o-mini' } })
    expect(initResult.success).toBe(true)
  })

  afterEach(() => {
    ai.close()
  })

  it('成功发送聊天请求并获取响应', async () => {
    const sdkResponse = makeSDKChatCompletion('你好！很高兴见到你。')
    mockCreate.mockResolvedValue(sdkResponse)

    const result = await ai.llm.chat({
      messages: [{ role: 'user', content: '你好' }],
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.id).toBe('chatcmpl-test')
      expect(result.data.object).toBe('chat.completion')
      expect(result.data.choices[0].message.role).toBe('assistant')
      expect(result.data.choices[0].message.content).toBe('你好！很高兴见到你。')
      expect(result.data.choices[0].finish_reason).toBe('stop')
      expect(result.data.usage.total_tokens).toBe(15)
    }
  })

  it('使用请求中指定的模型', async () => {
    mockCreate.mockResolvedValue(makeSDKChatCompletion('ok'))

    await ai.llm.chat({
      messages: [{ role: 'user', content: 'test' }],
      model: 'gpt-4o',
    })

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-4o', stream: false }),
    )
  })

  it('未指定模型时使用配置默认模型', async () => {
    mockCreate.mockResolvedValue(makeSDKChatCompletion('ok'))

    const result = await ai.llm.chat({
      messages: [{ role: 'user', content: 'test' }],
    })

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-4o-mini', stream: false }),
    )
    expect(result.success).toBe(true)
  })

  it('tool_calls 响应正确映射', async () => {
    const sdkResponse = makeSDKChatCompletion('', {
      toolCalls: [{
        id: 'call-abc',
        function: { name: 'getWeather', arguments: '{"city":"北京"}' },
      }],
      finishReason: 'tool_calls',
    })
    mockCreate.mockResolvedValue(sdkResponse)

    const result = await ai.llm.chat({
      messages: [{ role: 'user', content: '北京天气' }],
    })

    expect(result.success).toBe(true)
    if (result.success) {
      const choice = result.data.choices[0]
      expect(choice.finish_reason).toBe('tool_calls')
      expect(choice.message.tool_calls).toHaveLength(1)
      expect(choice.message.tool_calls![0].id).toBe('call-abc')
      expect(choice.message.tool_calls![0].type).toBe('function')
      expect(choice.message.tool_calls![0].function.name).toBe('getWeather')
    }
  })

  it('usage 缺失时默认为 0', async () => {
    const sdkResponse = makeSDKChatCompletion('ok')
    sdkResponse.usage = undefined as unknown as typeof sdkResponse.usage
    mockCreate.mockResolvedValue(sdkResponse)

    const result = await ai.llm.chat({
      messages: [{ role: 'user', content: 'test' }],
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.usage.prompt_tokens).toBe(0)
      expect(result.data.usage.completion_tokens).toBe(0)
      expect(result.data.usage.total_tokens).toBe(0)
    }
  })

  it('http 429 映射为 RATE_LIMITED', async () => {
    mockCreate.mockRejectedValue(new MockAPIError(429, 'Rate limit exceeded'))

    const result = await ai.llm.chat({
      messages: [{ role: 'user', content: 'test' }],
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AIErrorCode.RATE_LIMITED)
    }
  })

  it('http 404 映射为 MODEL_NOT_FOUND', async () => {
    mockCreate.mockRejectedValue(new MockAPIError(404, 'Model not found'))

    const result = await ai.llm.chat({
      messages: [{ role: 'user', content: 'test' }],
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AIErrorCode.MODEL_NOT_FOUND)
    }
  })

  it('http 400 映射为 INVALID_REQUEST', async () => {
    mockCreate.mockRejectedValue(new MockAPIError(400, 'Invalid request'))

    const result = await ai.llm.chat({
      messages: [{ role: 'user', content: 'test' }],
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AIErrorCode.INVALID_REQUEST)
    }
  })

  it('其他 APIError 映射为 API_ERROR', async () => {
    mockCreate.mockRejectedValue(new MockAPIError(500, 'Server error'))

    const result = await ai.llm.chat({
      messages: [{ role: 'user', content: 'test' }],
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AIErrorCode.API_ERROR)
    }
  })

  it('abortError 映射为 TIMEOUT', async () => {
    const abortErr = new Error('The operation was aborted')
    abortErr.name = 'AbortError'
    mockCreate.mockRejectedValue(abortErr)

    const result = await ai.llm.chat({
      messages: [{ role: 'user', content: 'test' }],
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AIErrorCode.TIMEOUT)
    }
  })

  it('未知异常映射为 INTERNAL_ERROR', async () => {
    mockCreate.mockRejectedValue(new TypeError('unexpected'))

    const result = await ai.llm.chat({
      messages: [{ role: 'user', content: 'test' }],
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AIErrorCode.INTERNAL_ERROR)
    }
  })

  it('非 Error 对象异常映射为 INTERNAL_ERROR', async () => {
    mockCreate.mockRejectedValue('string error')

    const result = await ai.llm.chat({
      messages: [{ role: 'user', content: 'test' }],
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AIErrorCode.INTERNAL_ERROR)
    }
  })

  it('传递 temperature / max_tokens 等参数', async () => {
    mockCreate.mockResolvedValue(makeSDKChatCompletion('ok'))

    await ai.llm.chat({
      messages: [{ role: 'user', content: 'test' }],
      temperature: 0.3,
      max_tokens: 1000,
      top_p: 0.9,
    })

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0.3,
        max_tokens: 1000,
        top_p: 0.9,
        stream: false,
      }),
    )
  })

  it('传递 tools 定义和 tool_choice', async () => {
    mockCreate.mockResolvedValue(makeSDKChatCompletion('ok'))

    await ai.llm.chat({
      messages: [{ role: 'user', content: 'test' }],
      tools: [{
        type: 'function',
        function: {
          name: 'search',
          description: '搜索',
          parameters: { type: 'object', properties: { q: { type: 'string' } } },
        },
      }],
      tool_choice: 'auto',
    })

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: expect.arrayContaining([
          expect.objectContaining({ type: 'function' }),
        ]),
        tool_choice: 'auto',
      }),
    )
  })

  it('content 为 null 时映射为空字符串', async () => {
    const sdkResponse = makeSDKChatCompletion('')
    sdkResponse.choices[0].message.content = null as unknown as string
    mockCreate.mockResolvedValue(sdkResponse)

    const result = await ai.llm.chat({
      messages: [{ role: 'user', content: 'test' }],
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.choices[0].message.content).toBe('')
    }
  })
})

// =============================================================================
// ai.llm.chatStream
// =============================================================================

describe('ai.llm.chatStream', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    constructorCalls.length = 0
    const initResult = ai.init({ llm: { apiKey: 'sk-test' } })
    expect(initResult.success).toBe(true)
  })

  afterEach(() => {
    ai.close()
  })

  it('流式接收文本响应', async () => {
    const streamChunks = [
      makeSDKChunk('Hello', { role: 'assistant' }),
      makeSDKChunk(' World'),
      makeSDKChunk(undefined, { finishReason: 'stop' }),
    ]

    mockCreate.mockResolvedValue((async function* () {
      for (const chunk of streamChunks) {
        yield chunk
      }
    })())

    const collected: string[] = []
    for await (const chunk of ai.llm.chatStream({
      messages: [{ role: 'user', content: 'hi' }],
    })) {
      if (chunk.choices[0]?.delta?.content) {
        collected.push(chunk.choices[0].delta.content)
      }
    }

    expect(collected).toEqual(['Hello', ' World'])
  })

  it('流式接收工具调用', async () => {
    const streamChunks = [
      makeSDKChunk(undefined, {
        role: 'assistant',
        toolCalls: [{
          index: 0,
          id: 'call-1',
          type: 'function',
          function: { name: 'search', arguments: '{"q":' },
        }],
      }),
      makeSDKChunk(undefined, {
        toolCalls: [{
          index: 0,
          function: { arguments: '"test"}' },
        }],
      }),
      makeSDKChunk(undefined, { finishReason: 'tool_calls' }),
    ]

    mockCreate.mockResolvedValue((async function* () {
      for (const chunk of streamChunks) {
        yield chunk
      }
    })())

    const processor = ai.stream.createProcessor()
    for await (const chunk of ai.llm.chatStream({
      messages: [{ role: 'user', content: 'search test' }],
    })) {
      processor.process(chunk)
    }

    const result = processor.getResult()
    expect(result.finishReason).toBe('tool_calls')
    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0].function.name).toBe('search')
  })

  it('stream 请求会设置 stream: true', async () => {
    mockCreate.mockResolvedValue((async function* () {
      yield makeSDKChunk('ok', { finishReason: 'stop' })
    })())

    for await (const _chunk of ai.llm.chatStream({
      messages: [{ role: 'user', content: 'test' }],
    })) {
      // consume stream
    }

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ stream: true }),
    )
  })
})

// =============================================================================
// ai.llm.listModels
// =============================================================================

describe('ai.llm.listModels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    constructorCalls.length = 0
    const initResult = ai.init({ llm: { apiKey: 'sk-test' } })
    expect(initResult.success).toBe(true)
  })

  afterEach(() => {
    ai.close()
  })

  it('成功获取模型列表', async () => {
    mockListModels.mockResolvedValue({
      data: [
        { id: 'gpt-4o' },
        { id: 'gpt-4o-mini' },
        { id: 'gpt-3.5-turbo' },
      ],
    })

    const result = await ai.llm.listModels()
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual(['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'])
    }
  })

  it('空模型列表', async () => {
    mockListModels.mockResolvedValue({ data: [] })

    const result = await ai.llm.listModels()
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual([])
    }
  })

  it('api 异常映射为 AIError', async () => {
    mockListModels.mockRejectedValue(new MockAPIError(401, 'Unauthorized'))

    const result = await ai.llm.listModels()
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AIErrorCode.API_ERROR)
    }
  })
})

// =============================================================================
// openAI 客户端初始化配置传递
// =============================================================================

describe('openAI 客户端配置', () => {
  afterEach(() => {
    ai.close()
    vi.clearAllMocks()
    constructorCalls.length = 0
  })

  it('apiKey 传递给 OpenAI 构造函数', () => {
    constructorCalls.length = 0
    ai.init({ llm: { apiKey: 'sk-my-key' } })

    expect(constructorCalls).toHaveLength(1)
    expect(constructorCalls[0][0]).toEqual(
      expect.objectContaining({ apiKey: 'sk-my-key' }),
    )
  })

  it('baseUrl 传递给 OpenAI 构造函数', () => {
    constructorCalls.length = 0
    ai.init({
      llm: {
        apiKey: 'sk-key',
        baseUrl: 'https://custom.api.com/v1',
      },
    })

    expect(constructorCalls[0][0]).toEqual(
      expect.objectContaining({ baseURL: 'https://custom.api.com/v1' }),
    )
  })

  it('timeout 传递给 OpenAI 构造函数', () => {
    constructorCalls.length = 0
    ai.init({
      llm: {
        apiKey: 'sk-key',
        timeout: 30000,
      },
    })

    expect(constructorCalls[0][0]).toEqual(
      expect.objectContaining({ timeout: 30000 }),
    )
  })

  it('重新初始化使用新配置', async () => {
    ai.init({ llm: { apiKey: 'sk-old' } })
    constructorCalls.length = 0
    vi.clearAllMocks()

    ai.init({ llm: { apiKey: 'sk-new', model: 'gpt-4o' } })
    mockCreate.mockResolvedValue(makeSDKChatCompletion('ok'))

    await ai.llm.chat({ messages: [{ role: 'user', content: 'test' }] })

    expect(constructorCalls).toHaveLength(1)
    expect(constructorCalls[0][0]).toEqual(
      expect.objectContaining({ apiKey: 'sk-new' }),
    )
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-4o' }),
    )
  })
})

// =============================================================================
// llm 完整对话流程集成测试
// =============================================================================

describe('llm 完整对话流程', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    constructorCalls.length = 0
    const initResult = ai.init({ llm: { apiKey: 'sk-test' } })
    expect(initResult.success).toBe(true)
  })

  afterEach(() => {
    ai.close()
  })

  it('多轮对话（system + user + assistant + user）', async () => {
    mockCreate.mockResolvedValue(makeSDKChatCompletion('第二轮回复'))

    const result = await ai.llm.chat({
      messages: [
        { role: 'system', content: '你是助手' },
        { role: 'user', content: '你好' },
        { role: 'assistant', content: '你好！' },
        { role: 'user', content: '谢谢' },
      ],
    })

    expect(result.success).toBe(true)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'system' }),
          expect.objectContaining({ role: 'user', content: '你好' }),
          expect.objectContaining({ role: 'assistant', content: '你好！' }),
          expect.objectContaining({ role: 'user', content: '谢谢' }),
        ]),
      }),
    )
  })

  it('工具调用完整循环：chat → tool_calls → tool result → chat', async () => {
    // 第一轮：模型决定调用工具
    const toolCallResponse = makeSDKChatCompletion('', {
      toolCalls: [{
        id: 'call-weather',
        function: { name: 'getWeather', arguments: '{"city":"北京"}' },
      }],
      finishReason: 'tool_calls',
    })
    mockCreate.mockResolvedValueOnce(toolCallResponse)

    const firstResult = await ai.llm.chat({
      messages: [{ role: 'user', content: '北京天气怎么样？' }],
      tools: [{
        type: 'function',
        function: {
          name: 'getWeather',
          description: '获取天气',
          parameters: { type: 'object', properties: { city: { type: 'string' } } },
        },
      }],
    })

    expect(firstResult.success).toBe(true)
    if (!firstResult.success)
      return
    expect(firstResult.data.choices[0].finish_reason).toBe('tool_calls')

    // 第二轮：把工具结果传回
    const finalResponse = makeSDKChatCompletion('北京今天晴天，25度。')
    mockCreate.mockResolvedValueOnce(finalResponse)

    const secondResult = await ai.llm.chat({
      messages: [
        { role: 'user', content: '北京天气怎么样？' },
        {
          role: 'assistant',
          content: null,
          tool_calls: firstResult.data.choices[0].message.tool_calls,
        },
        {
          role: 'tool',
          tool_call_id: 'call-weather',
          content: JSON.stringify({ city: '北京', temp: 25, weather: '晴天' }),
        },
      ],
    })

    expect(secondResult.success).toBe(true)
    if (secondResult.success) {
      expect(secondResult.data.choices[0].message.content).toBe('北京今天晴天，25度。')
      expect(secondResult.data.choices[0].finish_reason).toBe('stop')
    }
  })

  it('结合 ai.tools.createRegistry 执行工具调用', async () => {
    const { z } = await import('zod')

    // 定义并注册工具
    const calculator = ai.tools.define({
      name: 'calculate',
      description: '计算表达式',
      parameters: z.object({ expression: z.string() }),
      handler: ({ expression }) => {
        if (expression === '1+1')
          return { result: 2 }
        return { result: 0 }
      },
    })
    const registry = ai.tools.createRegistry()
    registry.register(calculator)

    // 模型返回工具调用
    const toolCallResponse = makeSDKChatCompletion('', {
      toolCalls: [{
        id: 'call-calc',
        function: { name: 'calculate', arguments: '{"expression":"1+1"}' },
      }],
      finishReason: 'tool_calls',
    })
    mockCreate.mockResolvedValueOnce(toolCallResponse)

    const chatResult = await ai.llm.chat({
      messages: [{ role: 'user', content: '1+1=?' }],
      tools: registry.getDefinitions(),
    })

    expect(chatResult.success).toBe(true)
    if (!chatResult.success)
      return

    // 用注册表执行工具调用
    const toolResult = await registry.executeAll(
      chatResult.data.choices[0].message.tool_calls!,
    )

    expect(toolResult.success).toBe(true)
    if (toolResult.success) {
      expect(toolResult.data).toHaveLength(1)
      expect(toolResult.data[0].role).toBe('tool')
      expect(toolResult.data[0].tool_call_id).toBe('call-calc')
      expect(JSON.parse(toolResult.data[0].content)).toEqual({ result: 2 })
    }
  })

  it('流式收集完整文本', async () => {
    const streamChunks = [
      makeSDKChunk('你', { role: 'assistant' }),
      makeSDKChunk('好'),
      makeSDKChunk('！'),
      makeSDKChunk(undefined, { finishReason: 'stop' }),
    ]

    mockCreate.mockResolvedValue((async function* () {
      for (const chunk of streamChunks) {
        yield chunk
      }
    })())

    const result = await ai.stream.collect(
      ai.llm.chatStream({ messages: [{ role: 'user', content: '你好' }] }),
    )

    expect(result.content).toBe('你好！')
    expect(result.finishReason).toBe('stop')
  })
})

// =============================================================================
// ai.llm.getHistory / ai.llm.listSessions — 对话记录
// =============================================================================

describe('ai.llm — chat recording', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    constructorCalls.length = 0
    const initResult = ai.init({ llm: { apiKey: 'sk-test', model: 'gpt-4o-mini' } })
    expect(initResult.success).toBe(true)
  })

  afterEach(() => {
    ai.close()
  })

  it('传入 objectId 时自动记录对话', async () => {
    mockCreate.mockResolvedValue(makeSDKChatCompletion('回复内容'))

    await ai.llm.chat({
      messages: [{ role: 'user', content: '你好' }],
      objectId: 'user-1',
      sessionId: 'session-1',
    })

    const historyResult = await ai.llm.getHistory({
      objectId: 'user-1',
      sessionId: 'session-1',
    })
    expect(historyResult.success).toBe(true)
    if (historyResult.success) {
      expect(historyResult.data.length).toBe(1)
      const record = historyResult.data[0]
      expect(record.objectId).toBe('user-1')
      expect(record.sessionId).toBe('session-1')
      expect(record.request.messages).toHaveLength(1)
      expect(record.response.content).toBe('回复内容')
      expect(record.response.usage.total_tokens).toBe(15)
      expect(record.duration).toBeGreaterThanOrEqual(0)
    }
  })

  it('未传 objectId 时不记录', async () => {
    mockCreate.mockResolvedValue(makeSDKChatCompletion('ok'))

    await ai.llm.chat({
      messages: [{ role: 'user', content: 'test' }],
    })

    const historyResult = await ai.llm.getHistory({
      objectId: 'user-1',
      sessionId: 'default',
    })
    expect(historyResult.success).toBe(true)
    if (historyResult.success) {
      expect(historyResult.data).toHaveLength(0)
    }
  })

  it('未传 sessionId 时默认使用 "default"', async () => {
    mockCreate.mockResolvedValue(makeSDKChatCompletion('ok'))

    await ai.llm.chat({
      messages: [{ role: 'user', content: '你好' }],
      objectId: 'user-1',
    })

    const historyResult = await ai.llm.getHistory({
      objectId: 'user-1',
      sessionId: 'default',
    })
    expect(historyResult.success).toBe(true)
    if (historyResult.success) {
      expect(historyResult.data).toHaveLength(1)
      expect(historyResult.data[0].sessionId).toBe('default')
    }
  })

  it('多条记录按时间倒序返回', async () => {
    mockCreate.mockResolvedValue(makeSDKChatCompletion('first'))
    await ai.llm.chat({
      messages: [{ role: 'user', content: 'q1' }],
      objectId: 'user-1',
      sessionId: 's1',
    })

    mockCreate.mockResolvedValue(makeSDKChatCompletion('second'))
    await ai.llm.chat({
      messages: [{ role: 'user', content: 'q2' }],
      objectId: 'user-1',
      sessionId: 's1',
    })

    const historyResult = await ai.llm.getHistory(
      { objectId: 'user-1', sessionId: 's1' },
      { order: 'desc' },
    )
    expect(historyResult.success).toBe(true)
    if (historyResult.success) {
      expect(historyResult.data).toHaveLength(2)
      expect(historyResult.data[0].createdAt).toBeGreaterThanOrEqual(historyResult.data[1].createdAt)
    }
  })

  it('limit 限制返回数量', async () => {
    for (let i = 0; i < 3; i++) {
      mockCreate.mockResolvedValue(makeSDKChatCompletion(`reply-${i}`))
      await ai.llm.chat({
        messages: [{ role: 'user', content: `q-${i}` }],
        objectId: 'user-1',
        sessionId: 's1',
      })
    }

    const historyResult = await ai.llm.getHistory(
      { objectId: 'user-1', sessionId: 's1' },
      { limit: 2 },
    )
    expect(historyResult.success).toBe(true)
    if (historyResult.success) {
      expect(historyResult.data).toHaveLength(2)
    }
  })
})

describe('ai.llm.listSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    constructorCalls.length = 0
    const initResult = ai.init({ llm: { apiKey: 'sk-test', model: 'gpt-4o-mini' } })
    expect(initResult.success).toBe(true)
  })

  afterEach(() => {
    ai.close()
  })

  it('记录对话后自动创建会话', async () => {
    mockCreate.mockResolvedValue(makeSDKChatCompletion('ok'))
    await ai.llm.chat({
      messages: [{ role: 'user', content: '你好' }],
      objectId: 'user-1',
      sessionId: 'session-a',
    })

    const result = await ai.llm.listSessions('user-1')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(1)
      expect(result.data[0].sessionId).toBe('session-a')
      expect(result.data[0].objectId).toBe('user-1')
    }
  })

  it('多个会话分别记录', async () => {
    mockCreate.mockResolvedValue(makeSDKChatCompletion('ok'))

    await ai.llm.chat({
      messages: [{ role: 'user', content: 'q1' }],
      objectId: 'user-1',
      sessionId: 'session-a',
    })
    await ai.llm.chat({
      messages: [{ role: 'user', content: 'q2' }],
      objectId: 'user-1',
      sessionId: 'session-b',
    })

    const result = await ai.llm.listSessions('user-1')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(2)
      const sessionIds = result.data.map(s => s.sessionId)
      expect(sessionIds).toContain('session-a')
      expect(sessionIds).toContain('session-b')
    }
  })

  it('不同 objectId 的会话互不影响', async () => {
    mockCreate.mockResolvedValue(makeSDKChatCompletion('ok'))

    await ai.llm.chat({
      messages: [{ role: 'user', content: 'q1' }],
      objectId: 'user-1',
      sessionId: 'session-a',
    })
    await ai.llm.chat({
      messages: [{ role: 'user', content: 'q2' }],
      objectId: 'user-2',
      sessionId: 'session-b',
    })

    const result1 = await ai.llm.listSessions('user-1')
    const result2 = await ai.llm.listSessions('user-2')
    expect(result1.success).toBe(true)
    expect(result2.success).toBe(true)
    if (result1.success && result2.success) {
      expect(result1.data).toHaveLength(1)
      expect(result2.data).toHaveLength(1)
      expect(result1.data[0].sessionId).toBe('session-a')
      expect(result2.data[0].sessionId).toBe('session-b')
    }
  })

  it('新建会话时从用户消息提取 title', async () => {
    mockCreate.mockResolvedValue(makeSDKChatCompletion('ok'))
    await ai.llm.chat({
      messages: [{ role: 'user', content: '请帮我写一篇关于人工智能的文章' }],
      objectId: 'user-1',
      sessionId: 'session-title',
    })

    const result = await ai.llm.listSessions('user-1')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(1)
      expect(result.data[0].title).toBe('请帮我写一篇关于人工智能的文章')
    }
  })

  it('长消息标题截断到 50 字符', async () => {
    mockCreate.mockResolvedValue(makeSDKChatCompletion('ok'))
    const longMsg = '这是一条非常长的消息用来测试标题截断功能是否生效当消息超过五十个字符时应该被截断并追加省略号以确保用户体验保持良好的状态'
    await ai.llm.chat({
      messages: [{ role: 'user', content: longMsg }],
      objectId: 'user-1',
      sessionId: 'session-long',
    })

    const result = await ai.llm.listSessions('user-1')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data[0].title).toBe(`${longMsg.slice(0, 50)}...`)
    }
  })
})

// =============================================================================
// chatStream 记录保存
// =============================================================================

describe('ai.llm.chatStream 记录保存', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    constructorCalls.length = 0
    const initResult = ai.init({ llm: { apiKey: 'sk-test', model: 'gpt-4o-mini' } })
    expect(initResult.success).toBe(true)
  })

  afterEach(() => {
    ai.close()
  })

  it('传入 objectId 时流式对话自动记录', async () => {
    const streamChunks = [
      makeSDKChunk('Hello', { role: 'assistant' }),
      makeSDKChunk(' World'),
      makeSDKChunk(undefined, { finishReason: 'stop' }),
    ]

    mockCreate.mockResolvedValue((async function* () {
      for (const chunk of streamChunks) yield chunk
    })())

    for await (const _chunk of ai.llm.chatStream({
      messages: [{ role: 'user', content: '你好' }],
      objectId: 'user-1',
      sessionId: 'stream-session',
    })) {
      // 消费所有 chunk
    }

    const historyResult = await ai.llm.getHistory({
      objectId: 'user-1',
      sessionId: 'stream-session',
    })
    expect(historyResult.success).toBe(true)
    if (historyResult.success) {
      expect(historyResult.data).toHaveLength(1)
      const record = historyResult.data[0]
      expect(record.objectId).toBe('user-1')
      expect(record.sessionId).toBe('stream-session')
      expect(record.response.content).toBe('Hello World')
      expect(record.response.finishReason).toBe('stop')
    }
  })

  it('流式对话自动创建会话并带 title', async () => {
    mockCreate.mockResolvedValue((async function* () {
      yield makeSDKChunk('回复', { role: 'assistant', finishReason: 'stop' })
    })())

    for await (const _chunk of ai.llm.chatStream({
      messages: [{ role: 'user', content: '帮我翻译这段话' }],
      objectId: 'user-1',
      sessionId: 'stream-s',
    })) {
      // 消费所有 chunk
    }

    const sessions = await ai.llm.listSessions('user-1')
    expect(sessions.success).toBe(true)
    if (sessions.success) {
      expect(sessions.data).toHaveLength(1)
      expect(sessions.data[0].title).toBe('帮我翻译这段话')
    }
  })

  it('未传 objectId 时流式对话不记录', async () => {
    mockCreate.mockResolvedValue((async function* () {
      yield makeSDKChunk('ok', { finishReason: 'stop' })
    })())

    for await (const _chunk of ai.llm.chatStream({
      messages: [{ role: 'user', content: 'test' }],
    })) {
      // 消费所有 chunk
    }

    const historyResult = await ai.llm.getHistory({
      objectId: 'user-1',
      sessionId: 'default',
    })
    expect(historyResult.success).toBe(true)
    if (historyResult.success) {
      expect(historyResult.data).toHaveLength(0)
    }
  })
})
