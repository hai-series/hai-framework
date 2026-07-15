/**
 * @h-ai/ai — Audio 子功能公共类型
 *
 * 仅定义语音识别（ASR）与语音合成（TTS）的对外业务类型。
 * 不暴露 WebSocket、SSE、厂商事件、Session/Commit、二进制帧等传输细节，
 * 也不暴露内部 Provider 接口与厂商报文结构。
 * @module audio/ai-audio-types
 */

import type { HaiResult } from '@h-ai/core'

// ─── 音频内容 ───

/**
 * 音频编码格式
 *
 * - `pcm16` — 16bit 小端裸 PCM（必须提供 `sampleRate`）
 * - `wav` — WAV 容器（自描述采样率，可不传 `sampleRate`）
 * - `mp3` — MP3 容器
 * - `opus` — Opus 编码
 */
export type AudioFormat = 'pcm16' | 'wav' | 'mp3' | 'opus'

/**
 * 完整音频内容（一次性输入/输出）
 *
 * `data` 统一使用二进制字节；Node.js 中的 `Buffer` 可直接作为 `Uint8Array` 传入。
 * Provider 内部会按厂商要求转换为 Base64 / Multipart / 二进制帧，调用方无需感知。
 */
export interface AudioContent {
  /** 音频二进制数据 */
  data: Uint8Array
  /** 音频编码格式 */
  format: AudioFormat
  /** 采样率（Hz）；`pcm16` 等裸音频必填，`wav` / `mp3` 等自描述格式可省略 */
  sampleRate?: number
  /** 声道数（默认单声道） */
  channels?: 1 | 2
}

/**
 * 实时音频输入流（持续到达的音频分片）
 *
 * 仅表达「音频分片持续到达」这一业务语义，不包含 WebSocket、Session、Commit 等传输概念。
 */
export interface AudioInputStream {
  /** 持续到达的音频分片 */
  chunks: AsyncIterable<Uint8Array>
  /** 音频编码格式 */
  format: AudioFormat
  /** 采样率（Hz） */
  sampleRate: number
  /** 声道数（默认单声道） */
  channels?: 1 | 2
}

// ─── 语音识别（ASR） ───

/** 完整语音识别请求 */
export interface TranscriptionRequest {
  /** 待识别的完整音频 */
  audio: AudioContent
  /** 语言提示（如 `zh` / `en`；不传时由模型自动检测） */
  language?: string
  /**
   * 领域提示词 / 热词（如角色名、专有名词、当前主题关键词）
   *
   * Provider 按能力映射为热词表 / phrase list / vocabulary / 提示词；不支持的平台会忽略。
   */
  contextHints?: string[]
  /** 模型 ID（不传时使用配置中的默认识别模型） */
  model?: string
  /** 取消信号 */
  signal?: AbortSignal
}

/** 流式语音识别请求（支持完整音频或持续音频输入） */
export interface TranscriptionStreamRequest {
  /** 完整音频，或持续到达的音频输入流 */
  audio: AudioContent | AudioInputStream
  /** 语言提示（如 `zh` / `en`；不传时由模型自动检测） */
  language?: string
  /**
   * 领域提示词 / 热词（如角色名、专有名词、当前主题关键词）
   *
   * Provider 按能力映射为热词表 / phrase list / vocabulary / 提示词；不支持的平台会忽略。
   */
  contextHints?: string[]
  /** 模型 ID（不传时使用配置中的默认识别模型） */
  model?: string
  /** 取消信号 */
  signal?: AbortSignal
}

/** 完整语音识别结果 */
export interface TranscriptionResult {
  /** 识别文本 */
  text: string
}

/**
 * 流式语音识别领域事件
 *
 * 统一的语音领域事件（非厂商协议）。支持服务端 VAD 的平台（如 Qwen 实时识别）会在检测到
 * 语音起止时额外产出 `speech_started` / `speech_stopped`，使调用方可在「开始说话」的瞬间做出
 * 反应（如取消当前上游生成），而无需自行运行 VAD；不产出 VAD 事件的平台（如豆包）仅产出
 * `transcript`，此时是否需要 VAD 由调用方自行决定。
 *
 * `transcript.text` 表示当前语句的完整识别文本（非字符增量），实时 ASR 会修订前一次临时结果，
 * 调用方可直接用 `text` 覆盖当前临时文本。
 */
export type TranscriptionEvent
  = | { type: 'speech_started' }
    | { type: 'transcript', text: string, final: boolean }
    | { type: 'speech_stopped' }

// ─── 语音合成（TTS） ───

/** 完整语音合成请求 */
export interface SynthesisRequest {
  /** 待合成文本 */
  text: string
  /** 音色（厂商音色名，不传时使用模型默认音色） */
  voice?: string
  /**
   * 自然语言风格指令（如语速、情绪、角色语气）
   *
   * Provider 按能力映射（如 MiMo 放入 user 消息、Qwen instructions）；不支持的平台会忽略。
   */
  instruction?: string
  /** 输出音频格式（不传时使用模型默认格式） */
  format?: AudioFormat
  /** 输出采样率（Hz） */
  sampleRate?: number
  /** 模型 ID（不传时使用配置中的默认合成模型） */
  model?: string
  /** 取消信号 */
  signal?: AbortSignal
}

