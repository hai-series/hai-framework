# AI Audio 与模型服务能力增强方案

## 1. 建设背景与目标

### 1.1 建设背景

`@h-ai/ai` 当前已经提供统一的 `ai.audio` 能力，通过 Provider 屏蔽 OpenAI、MiMo、Qwen、Doubao 等不同语音服务之间的协议差异，对外统一提供：

```text
transcribe()
transcribeStream()

synthesize()
synthesizeStream()

getCapabilities()
```

现有架构已经形成较清晰的职责边界：

```text
Application
    │
    ▼
ai.audio
    │
    ▼
Audio Operations
    │
    ▼
Provider
    │
    ▼
Endpoint
    │
    ▼
AI Service / Model
```

公共类型主要表达 Audio 业务语义，而 HTTP、WebSocket、厂商事件、二进制协议、Base64、鉴权报文等传输细节由 Provider 隐藏。当前 `ai-audio-types.ts` 也明确按照这一原则组织。

随着 AI Audio 能力的发展，会议转写、字幕生成、语音 Agent、数字人、智能客服、AI 配音等场景逐渐需要更丰富的通用能力，例如：

```text
ASR
├── 自动语言检测
├── VAD
├── 上下文提示 / 热词
├── Segment Timestamp
└── Word Timestamp

TTS
├── 多语言
├── Speaker Reference / Voice Cloning
├── Style / Emotion Reference
├── Style Strength
├── Instruction
├── Speed
└── Target Duration
```

与此同时，需要能够将开源模型部署为 CPU/GPU Model Service，通过统一 Provider 机制接入 Framework，并支持完全离线运行。

本方案不针对某一个具体业务流程设计，而是将这些能力沉淀为 **hai-framework 的通用 Audio 能力以及 Model Service 基础设施**。

---

### 1.2 建设目标

本次建设分为两个相互独立的层次。

#### 1.2.1 Audio Framework 能力增强

将当前：

```text
统一 ASR / TTS 调用
```

进一步增强为：

```text
统一 Audio 业务语义
        +
高级 ASR / TTS 能力
        +
Model-level Capability
        +
Provider 协议适配
        +
Endpoint 可替换
```

#### 1.2.2 Model Service 基础设施

在：

```text
packages/ai/models/
```

建立：

```text
Model Definition
      ↓
Model Prepare
      ↓
Docker Image
      ↓
Model Service
      ↓
Endpoint
```

首批支持：

```text
faster-whisper-large-v3
indextts-2.5
qwen3-4b
```

后续可扩展到：

```text
CosyVoice
MOSS-TTS
其他 ASR/TTS
Embedding
Rerank
OCR
Vision
其他 LLM
```

---

### 1.3 建设边界

本方案负责：

```text
ai.audio 公共类型增强
Provider 抽象增强
Model-level Capability
Whisper Provider
IndexTTS Provider
Model Endpoint 配置
Model Service Contract
Docker Image
CPU / GPU
Model Prepare
完全离线部署
Node.js 通用模型构建脚本
单元 / 集成 / Docker / 离线验收
```

不负责：

```text
视频编解码
音视频分轨
BGM / 人声分离
翻译业务流程
字幕编辑流程
业务级配音流程
```

这些能力由上层应用组合 Framework 提供的 Audio、LLM 等原子能力实现。

---

## 2. 总体架构设计

### 2.1 核心概念

整个体系明确区分：

```text
Provider
Endpoint
Model
Capability
Deployment
```

#### 2.1.1 Provider

Provider 表达：

> **如何调用某一种 API / Service Protocol。**

例如：

```text
openai
mimo
qwen
doubao
whisper
indextts
```

Provider 负责：

```text
请求协议
参数转换
HTTP / WebSocket
鉴权报文
响应解析
错误映射
模型能力声明
```

Provider **不描述服务部署在哪里**。

---

#### 2.1.2 Endpoint

Endpoint 表达：

> **服务实例在哪里。**

由：

```ts
baseUrl
```

描述。

例如：

```text
https://api.example.com/v1

http://127.0.0.1:8101/v1

http://ai-gpu.internal:8102/v1

wss://speech.internal/realtime
```

同一个 Provider 可以连接多个不同 Endpoint。

---

#### 2.1.3 Model

Model 表达：

> **调用 Endpoint 上的哪个模型。**

例如：

```text
qwen3-asr-flash-realtime

faster-whisper-large-v3

indextts-2.5

qwen3-4b
```

由：

```ts
model
```

配置。

---

#### 2.1.4 Capability

Capability 表达：

> **当前配置模型能提供什么业务能力。**

例如：

```text
wordTimestamps
languageDetection

speakerReference
styleReference

speedControl
targetDuration
```

Capability 不应该包含：

```text
local
cloud
cpu
gpu
docker
kubernetes
```

---

#### 2.1.5 Deployment

Deployment 表达 Endpoint 背后的运行环境，例如：

```text
Vendor SaaS

Bare Metal

Docker

Kubernetes

CPU

GPU
```

Deployment 对 Framework 调用层透明。

---

### 2.2 统一概念模型

```text
                    hai-framework
                         │
                         ▼
                   Model Config
                         │
            ┌────────────┼────────────┐
            │            │            │
            ▼            ▼            ▼
        Provider       Model       Endpoint
        怎么调用       调用什么      调用哪里
            │            │            │
            └────────────┼────────────┘
                         ▼
                    AI Service
                         │
                         ▼
                       Model
```

完整调用链：

```text
Request
   ↓
Model Resolver
   ↓
Provider
   ↓
Endpoint
   ↓
AI Service
   ↓
Model
```

---

### 2.3 Provider 与部署形态解耦

例如同一个 `qwen` Provider：

```text
qwen Provider
     │
     ├── DashScope Endpoint
     │
     ├── 企业内网兼容 Endpoint
     │
     └── 自托管兼容 Endpoint
```

只要 Endpoint 实现当前 `qwen` Provider 所要求的协议，就只需要修改：

```ts
baseUrl
```

不修改 Provider。

需要特别明确：

> 一个模型属于 Qwen 系列，并不意味着必须使用 `qwen` Provider。

例如 Qwen3-4B 如果通过 vLLM/SGLang 等暴露的是 OpenAI-compatible API，则应使用现有 OpenAI-compatible LLM Provider。

Provider 的选择依据是：

```text
API Protocol
```

而不是：

```text
Model Family
```

---

### 2.4 `models/` 与 Provider 的关系

`packages/ai/models` 不属于 Provider 层，它负责生成可以被 Provider 调用的 Endpoint。

```text
                          @h-ai/ai
                              │
                           Provider
                              │
                              ▼
                           Endpoint
                              ▲
                              │
            ┌─────────────────┴─────────────────┐
            │                                   │
      Vendor Service                    HAI Model Image
                                                │
                                                ▼
                                         models/images/*
```

因此：

```text
Provider
```

可以访问完全不由：

```text
packages/ai/models
```

部署出来的服务。

反过来，`models/images/*` 也应优先复用已有 Provider Contract。

---

## 3. Audio 公共能力增强

### 3.1 设计原则

公共 API 只表达模型无关业务语义。

应使用：

```text
speakerReference
styleReference
styleStrength
speed
targetDurationMs
```

而不暴露：

```text
spk_audio_prompt
emo_audio_prompt
emo_alpha
duration_factor
```

模型私有参数由 Provider 或 Model Service 转换。

所有新增字段均保持 optional，保证现有接口兼容。

---

## 4. ASR 公共能力

### 4.1 时间戳类型

在：

```text
packages/ai/src/audio/ai-audio-types.ts
```

增加：

```ts
/**
 * ASR 时间戳粒度。
 *
 * - `segment`：语义段/句级时间轴；
 * - `word`：词级时间轴。
 */
export type TranscriptionTimestampGranularity
  = | 'segment'
    | 'word'
```

---

### 4.2 Word Result

```ts
/**
 * 单个 ASR 词级识别结果。
 */
export interface TranscriptionWord {
  /** 识别出的文字、单词或 Token。 */
  text: string

  /** 起始时间，单位毫秒。 */
  startMs: number

  /** 结束时间，单位毫秒。 */
  endMs: number

  /**
   * 可选置信度。
   *
   * 仅 Provider 能提供明确概率语义时返回。
   */
  confidence?: number
}
```

