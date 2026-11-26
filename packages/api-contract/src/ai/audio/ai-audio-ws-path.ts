import { AUDIO_WS_PATH } from './ai-audio-ws-schemas.js'

/**
 * 解析实时语音的站点路径。显式路径从站点根开始，缺省路径随业务 API 前缀变化。
 *
 * @example
 * ```ts
 * import { apiContract } from '@h-ai/api-contract'
 *
 * const defaultPath = apiContract.resolveAudioWebSocketPath('/ops/v2') // /ops/v2/ai/audio
 * const voicePath = apiContract.resolveAudioWebSocketPath('/ops/v2', '/live/voice') // /live/voice
 * ```
 */
export function resolveAudioWebSocketPath(apiPrefix: `/${string}`, path?: `/${string}`): `/${string}` {
  return path ?? `${apiPrefix}${AUDIO_WS_PATH}`
}
