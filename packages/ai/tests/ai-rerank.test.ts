/**
 * AI Rerank 子模块单元测试
 *
 * 使用 mock fetch 测试 rerank 操作。
 */

import type { AIConfig } from '../src/ai-config.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HaiAIError } from '../src/ai-types.js'
import { createRerankOperations } from '../src/rerank/ai-rerank-functions.js'

// ─── Mock fetch ───

const mockFetch = vi.fn()
globalThis.fetch = mockFetch

/** 构造成功的 Cohere Rerank API 响应 */
function makeRerankResponse(results: Array<{ index: number, relevance_score: number, document?: { text: string } }>) {
  return {
    ok: true,
    json: async () => ({
      id: 'test-rerank-id',
      results,
    }),
    text: async () => '',
  }
}

/** 构造失败的 API 响应 */
function makeErrorResponse(status: number, body: string) {
  return {
    ok: false,
    status,
    statusText: body,
    text: async () => body,
  }
}

const mockConfig: AIConfig = {
  llm: { apiKey: 'sk-test', model: 'gpt-4o-mini' },
} as unknown as AIConfig

const mockConfigWithRerank: AIConfig = {
  llm: {
    apiKey: 'sk-llm-key',
    model: 'gpt-4o-mini',
    scenarios: { rerank: 'rerank-english-v3.0' },
    models: [
      { id: 'rerank-english-v3.0', model: 'rerank-english-v3.0', apiKey: 'co-rerank-key', baseUrl: 'https://api.cohere.com' },
    ],
  },
} as unknown as AIConfig

// ─── 测试 ───