---

### 4.3 Segment Result

```ts
/**
 * ASR 分段结果。
 */
export interface TranscriptionSegment {
  /**
   * Provider 返回或 Framework 生成的 Segment ID。
   */
  id?: string

  /** 当前 Segment 完整文本。 */
  text: string

  /** Segment 起始位置，毫秒。 */
  startMs: number

  /** Segment 结束位置，毫秒。 */
  endMs: number

  /**
   * 当前 Segment 下的词级时间轴。
   */
  words?: TranscriptionWord[]

  /**
   * 为后续 Speaker Diarization 预留。
   */
  speakerId?: string
}
```

公共时间统一使用：

```text
毫秒整数
```

避免秒浮点、毫秒、PTS、Frame 等多套时间语义。

---

### 4.4 ASR 公共 Options

完整 ASR 和流式 ASR 使用统一 Options：

```ts
/**
 * ASR 公共请求选项。
 */
export interface TranscriptionOptions {
  /**
   * 输入语言提示，例如 `zh` / `en` / `ja`。
   *
   * 未提供时表示期望模型自动判断语言。
   */
  language?: string

  /**
   * 领域提示词、角色名、产品名、专有名词等。
   */
  contextHints?: string[]

  /**
   * 请求返回的时间戳粒度。
   */
  timestampGranularities?:
  TranscriptionTimestampGranularity[]

  /**
   * 是否启用模型/服务端 VAD。
   */
  vad?: boolean

  /**
   * 是否严格要求高级能力全部被支持。
   *
   * false：best effort；
   * true：不支持则提前失败。
   */
  strictCapabilities?: boolean

  /** 显式 Model ID。 */
  model?: string

  /** 取消信号。 */
  signal?: AbortSignal
}

/**
 * 完整 ASR 请求。
 */
export interface TranscriptionRequest
  extends TranscriptionOptions {
  /** 待识别完整音频。 */
  audio: AudioContent
}

/**
 * 流式 ASR 请求。
 */
export interface TranscriptionStreamRequest
  extends TranscriptionOptions {
  /** 完整音频或持续音频流。 */
  audio: AudioContent | AudioInputStream
}
```

---

### 4.5 ASR Result

```ts
/**
 * 完整 ASR 结果。
 */
export interface TranscriptionResult {
  /**
   * 完整识别文本。
   *
   * 保持当前公共字段。
   */
  text: string

  /**
   * 实际检测或使用的语言。
   */
  language?: string

  /** 输入音频总时长，毫秒。 */
  durationMs?: number

  /**
   * 结构化识别时间轴。
   *
   * Word Timestamp 统一存储在 segments[].words。
   */
  segments?: TranscriptionSegment[]
}
```

不增加：

```text
words?: TranscriptionWord[]
```

顶层重复数据源。

---

### 4.6 Stream Event

```ts
/**
 * 流式 ASR 事件。
 */
export type TranscriptionEvent
  = | {
    /** 检测到语音开始。 */
    type: 'speech_started'
  }
  | {
    /** Transcript。 */
    type: 'transcript'

    /**
     * 当前语句完整文本。
     *
     * 保持现有覆盖临时文本语义。
     */
    text: string

    /** 是否最终结果。 */
    final: boolean

    /** 可选起始时间。 */
    startMs?: number

    /** 可选结束时间。 */
    endMs?: number

    /** 可选 Word Timestamp。 */
    words?: TranscriptionWord[]
  }
  | {
    /** 检测到语音结束。 */
    type: 'speech_stopped'
  }
```

---

## 5. TTS 公共能力

### 5.1 AudioReference

```ts
/**
 * TTS 通用参考音频。
 *
 * 不绑定任何具体 TTS Model。
 */
export interface AudioReference {
  /** 参考音频。 */
  audio: AudioContent

  /**
   * 参考音频对应文本。
   *
   * 仅需要参考 Transcript 的 Provider 使用。
   */
  transcript?: string

  /** 参考音频语言。 */
  language?: string
}
```

---

### 5.2 SynthesisOptions

```ts
/**
 * TTS 公共请求选项。
 */
export interface SynthesisOptions {
  /** 目标语言。 */
  language?: string

  /**
   * Provider 预置音色。
   *
   * 保留现有接口。
   */
  voice?: string

  /**
   * 说话人/音色参考。
   *
   * 表达“谁在说话”。
   */
  speakerReference?: AudioReference

  /**
   * 风格、情绪、韵律参考。
   *
   * 表达“怎么说”。
   */
  styleReference?: AudioReference

  /**
   * Style Reference 影响强度。
   *
   * Framework 统一为 [0, 1]。
   */
  styleStrength?: number

  /**
   * 通用自然语言风格指令。
   */
  instruction?: string

  /**
   * 语速倍数。
   *
   * 1.0：正常；
   * >1：更快；
   * <1：更慢。
   */
  speed?: number

  /** 输出格式。 */
  format?: AudioFormat

  /** 输出采样率。 */
  sampleRate?: number

  /** 显式 Model ID。 */
  model?: string

  /** 是否严格检查 Capability。 */
  strictCapabilities?: boolean

  /** 请求取消信号。 */
  signal?: AbortSignal
}
```

---

### 5.3 完整 TTS

```ts
/**
 * 完整 TTS 请求。
 */
export interface SynthesisRequest
  extends SynthesisOptions {
  /** 待合成文本。 */
  text: string

  /**
   * 最终音频目标时长，毫秒。
   *
   * 表达 Framework 业务目标，
   * 不对应某个模型私有参数。
   */
  targetDurationMs?: number

  /**
   * 目标时长允许误差，毫秒。
   */
  durationToleranceMs?: number
}
```

---

### 5.4 Stream TTS

首期流式 API 不提供：

```text
targetDurationMs
durationToleranceMs
```

因为：

```text
Streaming
→ 边生成边消费

Target Duration
→ 完整输出约束
```

两者语义不同。

```ts
/**
 * 流式 TTS 请求。
 */
export interface SynthesisStreamRequest
  extends SynthesisOptions {
  /** 单段文本或持续文本段。 */
  text:
    | SynthesisTextSegment
    | AsyncIterable<SynthesisTextSegment>
}
```

---

### 5.5 SynthesisResult

```ts
/**
 * 完整 TTS 结果。
 */
export interface SynthesisResult
  extends AudioContent {
  /**
   * 实际输出音频时长，毫秒。
   */
  durationMs?: number

  /** 通用生成元数据。 */
  metadata?: {
    /**
     * 是否满足调用方指定的时长容差。
     *
     * 无法判断时保持 undefined。
     */
    durationMatched?: boolean

    /**
     * Provider 最终使用的 Framework speed。
     */
    speed?: number
  }
}
```

---

## 6. 公共参数校验

### 6.1 TTS Validation

```ts
/**
 * 校验完整 TTS 公共参数。
 */
function validateSynthesisRequest(
  request: SynthesisRequest,
): HaiError | null {
  // Style 强度统一限制 [0, 1]。
  if (
    request.styleStrength !== undefined
    && (
      request.styleStrength < 0
      || request.styleStrength > 1
    )
  ) {
    return audioError(
      HaiAIError.AUDIO_INVALID_REQUEST,
      'styleStrength must be between 0 and 1',
    )
  }

  // Style Strength 必须依附于 Style Reference。
  if (
    request.styleStrength !== undefined
    && !request.styleReference
  ) {
    return audioError(
      HaiAIError.AUDIO_INVALID_REQUEST,
      'styleStrength requires styleReference',
    )
  }

  // Speed 必须为有限正数。
  if (
    request.speed !== undefined
    && (
      !Number.isFinite(request.speed)
      || request.speed <= 0
    )
  ) {
    return audioError(
      HaiAIError.AUDIO_INVALID_REQUEST,
      'speed must be greater than 0',
    )
  }

  // Target Duration 必须为正整数。
  if (
    request.targetDurationMs !== undefined
    && (
      !Number.isInteger(
        request.targetDurationMs,
      )
      || request.targetDurationMs <= 0
    )
  ) {
    return audioError(
      HaiAIError.AUDIO_INVALID_REQUEST,
      'targetDurationMs must be a positive integer',
    )
  }

  // Tolerance 必须依附于 Target Duration。
  if (
    request.durationToleranceMs !== undefined
    && request.targetDurationMs === undefined
  ) {
    return audioError(
      HaiAIError.AUDIO_INVALID_REQUEST,
      'durationToleranceMs requires targetDurationMs',
    )
  }

  // Tolerance 必须是非负整数。
  if (
    request.durationToleranceMs !== undefined
    && (
      !Number.isInteger(
        request.durationToleranceMs,
      )
      || request.durationToleranceMs < 0
    )
  ) {
    return audioError(
      HaiAIError.AUDIO_INVALID_REQUEST,
      'durationToleranceMs must be a non-negative integer',
    )
  }

  // Speed 与固定目标时长属于两个控制量。
  if (
    request.speed !== undefined
    && request.targetDurationMs !== undefined
  ) {
    return audioError(
      HaiAIError.AUDIO_INVALID_REQUEST,
      'speed and targetDurationMs cannot be used together',
    )
  }

  return null
}
```

