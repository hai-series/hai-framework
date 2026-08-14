/**
 * ai.audio Whisper Provider 测试
 *
 * 通过公共入口 `ai.audio.*` 验证 hai-framework Whisper Service 协议：
 * - multipart 请求格式、结构化时间轴响应映射、PCM16→WAV 上传封装
 * - 可选认证（无凭据 / Bearer）、无 canonical 端点必须显式配置 baseUrl
 * - 模型能力声明、无原生流式时的有限降级（完整音频→最终结果；持续输入→拒绝）
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { ai, HaiAIError } from '../src/index.js'

const WHISPER_BASE = 'http://127.0.0.1:8101/v1'

/** 构造 Whisper 模型条目（默认显式配置 baseUrl） */
function whisperModels(extra: Record<string, unknown> = {}): Array<Record<string, unknown>> {
  return [{ id: 'whisper', provider: 'whisper', model: 'faster-whisper-large-v3', operations: ['transcribe'], baseUrl: WHISPER_BASE, ...extra }]
}

async function initWhisper(models: Array<Record<string, unknown>> = whisperModels()): Promise<void> {
  const result = await ai.init({ llm: { apiKey: 'sk-test', model: 'gpt-4o-mini' }, audio: { models, transcribeModel: 'whisper' } })
  expect(result.success).toBe(true)
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function wav(bytes = 16): { data: Uint8Array, format: 'wav' } {
  return { data: new Uint8Array(bytes).fill(1), format: 'wav' }
}

describe('ai.audio Whisper Provider', () => {
  afterEach(async () => {
    vi.unstubAllGlobals()
    await ai.close()
  })

  it('transcribe 返回文本、语言、时长与结构化时间轴', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      text: '你好世界',
      language: 'zh',
      durationMs: 4120,
      segments: [{ id: 0, text: '你好世界', startMs: 100, endMs: 4000, words: [{ text: '你好', startMs: 100, endMs: 800, confidence: 0.98 }] }],
    }))
    vi.stubGlobal('fetch', fetchMock)
    await initWhisper()

    const r = await ai.audio.transcribe({ audio: wav(), language: 'zh', timestampGranularities: ['segment', 'word'], vad: true })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.text).toBe('你好世界')
      expect(r.data.language).toBe('zh')
      expect(r.data.durationMs).toBe(4120)
      expect(r.data.segments?.[0]?.startMs).toBe(100)
      expect(r.data.segments?.[0]?.words?.[0]?.text).toBe('你好')
      expect(r.data.segments?.[0]?.words?.[0]?.confidence).toBe(0.98)
    }

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${WHISPER_BASE}/audio/transcriptions`)
    const form = (init as RequestInit).body as FormData
    expect(form.get('model')).toBe('faster-whisper-large-v3')
    expect(form.get('language')).toBe('zh')
    expect(form.getAll('timestamp_granularities')).toEqual(['segment', 'word'])
    expect(form.get('vad')).toBe('true')
  })

  it('pcm16 上传前封装为 WAV 容器', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ text: 'hi' }))
    vi.stubGlobal('fetch', fetchMock)
    await initWhisper()

    const pcm = new Uint8Array(32).fill(7)
    const r = await ai.audio.transcribe({ audio: { data: pcm, format: 'pcm16', sampleRate: 16000 } })
    expect(r.success).toBe(true)

    const form = (fetchMock.mock.calls[0][1] as RequestInit).body as FormData
    const file = form.get('file') as File
    expect(file.name).toBe('audio.wav')
    const header = new Uint8Array(await file.arrayBuffer()).slice(0, 4)
    expect(String.fromCharCode(...header)).toBe('RIFF')
  })

  it('无凭据 Endpoint 可直接调用（不发送 Authorization）', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ text: 'ok' }))
    vi.stubGlobal('fetch', fetchMock)
    await initWhisper()

    await ai.audio.transcribe({ audio: wav() })
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
  })

  it('配置 apiKey 时发送 Bearer 认证', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ text: 'ok' }))
    vi.stubGlobal('fetch', fetchMock)
    await initWhisper(whisperModels({ apiKey: 'secret' }))

    await ai.audio.transcribe({ audio: wav() })
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer secret')
  })

  it('未配置 baseUrl 返回 CONFIGURATION_ERROR', async () => {
    const result = await ai.init({
      llm: { apiKey: 'sk', model: 'gpt-4o-mini' },
      audio: { models: [{ id: 'w', provider: 'whisper', model: 'faster-whisper-large-v3', operations: ['transcribe'] }], transcribeModel: 'w' },
    })
    expect(result.success).toBe(true)
    const r = await ai.audio.transcribe({ audio: wav() })
    expect(r.success).toBe(false)
    if (!r.success)
      expect(r.error.code).toBe(HaiAIError.CONFIGURATION_ERROR.code)
  })

  it('getCapabilities 返回 Whisper 能力且无需凭据', async () => {
    await initWhisper()
    const caps = ai.audio.getCapabilities({ operation: 'transcribe', model: 'whisper' })
    expect(caps.success).toBe(true)
    if (caps.success) {
      expect(caps.data.transcribe?.supported).toBe(true)
      expect(caps.data.transcribe?.wordTimestamps).toBe(true)
      expect(caps.data.transcribe?.segmentTimestamps).toBe(true)
      expect(caps.data.transcribe?.vad).toBe(true)
      expect(caps.data.transcribe?.languageDetection).toBe(true)
      expect(caps.data.transcribe?.realtimeAudioInput).toBe(false)
      expect(caps.data.transcribe?.streamingTranscriptOutput).toBe(false)
    }
  })

  it('无原生流式：完整音频降级为最终结果', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ text: '最终文本' }))
    vi.stubGlobal('fetch', fetchMock)
    await initWhisper()

    const events = []
    for await (const event of ai.audio.transcribeStream({ audio: wav(), model: 'whisper' }))
      events.push(event)
    expect(events).toEqual([{ type: 'transcript', text: '最终文本', final: true }])
  })

  it('无原生流式：持续音频输入被拒绝（不伪装实时）', async () => {
    await initWhisper()
    async function* chunks(): AsyncIterable<Uint8Array> {
      yield new Uint8Array([1])
    }
    await expect(async () => {
      for await (const _ of ai.audio.transcribeStream({ audio: { chunks: chunks(), format: 'pcm16', sampleRate: 16000 }, model: 'whisper' }))
        void _
    }).rejects.toThrow()
  })
})
