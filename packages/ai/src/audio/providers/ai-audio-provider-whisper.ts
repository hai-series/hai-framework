/**
 * @h-ai/ai — Audio Provider: Whisper 实现
 *
 * 适配 hai-framework Whisper Service 协议（`POST /v1/audio/transcriptions`，multipart/form-data）。
 * `whisper` 表示协议，而非部署位置：可连接本地、内网或云端任意实现该协议的 Endpoint。
 * 首期仅支持完整文件识别，不实现原生流式（持续音频输入由 Framework 层拒绝）。
 * @internal
 * @module audio/providers/ai-audio-provider-whisper
 */

import type { HaiResult } from '@h-ai/core'

import type { AudioModelCapabilities, TranscriptionResult, TranscriptionSegment, TranscriptionWord } from '../ai-audio-types.js'
import type { AudioProvider, ProviderTranscriptionRequest } from './ai-audio-provider.js'

import { core, err, ok } from '@h-ai/core'
import { aiM } from '../../ai-i18n.js'
import { HaiAIError } from '../../ai-types.js'
import { combineSignal, describeHttpError, errorMessage, toAudioBlob, toAudioErrorResult, toAudioUploadPart } from './ai-audio-provider.js'

const logger = core.logger.child({ module: 'ai', scope: 'audio-whisper' })

/** faster-whisper-large-v3 能力：完整文件识别 + 语言检测 + 段/词时间戳 + VAD（无实时输入 / 无原生流式输出） */
const WHISPER_CAPABILITIES: AudioModelCapabilities = {
  transcribe: {
    supported: true,
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

/** Whisper Service 词级结果（毫秒整数时间轴） */
interface WhisperWord {
  text?: string
  startMs?: number
  endMs?: number
  confidence?: number
}

/** Whisper Service 分段结果 */
interface WhisperSegment {
  id?: string | number
  text?: string
  startMs?: number
  endMs?: number
  words?: WhisperWord[]
}

/** Whisper Service 识别响应 */
interface WhisperResponse {
  text?: string
  language?: string
  durationMs?: number
  segments?: WhisperSegment[]
}

/**
 * 创建 Whisper Audio Provider（仅 ASR）
 *
 * @internal
 */
export function createWhisperAudioProvider(): AudioProvider {
  async function transcribe(request: ProviderTranscriptionRequest): Promise<HaiResult<TranscriptionResult>> {
    const { model, audio, language, contextHints, timestampGranularities, vad, signal } = request
    try {
      // 裸 pcm16 先封装为 WAV，其余按真实格式生成文件名 / MIME（文件型服务依据容器解析）
      const part = toAudioUploadPart(audio)
      const form = new FormData()
      form.append('file', toAudioBlob(part), part.filename)
      form.append('model', model.model)
      if (language)
        form.append('language', language)
      if (contextHints?.length)
        form.append('prompt', contextHints.join(', '))
      for (const granularity of timestampGranularities ?? [])
        form.append('timestamp_granularities', granularity)
      if (vad !== undefined)
        form.append('vad', String(vad))

      const headers: Record<string, string> = {}
      if (model.apiKey)
        headers.Authorization = `Bearer ${model.apiKey}`

      const response = await fetch(`${model.baseUrl.replace(/\/$/, '')}/audio/transcriptions`, {
        method: 'POST',
        headers,
        body: form,
        signal: combineSignal(signal, model.timeout),
      })
      if (!response.ok)
        return err(HaiAIError.AUDIO_UPSTREAM_ERROR, aiM('ai_audioUpstreamError', { params: { error: await describeHttpError(response) } }))

      const body = await response.json() as WhisperResponse
      return ok(mapWhisperResponse(body))
    }
    catch (error) {
      logger.debug('Whisper transcribe failed', { error: errorMessage(error) })
      return toAudioErrorResult(error, signal)
    }
  }

  return {
    transcription: { transcribe },
    getCapabilities: () => WHISPER_CAPABILITIES,
  }
}

/** 将 Whisper Service 响应映射为公共 TranscriptionResult（Word Timestamp 统一存于 segments[].words） */
function mapWhisperResponse(body: WhisperResponse): TranscriptionResult {
  const segments = body.segments?.map(mapWhisperSegment).filter((segment): segment is TranscriptionSegment => segment !== null)
  return {
    text: body.text ?? '',
    language: body.language,
    durationMs: body.durationMs,
    ...(segments?.length ? { segments } : {}),
  }
}

/** 映射单个分段；缺少必要时间轴的分段忽略 */
function mapWhisperSegment(segment: WhisperSegment): TranscriptionSegment | null {
  if (typeof segment.startMs !== 'number' || typeof segment.endMs !== 'number')
    return null
  const words = segment.words?.map(mapWhisperWord).filter((word): word is TranscriptionWord => word !== null)
  return {
    ...(segment.id !== undefined ? { id: String(segment.id) } : {}),
    text: segment.text ?? '',
    startMs: segment.startMs,
    endMs: segment.endMs,
    ...(words?.length ? { words } : {}),
  }
}

/** 映射单个词；缺少必要时间轴的词忽略 */
function mapWhisperWord(word: WhisperWord): TranscriptionWord | null {
  if (typeof word.startMs !== 'number' || typeof word.endMs !== 'number')
    return null
  return {
    text: word.text ?? '',
    startMs: word.startMs,
    endMs: word.endMs,
    ...(typeof word.confidence === 'number' ? { confidence: word.confidence } : {}),
  }
}
