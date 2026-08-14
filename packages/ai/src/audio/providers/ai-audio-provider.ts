/**
 * @h-ai/ai — Audio Provider 内部接口与共享传输辅助
 *
 * 定义 audio 子系统内部的协议适配接口 `AudioProvider`，以及各 Provider 复用的
 * Node WebSocket 连接、Base64、取消等底层辅助。这些类型与函数是 audio 子系统内部实现，
 * 不从 `@h-ai/ai` 根入口导出，也不作为模块消费者需要了解的概念。
 * @internal
 * @module audio/providers/ai-audio-provider
 */

import type { HaiError, HaiErrorDef, HaiResult } from '@h-ai/core'

import type { ResolvedAudioModel } from '../../ai-config.js'
import type {
  AudioContent,
  AudioFormat,
  AudioInputStream,
  AudioModelCapabilities,
  AudioReference,
  SynthesisResult,
  TranscriptionEvent,
  TranscriptionResult,
  TranscriptionTimestampGranularity,
} from '../ai-audio-types.js'

import { Buffer } from 'node:buffer'
import { core } from '@h-ai/core'
import WebSocket from 'ws'
import { aiM } from '../../ai-i18n.js'
import { HaiAIError } from '../../ai-types.js'

// ─── Provider 请求类型（已解析模型 + 公共请求字段） ───

/** Provider 层完整识别请求 */
export interface ProviderTranscriptionRequest {
  /** 已解析模型配置 */
  model: ResolvedAudioModel
  /** 完整音频 */
  audio: AudioContent
  /** 语言提示 */
  language?: string
  /** 领域提示词 / 热词 */
  contextHints?: string[]
  /** 请求返回的时间戳粒度 */
  timestampGranularities?: TranscriptionTimestampGranularity[]
  /** 是否启用服务端 VAD */
  vad?: boolean
  /** 取消信号 */
  signal?: AbortSignal
}

/** Provider 层流式识别请求 */
export interface ProviderTranscriptionStreamRequest {
  /** 已解析模型配置 */
  model: ResolvedAudioModel
  /** 完整音频或持续音频输入流 */
  audio: AudioContent | AudioInputStream
  /** 语言提示 */
  language?: string
  /** 领域提示词 / 热词 */
  contextHints?: string[]
  /** 请求返回的时间戳粒度 */
  timestampGranularities?: TranscriptionTimestampGranularity[]
  /** 是否启用服务端 VAD */
  vad?: boolean
  /** 取消信号 */
  signal?: AbortSignal
}

/** Provider 层完整合成请求 */
export interface ProviderSynthesisRequest {
  /** 已解析模型配置 */
  model: ResolvedAudioModel
  /** 待合成文本 */
  text: string
  /** 目标语言 */
  language?: string
  /** 音色 */
  voice?: string
  /** 说话人 / 音色参考 */
  speakerReference?: AudioReference
  /** 风格 / 情绪参考 */
  styleReference?: AudioReference
  /** 风格参考强度 `[0, 1]` */
  styleStrength?: number
  /** 自然语言风格指令 */
  instruction?: string
  /** 语速倍数 */
  speed?: number
  /** 目标时长（毫秒） */
  targetDurationMs?: number
  /** 目标时长容差（毫秒） */
  durationToleranceMs?: number
  /** 输出格式 */
  format?: AudioFormat
  /** 输出采样率 */
  sampleRate?: number
  /** 取消信号 */
  signal?: AbortSignal
}

/** Provider 层流式合成请求 */
export interface ProviderSynthesisStreamRequest {
  /** 已解析模型配置 */
  model: ResolvedAudioModel
  /** 完整文本或持续文本流 */
  text: string | AsyncIterable<string>
  /** 目标语言 */
  language?: string
  /** 音色 */
  voice?: string
  /** 说话人 / 音色参考 */
  speakerReference?: AudioReference
  /** 风格 / 情绪参考 */
  styleReference?: AudioReference
  /** 风格参考强度 `[0, 1]` */
  styleStrength?: number
  /** 自然语言风格指令 */
  instruction?: string
  /** 语速倍数 */
  speed?: number
  /** 输出格式 */
  format?: AudioFormat
  /** 输出采样率 */
  sampleRate?: number
  /** 取消信号 */
  signal?: AbortSignal
}

