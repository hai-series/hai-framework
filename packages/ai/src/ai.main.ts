/**
 * =============================================================================
 * @hai/ai - 统一服务入口
 * =============================================================================
 * AI 服务的统一出口
 *
 * 使用方式:
 * ```typescript
 * import { ai } from '@hai/ai'
 *
 * // LLM 对话
 * const response = await ai.llm.chat({ model: 'gpt-4', messages: [...] })
 *
 * // MCP 工具调用
 * const result = await ai.mcp.callTool('search', { query: 'hello' })
 *
 * // 执行技能
 * const skillResult = await ai.skills.execute('translate', { text: 'hello', to: 'zh' })
 * ```
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type {
  AIConfig,
  AIError,
  AIProvider,
  AIService,
  LLMProvider,
  MCPProvider,
  SkillsProvider,
} from './ai-types.js'
import { err, ok } from '@hai/core'

// 导入默认实现（hai provider）
import { createHaiLLMProvider } from './provider/hai/ai-hai-llm.js'
import { createHaiMCPProvider } from './provider/hai/ai-hai-mcp.js'
import { createHaiSkillsProvider } from './provider/hai/ai-hai-skills.js'

// =============================================================================
// 提供者工厂
// =============================================================================

/**
 * 提供者工厂映射
 */
const providerFactories: Record<AIProvider, {
  llm: (config: AIConfig) => LLMProvider
  mcp: (config: AIConfig) => MCPProvider
  skills: (config: AIConfig) => SkillsProvider
}> = {
  hai: {
    llm: createHaiLLMProvider,
    mcp: createHaiMCPProvider,
    skills: createHaiSkillsProvider,
  },
  openai: {
    llm: () => { throw new Error('OpenAI provider not implemented, use hai provider with OpenAI API') },
    mcp: () => { throw new Error('OpenAI provider uses hai MCP provider') },
    skills: () => { throw new Error('OpenAI provider uses hai skills provider') },
  },
  azure: {
    llm: () => { throw new Error('Azure provider not implemented') },
    mcp: () => { throw new Error('Azure provider not implemented') },
    skills: () => { throw new Error('Azure provider not implemented') },
  },
  anthropic: {
    llm: () => { throw new Error('Anthropic provider not implemented') },
    mcp: () => { throw new Error('Anthropic provider not implemented') },
    skills: () => { throw new Error('Anthropic provider not implemented') },
  },
  google: {
    llm: () => { throw new Error('Google provider not implemented') },
    mcp: () => { throw new Error('Google provider not implemented') },
    skills: () => { throw new Error('Google provider not implemented') },
  },
  custom: {
    llm: () => { throw new Error('Custom provider must be registered') },
    mcp: () => { throw new Error('Custom provider must be registered') },
    skills: () => { throw new Error('Custom provider must be registered') },
  },
}

// =============================================================================
// AI 服务实现
// =============================================================================

/**
 * AI 服务实现类
 */
class AIServiceImpl implements AIService {
  private _llm: LLMProvider | null = null
  private _mcp: MCPProvider | null = null
  private _skills: SkillsProvider | null = null
  private _config: AIConfig
  private _initialized = false

  constructor(config: AIConfig) {
    this._config = config
  }

  get llm(): LLMProvider {
    if (!this._llm) {
      throw new Error('AI service not initialized. Call initialize() first.')
    }
    return this._llm
  }

  get mcp(): MCPProvider {
    if (!this._mcp) {
      throw new Error('AI service not initialized. Call initialize() first.')
    }
    return this._mcp
  }

  get skills(): SkillsProvider {
    if (!this._skills) {
      throw new Error('AI service not initialized. Call initialize() first.')
    }
    return this._skills
  }

  async initialize(): Promise<Result<void, AIError>> {
    if (this._initialized) {
      return ok(undefined)
    }

    try {
      const factory = providerFactories[this._config.provider]
      if (!factory) {
        return err({
          type: 'CONFIGURATION_ERROR',
          message: `Unknown AI provider: ${this._config.provider}`,
        })
      }

      this._llm = factory.llm(this._config)
      this._mcp = factory.mcp(this._config)
      this._skills = factory.skills(this._config)
      this._initialized = true

      return ok(undefined)
    }
    catch (error) {
      return err({
        type: 'INTERNAL_ERROR',
        message: 'Failed to initialize AI service',
        cause: error,
      })
    }
  }

  async shutdown(): Promise<Result<void, AIError>> {
    this._llm = null
    this._mcp = null
    this._skills = null
    this._initialized = false
    return ok(undefined)
  }
}

// =============================================================================
// 全局 AI 实例
// =============================================================================

let globalAIService: AIService | null = null

/**
 * 默认配置
 */
const defaultConfig: AIConfig = {
  provider: 'hai',
  llm: {
    provider: 'hai',
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    apiKey: process.env.OPENAI_API_KEY || '',
    model: 'gpt-4o-mini',
    maxTokens: 4096,
    temperature: 0.7,
  },
}

/**
 * 创建 AI 服务
 */
export function createAIService(config?: Partial<AIConfig>): AIService {
  return new AIServiceImpl({
    ...defaultConfig,
    ...config,
  })
}

/**
 * 配置全局 AI 服务
 */
export function configureAI(config?: Partial<AIConfig>): void {
  globalAIService = createAIService(config)
}

/**
 * 获取全局 AI 服务
 */
export function getAI(): AIService {
  if (!globalAIService) {
    globalAIService = createAIService()
  }
  return globalAIService
}

/**
 * 注册自定义提供者
 */
export function registerAIProvider(
  name: AIProvider,
  factories: {
    llm?: (config: AIConfig) => LLMProvider
    mcp?: (config: AIConfig) => MCPProvider
    skills?: (config: AIConfig) => SkillsProvider
  },
): void {
  const existing = providerFactories[name] || providerFactories.custom
  providerFactories[name] = {
    llm: factories.llm || existing.llm,
    mcp: factories.mcp || existing.mcp,
    skills: factories.skills || existing.skills,
  }
}

// =============================================================================
// 导出全局 ai 常量
// =============================================================================

/**
 * AI 服务代理对象
 * 提供便捷的访问方式: ai.llm.chat(), ai.mcp.callTool(), ai.skills.execute()
 */
export const ai = {
  /**
   * LLM 服务
   */
  get llm(): LLMProvider {
    return getAI().llm
  },

  /**
   * MCP 服务
   */
  get mcp(): MCPProvider {
    return getAI().mcp
  },

  /**
   * 技能服务
   */
  get skills(): SkillsProvider {
    return getAI().skills
  },

  /**
   * 初始化 AI 服务
   */
  initialize: () => getAI().initialize(),

  /**
   * 关闭 AI 服务
   */
  shutdown: () => getAI().shutdown(),

  /**
   * 配置 AI 服务
   */
  configure: configureAI,
}
