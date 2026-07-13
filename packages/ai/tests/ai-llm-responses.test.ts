/**
 * OpenAI Responses API 适配器单元测试（issue #4）
 *
 * 覆盖 Chat Completions ↔ Responses API 的请求/响应/流事件互转（纯函数，无需 mock SDK）。
 */

import type OpenAI from 'openai'
import type { ChatMessage, ToolDefinition } from '../src/llm/ai-llm-types.js'

import { describe, expect, it } from 'vitest'
import {
  responsesEventToChunk,
  responsesToChatResponse,
  toResponsesInput,
  toResponsesTools,
} from '../src/llm/providers/ai-llm-provider-openai-responses.js'

describe('toResponsesInput', () => {
  it('映射 system / user / assistant 文本消息', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: '你是助手' },
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '你好，有什么可以帮你' },
    ]
    const input = toResponsesInput(messages)
    expect(input).toEqual([
      { role: 'system', content: '你是助手' },
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '你好，有什么可以帮你' },
    ])
  })

  it('assistant.tool_calls 映射为 function_call，tool 消息映射为 function_call_output', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: '天气' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'getWeather', arguments: '{"city":"北京"}' } }],
      },
      { role: 'tool', tool_call_id: 'call-1', content: '晴' },
    ]
    const input = toResponsesInput(messages)
    expect(input).toContainEqual({ type: 'function_call', call_id: 'call-1', name: 'getWeather', arguments: '{"city":"北京"}' })
    expect(input).toContainEqual({ type: 'function_call_output', call_id: 'call-1', output: '晴' })
  })

  it('多模态数组内容仅提取 text 片段', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: [{ type: 'text', text: '看图' }, { type: 'image_url', image_url: { url: 'http://x/y.png' } }] },
    ]
    const input = toResponsesInput(messages)
    expect(input).toEqual([{ role: 'user', content: '看图' }])
  })
})

describe('toResponsesTools', () => {
  it('转换 function 工具定义', () => {
    const tools: ToolDefinition[] = [{
      type: 'function',
      function: { name: 'add', description: '相加', parameters: { type: 'object', properties: {} } },
    }]
    const mapped = toResponsesTools(tools)
    expect(mapped).toEqual([{ type: 'function', name: 'add', description: '相加', parameters: { type: 'object', properties: {} }, strict: false }])
  })

  it('空工具返回 undefined', () => {
    expect(toResponsesTools(undefined)).toBeUndefined()
    expect(toResponsesTools([])).toBeUndefined()
  })
})

describe('responsesToChatResponse', () => {
  it('映射文本输出与用量', () => {
    const response = {
      id: 'resp-1',
      created_at: 1700000000,
      output_text: '你好',
      model: 'gpt-4.1',
      output: [],
      usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
    } as unknown as OpenAI.Responses.Response

    const mapped = responsesToChatResponse(response, 'gpt-4.1')
    expect(mapped.choices[0].message.content).toBe('你好')
    expect(mapped.choices[0].finish_reason).toBe('stop')
    expect(mapped.usage).toEqual({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 })
  })

  it('从 output 提取 function_call 映射为 tool_calls', () => {
    const response = {
      id: 'resp-2',
      created_at: 1700000000,
      output_text: '',
      model: 'gpt-4.1',
      output: [{ type: 'function_call', call_id: 'c1', name: 'getWeather', arguments: '{"city":"上海"}' }],
      usage: { input_tokens: 8, output_tokens: 3, total_tokens: 11 },
    } as unknown as OpenAI.Responses.Response

    const mapped = responsesToChatResponse(response, 'gpt-4.1')
    expect(mapped.choices[0].finish_reason).toBe('tool_calls')
    expect(mapped.choices[0].message.content).toBeNull()
    expect(mapped.choices[0].message.tool_calls).toEqual([
      { id: 'c1', type: 'function', function: { name: 'getWeather', arguments: '{"city":"上海"}' } },
    ])
  })
})

describe('responsesEventToChunk', () => {
  it('文本增量事件转换为带 content 的 chunk', () => {
    const chunk = responsesEventToChunk(
      { type: 'response.output_text.delta', delta: '嗨', item_id: 'item-1' } as unknown as OpenAI.Responses.ResponseStreamEvent,
      'gpt-4.1',
    )
    expect(chunk?.choices[0].delta.content).toBe('嗨')
    expect(chunk?.choices[0].finish_reason).toBeNull()
  })

  it('完成事件转换为带用量的终止 chunk', () => {
    const chunk = responsesEventToChunk(
      {
        type: 'response.completed',
        response: { id: 'resp-3', created_at: 1700000000, model: 'gpt-4.1', usage: { input_tokens: 4, output_tokens: 2, total_tokens: 6 } },
      } as unknown as OpenAI.Responses.ResponseStreamEvent,
      'gpt-4.1',
    )
    expect(chunk?.choices[0].finish_reason).toBe('stop')
    expect(chunk?.usage).toEqual({ prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 })
  })

  it('无关事件返回 null', () => {
    const chunk = responsesEventToChunk(
      { type: 'response.created' } as unknown as OpenAI.Responses.ResponseStreamEvent,
      'gpt-4.1',
    )
    expect(chunk).toBeNull()
  })
})