describe('rerank operations', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('rerank()', () => {
    it('成功重排序文档（字符串数组）', async () => {
      mockFetch.mockResolvedValueOnce(makeRerankResponse([
        { index: 2, relevance_score: 0.95 },
        { index: 0, relevance_score: 0.72 },
        { index: 1, relevance_score: 0.12 },
      ]))

      const ops = createRerankOperations(mockConfigWithRerank)
      const result = await ops.rerank({
        query: '机器学习入门',
        documents: ['今天天气不错', '神经网络是深度学习的基础', '机器学习是 AI 的核心分支'],
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.results).toHaveLength(3)
        expect(result.data.results[0].index).toBe(2)
        expect(result.data.results[0].relevanceScore).toBeCloseTo(0.95)
        expect(result.data.results[1].index).toBe(0)
        // rerank scenario 映射到 'rerank-english-v3.0'
        expect(result.data.model).toBe('rerank-english-v3.0')
      }
    })

    it('成功重排序文档对象数组（含 id）', async () => {
      mockFetch.mockResolvedValueOnce(makeRerankResponse([
        { index: 1, relevance_score: 0.88 },
        { index: 0, relevance_score: 0.34 },
      ]))

      const ops = createRerankOperations(mockConfigWithRerank)
      const result = await ops.rerank({
        query: '向量检索',
        documents: [
          { id: 'doc-001', text: 'SQL 数据库查询优化' },
          { id: 'doc-002', text: '向量相似度搜索原理' },
        ],
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.results[0].id).toBe('doc-002')
        expect(result.data.results[0].index).toBe(1)
        expect(result.data.results[1].id).toBe('doc-001')
      }
    })

    it('传入 topN 时转发 top_n 参数', async () => {
      mockFetch.mockResolvedValueOnce(makeRerankResponse([
        { index: 0, relevance_score: 0.9 },
      ]))

      const ops = createRerankOperations(mockConfig)
      await ops.rerank({
        query: '测试',
        documents: ['文档 A', '文档 B', '文档 C'],
        topN: 1,
      })

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(callBody.top_n).toBe(1)
    })

    it('returnDocuments=true 时转发 return_documents 参数', async () => {
      mockFetch.mockResolvedValueOnce(makeRerankResponse([
        { index: 0, relevance_score: 0.9, document: { text: '文档 A' } },
      ]))

      const ops = createRerankOperations(mockConfig)
      const result = await ops.rerank({
        query: '测试',
        documents: ['文档 A'],
        returnDocuments: true,
      })

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(callBody.return_documents).toBe(true)
      if (result.success) {
        expect(result.data.results[0].document).toBe('文档 A')
      }
    })

    it('使用 rerank 专属 apiKey 和 baseUrl', async () => {
      mockFetch.mockResolvedValueOnce(makeRerankResponse([{ index: 0, relevance_score: 0.9 }]))

      const ops = createRerankOperations(mockConfigWithRerank)
      await ops.rerank({ query: '测试', documents: ['文档'] })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.cohere.com/v1/rerank',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer co-rerank-key',
          }),
        }),
      )
    })

    it('回退到 LLM apiKey（无 rerank 专属配置）', async () => {
      mockFetch.mockResolvedValueOnce(makeRerankResponse([{ index: 0, relevance_score: 0.9 }]))

      const ops = createRerankOperations(mockConfig)
      await ops.rerank({ query: '测试', documents: ['文档'] })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer sk-test',
          }),
        }),
      )
    })

    it('无 API Key 时返回 CONFIGURATION_ERROR', async () => {
      const noKeyConfig = { llm: { model: 'gpt-4o-mini' } } as unknown as AIConfig
      const origKeys = {
        HAI_AI_LLM_API_KEY: process.env.HAI_AI_LLM_API_KEY,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      }
      delete process.env.HAI_AI_LLM_API_KEY
      delete process.env.OPENAI_API_KEY

      try {
        const ops = createRerankOperations(noKeyConfig)
        const result = await ops.rerank({ query: '测试', documents: ['文档'] })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(HaiAIError.CONFIGURATION_ERROR.code)
        }
      }
      finally {
        if (origKeys.HAI_AI_LLM_API_KEY)
          process.env.HAI_AI_LLM_API_KEY = origKeys.HAI_AI_LLM_API_KEY
        if (origKeys.OPENAI_API_KEY)
          process.env.OPENAI_API_KEY = origKeys.OPENAI_API_KEY
      }
    })

    it('空文档列表返回 RERANK_INVALID_REQUEST', async () => {
      const ops = createRerankOperations(mockConfig)
      const result = await ops.rerank({ query: '测试', documents: [] })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiAIError.RERANK_INVALID_REQUEST.code)
      }
    })

    it('请求失败时（HTTP 非 200）返回 RERANK_API_ERROR', async () => {
      mockFetch.mockResolvedValueOnce(makeErrorResponse(429, 'Rate limit exceeded'))

      const ops = createRerankOperations(mockConfig)
      const result = await ops.rerank({ query: '测试', documents: ['文档'] })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiAIError.RERANK_API_ERROR.code)
      }
    })

    it('网络错误时返回 RERANK_API_ERROR', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const ops = createRerankOperations(mockConfig)
      const result = await ops.rerank({ query: '测试', documents: ['文档'] })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiAIError.RERANK_API_ERROR.code)
      }
    })

    it('使用请求级 model 覆盖默认模型', async () => {
      mockFetch.mockResolvedValueOnce(makeRerankResponse([{ index: 0, relevance_score: 0.9 }]))

      const ops = createRerankOperations(mockConfig)
      const result = await ops.rerank({
        query: '测试',
        documents: ['文档'],
        model: 'rerank-multilingual-v3.0',
      })

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(callBody.model).toBe('rerank-multilingual-v3.0')
      if (result.success) {
        expect(result.data.model).toBe('rerank-multilingual-v3.0')
      }
    })
  })

  describe('rerankTexts()', () => {
    it('成功重排序文本数组，直接返回 RerankItem 列表', async () => {
      mockFetch.mockResolvedValueOnce(makeRerankResponse([
        { index: 1, relevance_score: 0.85 },
        { index: 0, relevance_score: 0.30 },
      ]))

      const ops = createRerankOperations(mockConfig)
      const result = await ops.rerankTexts('机器学习', ['普通内容', '机器学习原理'])
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(2)
        expect(result.data[0].index).toBe(1)
        expect(result.data[0].relevanceScore).toBeCloseTo(0.85)
      }
    })

    it('传入 topN 参数', async () => {
      mockFetch.mockResolvedValueOnce(makeRerankResponse([
        { index: 0, relevance_score: 0.9 },
      ]))

      const ops = createRerankOperations(mockConfig)
      await ops.rerankTexts('测试', ['A', 'B', 'C'], 1)

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(callBody.top_n).toBe(1)
    })

    it('网络错误时透传 RERANK_API_ERROR', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Timeout'))

      const ops = createRerankOperations(mockConfig)
      const result = await ops.rerankTexts('测试', ['文档'])
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiAIError.RERANK_API_ERROR.code)
      }
    })
  })
})
