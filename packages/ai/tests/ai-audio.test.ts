/**
 * ai.audio — 语音识别（ASR）/ 语音合成（TTS）测试
 *
 * 通过公共入口 `ai.audio.*` 验证：
 * - 未初始化 / 参数校验 / 模型解析 / 资源上限等边界行为
 * - OpenAI / MiMo / Qwen / 豆包四个 Provider 的请求格式与响应映射（mock 传输，不访问真实厂商）
 * - 豆包二进制协议的字节级断言、Qwen 实时事件断言
 */

import { Buffer } from 'node:buffer'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mock: OpenAI SDK + ws（均在 vi.hoisted 内定义，供 vi.mock 工厂引用） ───
const { mockTranscribe, mockSpeech, mockChatCreate, mockToFile, MockWebSocket } = vi.hoisted(() => {
  /** 可脚本化的 Node WebSocket mock */
  class MockWebSocketImpl {
    static instances: MockWebSocketImpl[] = []
    static script: ((data: unknown, ws: MockWebSocketImpl) => void) | null = null

    binaryType = ''
    readonly url: string
    readonly options: unknown
    readonly sent: unknown[] = []
    private readonly handlers: Record<string, ((...args: unknown[]) => void)[]> = {}

    constructor(url: string, options: unknown) {
      this.url = url
      this.options = options
      MockWebSocketImpl.instances.push(this)
      queueMicrotask(() => this.emit('open'))
    }

    on(event: string, cb: (...args: unknown[]) => void): void {
      (this.handlers[event] ??= []).push(cb)
    }

    send(data: unknown): void {
      this.sent.push(data)
      MockWebSocketImpl.script?.(data, this)
    }

    close(): void {
      this.emit('close')
    }

    emit(event: string, ...args: unknown[]): void {
      for (const cb of this.handlers[event] ?? [])
        cb(...args)
    }

    serverText(text: string): void {
      this.emit('message', Buffer.from(text, 'utf8'), false)
    }

    serverBinary(bytes: Uint8Array): void {
      this.emit('message', Buffer.from(bytes), true)
    }
  }
  return {
    mockTranscribe: vi.fn(),
    mockSpeech: vi.fn(),
    mockChatCreate: vi.fn(),
    mockToFile: vi.fn(async (data: Uint8Array, name: string) => ({ data, name })),
    MockWebSocket: MockWebSocketImpl,
  }
})

vi.mock('openai', () => {
  function MockOpenAI() {
    return {
      chat: { completions: { create: mockChatCreate } },
      responses: { create: vi.fn() },
      models: { list: vi.fn() },
      audio: { transcriptions: { create: mockTranscribe }, speech: { create: mockSpeech } },
    }
  }
  return {
    default: MockOpenAI,
    toFile: mockToFile,
  }
})

vi.mock('ws', () => ({ default: MockWebSocket }))

// eslint-disable-next-line import/first -- vi.mock 需在 import 之前
import { ai, HaiAIError } from '../src/index.js'

// ─── 公共测试数据 ───

const AUDIO_MODELS = [
  { id: 'oa-asr', provider: 'openai' as const, model: 'gpt-4o-transcribe', operations: ['transcribe'] as const, apiKey: 'sk-oa' },
  { id: 'oa-tts', provider: 'openai' as const, model: 'gpt-4o-mini-tts', operations: ['synthesize'] as const, apiKey: 'sk-oa' },
  { id: 'mimo-asr', provider: 'mimo' as const, model: 'mimo-v2.5-asr', operations: ['transcribe'] as const, apiKey: 'mk' },
  { id: 'mimo-tts', provider: 'mimo' as const, model: 'mimo-v2.5-tts', operations: ['synthesize'] as const, apiKey: 'mk' },
  { id: 'qwen-asr', provider: 'qwen' as const, model: 'qwen3-asr-flash-realtime', operations: ['transcribe'] as const, apiKey: 'qk' },
  { id: 'qwen-tts', provider: 'qwen' as const, model: 'qwen3-tts-flash-realtime', operations: ['synthesize'] as const, apiKey: 'qk' },
  { id: 'doubao-asr', provider: 'doubao' as const, model: 'bigmodel', operations: ['transcribe'] as const, apiKey: 'dk' },
  { id: 'doubao-tts', provider: 'doubao' as const, model: 'seed-tts-2.0', operations: ['synthesize'] as const, apiKey: 'dk' },
]

