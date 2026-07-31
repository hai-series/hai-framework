/** @h-ai/ai — 音频播放负载序列化 */

import type { HaiResult } from '@h-ai/core'

import type { AudioContent, PlayableAudio } from './ai-audio-types.js'

import { err, ok } from '@h-ai/core'
import { HaiAIError } from '../ai-types.js'

/**
 * 将标准音频内容转换为浏览器可直接播放的 Base64 负载。
 *
 * `synthesize` 只负责统一供应商输出的字节与格式；裸 PCM 没有容器头，
 * 因此这里负责补齐 WAV 头。MP3/WAV 则只进行 Base64 编码，不重新封装。
 */
export function serializePlayableAudio(audio: AudioContent): HaiResult<PlayableAudio> {
  if (audio.format === 'wav')
    return ok({ audioBase64: toBase64(audio.data), format: 'wav', mimeType: 'audio/wav' })
  if (audio.format === 'mp3')
    return ok({ audioBase64: toBase64(audio.data), format: 'mp3', mimeType: 'audio/mpeg' })
  if (audio.format !== 'pcm16')
    return err(HaiAIError.AUDIO_UNSUPPORTED_INPUT, `Unsupported playable audio format: ${audio.format}`)

  const sampleRate = audio.sampleRate
  const channels = audio.channels ?? 1
  if (sampleRate === undefined || !Number.isInteger(sampleRate) || sampleRate <= 0 || (channels !== 1 && channels !== 2) || audio.data.byteLength % (channels * 2) !== 0)
    return err(HaiAIError.AUDIO_INVALID_REQUEST, 'PCM16 audio metadata is invalid')

  const wav = new Uint8Array(44 + audio.data.byteLength)
  const view = new DataView(wav.buffer)
  writeAscii(wav, 0, 'RIFF')
  view.setUint32(4, wav.byteLength - 8, true)
  writeAscii(wav, 8, 'WAVE')
  writeAscii(wav, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * channels * 2, true)
  view.setUint16(32, channels * 2, true)
  view.setUint16(34, 16, true)
  writeAscii(wav, 36, 'data')
  view.setUint32(40, audio.data.byteLength, true)
  wav.set(audio.data, 44)
  return ok({ audioBase64: toBase64(wav), format: 'wav', mimeType: 'audio/wav' })
}

function writeAscii(target: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index++)
    target[offset + index] = value.charCodeAt(index)
}

function toBase64(data: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < data.length; offset += chunkSize)
    binary += String.fromCharCode(...data.subarray(offset, offset + chunkSize))
  return btoa(binary)
}