/**
 * Provider 解析后的最终输出音频元数据
 *
 * 不同平台对未指定格式时的默认值不同（如 OpenAI 默认 mp3、Qwen/Doubao/MiMo 默认 pcm16），
 * 由各 Provider 依据自身规则解析，供流式合成在 `segment_started` 标注真实格式，
 * 避免调用方根据请求参数猜测导致解码 / 播放参数错误。
 */
export interface SynthesisOutputMeta {
  /** 最终输出音频格式 */
  format: AudioFormat
  /** 采样率（Hz）；pcm16 等裸音频必填，wav / mp3 等自描述格式为 undefined */
  sampleRate?: number
  /** 声道数 */
  channels: 1 | 2
}

/**
 * Provider ASR 子能力
 *
 * 仅具备语音识别能力的平台（如 Whisper）只实现本接口。`transcribeStream` 可选：
 * 未实现时由 Framework 做有限降级（完整音频→完整识别后产出最终结果；持续音频输入→拒绝）。
 */
export interface AudioTranscriptionProvider {
  /** 完整语音识别 */
  transcribe: (request: ProviderTranscriptionRequest) => Promise<HaiResult<TranscriptionResult>>
  /** 原生流式语音识别（未实现时由 Framework 降级） */
  transcribeStream?: (request: ProviderTranscriptionStreamRequest) => AsyncIterable<TranscriptionEvent>
}

/**
 * Provider TTS 子能力
 *
 * 仅具备语音合成能力的平台（如 IndexTTS）只实现本接口。`synthesizeStream` 可选：
 * 未实现时由 Framework 做有限降级（每段文本完整合成后按段产出音频）。
 */
export interface AudioSynthesisProvider {
  /** 完整语音合成 */
  synthesize: (request: ProviderSynthesisRequest) => Promise<HaiResult<SynthesisResult>>
  /** 原生流式语音合成（未实现时由 Framework 降级） */
  synthesizeStream?: (request: ProviderSynthesisStreamRequest) => AsyncIterable<Uint8Array>
  /**
   * 解析该次合成请求的最终输出音频元数据（格式 / 采样率 / 声道）
   *
   * 与 `synthesizeStream` 采用一致的默认规则，供上层在 `segment_started` 标注真实格式。
   */
  resolveSynthesisOutput: (request: { format?: AudioFormat, sampleRate?: number }) => SynthesisOutputMeta
}

/**
 * Audio Provider 内部接口
 *
 * 每个平台一个实现，负责厂商协议适配、连接、响应解析与错误映射。Provider 只描述「如何调用某种协议」，
 * 不描述服务部署在哪里。使用工厂函数 + 闭包实现，不使用抽象基类。ASR / TTS 子能力按平台按需提供，
 * 不需要为不支持的操作实现空占位。
 */
export interface AudioProvider {
  /** 可选 ASR 子能力 */
  transcription?: AudioTranscriptionProvider
  /** 可选 TTS 子能力 */
  synthesis?: AudioSynthesisProvider
  /**
   * 获取指定模型的能力声明
   *
   * 同一个 Provider 下的不同模型可以返回不同 Capability。
   */
  getCapabilities: (model: ResolvedAudioModel) => AudioModelCapabilities
}

/** 句子结束边界（中英标点 + 换行） */
const SENTENCE_BOUNDARY_REGEX = /[。！？；!?;\n]|\.(?=\s|$)/

/**
 * 将持续到达的文本流按句子边界切分，边到达边产出完整短句。
 *
 * 供不原生支持增量文本输入的 TTS 平台（OpenAI / MiMo）使用：以句子级分段逐句发起合成，
 * 实现近似实时的首音低延迟，而非等待整段文本生成完毕（消除“虚假增量”语义）。
 */