function wavAudio(bytes = 16): { data: Uint8Array, format: 'wav' } {
  return { data: new Uint8Array(bytes).fill(1), format: 'wav' }
}

async function initAudio(overrides?: Record<string, unknown>): Promise<void> {
  const result = await ai.init({
    llm: { apiKey: 'sk-test', model: 'gpt-4o-mini' },
    audio: { models: AUDIO_MODELS, ...overrides },
  })
  expect(result.success).toBe(true)
}

// =============================================================================
// 未初始化
// =============================================================================

describe('ai.audio 未初始化', () => {
  beforeEach(async () => {
    await ai.close()
  })

  it('transcribe / synthesize 返回 NOT_INITIALIZED', async () => {
    const t = await ai.audio.transcribe({ audio: wavAudio() })
    expect(t.success).toBe(false)
    if (!t.success)
      expect(t.error.code).toBe(HaiAIError.NOT_INITIALIZED.code)

    const s = await ai.audio.synthesize({ text: 'hi' })
    expect(s.success).toBe(false)
  })

  it('transcribeStream 在迭代时抛出未初始化错误', async () => {
    await expect(async () => {
      for await (const _ of ai.audio.transcribeStream({ audio: wavAudio() }))
        void _
    }).rejects.toThrow()
  })
})

// =============================================================================
// 参数校验与模型解析
// =============================================================================

describe('ai.audio 校验与路由', () => {
  beforeEach(async () => {
    await initAudio()
  })
  afterEach(async () => {
    await ai.close()
  })

  it('空音频返回 AUDIO_INVALID_REQUEST', async () => {
    const r = await ai.audio.transcribe({ audio: { data: new Uint8Array(0), format: 'wav' }, model: 'oa-asr' })
    expect(r.success).toBe(false)
    if (!r.success)
      expect(r.error.code).toBe(HaiAIError.AUDIO_INVALID_REQUEST.code)
  })

  it('空文本返回 AUDIO_INVALID_REQUEST', async () => {
    const r = await ai.audio.synthesize({ text: '', model: 'oa-tts' })
    expect(r.success).toBe(false)
    if (!r.success)
      expect(r.error.code).toBe(HaiAIError.AUDIO_INVALID_REQUEST.code)
  })

  it('未知模型返回 AUDIO_MODEL_NOT_FOUND', async () => {
    const r = await ai.audio.transcribe({ audio: wavAudio(), model: 'does-not-exist' })
    expect(r.success).toBe(false)
    if (!r.success)
      expect(r.error.code).toBe(HaiAIError.AUDIO_MODEL_NOT_FOUND.code)
  })

  it('未指定默认识别模型时返回 AUDIO_MODEL_NOT_FOUND', async () => {
    const r = await ai.audio.transcribe({ audio: wavAudio() })
    expect(r.success).toBe(false)
    if (!r.success)
      expect(r.error.code).toBe(HaiAIError.AUDIO_MODEL_NOT_FOUND.code)
  })

  it('在调用厂商前拒绝 ASR/TTS 模型混用', async () => {
    const transcribe = await ai.audio.transcribe({ audio: wavAudio(), model: 'qwen-tts' })
    expect(transcribe.success).toBe(false)
    if (!transcribe.success)
      expect(transcribe.error.code).toBe(HaiAIError.AUDIO_UNSUPPORTED_INPUT.code)

    const synthesize = await ai.audio.synthesize({ text: 'hi', model: 'qwen-asr' })
    expect(synthesize.success).toBe(false)
    if (!synthesize.success)
      expect(synthesize.error.code).toBe(HaiAIError.AUDIO_UNSUPPORTED_INPUT.code)
    expect(MockWebSocket.instances).toHaveLength(0)
  })
})

