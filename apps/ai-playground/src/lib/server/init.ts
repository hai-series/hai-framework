/**
 * AI 实验台服务端初始化
 *
 * 从环境变量解析模型配置（默认接入 MiMo，可切换任意兼容 OpenAI 接口的服务），并在首次请求时
 * 惰性初始化 @h-ai/ai。使用进程内记忆存储，仅用于能力演示；生产环境应先初始化 reldb / vecdb。
 * @module server/init
 */

import type { AIConfigInput, AudioProviderName } from '@h-ai/ai'
import process from 'node:process'
import { ai, AudioProviderSchema } from '@h-ai/ai'
import { core } from '@h-ai/core'

// 默认指向 MiMo 系列模型，可通过下列环境变量切换到任意兼容 OpenAI 接口的模型服务
export const AI_BASE_URL = process.env.AI_BASE_URL || 'https://api.xiaomimimo.com/v1'
export const AI_LLM_MODEL = process.env.AI_LLM_MODEL || 'mimo-v2.5'
export const AI_TTS_MODEL = process.env.AI_TTS_MODEL || 'mimo-v2.5-tts'
export const AI_ASR_MODEL = process.env.AI_ASR_MODEL || 'mimo-v2.5-asr'
// 音频适配器标识（transcribe/synthesize），非法或缺省时回退到 mimo
export const AI_AUDIO_PROVIDER: AudioProviderName = AudioProviderSchema.catch('mimo').parse(process.env.AI_AUDIO_PROVIDER)
// TTS 预置音色，默认使用 MiMo 音色，可用 AI_TTS_VOICES（逗号分隔）覆盖以适配其它模型
const DEFAULT_TTS_VOICES = ['mimo_default', '冰糖', '茉莉', '苏打', '白桦', 'Mia', 'Chloe', 'Milo', 'Dean']
export const AI_TTS_VOICES = process.env.AI_TTS_VOICES
  ? process.env.AI_TTS_VOICES.split(',').map(voice => voice.trim()).filter(Boolean)
  : DEFAULT_TTS_VOICES

let initPromise: Promise<void> | undefined

/** 构建 AI 配置：LLM 对话 + 音频（ASR/TTS）+ 进程内原生记忆 */
function createAIConfig(): AIConfigInput {
  return {
    llm: {
      apiKey: process.env.AI_API_KEY,
      baseUrl: AI_BASE_URL,
      model: AI_LLM_MODEL,
      api: 'chat',
      temperature: 0.7,
      maxTokens: 4096,
      timeout: 120000,
    },
    audio: {
      models: [
        {
          id: 'asr',
          provider: AI_AUDIO_PROVIDER,
          model: AI_ASR_MODEL,
          operations: ['transcribe'],
          apiKey: process.env.AI_API_KEY,
          baseUrl: AI_BASE_URL,
          timeout: 120000,
        },
        {
          id: 'tts',
          provider: AI_AUDIO_PROVIDER,
          model: AI_TTS_MODEL,
          operations: ['synthesize'],
          apiKey: process.env.AI_API_KEY,
          baseUrl: AI_BASE_URL,
          timeout: 120000,
        },
      ],
      transcribeModel: 'asr',
      synthesizeModel: 'tts',
    },
    memory: {
      provider: 'native',
      embeddingEnabled: false,
      defaultTopK: 8,
    },
  }
}

/** 实际初始化：初始化 core → 校验密钥 → 初始化 ai */
async function initialize(): Promise<void> {
  core.init({ logging: { level: 'info' } })

  if (!process.env.AI_API_KEY)
    throw new Error('AI_API_KEY is not configured')

  const result = await ai.init(createAIConfig())
  if (!result.success)
    throw new Error(`AI initialization failed: ${result.error.message}`)

  core.logger.info('AI Playground initialized', {
    provider: AI_AUDIO_PROVIDER,
    llmModel: AI_LLM_MODEL,
    ttsModel: AI_TTS_MODEL,
    asrModel: AI_ASR_MODEL,
  })
}

/** 确保 AI 已初始化（并发安全，仅初始化一次；失败时清空 promise 以允许重试） */
export async function ensureAIInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = initialize().catch((error: unknown) => {
      initPromise = undefined
      throw error
    })
  }
  await initPromise
}
