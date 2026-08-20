/**
 * @h-ai/ai — Audio Provider: IndexTTS 实现
 *
 * 适配 hai-framework IndexTTS Service 协议（`POST /v1/audio/speech`，multipart/form-data，二进制音频响应）。
 * `indextts` 表示协议，而非部署位置：可连接本地、内网或云端任意实现该协议的 Endpoint。
 * 公共层只表达模型无关的业务语义（说话人 / 风格参考、语速、目标时长），模型私有参数由 Model Service 转换。
 * 首期不实现原生流式（由 Framework 层按段完整合成降级）。
 * @internal
 * @module audio/providers/ai-audio-provider-indextts
 */

import type { HaiResult } from '@h-ai/core'
import type { Dispatcher } from 'undici'

import type { AudioFormat, AudioModelCapabilities, AudioReference, SynthesisResult } from '../ai-audio-types.js'

import type { AudioProvider, ProviderSynthesisRequest, SynthesisOutputMeta } from './ai-audio-provider.js'
import process from 'node:process'

import { core, err, ok } from '@h-ai/core'
import { aiM } from '../../ai-i18n.js'
import { HaiAIError } from '../../ai-types.js'
import { combineSignal, describeHttpError, errorMessage, toAudioBlob, toAudioErrorResult, toAudioUploadPart } from './ai-audio-provider.js'

const logger = core.logger.child({ module: 'ai', scope: 'audio-indextts' })

/** IndexTTS 2.5 能力：说话人参考（必需）+ 风格参考 + 语速 + 目标时长（无预置音色 / 无原生流式输出） */
const INDEX_TTS_CAPABILITIES: AudioModelCapabilities = {
  synthesize: {
    supported: true,
    incrementalTextInput: false,
    streamingAudioOutput: false,
    languageSelection: true,
    presetVoice: false,
    speakerReference: true,
    speakerReferenceRequired: true,
    styleReference: true,
    instruction: false,
    speedControl: true,
    targetDuration: true,
    supportedLanguages: ['zh', 'en', 'ja'],
  },
}

/** 响应头字段名（Model Service 回传的真实音频元数据） */
const HEADER_DURATION_MS = 'x-hai-audio-duration-ms'
const HEADER_DURATION_MATCHED = 'x-hai-duration-matched'
const HEADER_APPLIED_SPEED = 'x-hai-applied-speed'
const HEADER_SAMPLE_RATE = 'x-hai-audio-sample-rate'
const HEADER_CHANNELS = 'x-hai-audio-channels'

/**
 * 创建 IndexTTS Audio Provider（仅 TTS）
 *
 * @internal
 */
export function createIndexTtsAudioProvider(): AudioProvider {
  async function synthesize(request: ProviderSynthesisRequest): Promise<HaiResult<SynthesisResult>> {
    const { model, text, language, speakerReference, styleReference, styleStrength, speed, targetDurationMs, durationToleranceMs, format, sampleRate, signal } = request
    // IndexTTS 需要说话人参考音频；缺失时在调用服务前返回明确错误
    if (!speakerReference)
      return err(HaiAIError.AUDIO_INVALID_REQUEST, aiM('ai_audioInvalidRequest', { params: { reason: 'speaker_reference is required' } }))

    const out = resolveSynthesisOutput({ format, sampleRate })
    try {
      const form = new FormData()
      form.append('text', text)
      form.append('model', model.model)
      if (language)
        form.append('language', language)

      appendReference(form, 'speaker_reference', speakerReference)
      if (styleReference)
        appendReference(form, 'style_reference', styleReference)
      if (styleStrength !== undefined)
        form.append('style_strength', String(styleStrength))
      if (speed !== undefined)
        form.append('speed', String(speed))
      if (targetDurationMs !== undefined)
        form.append('target_duration_ms', String(targetDurationMs))
      if (durationToleranceMs !== undefined)
        form.append('duration_tolerance_ms', String(durationToleranceMs))
      form.append('response_format', out.format)
      if (out.sampleRate !== undefined)
        form.append('sample_rate', String(out.sampleRate))

      const headers: Record<string, string> = {}
      if (model.apiKey)
        headers.Authorization = `Bearer ${model.apiKey}`

      const dispatcher = await createNodeDispatcher(model.timeout)
      try {
        const requestInit: RequestInit & { dispatcher?: Dispatcher } = {
          method: 'POST',
          headers,
          body: form,
          signal: combineSignal(signal, model.timeout),
          ...(dispatcher ? { dispatcher } : {}),
        }
        const response = await fetch(`${model.baseUrl.replace(/\/$/, '')}/audio/speech`, requestInit)
        if (!response.ok)
          return err(HaiAIError.AUDIO_UPSTREAM_ERROR, aiM('ai_audioUpstreamError', { params: { error: await describeHttpError(response) } }))

        const data = new Uint8Array(await response.arrayBuffer())
        return ok(buildSynthesisResult(data, out, response.headers))
      }
      finally {
        await dispatcher?.close()
      }
    }
    catch (error) {
      logger.debug('IndexTTS synthesize failed', { error: errorMessage(error) })
      return toAudioErrorResult(error, signal)
    }
  }

  return {
    synthesis: { synthesize, resolveSynthesisOutput },
    getCapabilities: () => INDEX_TTS_CAPABILITIES,
  }
}