export async function* streamSentences(stream: AsyncIterable<string>): AsyncIterable<string> {
  let buffer = ''
  for await (const part of stream) {
    buffer += part
    let match = SENTENCE_BOUNDARY_REGEX.exec(buffer)
    while (match !== null) {
      const end = match.index + match[0].length
      const sentence = buffer.slice(0, end).trim()
      buffer = buffer.slice(end)
      if (sentence)
        yield sentence
      match = SENTENCE_BOUNDARY_REGEX.exec(buffer)
    }
  }
  const rest = buffer.trim()
  if (rest)
    yield rest
}

// ─── Base64 辅助 ───

/** 将二进制数据编码为 Base64 字符串 */
export function toBase64(data: Uint8Array): string {
  return Buffer.from(data).toString('base64')
}

/** 将 Base64 字符串解码为二进制数据 */
export function fromBase64(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, 'base64'))
}

/** 顺序拼接多个二进制分片 */
export function concatChunks(chunks: Uint8Array[]): Uint8Array {
  return new Uint8Array(Buffer.concat(chunks.map(c => Buffer.from(c))))
}

// ─── 音频上传辅助 ───

/** 音频格式 → 上传文件扩展名（文件型服务依据扩展名识别容器） */
const AUDIO_UPLOAD_EXT: Record<AudioFormat, string> = { pcm16: 'wav', wav: 'wav', mp3: 'mp3', opus: 'ogg' }

/** 音频格式 → MIME 类型 */
const AUDIO_UPLOAD_MIME: Record<AudioFormat, string> = { pcm16: 'audio/wav', wav: 'audio/wav', mp3: 'audio/mpeg', opus: 'audio/opus' }

/** 可上传的音频分片（真实字节 + 与内容一致的文件名 / MIME） */
export interface AudioUploadPart {
  /** 上传字节（裸 pcm16 已封装为 WAV） */
  data: Uint8Array
  /** 与真实内容一致的文件名（扩展名不伪装） */
  filename: string
  /** 与真实内容一致的 MIME 类型 */
  mimeType: string
}

/**
 * 将音频内容标准化为可上传的字节 + 文件名 + MIME
 *
 * 裸 `pcm16` 没有容器头，文件型 Model Service 无法从字节推断采样率 / 声道，故先封装为 WAV；
 * 其余格式按真实内容生成扩展名与 MIME，避免「扩展名是 WAV、内容是 MP3」导致模型加载异常。
 *
 * @internal
 */
export function toAudioUploadPart(audio: AudioContent, baseName = 'audio'): AudioUploadPart {
  if (audio.format === 'pcm16') {
    const wav = wrapPcm16ToWav(audio.data, audio.sampleRate ?? 16000, audio.channels ?? 1)
    return { data: wav, filename: `${baseName}.wav`, mimeType: 'audio/wav' }
  }
  return { data: audio.data, filename: `${baseName}.${AUDIO_UPLOAD_EXT[audio.format]}`, mimeType: AUDIO_UPLOAD_MIME[audio.format] }
}

/**
 * 将上传分片构造为 multipart Blob
 *
 * 复制为 ArrayBuffer 承载的字节，满足全局 `Blob` / `FormData` 的 `BlobPart` 类型约束。
 *
 * @internal
 */
export function toAudioBlob(part: AudioUploadPart): Blob {
  return new Blob([new Uint8Array(part.data)], { type: part.mimeType })
}

/**
 * 将 16bit 小端裸 PCM 封装为标准 WAV 容器（44 字节头 + 数据）
 *
 * @internal
 */
