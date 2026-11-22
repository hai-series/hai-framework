/**
 * 浏览器端 WAV 编码工具
 *
 * MediaRecorder 通常输出 webm/opus，而多数 ASR 服务（如 MiMo）仅接受 wav/mp3，
 * 故录音快照先用 Web Audio API 解码，再重采样为单声道并编码为 16bit PCM WAV。
 * 所有 API 均为浏览器专用（AudioContext / OfflineAudioContext），仅在客户端调用。
 * @module audio/wav
 */

const ASR_SAMPLE_RATE = 16000

/**
 * WAV 转换的目标格式和处理上限。
 * @example
 * ```ts
 * import type { AudioWavOptions } from '@h-ai/ai/client'
 * const options: AudioWavOptions = { maxInputBytes: 1024 * 1024, maxDurationSeconds: 30, overflow: 'truncate' }
 * ```
 */
export interface AudioWavOptions {
  /** 输出采样率，单位 Hz，默认 16000。 */
  sampleRate?: number
  /** 解码前允许的 Blob 最大字节数。 */
  maxInputBytes?: number
  /** 输出 PCM 的最长秒数，在解码后、重采样前检查。 */
  maxDurationSeconds?: number
  /** 超过最长秒数时默认拒绝，设为 truncate 时保留开头。 */
  overflow?: 'reject' | 'truncate'
}

/**
 * 将任意浏览器可解码的音频 Blob（如 MediaRecorder 的 webm）转换为单声道 16bit PCM WAV。
 *
 * @param blob - 录制得到的原始音频
 * @param options - 目标采样率（兼容旧调用）或含转换上限的配置
 * @throws 配置无效、输入超限、解码失败或超时长且未指定截断时抛错
 * @returns `audio/wav` 类型的 Blob
 * @example
 * ```ts
 * import { blobToWav } from '@h-ai/ai/client'
 * async function prepareRecording(recording: Blob) {
 *   const wav = await blobToWav(recording)
 *   return new File([wav], 'recording.wav', { type: wav.type })
 * }
 * ```
 */
export async function blobToWav(blob: Blob, options: number | AudioWavOptions = ASR_SAMPLE_RATE): Promise<Blob> {
  const { sampleRate = ASR_SAMPLE_RATE, maxInputBytes, maxDurationSeconds, overflow = 'reject' }
    = typeof options === 'number'
      ? { sampleRate: options }
      : options
  if (!Number.isSafeInteger(sampleRate) || sampleRate <= 0
    || (maxInputBytes !== undefined && (!Number.isSafeInteger(maxInputBytes) || maxInputBytes <= 0))
    || (maxDurationSeconds !== undefined && (!Number.isFinite(maxDurationSeconds) || Math.floor(maxDurationSeconds * sampleRate) < 1))) {
    throw new RangeError('Invalid WAV conversion limits')
  }
  if (!blob.size || (maxInputBytes !== undefined && blob.size > maxInputBytes))
    throw new RangeError('Invalid audio input size')
  const arrayBuffer = await blob.arrayBuffer()

  // 解码为 AudioBuffer（浏览器自动识别 webm/opus/mp4 等容器）
  const decodeCtx = new AudioContext()
  let decoded: AudioBuffer
  try {
    decoded = await decodeCtx.decodeAudioData(arrayBuffer)
  }
  finally {
    await decodeCtx.close()
  }

  // 通过离线渲染重采样为目标采样率的单声道
  const inputFrames = Math.ceil(decoded.duration * sampleRate)
  const maxFrames = maxDurationSeconds === undefined
    ? Math.floor((0xFFFFFFFF - 36) / 2)
    : Math.min(Math.floor(maxDurationSeconds * sampleRate), Math.floor((0xFFFFFFFF - 36) / 2))
  if (!inputFrames || (inputFrames > maxFrames && overflow !== 'truncate'))
    throw new RangeError('Invalid audio duration')
  const frameCount = Math.min(inputFrames, maxFrames)
  const offline = new OfflineAudioContext(1, frameCount, sampleRate)
  const source = offline.createBufferSource()
  source.buffer = decoded
  source.connect(offline.destination)
  source.start()
  const rendered = await offline.startRendering()

  return encodeWav(rendered.getChannelData(0), sampleRate)
}

/** 将单声道 Float32 采样编码为 16bit PCM WAV Blob */
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)

  // WAV 头（RIFF/WAVE + fmt + data）
  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // fmt 块长度
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // 单声道
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // 字节率 = 采样率 * 声道数 * 位深/8
  view.setUint16(32, 2, true) // 块对齐
  view.setUint16(34, 16, true) // 位深
  writeString(view, 36, 'data')
  view.setUint32(40, samples.length * 2, true)

  // 采样数据：Float32 [-1,1] → Int16 小端
  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, clamped < 0
      ? clamped * 0x8000
      : clamped * 0x7FFF, true)
    offset += 2
  }

  return new Blob([view], { type: 'audio/wav' })
}

/** 在 DataView 指定偏移写入 ASCII 字符串 */
function writeString(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++)
    view.setUint8(offset + i, text.charCodeAt(i))
}