---

### 6.2 Reference Audio 大小保护

当前完整音频已有 `maxAudioBytes` 保护。新增 Speaker/Style Reference 后需要同步保护。现有 `ai-audio-functions.ts` 已有统一 `guardAudioSize()`，适合复用。

```ts
/**
 * 校验 TTS 中的参考音频。
 */
function guardSynthesisReferences(
  request:
    | SynthesisRequest
    | SynthesisStreamRequest,
): HaiError | null {
  // Speaker Reference。
  if (request.speakerReference) {
    const error = guardAudioSize(
      request.speakerReference.audio,
    )

    if (error)
      return error
  }

  // Style Reference。
  if (request.styleReference) {
    const error = guardAudioSize(
      request.styleReference.audio,
    )

    if (error)
      return error
  }

  return null
}
```

---

### 6.3 PCM16 上传

裸：

```text
pcm16
```

没有容器 Header。

文件型 Model Service 不能仅依靠字节推断：

```text
sampleRate
channels
```

因此上传 Whisper、IndexTTS 等文件 API 前必须转换为 WAV。

建议将 OpenAI Provider 中现有 WAV 封装逻辑抽取为内部共享工具。

```ts
/**
 * 将 PCM16 封装为标准 WAV。
 */
export function wrapPcm16ToWav(
  pcm: Uint8Array,
  sampleRate: number,
  channels: 1 | 2 = 1,
): Uint8Array {
  // PCM16 每 Sample 为 2 字节。
  const bytesPerSample = 2

  const blockAlign
    = channels * bytesPerSample

  const byteRate
    = sampleRate * blockAlign

  // WAV Header 固定 44 字节。
  const output
    = new Uint8Array(
      44 + pcm.byteLength,
    )

  const view
    = new DataView(
      output.buffer,
    )

  // RIFF。
  writeAscii(output, 0, 'RIFF')
  view.setUint32(
    4,
    output.byteLength - 8,
    true,
  )

  // WAVE。
  writeAscii(output, 8, 'WAVE')

  // fmt。
  writeAscii(output, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(
    24,
    sampleRate,
    true,
  )
  view.setUint32(
    28,
    byteRate,
    true,
  )
  view.setUint16(
    32,
    blockAlign,
    true,
  )
  view.setUint16(34, 16, true)

  // data。
  writeAscii(output, 36, 'data')
  view.setUint32(
    40,
    pcm.byteLength,
    true,
  )

  output.set(
    pcm,
    44,
  )

  return output
}
```

---

## 7. Capability 体系

### 7.1 AudioModelCapabilities

```ts
/**
 * Audio Model 能力。
 *
 * 描述模型/服务能做什么，
 * 不描述 Deployment。
 */
export interface AudioModelCapabilities {
  transcribe?: {
    /** 是否支持 ASR。 */
    supported: boolean

    /** 是否原生支持持续实时音频输入。 */
    realtimeAudioInput: boolean

    /** 是否产生语音边界事件。 */
    speechBoundaryEvents: boolean

    /** 是否原生输出增量 Transcript。 */
    streamingTranscriptOutput: boolean

    /** 是否接受 Language Hint。 */
    languageHint?: boolean

    /** 是否支持自动语言检测。 */
    languageDetection?: boolean

    /** 是否支持 Segment Timestamp。 */
    segmentTimestamps?: boolean

    /** 是否支持 Word Timestamp。 */
    wordTimestamps?: boolean

    /** 是否支持 Context Hints。 */
    contextHints?: boolean

    /** 是否支持 VAD。 */
    vad?: boolean

    /** 是否支持 Speaker Diarization。 */
    speakerDiarization?: boolean
  }

  synthesize?: {
    /** 是否支持 TTS。 */
    supported: boolean

    /** 是否原生支持增量文本输入。 */
    incrementalTextInput: boolean

    /** 是否原生支持流式音频输出。 */
    streamingAudioOutput: boolean

    /** 是否支持指定目标语言。 */
    languageSelection?: boolean

    /** 是否支持预置 Voice。 */
    presetVoice?: boolean

    /** 是否支持 Speaker Reference。 */
    speakerReference?: boolean

    /**
     * 是否必须提供 Speaker Reference。
     */
    speakerReferenceRequired?: boolean

    /** 是否支持 Style Reference。 */
    styleReference?: boolean

    /** 是否支持通用自然语言 Instruction。 */
    instruction?: boolean

    /** 是否支持 Framework Speed。 */
    speedControl?: boolean

    /** 是否支持 Framework Target Duration。 */
    targetDuration?: boolean

    /** 已知支持语言。 */
    supportedLanguages?: string[]
  }
}
```

---

### 7.2 Capability 属于 Model

当前 Provider 直接持有固定 `capabilities`。

调整为：

```ts
/**
 * Audio Provider。
 *
 * Provider 描述协议适配，不描述 Deployment。
 */
export interface AudioProvider {
  /** 可选 ASR 子能力。 */
  transcription?: AudioTranscriptionProvider

  /** 可选 TTS 子能力。 */
  synthesis?: AudioSynthesisProvider

  /**
   * 获取指定 Model 的能力。
   *
   * 同一个 Provider 下的不同模型
   * 可以返回不同 Capability。
   */
  getCapabilities:
  (
    model: ResolvedAudioModel,
  ) => AudioModelCapabilities
}
```

---

## 8. Provider 接口

### 8.1 ASR Provider

```ts
/**
 * Provider ASR 子能力。
 */
export interface AudioTranscriptionProvider {
  /** 完整 ASR。 */
  transcribe:
  (
    request: ProviderTranscriptionRequest,
  ) => Promise<HaiResult<TranscriptionResult>>

  /**
   * 可选原生流式 ASR。
   *
   * 不实现时由 Framework 做有限降级。
   */
  transcribeStream?:
  (
    request:
    ProviderTranscriptionStreamRequest,
  ) => AsyncIterable<TranscriptionEvent>
}
```

---

### 8.2 TTS Provider

```ts
/**
 * Provider TTS 子能力。
 */
export interface AudioSynthesisProvider {
  /** 完整 TTS。 */
  synthesize:
  (
    request: ProviderSynthesisRequest,
  ) => Promise<HaiResult<SynthesisResult>>

  /**
   * 可选原生流式 TTS。
   */
  synthesizeStream?:
  (
    request:
    ProviderSynthesisStreamRequest,
  ) => AsyncIterable<Uint8Array>

  /**
   * 原生 Streaming 时预先解析实际输出格式。
   */
  resolveSynthesisOutput?:
  (
    request: {
      format?: AudioFormat
      sampleRate?: number
    },
  ) => SynthesisOutputMeta
}
```

最终：

```text
OpenAI
├── transcription
└── synthesis

MiMo
├── transcription
└── synthesis

Qwen
├── transcription
└── synthesis

Doubao
├── transcription
└── synthesis

Whisper
└── transcription

IndexTTS
└── synthesis
```

---

## 9. Stream 降级语义

### 9.1 ASR

Whisper 等 Provider 如果没有原生 `transcribeStream()`：

```text
AudioContent
→ 可以完整识别后 yield final result

AudioInputStream
→ 必须拒绝
```

不能将整个持续流缓冲完后伪装为：

```text
realtimeAudioInput=true
```

---

### 9.2 TTS

IndexTTS 等完整生成模型如果没有原生 Streaming：

```text
SynthesisTextSegment
    ↓
完整 synthesize()
    ↓
segment_started
    ↓
audio
    ↓
segment_done
```