export function wrapPcm16ToWav(pcm: Uint8Array, sampleRate: number, channels: 1 | 2 = 1): Uint8Array {
  const bitsPerSample = 16
  const byteRate = (sampleRate * channels * bitsPerSample) / 8
  const blockAlign = (channels * bitsPerSample) / 8
  const dataSize = pcm.length
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(channels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(byteRate, 28)
  buffer.writeUInt16LE(blockAlign, 32)
  buffer.writeUInt16LE(bitsPerSample, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)
  Buffer.from(pcm).copy(buffer, 44)
  return new Uint8Array(buffer)
}

/** 提取错误对象的简要消息（不含敏感请求体 / 凭据） */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 构造可抛出的 HaiError（供流式 async generator 在迭代期间抛出）
 *
 * @internal
 */
export function audioError(def: HaiErrorDef, message: string, cause?: unknown): HaiError {
  return core.error.buildHaiErrorInst(def, message, cause)
}

/**
 * 依据取消原因返回统一取消/超时错误（区分主动取消与超时）
 *
 * `AbortSignal.timeout()` 触发时 `signal.reason` 是 `TimeoutError`，映射为 `AUDIO_TIMEOUT`；
 * 其余主动取消映射为 `AUDIO_CANCELLED`。
 *
 * @internal
 */
export function audioAbortError(signal?: AbortSignal): HaiError {
  const reason = signal?.reason as { name?: string } | undefined
  if (reason?.name === 'TimeoutError')
    return audioError(HaiAIError.AUDIO_TIMEOUT, aiM('ai_audioTimeout'))
  return audioError(HaiAIError.AUDIO_CANCELLED, aiM('ai_audioCancelled'))
}

/**
 * 将流式迭代 / 请求抛出的错误映射为统一 HaiError
 *
 * - 已是领域 HaiError（取消/超时/连接/协议等）→ 原样返回，保留错误码
 * - fetch / SDK 的 `AbortError` / `TimeoutError` → 按取消原因映射 `AUDIO_CANCELLED` / `AUDIO_TIMEOUT`
 * - 其余 → `AUDIO_UPSTREAM_ERROR`
 *
 * @internal
 */
export function mapStreamError(error: unknown, signal?: AbortSignal): HaiError {
  const maybe = error as { code?: unknown, name?: unknown }
  if (typeof maybe.code === 'string' && maybe.code.startsWith('hai:ai:'))
    return error as HaiError
  if (maybe.name === 'AbortError' || maybe.name === 'TimeoutError')
    return audioAbortError(signal)
  return audioError(HaiAIError.AUDIO_UPSTREAM_ERROR, aiM('ai_audioUpstreamError', { params: { error: errorMessage(error) } }), error)
}

/**
 * 将流式迭代抛出的错误转换为 HaiResult（供非流式 transcribe/synthesize 复用底层流）
 *
 * @internal
 */
export function toAudioErrorResult<T>(error: unknown, signal?: AbortSignal): HaiResult<T> {
  return { success: false, error: mapStreamError(error, signal) }
}

// ─── HTTP 辅助 ───

/** 组合取消信号与超时（不泄露原信号） */
export function combineSignal(signal: AbortSignal | undefined, timeout: number): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeout)
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
}

/** 读取 HTTP 错误响应摘要（截断，避免泄露过长响应体） */
export async function describeHttpError(response: Response): Promise<string> {
  const text = await response.text().catch(() => '')
  return `HTTP ${response.status} ${text.slice(0, 200)}`.trim()
}

// ─── Node WebSocket 连接辅助 ───

/** WebSocket 收到的单条消息 */
export interface AudioWsMessage {
  /** 文本帧的字符串内容（`isBinary=false` 时有效） */
  text?: string
  /** 二进制帧内容（`isBinary=true` 时有效） */
  binary?: Uint8Array
  /** 是否为二进制帧 */
  isBinary: boolean
}

/** WebSocket 连接封装（隐藏 ws 事件模型，向 Provider 暴露异步迭代） */
export interface AudioWsConnection {
  /** 发送文本或二进制帧 */
  send: (data: string | Uint8Array) => void
  /** 按到达顺序异步迭代服务端消息，连接关闭时正常结束，出错时抛出 */
  messages: () => AsyncIterableIterator<AudioWsMessage>
  /** 主动关闭连接并释放资源 */
  close: () => void
}