/**
 * Node 内置 fetch 的响应头等待上限可能早于模型配置超时；CPU TTS 首次推理尤其容易触发。
 * 仅在 Node 环境创建独立调度器，使连接、响应头和响应体超时都服从模型 timeout。
 */
async function createNodeDispatcher(timeout: number): Promise<Dispatcher | undefined> {
  if (typeof process === 'undefined' || !process.versions?.node)
    return undefined

  const { Agent } = await import('undici')
  return new Agent({
    connectTimeout: Math.min(timeout, 30_000),
    headersTimeout: timeout,
    bodyTimeout: timeout,
  })
}

/** IndexTTS 未指定格式时默认 wav；pcm16 时补默认采样率 24000。 */
function resolveSynthesisOutput(request: { format?: AudioFormat, sampleRate?: number }): SynthesisOutputMeta {
  const format: AudioFormat = request.format ?? 'wav'
  return { format, sampleRate: format === 'pcm16' ? (request.sampleRate ?? 24000) : undefined, channels: 1 }
}

/** 追加参考音频及其文本 / 语言到表单（裸 pcm16 已由 toAudioUploadPart 封装为 WAV） */
function appendReference(form: FormData, field: string, reference: AudioReference): void {
  const part = toAudioUploadPart(reference.audio, field)
  form.append(field, toAudioBlob(part), part.filename)
  if (reference.transcript)
    form.append(`${field}_text`, reference.transcript)
  if (reference.language)
    form.append(`${field}_language`, reference.language)
}

/** 由二进制响应体 + 响应头构造 SynthesisResult（真实时长 / 采样率 / 声道以服务端为准） */
function buildSynthesisResult(data: Uint8Array, out: SynthesisOutputMeta, headers: Headers): SynthesisResult {
  const durationMs = parseNumberHeader(headers.get(HEADER_DURATION_MS))
  const sampleRate = parseNumberHeader(headers.get(HEADER_SAMPLE_RATE)) ?? out.sampleRate
  const channels = parseNumberHeader(headers.get(HEADER_CHANNELS)) === 2 ? 2 : out.channels
  const durationMatched = parseBooleanHeader(headers.get(HEADER_DURATION_MATCHED))
  const appliedSpeed = parseNumberHeader(headers.get(HEADER_APPLIED_SPEED))

  const metadata: SynthesisResult['metadata'] = {}
  if (durationMatched !== undefined)
    metadata.durationMatched = durationMatched
  if (appliedSpeed !== undefined)
    metadata.speed = appliedSpeed

  return {
    data,
    format: out.format,
    sampleRate,
    channels,
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...(Object.keys(metadata).length ? { metadata } : {}),
  }
}

/** 解析数值响应头（缺失或非法返回 undefined） */
function parseNumberHeader(value: string | null): number | undefined {
  if (value === null)
    return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

/** 解析布尔响应头（缺失返回 undefined，保留「无法判断」语义） */
function parseBooleanHeader(value: string | null): boolean | undefined {
  if (value === null)
    return undefined
  return value === 'true' || value === '1'
}