公共 `synthesizeStream()` 仍可工作，但 Capability 必须保持：

```text
streamingAudioOutput=false
```

即：

> API 可兼容 ≠ 模型具备原生实时能力。

---

## 10. Audio Model 配置

### 10.1 Provider Schema

```ts
/**
 * Audio Provider。
 *
 * 表示协议适配方式，与部署位置无关。
 */
export const AudioProviderSchema
  = z.enum([
    'openai',
    'mimo',
    'qwen',
    'doubao',
    'whisper',
    'indextts',
  ])
```

---

### 10.2 Audio Operation

当前配置使用固定 tuple 组合。

建议：

```ts
/**
 * Audio Model 支持的 Operation。
 */
export const AudioOperationSchema
  = z.enum([
    'transcribe',
    'synthesize',
  ])

/**
 * Audio Model Operation 列表。
 */
export const AudioOperationsSchema
  = z
    .array(AudioOperationSchema)
    .min(1)
    .refine(
      operations =>
        new Set(operations).size
          === operations.length,
      {
        message:
          'audio model operations must be unique',
      },
    )
```

---

### 10.3 Audio Model Entry

```ts
/**
 * Audio Model Endpoint 配置。
 */
export const AudioModelEntrySchema
  = z.object({
    /** Framework 内唯一 ID。 */
    id: z.string().min(1),

    /** Provider Protocol。 */
    provider: AudioProviderSchema,

    /** Endpoint 上模型名。 */
    model: z.string().min(1),

    /** 允许执行的 Operation。 */
    operations: AudioOperationsSchema,

    /** 可选 Credential。 */
    apiKey: OptionalSecretSchema,

    /**
     * Model Endpoint。
     *
     * 没有 canonical endpoint 的
     * Provider 必须显式配置。
     */
    baseUrl:
      z.string().min(1).optional(),

    /** Timeout。 */
    timeout:
      z.number().positive().optional(),

    // 保留当前特殊 Provider 字段。
    appKey: OptionalSecretSchema,
    accessKey: OptionalSecretSchema,
    resourceId: z.string().optional(),
    workspaceId: z.string().optional(),
  })
```

---

## 11. Endpoint 与 Credential 解析

### 11.1 Default Endpoint

只有真正存在 canonical 服务地址的 Provider 定义默认值。

```ts
/**
 * Provider Canonical Endpoint。
 *
 * Whisper / IndexTTS 没有固定服务端，
 * 因而不存在 localhost 默认值。
 */
const AUDIO_PROVIDER_DEFAULT_BASE_URL:
Partial<Record<AudioProviderName, string>> = {
  openai:
    'https://api.openai.com/v1',

  mimo:
    'https://api.xiaomimimo.com/v1',

  qwen:
    'wss://dashscope.aliyuncs.com/api-ws/v1/realtime',

  doubao:
    'wss://openspeech.bytedance.com',
}
```

---

### 11.2 Optional Credential

```ts
/**
 * 读取 Provider 可选 Credential。
 */
function audioProviderEnvApiKey(
  provider: AudioProviderName,
): string | undefined {
  switch (provider) {
    case 'openai':
      return process.env
        .HAI_AI_AUDIO_OPENAI_API_KEY
        ?? process.env.OPENAI_API_KEY

    case 'mimo':
      return process.env
        .HAI_AI_AUDIO_MIMO_API_KEY
        ?? process.env.MIMO_API_KEY

    case 'qwen':
      return process.env
        .HAI_AI_AUDIO_QWEN_API_KEY
        ?? process.env.DASHSCOPE_API_KEY

    case 'doubao':
      return process.env
        .HAI_AI_AUDIO_DOUBAO_API_KEY
        ?? process.env.VOLC_API_KEY

    case 'whisper':
      return process.env
        .HAI_AI_AUDIO_WHISPER_API_KEY

    case 'indextts':
      return process.env
        .HAI_AI_AUDIO_INDEXTTS_API_KEY
  }
}
```

---

### 11.3 Resolver

当前 Resolver 在进入 Provider 前统一检查 API Key。

本方案中 Resolver 负责：

```text
Model 查找
Operation 校验
Endpoint 解析
Credential 解析
Timeout 解析
```

Credential 是否必须存在由具体 Provider Contract 决定。

```ts
/**
 * 解析 Audio Model Endpoint。
 */
export function resolveAudioModel(
  audioConfig: AudioConfig,
  operation: AudioOperation,
  explicit?: string,
  llmApiKey?: string,
): HaiResult<ResolvedAudioModel> {
  // 显式 Model 优先。
  const targetId
    = explicit
      ?? (
        operation === 'transcribe'
          ? audioConfig.transcribeModel
          : audioConfig.synthesizeModel
      )

  if (!targetId) {
    return err(
      HaiAIError.AUDIO_MODEL_NOT_FOUND,
      `No model configured for ${operation}`,
    )
  }

  // 支持 ID / Model Name 两种查找。
  const entry
    = audioConfig.models?.find(
      item =>
        item.id === targetId
        || item.model === targetId,
    )

  if (!entry) {
    return err(
      HaiAIError.AUDIO_MODEL_NOT_FOUND,
      `Audio model ${targetId} not found`,
    )
  }

  // Operation 校验。
  if (
    !entry.operations.includes(operation)
  ) {
    return err(
      HaiAIError.AUDIO_UNSUPPORTED_INPUT,
      `Model ${entry.id} does not support ${operation}`,
    )
  }

  // Credential 只解析，不判断必需性。
  const apiKey
    = entry.apiKey
      ?? (
        audioConfig.inheritLlmApiKey
          ? llmApiKey
          : undefined
      )
      ?? audioProviderEnvApiKey(
        entry.provider,
      )

  // Endpoint 优先使用 Model Entry。
  const baseUrl
    = entry.baseUrl
      ?? AUDIO_PROVIDER_DEFAULT_BASE_URL[
        entry.provider
      ]

  // 没有 Canonical Endpoint 时必须配置。
  if (!baseUrl) {
    return err(
      HaiAIError.CONFIGURATION_ERROR,
      `Audio provider ${entry.provider} requires baseUrl`,
    )
  }

  return ok({
    id: entry.id,
    provider: entry.provider,
    model: entry.model,
    apiKey,
    baseUrl,
    timeout:
      entry.timeout ?? 60_000,

    // 保留当前特殊 Provider 字段。
    appKey:
      entry.appKey
      ?? process.env.VOLC_APP_KEY,

    accessKey:
      entry.accessKey
      ?? process.env.VOLC_ACCESS_KEY,

    resourceId:
      entry.resourceId
      ?? (
        entry.provider === 'doubao'
          ? doubaoDefaultResourceId(
              operation,
            )
          : ''
      ),

    workspaceId:
      entry.workspaceId,
  })
}
```

---

## 12. getCapabilities

当前 `getCapabilities()` 自己再次查找 Model Entry，并直接读取 Provider 固定 Capability。

统一改为复用 Model Resolver：

```ts
/**
 * 获取指定 Model 的 Capability。
 */
function getCapabilities(
  request: AudioCapabilitiesRequest,
): HaiResult<AudioModelCapabilities> {
  // 与真实调用使用同一个 Resolver。
  const resolved
    = resolveAudioModel(
      audioConfig,
      request.operation,
      request.model,
      config.llm.apiKey,
    )

  if (!resolved.success)
    return resolved

  // Provider 根据具体 Model 返回 Capability。
  const capabilities
    = getProvider(
      resolved.data.provider,
    ).getCapabilities(
      resolved.data,
    )

  // 保持公共 API 只返回对应 Operation。
  return ok(
    request.operation === 'transcribe'
      ? {
          transcribe:
            capabilities.transcribe,
        }
      : {
          synthesize:
            capabilities.synthesize,
        },
  )
}
```

由于 Resolver 不再统一要求 API Key，因此 Capability 查询不需要真实 Credential。

---

## 13. Whisper Provider

### 13.1 Provider 定位

新增：

```text
packages/ai/src/audio/providers/
└── ai-audio-provider-whisper.ts
```

`whisper` 表示：

> hai-framework Whisper Service Protocol。

不表示：

```text
localhost
```

可以访问：

```text
http://127.0.0.1:8101/v1

http://speech.internal:8101/v1

https://speech.example.com/v1
```

