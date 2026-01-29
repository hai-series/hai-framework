/**
 * =============================================================================
 * @hai/core - AI 配置 Schema 测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import {
  AIConfigSchema,
  // 错误码
  AIErrorCode,
  GenerationParamsSchema,
  LLMModelConfigSchema,
  // Schema
  LLMProviderSchema,
} from '../../src/config/core-config-ai.js'

describe('core-config-ai', () => {
  describe('aIErrorCode', () => {
    it('应有正确的错误码范围 (4000-4999)', () => {
      expect(AIErrorCode.API_ERROR).toBe(4000)
      expect(AIErrorCode.RATE_LIMIT).toBe(4001)
      expect(AIErrorCode.MODEL_NOT_FOUND).toBe(4002)
      expect(AIErrorCode.CONTEXT_TOO_LONG).toBe(4003)
      expect(AIErrorCode.CONTENT_FILTERED).toBe(4004)
      expect(AIErrorCode.INVALID_RESPONSE).toBe(4005)
      expect(AIErrorCode.STREAM_ERROR).toBe(4006)
      expect(AIErrorCode.TOOL_CALL_FAILED).toBe(4007)
      expect(AIErrorCode.MCP_CONNECTION_FAILED).toBe(4008)
      expect(AIErrorCode.MCP_PROTOCOL_ERROR).toBe(4009)
      expect(AIErrorCode.EMBEDDING_FAILED).toBe(4010)
      expect(AIErrorCode.QUOTA_EXCEEDED).toBe(4011)
    })
  })

  describe('lLMProviderSchema', () => {
    it('应接受有效的 LLM 提供商', () => {
      const providers = ['openai', 'azure-openai', 'anthropic', 'deepseek', 'moonshot', 'qwen', 'zhipu', 'ollama', 'custom']
      for (const provider of providers) {
        expect(LLMProviderSchema.parse(provider)).toBe(provider)
      }
    })

    it('应拒绝无效的提供商', () => {
      expect(() => LLMProviderSchema.parse('invalid')).toThrow()
    })
  })

  describe('lLMModelConfigSchema', () => {
    it('应接受最小配置', () => {
      const config = {
        id: 'gpt-4o',
        name: 'GPT-4o',
        provider: 'openai',
      }
      const result = LLMModelConfigSchema.parse(config)
      expect(result.id).toBe('gpt-4o')
      expect(result.maxContextLength).toBe(4096)
      expect(result.maxOutputLength).toBe(2048)
      expect(result.supportsTools).toBe(false)
      expect(result.supportsVision).toBe(false)
      expect(result.supportsStreaming).toBe(true)
    })

    it('应接受完整配置', () => {
      const config = {
        id: 'gpt-4o',
        name: 'GPT-4o',
        provider: 'openai',
        endpoint: 'https://api.openai.com/v1',
        apiKey: 'sk-xxx',
        maxContextLength: 128000,
        maxOutputLength: 4096,
        supportsTools: true,
        supportsVision: true,
        supportsStreaming: true,
        inputPricePerK: 0.01,
        outputPricePerK: 0.03,
      }
      const result = LLMModelConfigSchema.parse(config)
      expect(result.maxContextLength).toBe(128000)
      expect(result.supportsTools).toBe(true)
    })

    it('应验证端点为有效 URL', () => {
      const config = {
        id: 'test',
        name: 'Test',
        provider: 'openai',
        endpoint: 'not-a-url',
      }
      expect(() => LLMModelConfigSchema.parse(config)).toThrow()
    })
  })

  describe('generationParamsSchema', () => {
    it('应使用默认值', () => {
      const result = GenerationParamsSchema.parse({})
      expect(result.temperature).toBe(0.7)
      expect(result.topP).toBe(1)
      expect(result.frequencyPenalty).toBe(0)
      expect(result.presencePenalty).toBe(0)
    })

    it('应验证温度范围', () => {
      expect(GenerationParamsSchema.parse({ temperature: 0 }).temperature).toBe(0)
      expect(GenerationParamsSchema.parse({ temperature: 2 }).temperature).toBe(2)
      expect(() => GenerationParamsSchema.parse({ temperature: -1 })).toThrow()
      expect(() => GenerationParamsSchema.parse({ temperature: 3 })).toThrow()
    })

    it('应验证 topP 范围', () => {
      expect(GenerationParamsSchema.parse({ topP: 0 }).topP).toBe(0)
      expect(GenerationParamsSchema.parse({ topP: 1 }).topP).toBe(1)
      expect(() => GenerationParamsSchema.parse({ topP: -0.1 })).toThrow()
      expect(() => GenerationParamsSchema.parse({ topP: 1.1 })).toThrow()
    })
  })

  describe('aIConfigSchema', () => {
    it('应使用默认值', () => {
      const result = AIConfigSchema.parse({})
      expect(result.enabled).toBe(true)
      expect(result.models).toEqual([])
      expect(result.defaultModel).toBe('gpt-3.5-turbo')
    })

    it('应接受完整配置', () => {
      const config = {
        enabled: true,
        defaultModel: 'gpt-4o',
        models: [
          {
            id: 'gpt-4o',
            name: 'GPT-4o',
            provider: 'openai',
          },
        ],
        defaultParams: {
          temperature: 0.5,
        },
        timeout: 30000,
        maxRetries: 5,
      }
      const result = AIConfigSchema.parse(config)
      expect(result.defaultModel).toBe('gpt-4o')
      expect(result.models.length).toBe(1)
      expect(result.timeout).toBe(30000)
    })
  })
})