describe('ai.audio 资源上限与缺失凭据', () => {
  afterEach(async () => {
    await ai.close()
  })

  it('超过 maxAudioBytes 返回 AUDIO_INPUT_TOO_LARGE', async () => {
    await initAudio({ maxAudioBytes: 8 })
    const r = await ai.audio.transcribe({ audio: wavAudio(64), model: 'oa-asr' })
    expect(r.success).toBe(false)
    if (!r.success)
      expect(r.error.code).toBe(HaiAIError.AUDIO_INPUT_TOO_LARGE.code)
  })

  it('缺少凭据返回 CONFIGURATION_ERROR', async () => {
    const saved = process.env.VOLC_API_KEY
    delete process.env.VOLC_API_KEY
    await ai.init({
      llm: { apiKey: 'sk-test', model: 'gpt-4o-mini' },
      audio: { models: [{ id: 'db', provider: 'doubao', model: 'bigmodel', operations: ['transcribe'] }] },
    })
    const r = await ai.audio.transcribe({ audio: wavAudio(), model: 'db' })
    expect(r.success).toBe(false)
    if (!r.success)
      expect(r.error.code).toBe(HaiAIError.CONFIGURATION_ERROR.code)
    if (saved !== undefined)
      process.env.VOLC_API_KEY = saved
  })
})

// =============================================================================
// OpenAI Provider
// =============================================================================

describe('ai.audio OpenAI Provider', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await initAudio({ transcribeModel: 'oa-asr', synthesizeModel: 'oa-tts' })
  })
  afterEach(async () => {
    await ai.close()
  })

  it('transcribe 返回识别文本', async () => {
    mockTranscribe.mockResolvedValue({ text: '你好世界' })
    const r = await ai.audio.transcribe({ audio: wavAudio() })
    expect(r.success).toBe(true)
    if (r.success)
      expect(r.data.text).toBe('你好世界')
    expect(mockTranscribe).toHaveBeenCalledTimes(1)
  })

  it('synthesize 返回音频字节', async () => {
    const audioBytes = new Uint8Array([1, 2, 3, 4])
    mockSpeech.mockResolvedValue({ arrayBuffer: async () => audioBytes.buffer.slice(0), body: null })
    const r = await ai.audio.synthesize({ text: '欢迎', format: 'mp3' })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.format).toBe('mp3')
      expect(r.data.data.length).toBe(4)
    }
  })

  it('transcribeStream 持续音频输入返回不支持', async () => {
    async function* chunks(): AsyncIterable<Uint8Array> {
      yield new Uint8Array([1])
    }
    await expect(async () => {
      for await (const _ of ai.audio.transcribeStream({ audio: { chunks: chunks(), format: 'pcm16', sampleRate: 16000 }, model: 'oa-asr' }))
        void _
    }).rejects.toThrow()
  })
})

// =============================================================================
// MiMo Provider（mock fetch）
// =============================================================================

describe('ai.audio MiMo Provider', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await initAudio({ transcribeModel: 'mimo-asr', synthesizeModel: 'mimo-tts' })
  })
  afterEach(async () => {
    vi.unstubAllGlobals()
    await ai.close()
  })

  it('transcribe 请求格式符合 MiMo 契约并返回文本', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '识别结果' } }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const r = await ai.audio.transcribe({ audio: wavAudio(), language: 'zh' })
    expect(r.success).toBe(true)
    if (r.success)
      expect(r.data.text).toBe('识别结果')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.xiaomimimo.com/v1/chat/completions')
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer mk')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.model).toBe('mimo-v2.5-asr')
    expect(body.messages[0].content[0].type).toBe('input_audio')
    expect(body.messages[0].content[0].input_audio.data).toContain('data:audio/wav;base64,')
    expect(body.asr_options.language).toBe('zh')
  })

  it('synthesize 将 assistant 文本合成为音频并解码 Base64', async () => {
    const pcm = new Uint8Array([9, 8, 7, 6])
    const base64 = Buffer.from(pcm).toString('base64')
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { audio: { data: base64 } } }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const r = await ai.audio.synthesize({ text: '欢迎参加访谈', voice: 'Chloe', format: 'wav' })
    expect(r.success).toBe(true)
    if (r.success)
      expect(Array.from(r.data.data)).toEqual([9, 8, 7, 6])

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.messages[0].role).toBe('assistant')
    expect(body.messages[0].content).toBe('欢迎参加访谈')
    expect(body.audio).toEqual({ format: 'wav', voice: 'Chloe' })
  })
})

