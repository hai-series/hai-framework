/**
 * AI 实验台服务端初始化
 *
 * 配置统一由 `config/_core.yml` 与 `config/_ai.yml` 提供；约定环境变量拥有最高优先级。
 * @module server/init
 */

import type { AIConfig, AIConfigInput, AudioProviderName, ImageProviderName } from '@h-ai/ai'
import { ai, AIConfigSchema } from '@h-ai/ai'
import { core } from '@h-ai/core'

const DEFAULT_TTS_VOICES = ['mimo_default', '冰糖', '茉莉', '苏打', '白桦', 'Mia', 'Chloe', 'Milo', 'Dean']

/** 首页状态卡片所需的非敏感配置摘要。 */
export interface AIPlaygroundMetadata {
  provider: AudioProviderName
  llmModel: string
  ttsModel: string
  asrModel: string
  imageProvider: ImageProviderName
  imageModel: string
  ttsVoices: string[]
}

let initPromise: Promise<void> | undefined
let metadata: AIPlaygroundMetadata | undefined

function createMetadata(config: AIConfig): AIPlaygroundMetadata {
  const transcribe = config.audio?.models?.find(model => model.id === config.audio?.transcribeModel)
  const synthesize = config.audio?.models?.find(model => model.id === config.audio?.synthesizeModel)
  const image = config.image?.models?.find(model => model.id === config.image?.generateModel)
  if (!transcribe || !synthesize || !image)
    throw new Error('AI config must define audio transcribe/synthesize models and an image generate model')

  return {
    provider: synthesize.provider,
    llmModel: config.llm.model,
    ttsModel: synthesize.model,
    asrModel: transcribe.model,
    imageProvider: image.provider,
    imageModel: image.model,
    ttsVoices: synthesize.provider === 'mimo' ? DEFAULT_TTS_VOICES : [],
  }
}

/** 返回已加载的非敏感 AI 配置摘要。 */
export function getAIPlaygroundMetadata(): AIPlaygroundMetadata {
  if (!metadata)
    throw new Error('AI Playground is not initialized')
  return metadata
}

/** 实际初始化：加载 YAML → 校验 AI 配置 → 初始化 AI 模块。 */
async function initialize(): Promise<void> {
  // 不传 logging，确保 config/_core.yml 中的日志配置拥有最终决定权。
  core.init({ configDir: './config' })

  const validated = core.config.validate('ai', AIConfigSchema)
  if (!validated.success) {
    core.logger.error('AI Playground config validation failed', { error: validated.error.message })
    throw new Error(`AI config validation failed: ${validated.error.message}`)
  }

  const config = core.config.getOrThrow<AIConfigInput>('ai')
  const result = await ai.init(config)
  if (!result.success) {
    core.logger.error('AI Playground initialization failed', {
      code: result.error.code,
      error: result.error.message,
    })
    throw new Error(`AI initialization failed: ${result.error.message}`)
  }

  metadata = createMetadata(validated.data)
  core.logger.info('AI Playground initialized', {
    logLevel: core.logger.getLevel(),
    provider: metadata.provider,
    llmModel: metadata.llmModel,
    ttsModel: metadata.ttsModel,
    asrModel: metadata.asrModel,
    imageProvider: metadata.imageProvider,
    imageModel: metadata.imageModel,
  })
}

/** 确保 AI 已初始化（并发安全；失败时允许后续请求重试）。 */
export async function ensureAIInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = initialize().catch((error: unknown) => {
      initPromise = undefined
      metadata = undefined
      throw error
    })
  }
  await initPromise
}