/** 带稳定 ID 的合成文本段 */
export interface SynthesisTextSegment {
  /** 调用方分配的稳定 ID，用于关联文本、音频与播放完成状态 */
  id: string
  /** 本段待合成文本 */
  text: string
}

/** 流式语音合成请求（支持单段或持续文本段输入） */
export interface SynthesisStreamRequest {
  /** 单个文本段，或持续到达的文本段流 */
  text: SynthesisTextSegment | AsyncIterable<SynthesisTextSegment>
  /** 音色（厂商音色名，不传时使用模型默认音色） */
  voice?: string
  /**
   * 自然语言风格指令（如语速、情绪、角色语气）
   *
   * Provider 按能力映射（如 MiMo 放入 user 消息、Qwen instructions）；不支持的平台会忽略。
   */
  instruction?: string
  /** 输出音频格式（不传时使用模型默认格式） */
  format?: AudioFormat
  /** 输出采样率（Hz） */
  sampleRate?: number
  /** 模型 ID（不传时使用配置中的默认合成模型） */
  model?: string
  /** 取消信号 */
  signal?: AbortSignal
}

/** 完整语音合成结果 */
export interface SynthesisResult extends AudioContent {}

/**
 * 流式语音合成领域事件
 *
 * 每个文本段严格按 `segment_started → audio* → segment_done` 顺序产出，调用方可在
 * 对应音频真正播放完成后提交该段文本，不需要按字节数反推文本边界。
 *
 * `segment_started` 携带服务端解析 Provider 后的**真实输出音频参数**（format / sampleRate / channels），
 * 调用方据此正确解码、设置 PCM 播放参数、选择保存扩展名，而非根据请求参数猜测。
 */
export type SynthesisEvent
  = | { type: 'segment_started', segmentId: string, text: string, format: AudioFormat, sampleRate?: number, channels?: 1 | 2 }
    | { type: 'audio', segmentId: string, data: Uint8Array }
    | { type: 'segment_done', segmentId: string }

// ─── 模型能力 ───

/**
 * 语音模型的实时能力声明
 *
 * 由 `ai.audio.getCapabilities({ operation, model })` 返回，供实时会话在启动前校验：不同平台对「持续音频输入 /
 * 服务端 VAD / 增量文本输入 / 流式输出」的原生支持不同，同一方法签名在不同平台下的实时语义并不一致。
 * 调用方应据此选择模型或调整策略（如实时 ASR 要求 `realtimeAudioInput` 与 `speechBoundaryEvents`，
 * 实时 TTS 要求 `streamingAudioOutput`）。
 */
export interface AudioModelCapabilities {
  /** 语音识别能力；模型未声明识别操作时不返回 */
  transcribe?: {
    supported: boolean
    realtimeAudioInput: boolean
    speechBoundaryEvents: boolean
    streamingTranscriptOutput: boolean
  }
  /** 语音合成能力；模型未声明合成操作时不返回 */
  synthesize?: {
    supported: boolean
    incrementalTextInput: boolean
    streamingAudioOutput: boolean
  }
}

/** 查询语音模型能力的参数 */
export interface AudioCapabilitiesRequest {
  /** 要查询的操作，决定默认模型和返回的能力分支 */
  operation: 'transcribe' | 'synthesize'
  /** 模型 ID；不传时使用该操作配置的默认模型 */
  model?: string
}

// ─── Audio 操作接口 ───

/**
 * Audio 操作接口（通过 `ai.audio` 访问）
 *
 * 提供语音识别与语音合成的完整与流式能力。普通方法返回 `HaiResult`；
 * 流式方法返回 `AsyncIterable`，迭代期间发生的连接/协议/上游错误会终止异步迭代（抛出异常）。
 */
export interface AudioOperations {
  /** 将完整音频识别为完整文本 */
  transcribe: (request: TranscriptionRequest) => Promise<HaiResult<TranscriptionResult>>
  /** 持续输入音频或增量返回识别文本（含语音起止领域事件） */
  transcribeStream: (request: TranscriptionStreamRequest) => AsyncIterable<TranscriptionEvent>
  /** 将完整文本合成为完整音频 */
  synthesize: (request: SynthesisRequest) => Promise<HaiResult<SynthesisResult>>
  /** 持续输入文本段并按段输出结构化音频事件 */
  synthesizeStream: (request: SynthesisStreamRequest) => AsyncIterable<SynthesisEvent>
  /**
   * 查询指定模型的实时能力声明
   *
   * @param request - 操作类型与可选模型 ID
   * @returns 该模型对应操作的能力；模型不存在或操作不匹配时返回失败结果
   */
  getCapabilities: (request: AudioCapabilitiesRequest) => HaiResult<AudioModelCapabilities>
}