// =============================================================================
// Qwen Provider（mock ws，实时事件）
// =============================================================================

describe('ai.audio Qwen Provider', () => {
  beforeEach(async () => {
    MockWebSocket.instances.length = 0
    MockWebSocket.script = null
    await initAudio({ transcribeModel: 'qwen-asr', synthesizeModel: 'qwen-tts' })
  })
  afterEach(async () => {
    MockWebSocket.script = null
    await ai.close()
  })

  it('transcribe 发送 session/append/commit/finish 并返回最终文本', async () => {
    MockWebSocket.script = (data, ws) => {
      if (typeof data === 'string' && data.includes('session.finish')) {
        ws.serverText(JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed', transcript: '人工智能' }))
        ws.serverText(JSON.stringify({ type: 'session.finished' }))
      }
    }

    const r = await ai.audio.transcribe({ audio: { data: new Uint8Array([1, 2, 3]), format: 'pcm16', sampleRate: 16000 } })
    expect(r.success).toBe(true)
    if (r.success)
      expect(r.data.text).toBe('人工智能')

    const ws = MockWebSocket.instances[0]
    const types = ws.sent.map(m => JSON.parse(m as string).type)
    expect(types).toContain('session.update')
    expect(types).toContain('input_audio_buffer.append')
    expect(types).toContain('input_audio_buffer.commit')
    expect(types).toContain('session.finish')
    expect(ws.url).toContain('model=qwen3-asr-flash-realtime')
  })

  it('synthesize 流式音频分片拼接为完整音频', async () => {
    MockWebSocket.script = (data, ws) => {
      if (typeof data === 'string' && data.includes('session.finish')) {
        ws.serverText(JSON.stringify({ type: 'response.audio.delta', audio: Buffer.from([1, 2]).toString('base64') }))
        ws.serverText(JSON.stringify({ type: 'response.audio.delta', audio: Buffer.from([3, 4]).toString('base64') }))
        ws.serverText(JSON.stringify({ type: 'session.finished' }))
      }
    }

    const r = await ai.audio.synthesize({ text: '欢迎', voice: 'Cherry', format: 'pcm16' })
    expect(r.success).toBe(true)
    if (r.success)
      expect(Array.from(r.data.data)).toEqual([1, 2, 3, 4])

    const ws = MockWebSocket.instances[0]
    const update = JSON.parse(ws.sent[0] as string)
    expect(update.type).toBe('session.update')
    expect(update.session.voice).toBe('Cherry')
  })

  it('synthesizeStream 按文本段产出可关联的结构化事件', async () => {
    MockWebSocket.script = (data, ws) => {
      if (typeof data === 'string' && data.includes('session.finish')) {
        ws.serverText(JSON.stringify({ type: 'response.audio.delta', audio: Buffer.from([1, 2]).toString('base64') }))
        ws.serverText(JSON.stringify({ type: 'session.finished' }))
      }
    }
    async function* segments() {
      yield { id: 'seg-1', text: '第一段。' }
      yield { id: 'seg-2', text: '第二段。' }
    }

    const events = []
    for await (const event of ai.audio.synthesizeStream({ text: segments() }))
      events.push(event)

    expect(events.map(event => [event.type, event.segmentId])).toEqual([
      ['segment_started', 'seg-1'],
      ['audio', 'seg-1'],
      ['segment_done', 'seg-1'],
      ['segment_started', 'seg-2'],
      ['audio', 'seg-2'],
      ['segment_done', 'seg-2'],
    ])
  })
})

// =============================================================================
// 豆包 / 火山引擎 Provider（mock ws，二进制协议字节级断言）
// =============================================================================

describe('ai.audio 豆包 Provider', () => {
  beforeEach(async () => {
    MockWebSocket.instances.length = 0
    MockWebSocket.script = null
    await initAudio({ transcribeModel: 'doubao-asr', synthesizeModel: 'doubao-tts' })
  })
  afterEach(async () => {
    MockWebSocket.script = null
    await ai.close()
  })

  it('识别 full client request 头字节符合二进制协议', async () => {
    MockWebSocket.script = (data, ws) => {
      if (data instanceof Uint8Array && data[1] >> 4 === 0b0010) {
        // 收到 audio-only 帧后返回最终识别结果
        ws.serverBinary(buildDoubaoAsrResponse({ result: { text: '字节跳动' } }, -1))
      }
    }

    const r = await ai.audio.transcribe({ audio: { data: new Uint8Array([1, 2, 3, 4]), format: 'pcm16', sampleRate: 16000 } })
    expect(r.success).toBe(true)
    if (r.success)
      expect(r.data.text).toBe('字节跳动')

    const ws = MockWebSocket.instances[0]
    const firstFrame = ws.sent[0] as Uint8Array
    // 头 4 字节：版本1+头长1、full client request(0001)+无序列(0000)、JSON(0001)+无压缩(0000)、保留 0
    expect(firstFrame[0]).toBe(0x11)
    expect(firstFrame[1]).toBe(0x10)
    expect(firstFrame[2]).toBe(0x10)
    expect(firstFrame[3]).toBe(0x00)
    // 载荷是合法 JSON 配置
    const payload = JSON.parse(Buffer.from(firstFrame.slice(8)).toString('utf8'))
    expect(payload.request.model_name).toBe('bigmodel')
    expect(payload.audio.format).toBe('pcm')
  })

  it('合成 StartConnection 帧带事件号且返回音频', async () => {
    MockWebSocket.script = (data, ws) => {
      if (data instanceof Uint8Array) {
        const event = readEvent(data)
        if (event === 102) {
          // FinishSession 后返回一帧音频 + SessionFinished
          ws.serverBinary(buildDoubaoTtsAudio(new Uint8Array([5, 6, 7])))
          ws.serverBinary(buildDoubaoTtsEvent(152))
        }
      }
    }

    const r = await ai.audio.synthesize({ text: '你好', voice: 'zh_female_test', format: 'pcm16' })
    expect(r.success).toBe(true)
    if (r.success)
      expect(Array.from(r.data.data)).toEqual([5, 6, 7])

    const ws = MockWebSocket.instances[0]
    const startFrame = ws.sent[0] as Uint8Array
    expect(startFrame[0]).toBe(0x11)
    // full client request(0001) + with event(0100) = 0x14
    expect(startFrame[1]).toBe(0x14)
    expect(readEvent(startFrame)).toBe(1) // StartConnection
  })
})

// =============================================================================
// 新能力：语音事件 / 取消语义 / 提示词 / 风格指令 / pcm→wav
// =============================================================================

describe('ai.audio 能力声明 getCapabilities', () => {
  beforeEach(async () => {
    await ai.close()
    await initAudio({ transcribeModel: 'qwen-asr', synthesizeModel: 'oa-tts' })
  })

  it('qwen 声明实时输入 + 服务端 VAD 起止事件', () => {
    const caps = ai.audio.getCapabilities({ operation: 'transcribe', model: 'qwen-asr' })
    expect(caps.success).toBe(true)
    if (!caps.success)
      return
    expect(caps.data.transcribe?.realtimeAudioInput).toBe(true)
    expect(caps.data.transcribe?.speechBoundaryEvents).toBe(true)
    expect(caps.data.synthesize).toBeUndefined()
  })

  it('豆包实时但不产出服务端 VAD 起止事件', () => {
    const caps = ai.audio.getCapabilities({ operation: 'transcribe', model: 'doubao-asr' })
    expect(caps.success && caps.data.transcribe?.realtimeAudioInput).toBe(true)
    expect(caps.success && caps.data.transcribe?.speechBoundaryEvents).toBe(false)
  })

  it('openAI / MiMo 不原生支持增量文本输入但流式产出音频', () => {
    const oa = ai.audio.getCapabilities({ operation: 'synthesize', model: 'oa-tts' })
    expect(oa.success && oa.data.synthesize?.incrementalTextInput).toBe(false)
    expect(oa.success && oa.data.synthesize?.streamingAudioOutput).toBe(true)
    const mimo = ai.audio.getCapabilities({ operation: 'synthesize', model: 'mimo-tts' })
    expect(mimo.success && mimo.data.synthesize?.incrementalTextInput).toBe(false)
  })

  it('不传 model 时按 operation 查询对应默认模型', () => {
    expect(ai.audio.getCapabilities({ operation: 'transcribe' }).success).toBe(true)
    expect(ai.audio.getCapabilities({ operation: 'synthesize' }).success).toBe(true)
  })

  it('未知模型返回 AUDIO_MODEL_NOT_FOUND', () => {
    const caps = ai.audio.getCapabilities({ operation: 'transcribe', model: 'does-not-exist' })
    expect(caps.success).toBe(false)
    if (!caps.success)
      expect(caps.error.code).toBe(HaiAIError.AUDIO_MODEL_NOT_FOUND.code)
  })
})

describe('ai.audio 领域事件与取消语义', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    MockWebSocket.instances.length = 0
    MockWebSocket.script = null
    await initAudio({ transcribeModel: 'qwen-asr', synthesizeModel: 'qwen-tts' })
  })
  afterEach(async () => {
    MockWebSocket.script = null
    await ai.close()
  })

  it('实时识别产出 speech_started / transcript / speech_stopped 事件', async () => {
    MockWebSocket.script = (data, ws) => {
      if (typeof data === 'string' && data.includes('session.finish')) {
        ws.serverText(JSON.stringify({ type: 'input_audio_buffer.speech_started' }))
        ws.serverText(JSON.stringify({ type: 'conversation.item.input_audio_transcription.text', text: '人工' }))
        ws.serverText(JSON.stringify({ type: 'input_audio_buffer.speech_stopped' }))
        ws.serverText(JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed', transcript: '人工智能' }))
        ws.serverText(JSON.stringify({ type: 'session.finished' }))
      }
    }

    async function* chunks(): AsyncIterable<Uint8Array> {
      yield new Uint8Array([1, 2, 3])
    }
    const events: string[] = []
    for await (const event of ai.audio.transcribeStream({ audio: { chunks: chunks(), format: 'pcm16', sampleRate: 16000 } }))
      events.push(event.type)

    expect(events).toContain('speech_started')
    expect(events).toContain('transcript')
    expect(events).toContain('speech_stopped')
  })

  it('取消信号触发时返回 AUDIO_CANCELLED', async () => {
    const controller = new AbortController()
    MockWebSocket.script = () => {
      controller.abort()
    }
    const r = await ai.audio.synthesize({ text: '你好', signal: controller.signal })
    expect(r.success).toBe(false)
    if (!r.success)
      expect(r.error.code).toBe(HaiAIError.AUDIO_CANCELLED.code)
  })
})