---

### 13.2 Capability

```ts
/**
 * faster-whisper-large-v3 能力。
 */
const WHISPER_CAPABILITIES:
AudioModelCapabilities = {
  transcribe: {
    supported: true,

    // 首期只处理完整文件。
    realtimeAudioInput: false,

    speechBoundaryEvents: false,

    streamingTranscriptOutput: false,

    languageHint: true,

    languageDetection: true,

    segmentTimestamps: true,

    wordTimestamps: true,

    contextHints: true,

    vad: true,

    speakerDiarization: false,
  },
}
```

---

### 13.3 Service API

```http
POST /v1/audio/transcriptions
```

`multipart/form-data`：

```text
file
model
language?
prompt?
timestamp_granularities?
vad?
```

返回：

```jsonc
{
  "text": "你好世界",
  "language": "zh",
  "durationMs": 4120,

  "segments": [
    {
      "id": "0",
      "text": "你好世界",
      "startMs": 100,
      "endMs": 4000,

      "words": [
        {
          "text": "你好",
          "startMs": 100,
          "endMs": 800,
          "confidence": 0.98
        }
      ]
    }
  ]
}
```

---

## 14. IndexTTS Provider

### 14.1 Provider 定位

新增：

```text
packages/ai/src/audio/providers/
└── ai-audio-provider-indextts.ts
```

用于适配：

```text
IndexTTS Service Protocol
```

而不是描述部署位置。

---

### 14.2 Capability

```ts
/**
 * IndexTTS 2.5 能力。
 */
const INDEX_TTS_25_CAPABILITIES:
AudioModelCapabilities = {
  synthesize: {
    supported: true,

    incrementalTextInput: false,

    streamingAudioOutput: false,

    languageSelection: true,

    presetVoice: false,

    speakerReference: true,

    // IndexTTS 需要 Speaker Prompt。
    speakerReferenceRequired: true,

    styleReference: true,

    // emo_text 不等价于 Framework 通用 instruction。
    instruction: false,

    speedControl: true,

    targetDuration: true,

    supportedLanguages: [
      'zh',
      'en',
      'ja',
    ],
  },
}
```

---

### 14.3 参数映射

```text
speakerReference
→ speaker_reference
→ spk_audio_prompt

styleReference
→ style_reference
→ emo_audio_prompt

styleStrength
→ style_strength
→ emo_alpha

language
→ language
→ IndexTTS lang

speed
→ speed
→ 1 / duration_factor

targetDurationMs
→ target_duration_ms
→ Service 闭环调整 duration_factor
```

---

### 14.4 Service API

```http
POST /v1/audio/speech
```

字段：

```text
text
model
language

speaker_reference
speaker_reference_text?
speaker_reference_language?

style_reference?
style_reference_text?
style_reference_language?
style_strength?

speed?

target_duration_ms?
duration_tolerance_ms?

response_format?
sample_rate?
```

响应 Body：

```text
Binary Audio
```

响应 Header：

```text
X-HAI-Audio-Duration-Ms
X-HAI-Duration-Matched
X-HAI-Applied-Speed
X-HAI-Audio-Sample-Rate
X-HAI-Audio-Channels
```

---

## 15. IndexTTS Speed 与 Target Duration

### 15.1 Speed Mapping

Framework：

```text
speed > 1
→ 更快
```

IndexTTS：

```text
duration_factor > 1
→ 更慢
```

Service 映射：

```python
def resolve_duration_factor(
    speed: float | None,
) -> float:
    """
    Framework Speed → IndexTTS duration_factor。
    """

    # 未指定则保持正常速度。
    if speed is None:
        return 1.0

    if speed <= 0:
        raise ValueError(
            "speed must be greater than 0"
        )

    # 两套速度语义互为倒数。
    factor = 1.0 / speed

    # 限制到模型有效范围。
    return max(
        0.5,
        min(
            2.0,
            factor,
        ),
    )
```

---

### 15.2 Target Duration

`targetDurationMs` 是 Framework 语义。

Model Service：

```text
目标时长
   ↓
第一次生成
   ↓
读取实际时长
   ↓
计算比例
   ↓
调整 duration_factor
   ↓
重新生成
   ↓
达到 tolerance / 最大迭代次数
```

建议：

```text
maxIterations = 3
```

防止无法收敛时无限推理。

如果调用者没有提供：

```text
durationToleranceMs
```

Service 可以使用内部收敛阈值，但：

```text
metadata.durationMatched
```

保持：

```ts
undefined
```

而不是错误标记为 `false`。

---

## 16. Audio 文件上传规范

### 16.1 真实格式

不能将所有 Reference 强行：

```text
speaker.wav
```

如果实际数据为 MP3。

统一根据：

```ts
AudioContent.format
```

生成：

```text
.wav
.mp3
.opus
```

PCM16 则先封装 WAV。

---

### 16.2 MIME

```text
wav
→ audio/wav

mp3
→ audio/mpeg

opus
→ audio/opus

pcm16
→ 转 WAV → audio/wav
```

这样避免出现：

```text
文件扩展名是 WAV
实际内容是 MP3
```

导致模型加载异常。

---

## 17. 模型服务基础设施

### 17.1 目录结构

```text
packages/ai/
├── models/
│   ├── build.mjs
│   ├── README.md
│   ├── .gitignore
│   ├── .cache/
│   │
│   └── images/
│       ├── faster-whisper-large-v3/
│       │   ├── model.json
│       │   ├── Dockerfile
│       │   ├── server.py
│       │   ├── prepare.py
│       │   └── .dockerignore
│       │
│       ├── indextts-2.5/
│       │   ├── model.json
│       │   ├── Dockerfile
│       │   ├── server.py
│       │   ├── prepare.py
│       │   └── .dockerignore
│       │
│       └── qwen3-4b/
│           ├── model.json
│           ├── Dockerfile
│           ├── server.py
│           ├── prepare.py
│           └── .dockerignore
│
├── src/
└── package.json
```

---

## 18. Model Manifest

### 18.1 基本结构

示例使用 JSONC 方便说明；实际：

```text
model.json
```

必须是标准 JSON。

```jsonc
{
  // Manifest Schema。
  "schemaVersion": 1,

  // Image 定义名称。
  "name": "faster-whisper-large-v3",

  // Image 版本。
  "version": "1",

  // Docker Repository。
  "image": "hai-ai/faster-whisper-large-v3",

  // 服务提供的逻辑能力。
  "provides": [
    "audio.transcribe"
  ],

  // 服务实现的 API Contract。
  "protocol": "whisper",

  // 支持的 Runtime Device。
  "devices": [
    "cpu",
    "gpu"
  ],

  // Container 内端口。
  "port": 8000,

  // Health。
  "health": "/health",

  // 模型来源。
  "model": {
    "id": "faster-whisper-large-v3"
  }
}
```

---

### 18.2 IndexTTS

```jsonc
{
  "schemaVersion": 1,
  "name": "indextts-2.5",
  "version": "2.5",
  "image": "hai-ai/indextts-2.5",

  "provides": [
    "audio.synthesize"
  ],

  "protocol": "indextts",

  "devices": [
    "cpu",
    "gpu"
  ],

  "port": 8000,
  "health": "/health",

  "model": {
    "id": "IndexTeam/IndexTTS-2.5"
  }
}
```

---

### 18.3 Qwen3-4B

```jsonc
{
  "schemaVersion": 1,
  "name": "qwen3-4b",
  "version": "1",
  "image": "hai-ai/qwen3-4b",

  "provides": [
    "llm.chat"
  ],

  // 对外实现 OpenAI-compatible API。
  "protocol": "openai",

  "devices": [
    "cpu",
    "gpu"
  ],

  "port": 8000,
  "health": "/health",

  "model": {
    "id": "Qwen/Qwen3-4B"
  }
}
```

---

## 19. `provides` 与 `protocol`

`provides`：

> **Service 能做什么。**

首期：

```text
audio.transcribe
audio.synthesize
llm.chat
```

可扩展：

```text
llm.embedding
llm.rerank
image.generate
vision.understand
audio.convert
audio.speakerEmbedding
```

`protocol`：

> **Framework 使用哪一种 Provider Contract 调用。**

例如：

```text
openai
qwen
whisper
indextts
```

关系：

