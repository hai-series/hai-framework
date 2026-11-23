/**
 * @h-ai/ai/client — 浏览器语音客户端入口。
 *
 * createAudioClient 连接统一 Audio WebSocket；HTTP 领域能力由 @h-ai/api-client 的 typed contract 提供。
 * @module index
 */
export type { AudioClientConfig, AudioClientOperations, AudioTicketRequest } from './ai-audio-client.js'

export type { AudioRecorder, AudioRecorderOptions } from './ai-audio-recorder.js'

export type { AudioWavOptions } from './ai-audio-wav.js'

export { ai } from './ai-client-main.js'