describe('ai.audio 提示词 / 风格指令 / pcm→wav', () => {
  afterEach(async () => {
    vi.unstubAllGlobals()
    await ai.close()
  })

  it('合成将 instruction 放入 MiMo user 消息', async () => {
    vi.clearAllMocks()
    await initAudio({ synthesizeModel: 'mimo-tts' })
    const base64 = Buffer.from(new Uint8Array([1, 2])).toString('base64')
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { audio: { data: base64 } } }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await ai.audio.synthesize({ text: '欢迎', instruction: '用轻快的语气', format: 'wav' })
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.messages[0]).toEqual({ role: 'user', content: '用轻快的语气' })
    expect(body.messages[1]).toEqual({ role: 'assistant', content: '欢迎' })
  })

  it('豆包 ASR 将 contextHints 映射为热词 context', async () => {
    vi.clearAllMocks()
    MockWebSocket.instances.length = 0
    MockWebSocket.script = (data, ws) => {
      if (data instanceof Uint8Array && data[1] >> 4 === 0b0010)
        ws.serverBinary(buildDoubaoAsrResponse({ result: { text: '字节跳动' } }, -1))
    }
    await initAudio({ transcribeModel: 'doubao-asr' })
    const r = await ai.audio.transcribe({ audio: { data: new Uint8Array([1, 2, 3, 4]), format: 'pcm16', sampleRate: 16000 }, contextHints: ['字节跳动', '火山引擎'] })
    expect(r.success).toBe(true)

    const ws = MockWebSocket.instances[0]
    const firstFrame = ws.sent[0] as Uint8Array
    const payload = JSON.parse(Buffer.from(firstFrame.slice(8)).toString('utf8'))
    const context = JSON.parse(payload.request.context)
    expect(context.hotwords).toEqual([{ word: '字节跳动' }, { word: '火山引擎' }])
    MockWebSocket.script = null
  })

  it('识别将裸 pcm16 封装为 WAV（OpenAI RIFF 头）', async () => {
    vi.clearAllMocks()
    await initAudio({ transcribeModel: 'oa-asr' })
    mockTranscribe.mockResolvedValue({ text: 'ok' })
    await ai.audio.transcribe({ audio: { data: new Uint8Array([0, 0, 0, 0]), format: 'pcm16', sampleRate: 16000 } })

    const uploaded = mockToFile.mock.calls[0][0] as Uint8Array
    const magic = Buffer.from(uploaded.slice(0, 4)).toString('ascii')
    expect(magic).toBe('RIFF')
  })
})

