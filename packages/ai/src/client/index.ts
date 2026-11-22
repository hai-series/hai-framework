/**
 * @h-ai/ai/client — 浏览器语音客户端入口。
 *
 * createAudioClient 连接统一 Audio WebSocket；HTTP 领域能力由 @h-ai/api-client 的 typed contract 提供。
 * @module index
 */
export * from './ai-audio-client.js'

export { createAudioRecorder } from './ai-audio-recorder.js'
export type { AudioRecorder, AudioRecorderOptions } from './ai-audio-recorder.js'
export { blobToWav } from './ai-audio-wav.js'
export type { AudioWavOptions } from './ai-audio-wav.js'
