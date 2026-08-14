/**
 * ai.audio IndexTTS Provider 测试
 *
 * 通过公共入口 `ai.audio.*` 验证 hai-framework IndexTTS Service 协议：
 * - multipart 请求格式、说话人 / 风格参考上传、语速 / 目标时长字段透传
 * - 二进制响应 + 响应头元数据映射（时长 / 匹配标记 / 采用语速）
 * - 说话人参考必需校验、模型能力声明、无原生流式时的按段降级
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { ai, HaiAIError } from '../src/index.js'

const INDEXTTS_BASE = 'http://127.0.0.1:8102/v1'

function indexttsModels(extra: Record<string, unknown> = {}): Array<Record<string, unknown>> {
  return [{ id: 'indextts', provider: 'indextts', model: 'indextts-2.5', operations: ['synthesize'], baseUrl: INDEXTTS_BASE, ...extra }]
}

async function initIndexTts(models: Array<Record<string, unknown>> = indexttsModels()): Promise<void> {
  const result = await ai.init({ llm: { apiKey: 'sk-test', model: 'gpt-4o-mini' }, audio: { models, synthesizeModel: 'indextts' } })
  expect(result.success).toBe(true)
}

function wav(bytes = 16): { data: Uint8Array, format: 'wav' } {
  return { data: new Uint8Array(bytes).fill(1), format: 'wav' }
}

function audioResponse(bytes: Uint8Array, headers: Record<string, string> = {}): Response {
  return new Response(bytes, { status: 200, headers })
}

describe('ai.audio IndexTTS Provider', () => {
  afterEach(async () => {
    vi.unstubAllGlobals()
    await ai.close()
  })

  it('synthesize 透传说话人 / 风格参考、语速与目标时长', async () => {
    const fetchMock = vi.fn(async () => audioResponse(new Uint8Array([1, 2, 3, 4]), {
      'x-hai-audio-duration-ms': '3280',
      'x-hai-duration-matched': 'true',
      'x-hai-applied-speed': '1',
      'x-hai-audio-sample-rate': '24000',
      'x-hai-audio-channels': '1',
    }))
    vi.stubGlobal('fetch', fetchMock)
    await initIndexTts()

    const r = await ai.audio.synthesize({
      text: '我们下午三点出发。',
      language: 'zh',
      speakerReference: { audio: wav(), language: 'ja' },
      styleReference: { audio: wav(), language: 'ja' },
      styleStrength: 0.8,
      targetDurationMs: 3280,
      durationToleranceMs: 120,
      format: 'wav',
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.format).toBe('wav')
      expect(r.data.data.length).toBe(4)
      expect(r.data.durationMs).toBe(3280)
      expect(r.data.metadata?.durationMatched).toBe(true)
      expect(r.data.metadata?.speed).toBe(1)
    }

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${INDEXTTS_BASE}/audio/speech`)
    const form = (init as RequestInit).body as FormData
    expect(form.get('text')).toBe('我们下午三点出发。')
    expect(form.get('model')).toBe('indextts-2.5')
    expect(form.get('language')).toBe('zh')
    expect(form.get('style_strength')).toBe('0.8')
    expect(form.get('target_duration_ms')).toBe('3280')
    expect(form.get('duration_tolerance_ms')).toBe('120')
    expect(form.get('response_format')).toBe('wav')
    expect((form.get('speaker_reference') as File).name).toBe('speaker_reference.wav')
    expect(form.get('speaker_reference_language')).toBe('ja')
    expect((form.get('style_reference') as File).name).toBe('style_reference.wav')
  })

  it('speed 字段透传，未提供时长容差时不标记匹配', async () => {
    const fetchMock = vi.fn(async () => audioResponse(new Uint8Array([5]), { 'x-hai-applied-speed': '1.2' }))
    vi.stubGlobal('fetch', fetchMock)
    await initIndexTts()

    const r = await ai.audio.synthesize({ text: '快一点', speakerReference: { audio: wav() }, speed: 1.2 })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.metadata?.speed).toBe(1.2)
      expect(r.data.metadata?.durationMatched).toBeUndefined()
    }
    expect((fetchMock.mock.calls[0][1] as RequestInit).body as FormData).toBeInstanceOf(FormData)
    const form = (fetchMock.mock.calls[0][1] as RequestInit).body as FormData
    expect(form.get('speed')).toBe('1.2')
  })

  it('缺少说话人参考返回 AUDIO_INVALID_REQUEST', async () => {
    const fetchMock = vi.fn(async () => audioResponse(new Uint8Array([0])))
    vi.stubGlobal('fetch', fetchMock)
    await initIndexTts()

    const r = await ai.audio.synthesize({ text: '你好' })
    expect(r.success).toBe(false)
    if (!r.success)
      expect(r.error.code).toBe(HaiAIError.AUDIO_INVALID_REQUEST.code)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('getCapabilities 返回 IndexTTS 能力', async () => {
    await initIndexTts()
    const caps = ai.audio.getCapabilities({ operation: 'synthesize', model: 'indextts' })
    expect(caps.success).toBe(true)
    if (caps.success) {
      expect(caps.data.synthesize?.supported).toBe(true)
      expect(caps.data.synthesize?.speakerReference).toBe(true)
      expect(caps.data.synthesize?.speakerReferenceRequired).toBe(true)
      expect(caps.data.synthesize?.styleReference).toBe(true)
      expect(caps.data.synthesize?.instruction).toBe(false)
      expect(caps.data.synthesize?.speedControl).toBe(true)
      expect(caps.data.synthesize?.targetDuration).toBe(true)
      expect(caps.data.synthesize?.streamingAudioOutput).toBe(false)
    }
  })

  it('strictCapabilities 请求不支持的 instruction 前置失败', async () => {
    const fetchMock = vi.fn(async () => audioResponse(new Uint8Array([0])))
    vi.stubGlobal('fetch', fetchMock)
    await initIndexTts()

    const r = await ai.audio.synthesize({ text: '你好', speakerReference: { audio: wav() }, instruction: '开心地说', strictCapabilities: true })
    expect(r.success).toBe(false)
    if (!r.success)
      expect(r.error.code).toBe(HaiAIError.AUDIO_UNSUPPORTED_INPUT.code)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('无原生流式：按段完整合成降级为结构化事件', async () => {
    const fetchMock = vi.fn(async () => audioResponse(new Uint8Array([7, 7])))
    vi.stubGlobal('fetch', fetchMock)
    await initIndexTts()

    const events = []
    for await (const event of ai.audio.synthesizeStream({ text: { id: 's1', text: '你好' }, speakerReference: { audio: wav() }, model: 'indextts' }))
      events.push(event)

    expect(events[0]?.type).toBe('segment_started')
    if (events[0]?.type === 'segment_started')
      expect(events[0].format).toBe('wav')
    expect(events.some(e => e.type === 'audio')).toBe(true)
    expect(events.at(-1)?.type).toBe('segment_done')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
