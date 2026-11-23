import { ensureAudioCredential, resolveAudioModel, resolveImageModel, resolveModelApi, resolveModelEntry } from './ai-config.js'
import { serializePlayableAudio } from './audio/ai-audio-serialization.js'
import { createAudioClient } from './client/ai-audio-client.js'
import { createAudioRecorder } from './client/ai-audio-recorder.js'
import { blobToWav } from './client/ai-audio-wav.js'

/**
 * 浏览器 AI 工具与语音工厂；无需初始化，不加载服务端 Provider。
 * @example
 * ```ts
 * import { ai } from '@h-ai/ai'
 *
 * // 读取共享模型解析能力；配置由宿主提供。
 * const resolveModel = ai.resolveModelEntry
 * void resolveModel
 * ```
 */
export const ai = {
  resolveModelEntry,
  resolveModelApi,
  resolveAudioModel,
  ensureAudioCredential,
  resolveImageModel,
  serializePlayableAudio,
  createAudioRecorder,
  blobToWav,
  createAudioClient,
}
