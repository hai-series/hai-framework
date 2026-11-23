import { createAudioClient } from './ai-audio-client.js'
import { createAudioRecorder } from './ai-audio-recorder.js'
import { blobToWav } from './ai-audio-wav.js'

/**
 * 浏览器语音实例的统一创建入口。
 * @example
 * ```ts
 * import { ai } from '@h-ai/ai/client'
 *
 * // 创建录音实例；实际开始录音时由浏览器申请麦克风权限。
 * const recorder = ai.createAudioRecorder({ onStop: blob => void blob.size })
 * void recorder
 * ```
 */
export const ai = { createAudioRecorder, blobToWav, createAudioClient }