```text
provides
= Capability

protocol
= Invocation Contract
```

一个 Model Image 可以声明多个 `provides`，构建工具不能假定一个镜像只提供一种能力。

---

## 20. 通用 Model Service Contract

所有 Image 至少实现：

```http
GET /health

GET /v1/models
```

---

### 20.1 Health

```jsonc
{
  "status": "ok",

  // 实际 Model。
  "model": "indextts-2.5",

  // Runtime 信息。
  "device": "cuda"
}
```

CPU/GPU 属于 Runtime 信息，不放入 Audio Capability。

---

### 20.2 `/v1/models`

统一 OpenAI 风格：

```jsonc
{
  "object": "list",

  "data": [
    {
      "id": "indextts-2.5",
      "object": "model"
    }
  ]
}
```

---

### 20.3 Error

统一：

```jsonc
{
  "error": {
    "message":
      "speaker_reference is required",

    "type":
      "invalid_request_error",

    "code":
      "invalid_request"
  }
}
```

非法请求使用正常 4xx HTTP Status，不使用：

```text
HTTP 200 + error string
```

---

### 20.4 Endpoint Authentication

自托管服务建议统一支持：

```text
HAI_MODEL_API_KEY
```

未配置：

```text
无认证
```

配置后：

```http
Authorization: Bearer <token>
```

这是 Endpoint 行为，与 Local/Cloud 无关。

---

## 21. Faster Whisper Image

### 21.1 Provides

```text
audio.transcribe
```

### 21.2 API

```http
POST /v1/audio/transcriptions
```

### 21.3 Environment

```text
MODEL_PATH=/opt/models

DEVICE=auto|cpu|cuda

COMPUTE_TYPE=
auto|int8|float16|int8_float16
```

推荐：

```text
CPU → int8

GPU → float16
```

### 21.4 server.py

核心职责：

```python
"""
faster-whisper Model Service。

实现 hai-framework whisper Protocol。
"""

@app.post(
    "/v1/audio/transcriptions"
)
async def transcriptions(
    file: UploadFile = File(...),
    model: str = Form(...),
    language: str | None = Form(None),
    prompt: str | None = Form(None),
    timestamp_granularities:
        list[str] | None = Form(None),
    vad: bool = Form(False),
):
    """
    执行完整文件 ASR。
    """

    # 保存上传音频。
    audio_path =
        await save_upload(file)

    try:
        # 是否请求 Word Timestamp。
        word_timestamps = bool(
            timestamp_granularities
            and "word"
            in timestamp_granularities
        )

        # 执行模型。
        segments, info =
            whisper_model.transcribe(
                audio_path,
                language=language,
                initial_prompt=prompt,
                word_timestamps=
                    word_timestamps,
                vad_filter=vad,
            )

        # 将 Lazy Generator 转换成
        # Framework DTO。
        return build_result(
            segments,
            info,
            word_timestamps,
        )

    finally:
        # 无论成功失败都清理临时文件。
        remove_temp_file(
            audio_path
        )
```

---

## 22. IndexTTS Image

### 22.1 Provides

```text
audio.synthesize
```

### 22.2 API

```http
POST /v1/audio/speech
```

### 22.3 Runtime

```text
MODEL_PATH=/opt/models

DEVICE=auto|cpu|cuda
```

服务必须等：

```text
模型加载完成
```

之后才：

```text
/health → status=ok
```

避免 Container 已启动但 Model 尚未 Ready。

---

### 22.4 输出格式

服务层负责将模型原始结果转换到 Framework 支持的：

```text
wav
mp3
opus
pcm16
```

如果某格式未实现：

```text
返回明确 4xx
```

不得返回与请求：

```text
format
```

不一致的音频。

---

## 23. Qwen3-4B Image

### 23.1 Provides

```text
llm.chat
```

### 23.2 Protocol

```text
openai
```

### 23.3 API

至少：

```http
GET /health

GET /v1/models

POST /v1/chat/completions
```

`/v1/chat/completions` 应覆盖 hai-framework 当前实际使用的 OpenAI-compatible 子集。

如果 Framework 当前调用支持：

```text
stream=true
```

镜像必须同步支持 SSE Streaming，不能只实现非流式接口。

---

## 24. Docker 与 CPU/GPU

每个模型尽量只维护：

```text
一个 Dockerfile
```

通过：

```text
--target cpu

--target gpu
```

区分。

```dockerfile
# syntax=docker/dockerfile:1

# -------------------------
# 公共服务阶段
# -------------------------
FROM python:3.11-slim AS base

# Python 运行参数。
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# 通用依赖。
RUN apt-get update \
    && apt-get install -y \
       --no-install-recommends \
       ffmpeg \
       curl \
    && rm -rf \
       /var/lib/apt/lists/*

WORKDIR /app

# Service。
COPY server.py /app/server.py


# -------------------------
# CPU
# -------------------------
FROM base AS cpu

ENV DEVICE=cpu

# 在此安装模型 CPU 依赖。


# -------------------------
# GPU
# -------------------------
FROM base AS gpu

ENV DEVICE=cuda

# 实际模型应使用与其 PyTorch/CUDA
# 严格匹配的 Base Image / Dependency。
```

不同模型不要求共用相同：

```text
Python
PyTorch
CUDA
Dependency Manager
```

例如 IndexTTS 可以继续遵循其自身的 `uv` 依赖体系。

---

## 25. 模型权重与离线运行

### 25.1 Runtime Image

Image 包含：

```text
Runtime
Service
Dependencies
```

模型通过：

```text
/opt/models
```

Volume 提供。

适合开发。

---

### 25.2 Bundled Image

包含：

```text
Runtime
Service
Dependencies
Main Model
Tokenizer
Auxiliary Models
```

适合隔离网络部署。

---

### 25.3 Prepare

统一：

```bash
node models/build.mjs \
  prepare indextts-2.5
```

调用模型目录：

```text
prepare.py
```

输出：

```text
packages/ai/models/.cache/
└── indextts-2.5/
```

Prepare 负责：

```text
下载主模型
下载辅助模型
固定 Revision
完整性检查
```

---

### 25.4 Offline

Bundled Image 设置：

```text
HF_HUB_OFFLINE=1

TRANSFORMERS_OFFLINE=1
```

断网启动后不得访问：

```text
HuggingFace
ModelScope
GitHub
其他模型源
```

---

## 26. build.mjs

### 26.1 CLI

```bash
# 模型列表。
node models/build.mjs list

# Manifest 检查。
node models/build.mjs \
  inspect indextts-2.5

# 权重准备。
node models/build.mjs \
  prepare indextts-2.5

# CPU。
node models/build.mjs \
  build indextts-2.5 \
  --device cpu

# GPU。
node models/build.mjs \
  build indextts-2.5 \
  --device gpu

# Bundled Image。
node models/build.mjs \
  build indextts-2.5 \
  --device gpu \
  --bundle-model

# 启动 Service。
node models/build.mjs \
  run indextts-2.5
```

---

### 26.2 Windows 兼容路径

不要使用：

```text
new URL(...).pathname
```

直接作为文件系统路径。

应使用：

```js
/**
 * ESM 当前目录。
 *
 * 使用 fileURLToPath 保证 Windows
 * `C:\...` 路径正确。
 */
const CURRENT_FILE
  = fileURLToPath(
    import.meta.url,
  )

const MODELS_DIR
  = dirname(
    CURRENT_FILE,
  )

const IMAGES_DIR
  = join(
    MODELS_DIR,
    'images',
  )

const CACHE_DIR
  = join(
    MODELS_DIR,
    '.cache',
  )
```

---

### 26.3 Manifest Validation

使用 package 已有：

```text
zod
```

依赖。

```js
/**
 * Model Manifest。
 */
const ModelManifestSchema
  = z.object({
    schemaVersion:
      z.literal(1),

    name:
      z.string().min(1),

    version:
      z.string().min(1),

    image:
      z.string().min(1),

    // 一个 Service 可以提供多个能力。
    provides:
      z.array(
        z.string().min(1),
      ).min(1),

    // Provider Contract。
    protocol:
      z.string().min(1),

    // 每个 Model 自行声明 Device。
    devices:
      z.array(
        z.enum([
          'cpu',
          'gpu',
        ]),
      ).min(1),

    port:
      z.number()
        .int()
        .positive(),

    health:
      z.string()
        .startsWith('/'),

    model:
      z.object({
        id:
          z.string().min(1),

        revision:
          z.string()
            .optional(),
      }).optional(),
  })
```