// ─── 豆包协议测试辅助 ───

/** 构造豆包 ASR full server response 帧（header + seq + size + JSON） */
function buildDoubaoAsrResponse(json: object, seq: number): Uint8Array {
  const header = Buffer.from([0x11, (0b1001 << 4) | 0b0000, (0b0001 << 4) | 0b0000, 0x00])
  const seqBuf = Buffer.alloc(4)
  seqBuf.writeInt32BE(seq)
  const payload = Buffer.from(JSON.stringify(json), 'utf8')
  const size = Buffer.alloc(4)
  size.writeUInt32BE(payload.length)
  return new Uint8Array(Buffer.concat([header, seqBuf, size, payload]))
}

/** 读取事件型帧的 event 号（header 后 4 字节 int32） */
function readEvent(frame: Uint8Array): number {
  return Buffer.from(frame).readInt32BE(4)
}

/** 构造豆包 TTS 事件帧（会话级事件携带 session_id） */
function buildDoubaoTtsEvent(event: number): Uint8Array {
  const header = Buffer.from([0x11, (0b1001 << 4) | 0b0100, (0b0001 << 4) | 0b0000, 0x00])
  const eventBuf = Buffer.alloc(4)
  eventBuf.writeInt32BE(event)
  const sid = Buffer.from('s', 'utf8')
  const sidSize = Buffer.alloc(4)
  sidSize.writeUInt32BE(sid.length)
  const payload = Buffer.from('{}', 'utf8')
  const size = Buffer.alloc(4)
  size.writeUInt32BE(payload.length)
  return new Uint8Array(Buffer.concat([header, eventBuf, sidSize, sid, size, payload]))
}

/** 构造豆包 TTS AudioOnlyServer 音频帧（TTSResponse=352，携带 session_id） */
function buildDoubaoTtsAudio(audio: Uint8Array): Uint8Array {
  const header = Buffer.from([0x11, (0b1011 << 4) | 0b0100, (0b0000 << 4) | 0b0000, 0x00])
  const eventBuf = Buffer.alloc(4)
  eventBuf.writeInt32BE(352)
  const sid = Buffer.from('s', 'utf8')
  const sidSize = Buffer.alloc(4)
  sidSize.writeUInt32BE(sid.length)
  const size = Buffer.alloc(4)
  size.writeUInt32BE(audio.length)
  return new Uint8Array(Buffer.concat([header, eventBuf, sidSize, sid, size, Buffer.from(audio)]))
}