const logger = core.logger.child({ module: 'ai', scope: 'audio-ws' })

/**
 * 建立 Node WebSocket 连接
 *
 * 内部维护消息队列，将 ws 的事件模型转换为背压友好的异步迭代。连接失败或超时返回 rejected Promise。
 * 传入的 `signal` 触发时立即关闭连接并终止迭代。
 *
 * @internal
 */
export function openAudioWebSocket(
  url: string,
  headers: Record<string, string>,
  options?: { signal?: AbortSignal, timeout?: number },
): Promise<AudioWsConnection> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers, handshakeTimeout: options?.timeout ?? 15000 })
    ws.binaryType = 'arraybuffer'

    // 消息队列 + 等待者：经典异步队列，实现背压友好的 for await
    const queue: AudioWsMessage[] = []
    let waiting: ((result: IteratorResult<AudioWsMessage>) => void) | null = null
    let closed = false
    let opened = false
    let aborted = false
    let failure: Error | null = null

    const onSignalAbort = (): void => {
      aborted = true
      try {
        ws.close()
      }
      catch { /* 忽略 */ }
    }

    function settleClosed(): void {
      if (closed)
        return
      closed = true
      if (options?.signal)
        options.signal.removeEventListener('abort', onSignalAbort)
      if (waiting) {
        const w = waiting
        waiting = null
        w({ value: undefined, done: true })
      }
    }

    function pushMessage(msg: AudioWsMessage): void {
      if (waiting) {
        const w = waiting
        waiting = null
        w({ value: msg, done: false })
      }
      else {
        queue.push(msg)
      }
    }

    ws.on('message', (data: ArrayBuffer | Buffer, isBinary: boolean) => {
      if (isBinary) {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer)
        pushMessage({ isBinary: true, binary: new Uint8Array(buf) })
      }
      else {
        const text = Buffer.isBuffer(data) ? data.toString('utf8') : Buffer.from(data as ArrayBuffer).toString('utf8')
        pushMessage({ isBinary: false, text })
      }
    })

    ws.on('error', (error: Error) => {
      // open 之前出错视为连接建立失败，映射为 AUDIO_CONNECTION_FAILED
      if (!opened) {
        settleClosed()
        reject(audioError(HaiAIError.AUDIO_CONNECTION_FAILED, aiM('ai_audioConnectionFailed', { params: { error: error.message } }), error))
        return
      }
      failure = error
      logger.debug('Audio WebSocket error', { error: error.message })
      settleClosed()
    })

    ws.on('close', () => {
      settleClosed()
    })

    if (options?.signal) {
      if (options.signal.aborted)
        onSignalAbort()
      else
        options.signal.addEventListener('abort', onSignalAbort, { once: true })
    }

    ws.on('open', () => {
      opened = true
      const connection: AudioWsConnection = {
        send(data) {
          ws.send(data)
        },
        async* messages() {
          while (true) {
            if (queue.length > 0) {
              yield queue.shift() as AudioWsMessage
              continue
            }
            if (closed) {
              if (aborted)
                throw audioAbortError(options?.signal)
              if (failure)
                throw audioError(HaiAIError.AUDIO_CONNECTION_FAILED, aiM('ai_audioConnectionFailed', { params: { error: failure.message } }), failure)
              return
            }
            const next = await new Promise<IteratorResult<AudioWsMessage>>((res) => {
              waiting = res
            })
            if (next.done) {
              if (aborted)
                throw audioAbortError(options?.signal)
              if (failure)
                throw audioError(HaiAIError.AUDIO_CONNECTION_FAILED, aiM('ai_audioConnectionFailed', { params: { error: failure.message } }), failure)
              return
            }
            yield next.value
          }
        },
        close() {
          try {
            ws.close()
          }
          catch { /* 忽略 */ }
        },
      }
      resolve(connection)
    })
  })
}