---

### 26.4 Build 流程

```text
解析 CLI
   ↓
扫描 images/*
   ↓
读取 model.json
   ↓
Zod Validation
   ↓
prepare（需要时）
   ↓
docker buildx
   ↓
docker run
   ↓
health check
```

`build.mjs` 不写：

```text
Whisper 下载逻辑
IndexTTS 下载逻辑
Qwen 下载逻辑
```

这些属于：

```text
images/<model>/prepare.py
```

---

## 27. package.json

增加：

```jsonc
{
  "scripts": {
    // 模型列表。
    "model:list":
      "node models/build.mjs list",

    // 权重准备。
    "model:prepare":
      "node models/build.mjs prepare",

    // Image Build。
    "model:build":
      "node models/build.mjs build",

    // Service Run。
    "model:run":
      "node models/build.mjs run"
  }
}
```

实际 `package.json` 不包含注释。

当前 `@h-ai/ai` 根导出已经直接导出 `ai-audio-types.ts`，因此新增 Audio 公共类型无需再增加单独根出口。

同时当前 npm package 的发布内容仅包含 `dist`，应继续保证：

```text
models/
```

不进入 npm Runtime Package。

---

## 28. 配置示例

### 28.1 Whisper / IndexTTS Endpoint

```yaml
audio:
  # 默认 ASR。
  transcribeModel: whisper-main

  # 默认 TTS。
  synthesizeModel: indextts-main

  models:
    # Whisper Service。
    - id: whisper-main

      # Protocol。
      provider: whisper

      # Model。
      model: faster-whisper-large-v3

      operations:
        - transcribe

      # Endpoint。
      baseUrl:
        http://127.0.0.1:8101/v1

    # IndexTTS Service。
    - id: indextts-main
      provider: indextts
      model: indextts-2.5

      operations:
        - synthesize

      baseUrl:
        http://127.0.0.1:8102/v1
```

生产只需：

```yaml
baseUrl:
  http://ai-gpu.internal:8102/v1
```

Provider、Model、业务代码全部无需变化。

---

### 28.2 同 Provider 多 Endpoint

```yaml
audio:
  models:
    # 开发 Endpoint。
    - id: whisper-dev
      provider: whisper
      model: faster-whisper-large-v3
      operations:
        - transcribe
      baseUrl:
        http://127.0.0.1:8101/v1

    # 生产 Endpoint。
    - id: whisper-prod
      provider: whisper
      model: faster-whisper-large-v3
      operations:
        - transcribe
      baseUrl:
        http://speech.internal:8101/v1
```

---

## 29. 调用示例

### 29.1 ASR

```ts
const result
  = await ai.audio.transcribe({
    // Model Endpoint 配置 ID。
    model: 'whisper-main',

    // 输入音频。
    audio,

    // 输入语言。
    language: 'ja',

    // 请求时间轴。
    timestampGranularities: [
      'segment',
      'word',
    ],

    // 模型 VAD。
    vad: true,

    // 高级能力必须真实支持。
    strictCapabilities: true,
  })
```

---

### 29.2 TTS

```ts
const result
  = await ai.audio.synthesize({
    // Model Endpoint。
    model: 'indextts-main',

    // 目标文本。
    text:
      '我们下午三点出发。',

    // 目标语言。
    language: 'zh',

    // Speaker Reference。
    speakerReference: {
      audio: speakerAudio,

      // 可以与目标语言不同。
      language: 'ja',
    },

    // Style Reference。
    styleReference: {
      audio: styleAudio,
      language: 'ja',
    },

    // Style 强度。
    styleStrength: 0.8,

    // 目标时长。
    targetDurationMs: 3280,

    // 业务容差。
    durationToleranceMs: 120,

    // 输出格式。
    format: 'wav',

    // 禁止静默降级。
    strictCapabilities: true,
  })
```

---

## 30. 文件变更范围

```text
packages/ai/
├── package.json
│
├── models/
│   ├── build.mjs
│   ├── README.md
│   ├── .gitignore
│   ├── .cache/
│   └── images/
│       ├── faster-whisper-large-v3/
│       │   ├── model.json
│       │   ├── Dockerfile
│       │   ├── server.py
│       │   ├── prepare.py
│       │   └── .dockerignore
│       │
│       ├── indextts-2.5/
│       │   ├── model.json
│       │   ├── Dockerfile
│       │   ├── server.py
│       │   ├── prepare.py
│       │   └── .dockerignore
│       │
│       └── qwen3-4b/
│           ├── model.json
│           ├── Dockerfile
│           ├── server.py
│           ├── prepare.py
│           └── .dockerignore
│
├── src/
│   ├── ai-config.ts
│   └── audio/
│       ├── ai-audio-types.ts
│       ├── ai-audio-functions.ts
│       └── providers/
│           ├── ai-audio-provider.ts
│           ├── ai-audio-provider-openai.ts
│           ├── ai-audio-provider-mimo.ts
│           ├── ai-audio-provider-qwen.ts
│           ├── ai-audio-provider-doubao.ts
│           ├── ai-audio-provider-whisper.ts
│           └── ai-audio-provider-indextts.ts
│
└── tests/
    ├── ai-audio.test.ts
    ├── ai-audio-whisper.test.ts
    ├── ai-audio-indextts.test.ts
    └── ai-models.test.ts
```

---

## 31. 实施计划

### 31.1 P0：公共类型

完成：

```text
ASR Timestamp
ASR Structured Result
AudioReference
TTS Reference
Language
Speed
Target Duration
Synthesis Metadata
Capability
```

涉及：

```text
ai-audio-types.ts
```

---

### 31.2 P1：Provider 基础机制

完成：

```text
ASR/TTS Provider 子接口
Model-level Capability
strictCapabilities
AudioOperation
Model Resolver
Optional Credential
Endpoint Resolution
PCM16 Upload
Stream Fallback
```

涉及：

```text
ai-config.ts
ai-audio-provider.ts
ai-audio-functions.ts
现有 4 个 Provider
```

---

### 31.3 P2：Whisper

完成：

```text
whisper Provider
faster-whisper-large-v3 Image
Whisper Model Service
```

---

### 31.4 P3：IndexTTS

完成：

```text
indextts Provider
indextts-2.5 Image
IndexTTS Model Service
Speaker Reference
Style Reference
Speed
Target Duration
```

---

### 31.5 P4：Model Infrastructure

完成：

```text
model.json
protocol
provides
prepare.py
build.mjs
CPU
GPU
Bundled Image
Health Check
Offline
```

同时完成：

```text
qwen3-4b
```

验证该体系不与 Audio 强绑定。

---

## 32. 验收方案

### 32.1 Framework 兼容性

#### AC-F01

现有：

```ts
await ai.audio.transcribe({
  audio,
})
```

不修改即可编译、运行。

#### AC-F02

现有：

```ts
await ai.audio.synthesize({
  text: 'hello',
})
```

不修改即可编译、运行。

#### AC-F03

执行：

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

全部通过。

现有 Audio 单测已经覆盖四个 Provider 的路由和协议映射，因此这些测试应作为强制回归基线。

---

## 33. 架构验收

### AC-ARCH-01：同 Provider 多 Endpoint

两个：

```text
provider=whisper
```

不同：

```text
baseUrl
```

均能正常调用。

---

### AC-ARCH-02：Qwen Endpoint 替换

实现相同 Qwen Provider Contract 的两个 Endpoint：

```text
只修改 baseUrl
```

业务代码和 Provider 不变。

---

### AC-ARCH-03：Provider 不依赖 models/

分别调用：

```text
HAI Image Endpoint

手工部署兼容 Endpoint
```

均使用同一 Provider。

---

### AC-ARCH-04：Deployment 不影响 Capability

同一模型：

```text
CPU
GPU
```

功能一致时：

```text
AudioModelCapabilities
```

一致。

Runtime 差异只通过：

```text
/health
```

体现。

---

### AC-ARCH-05：无 Canonical Endpoint

`whisper` / `indextts` 未配置：

```text
baseUrl
```

必须：

```text
CONFIGURATION_ERROR
```

不默认 localhost。

