import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'

import { serializePlayableAudio } from '../src/index.js'

describe('serializePlayableAudio', () => {
  it('透传 WAV 和 MP3 为 Base64 播放负载', () => {
    const wav = serializePlayableAudio({ data: new Uint8Array([1, 2]), format: 'wav' })
    expect(wav.success).toBe(true)
    if (wav.success)
      expect(wav.data).toEqual({ audioBase64: 'AQI=', format: 'wav', mimeType: 'audio/wav' })

    const mp3 = serializePlayableAudio({ data: new Uint8Array([3, 4]), format: 'mp3' })
    expect(mp3.success).toBe(true)
    if (mp3.success)
      expect(mp3.data).toEqual({ audioBase64: 'AwQ=', format: 'mp3', mimeType: 'audio/mpeg' })
  })

  it('为 PCM16 添加合法 WAV 头', () => {
    const result = serializePlayableAudio({ data: new Uint8Array([1, 0, 2, 0]), format: 'pcm16', sampleRate: 24_000 })
    expect(result.success).toBe(true)
    if (result.success) {
      const bytes = Uint8Array.from(Buffer.from(result.data.audioBase64, 'base64'))
      expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF')
      expect(String.fromCharCode(...bytes.slice(8, 12))).toBe('WAVE')
      expect(bytes.byteLength).toBe(48)
    }
  })

  it('拒绝缺少采样率或不完整采样帧的 PCM16', () => {
    const missingRate = serializePlayableAudio({ data: new Uint8Array([1, 0]), format: 'pcm16' })
    expect(missingRate.success).toBe(false)

    const incompleteFrame = serializePlayableAudio({ data: new Uint8Array([1, 0, 2]), format: 'pcm16', sampleRate: 24_000 })
    expect(incompleteFrame.success).toBe(false)
  })
})