---

## 34. ASR 验收

### AC-A01：中英日

```text
ZH
EN
JA
```

均：

```text
success=true
text 非空
```

---

### AC-A02：Language Detection

不传：

```text
language
```

应正确返回：

```text
zh
en
ja
```

---

### AC-A03：Segment Timestamp

要求：

```text
segments.length > 0

startMs >= 0

endMs > startMs

时间单调递增
```

---

### AC-A04：Word Timestamp

请求：

```text
word
```

要求：

```text
segments[].words
```

存在且时间有效。

---

### AC-A05：VAD

输入：

```text
长静音 + 语音 + 长静音
```

要求：

```text
识别成功
VAD 正确透传
静音区无大量无意义结果
```

---

### AC-A06：PCM16

输入裸 PCM16 时：

```text
Provider 转 WAV
→ Service
```

必须成功。

不得：

```text
直接上传 .pcm16 文件
```

---

## 35. TTS 验收

### AC-T01：中英日

分别生成：

```text
ZH
EN
JA
```

均输出可播放音频。

---

### AC-T02：Speaker Reference

Speaker A / B 使用相同文本。

要求：

```text
均生成成功
音色明显不同
Reference 上传格式正确
```

---

### AC-T03：Style Reference

```text
neutral
sad
angry
```

要求有明显表达差异。

---

### AC-T04：Style Strength

```text
0.2
0.8
```

正确工作。

没有：

```text
styleReference
```

却指定：

```text
styleStrength
```

必须返回：

```text
AUDIO_INVALID_REQUEST
```

---

### AC-T05：Speed

```text
0.8
1.0
1.2
```

要求：

```text
duration(0.8)
>
duration(1.0)
>
duration(1.2)
```

---

### AC-T06：Target Duration

显式提供：

```text
targetDurationMs
durationToleranceMs
```

要求：

```text
|actual-target|
<= tolerance
```

并返回：

```ts
metadata.durationMatched === true
```

---

### AC-T07：无 Tolerance

只提供：

```text
targetDurationMs
```

允许：

```ts
durationMatched === undefined
```

---

### AC-T08：参数冲突

同时：

```text
speed
targetDurationMs
```

必须：

```text
AUDIO_INVALID_REQUEST
```

---

### AC-T09：Reference Format

分别测试：

```text
wav
mp3
opus
pcm16
```

要求文件扩展名、MIME 和实际内容一致。

---

## 36. Capability 验收

### AC-C01：Whisper

至少：

```text
supported=true
languageHint=true
languageDetection=true
segmentTimestamps=true
wordTimestamps=true
contextHints=true
vad=true
realtimeAudioInput=false
streamingTranscriptOutput=false
```

---

### AC-C02：IndexTTS

至少：

```text
supported=true
languageSelection=true
speakerReference=true
speakerReferenceRequired=true
styleReference=true
instruction=false
speedControl=true
targetDuration=true
streamingAudioOutput=false
```

---

### AC-C03：strictCapabilities

请求模型不支持的能力：

```text
strictCapabilities=true
```

必须在调用 Provider 前：

```text
AUDIO_UNSUPPORTED_INPUT
```

---

### AC-C04：Model-level Capability

同一个 Provider 两个不同 Model：

```text
Model A
Model B
```

允许返回不同 Capability。

---

## 37. Provider 验收

### AC-P01：ASR-only

Whisper 不需要实现无意义 TTS Stub。

---

### AC-P02：TTS-only

IndexTTS 不需要实现无意义 ASR Stub。

---

### AC-P03：无认证 Endpoint

不提供：

```text
apiKey
```

Whisper / IndexTTS Endpoint 可正常调用。

---

### AC-P04：有认证 Endpoint

提供：

```text
apiKey
```

正确发送：

```http
Authorization: Bearer ...
```

---

### AC-P05：Cloud Credential

OpenAI 等需要 Credential 的实际调用仍按原有 Provider 规则失败。

---

### AC-P06：Capability 无 Credential

```text
ai.audio.getCapabilities(...)
```

不需要真实 API Key。

---

### AC-P07：ASR Stream Fallback

无原生 Streaming 时：

```text
AudioContent
→ final transcript

AudioInputStream
→ AUDIO_UNSUPPORTED_INPUT
```

---

### AC-P08：TTS Stream Fallback

无原生 Streaming 时：

```text
Segment 完整合成
→ segment_started
→ audio
→ segment_done
```

但：

```text
streamingAudioOutput=false
```

---

## 38. Model Service 验收

### AC-M01

```bash
node models/build.mjs list
```

至少：

```text
faster-whisper-large-v3
indextts-2.5
qwen3-4b
```

---

### AC-M02

Manifest 不合法：

```text
非 0 退出
输出明确字段错误
```

---

### AC-M03

`provides` 可以包含一个或多个能力。

构建工具不能假设：

```text
一个 Image = 一个 provides
```

---

### AC-M04

```http
GET /health
```

返回：

```text
status
model
device
```

---

### AC-M05

```http
GET /v1/models
```

返回规范模型列表。

---

## 39. CPU/GPU 验收

### AC-D01：Whisper CPU

```text
启动
ASR
Segment
Word Timestamp
VAD
```

均成功。

---

### AC-D02：Whisper GPU

```text
device=cuda
```

功能与 CPU 一致。

---

### AC-D03：IndexTTS CPU

至少完成：

```text
短文本
Speaker Reference
有效输出
```

CPU 不要求实时性能。

---

### AC-D04：IndexTTS GPU

完成：

```text
ZH / EN / JA
Speaker
Style
Speed
Target Duration
```

---

## 40. 完全离线验收

### AC-O01：Prepare

```bash
node models/build.mjs \
  prepare indextts-2.5
```

要求完整准备：

```text
主模型
Tokenizer
Auxiliary Model
配置文件
```

---

### AC-O02：Bundle

```bash
node models/build.mjs \
  build indextts-2.5 \
  --device gpu \
  --bundle-model
```

成功。

---

### AC-O03：断网运行

阻断公网后：

```text
Container 启动
Health OK
真实推理成功
```

日志无运行时下载。

---

## 41. Qwen3-4B 验收

### AC-Q01

```http
GET /health

GET /v1/models

POST /v1/chat/completions
```

全部正常。

---

### AC-Q02

Framework 使用现有：

```text
OpenAI-compatible LLM Provider
```

调用 Qwen3-4B。

不得新增：

```text
qwen3-local Provider
```

---

## 42. 工程质量要求

```text
✓ 公共类型不出现模型私有参数

✓ Provider 不出现 local/cloud 判断

✓ Endpoint 由配置解析

✓ CPU/GPU 不进入 Audio Capability

✓ Provider 与 models/ 解耦

✓ Capability 属于具体 Model

✓ getCapabilities 复用统一 Resolver

✓ PCM16 上传前正确封装

✓ Reference Audio 格式真实一致

✓ 不通过完整缓冲伪装实时 AudioInputStream

✓ 新增公共类型具有完整 TSDoc

✓ Provider 核心方法具有职责注释

✓ Python Service 核心函数具有 Docstring

✓ build.mjs 核心函数具有 JSDoc

✓ Python/CUDA 不进入 @h-ai/ai npm dependencies

✓ models/ 不进入 npm 发布物

✓ pnpm typecheck 通过

✓ pnpm lint 通过

✓ pnpm test 通过

✓ pnpm build 通过
```

---

## 43. 最终体系定位

Audio Framework：

```text
                 Audio Capability Layer
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
        Unified ASR                 Unified TTS
             │                           │
      timestamps                    language
      language                      speaker reference
      VAD                           style reference
      context                       instruction
                                    speed
                                    duration
             │                           │
             └─────────────┬─────────────┘
                           ▼
                    Model Capability
                           │
                           ▼
                       Provider
                           │
                           ▼
                       Endpoint
                           │
                           ▼
                      AI Service
```

Model Service：

```text
packages/ai/models
        │
        ▼
Model Manifest
        │
        ▼
Prepare
        │
        ▼
Node Build Tool
        │
        ▼
CPU / GPU Image
        │
        ▼
Model Service
        │
        ▼
Endpoint
```

两条链路在：

```text
Endpoint
```

汇合：

```text
Framework
   │
Provider
   │
   ▼
Endpoint
   ▲
   │
Model Service Image
```
