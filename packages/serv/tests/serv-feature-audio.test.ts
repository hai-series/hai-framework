/**
 * serv feature audio — 统一语音 WebSocket 接入测试
 *
 * 验证「统一 WebSocket 消息 → ai.audio 调用 → 统一 WebSocket 返回」的服务层桥接：
 * - 流式 / 非流式识别、语音合成的消息往返
 * - 鉴权失败、超大消息等边界
 * - createApp 启用 audio 时注册升级注入器
 */

import type { AudioOperations } from '@h-ai/ai'
import type { HaiResult } from '@h-ai/core'
import type { Hono } from 'hono'
import type { UpgradeWebSocket, WSContext } from 'hono/ws'
import type { AudioWsDeps } from '../src/features/serv-feature-audio.js'
import type { ServContext } from '../src/serv-context.js'
import { apiContract } from '@h-ai/api-contract'
import { err, HaiCommonError, ok } from '@h-ai/core'
import { describe, expect, it, vi } from 'vitest'
import { registerAudioWsRoute } from '../src/features/serv-feature-audio.js'
import { audioWsInjectors } from '../src/serv-app.js'
import { serv } from '../src/serv-main.js'

/** 构造可控的 ai.audio mock */
function createAudioMock(): AudioOperations {
  return {
    transcribe: async () => ok({ text: '完整识别结果' }),
    async* transcribeStream() {
      yield { type: 'speech_started' }
      yield { type: 'transcript', text: '临时', final: false }
      yield { type: 'transcript', text: '最终', final: true }
      yield { type: 'speech_stopped' }
    },
    synthesize: async () => ok({ data: new Uint8Array([1]), format: 'pcm16' }),
    async* synthesizeStream(request) {
      const segments = Symbol.asyncIterator in request.text ? request.text : single(request.text)
      for await (const segment of segments) {
        yield { type: 'segment_started', segmentId: segment.id, text: segment.text }
        yield { type: 'audio', segmentId: segment.id, data: new Uint8Array([1, 2]) }
        yield { type: 'audio', segmentId: segment.id, data: new Uint8Array([3, 4]) }
        yield { type: 'segment_done', segmentId: segment.id }
      }
    },
    getCapabilities: () => ok({ synthesize: { supported: true, incrementalTextInput: false, streamingAudioOutput: true } }),
  }
}

async function* single<T>(value: T): AsyncIterable<T> {
  yield value
}

const TEST_SESSION = { userId: 'user-1', roles: ['user'], permissions: ['ai:audio'] }
type AudioWsTestDeps = Omit<AudioWsDeps, 'verifyTicket'> & Pick<Partial<AudioWsDeps>, 'verifyTicket'>

/** 取出 registerAudioWsRoute 注册的连接处理器 */
function captureHandlers(deps: AudioWsTestDeps, ticket = 'ticket-1'): WsHandlers {
  let factory: ((c: unknown) => WsHandlers) | undefined
  const app = { get: (_path: string, _handler: unknown) => {} } as unknown as Hono
  const upgradeWebSocket = ((f: (c: unknown) => WsHandlers) => {
    factory = f
    return () => {}
  }) as unknown as UpgradeWebSocket
  registerAudioWsRoute(app, '/api/v1/ai/audio', upgradeWebSocket, {
    ...deps,
    verifyTicket: deps.verifyTicket ?? (async () => ok(TEST_SESSION)),
  })
  const honoContext = { req: { query: (name: string) => name === 'ticket' ? ticket : undefined, header: () => undefined } }
  return factory!(honoContext)
}

interface WsHandlers {
  onOpen: (evt: unknown, ws: WSContext) => void
  onMessage: (evt: { data: unknown }, ws: WSContext) => void
  onClose: () => void
  onError: () => void
}

function createWsMock(): WSContext & { readonly messages: unknown[] } {
  const messages: unknown[] = []
  return {
    messages,
    send: (data: unknown) => { messages.push(data) },
    close: vi.fn(),
  } as unknown as WSContext & { readonly messages: unknown[] }
}

/** 等待微任务队列清空，让后台异步管线完成 */
async function flush(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 20))
}

function parseJsonMessages(ws: { messages: unknown[] }): Array<Record<string, unknown>> {
  return ws.messages.filter((m): m is string => typeof m === 'string').map(m => JSON.parse(m) as Record<string, unknown>)
}

describe('serv feature audio', () => {
  it('流式识别返回临时与最终文本，并以 end 结束', async () => {
    const handlers = captureHandlers({ ai: { audio: createAudioMock() } })
    const ws = createWsMock()
    handlers.onOpen({}, ws)
    handlers.onMessage({ data: JSON.stringify({ type: 'start', operation: 'transcribe', stream: true, format: 'pcm16', sampleRate: 16000 }) }, ws)
    await flush()

    const msgs = parseJsonMessages(ws)
    expect(msgs).toEqual([
      { type: 'speech_started' },
      { type: 'transcript', text: '临时', final: false },
      { type: 'transcript', text: '最终', final: true },
      { type: 'speech_stopped' },
      { type: 'end' },
    ])
  })

  it('非流式识别缓冲音频后返回单条最终结果', async () => {
    const handlers = captureHandlers({ ai: { audio: createAudioMock() } })
    const ws = createWsMock()
    handlers.onOpen({}, ws)
    handlers.onMessage({ data: JSON.stringify({ type: 'start', operation: 'transcribe', stream: false, format: 'wav' }) }, ws)
    handlers.onMessage({ data: new Uint8Array([1, 2, 3]) }, ws)
    handlers.onMessage({ data: JSON.stringify({ type: 'done' }) }, ws)
    await flush()

    const msgs = parseJsonMessages(ws)
    expect(msgs).toEqual([
      { type: 'transcript', text: '完整识别结果', final: true },
      { type: 'end' },
    ])
  })

  it('语音合成以二进制帧返回音频并以 end 结束', async () => {
    const handlers = captureHandlers({ ai: { audio: createAudioMock() } })
    const ws = createWsMock()
    handlers.onOpen({}, ws)
    handlers.onMessage({ data: JSON.stringify({ type: 'start', operation: 'synthesize', format: 'pcm16' }) }, ws)
    handlers.onMessage({ data: JSON.stringify({ type: 'text', segmentId: 'seg-1', text: '你好' }) }, ws)
    handlers.onMessage({ data: JSON.stringify({ type: 'done' }) }, ws)
    await flush()

    const binaryFrames = ws.messages.filter(m => m instanceof ArrayBuffer)
    expect(binaryFrames.length).toBe(2)
    const jsonMsgs = parseJsonMessages(ws)
    expect(jsonMsgs).toEqual([
      { type: 'segment_started', segmentId: 'seg-1', text: '你好' },
      { type: 'segment_done', segmentId: 'seg-1' },
      { type: 'end' },
    ])
  })

  it('无效或已消费的 ticket 返回错误并关闭', async () => {
    const verifyTicket = async (): Promise<HaiResult<{ userId: string, roles: string[], permissions: string[] }>> => err(HaiCommonError.UNAUTHORIZED, 'invalid')
    const handlers = captureHandlers({ ai: { audio: createAudioMock() }, verifyTicket }, 'used-ticket')
    const ws = createWsMock()
    handlers.onOpen({}, ws)
    handlers.onMessage({ data: JSON.stringify({ type: 'start', operation: 'transcribe', stream: true }) }, ws)
    await flush()

    const msgs = parseJsonMessages(ws)
    expect(msgs[0]).toMatchObject({ type: 'error' })
    expect(ws.close).toHaveBeenCalled()
  })

  it('缺失 ticket 时不会调用校验或付费能力', async () => {
    const verifyTicket = vi.fn(async () => ok(TEST_SESSION))
    const transcribeStream = vi.fn(createAudioMock().transcribeStream)
    const audio = { ...createAudioMock(), transcribeStream }
    const handlers = captureHandlers({ ai: { audio }, verifyTicket }, '')
    const ws = createWsMock()
    handlers.onOpen({}, ws)
    handlers.onMessage({ data: JSON.stringify({ type: 'start', operation: 'transcribe', stream: true }) }, ws)
    await flush()

    expect(verifyTicket).not.toHaveBeenCalled()
    expect(transcribeStream).not.toHaveBeenCalled()
    expect(parseJsonMessages(ws)[0]).toMatchObject({ type: 'error', message: 'missing audio ticket' })
  })

  it('超大消息帧返回 AUDIO_INPUT_TOO_LARGE 错误码', async () => {
    const handlers = captureHandlers({ ai: { audio: createAudioMock() }, maxMessageBytes: 4 })
    const ws = createWsMock()
    handlers.onOpen({}, ws)
    handlers.onMessage({ data: JSON.stringify({ type: 'start', operation: 'transcribe', stream: true }) }, ws)
    handlers.onMessage({ data: new Uint8Array(16) }, ws)
    await flush()

    const msgs = parseJsonMessages(ws)
    expect(msgs.find(m => m.type === 'error')).toMatchObject({ code: 'hai:ai:058' })
  })

  it('鉴权未完成前不调用付费 ASR（串行化 + 鉴权先行，消除竞态）', async () => {
    const transcribe = vi.fn(async () => ok({ text: '不该被识别' }))
    const audio = { ...createAudioMock(), transcribe } as unknown as AudioOperations
    // 鉴权异步失败（下一 tick 才 resolve），模拟快速连发时的竞态窗口
    const verifyTicket = async (): Promise<HaiResult<{ userId: string, roles: string[], permissions: string[] }>> => {
      await Promise.resolve()
      return err(HaiCommonError.UNAUTHORIZED, 'invalid')
    }
    const handlers = captureHandlers({ ai: { audio }, verifyTicket }, 'bad-ticket')
    const ws = createWsMock()
    handlers.onOpen({}, ws)
    // 快速连发 start → binary → done，试图在鉴权完成前触发付费 ASR
    handlers.onMessage({ data: JSON.stringify({ type: 'start', operation: 'transcribe', stream: false, format: 'wav' }) }, ws)
    handlers.onMessage({ data: new Uint8Array([1, 2, 3]) }, ws)
    handlers.onMessage({ data: JSON.stringify({ type: 'done' }) }, ws)
    await flush()

    // 付费 ASR 未被调用，且返回鉴权错误
    expect(transcribe).not.toHaveBeenCalled()
    const msgs = parseJsonMessages(ws)
    expect(msgs[0]).toMatchObject({ type: 'error' })
  })

  it('文本累计超过 maxTextBytes 返回 AUDIO_INPUT_TOO_LARGE 并关闭', async () => {
    const handlers = captureHandlers({ ai: { audio: createAudioMock() }, maxTextBytes: 4 })
    const ws = createWsMock()
    handlers.onOpen({}, ws)
    handlers.onMessage({ data: JSON.stringify({ type: 'start', operation: 'synthesize', format: 'pcm16' }) }, ws)
    handlers.onMessage({ data: JSON.stringify({ type: 'text', segmentId: 'seg-1', text: '这是一段很长的文本' }) }, ws)
    await flush()

    const msgs = parseJsonMessages(ws)
    expect(msgs.find(m => m.type === 'error')).toMatchObject({ code: 'hai:ai:058' })
    expect(ws.close).toHaveBeenCalled()
  })

  it('保存 ticket 对应 Session，并只使用授权后的模型与音色', async () => {
    const synthesizeStream = vi.fn(createAudioMock().synthesizeStream)
    const audio = { ...createAudioMock(), synthesizeStream }
    const authorize = vi.fn(async () => ok({ operation: 'synthesize' as const, model: 'allowed-tts', voice: 'ServerVoice', format: 'pcm16' as const }))
    const handlers = captureHandlers({ ai: { audio }, authorize })
    const ws = createWsMock()
    handlers.onOpen({}, ws)
    handlers.onMessage({ data: JSON.stringify({ type: 'start', operation: 'synthesize', model: 'expensive-tts', voice: 'ClientVoice' }) }, ws)
    handlers.onMessage({ data: JSON.stringify({ type: 'text', segmentId: 'seg-1', text: '授权测试' }) }, ws)
    handlers.onMessage({ data: JSON.stringify({ type: 'done' }) }, ws)
    await flush()

    expect(authorize).toHaveBeenCalledWith(TEST_SESSION, expect.objectContaining({ model: 'expensive-tts', voice: 'ClientVoice' }))
    expect(synthesizeStream).toHaveBeenCalledWith(expect.objectContaining({ model: 'allowed-tts', voice: 'ServerVoice' }))
  })

  it('未配置 authorize 时忽略客户端 model、voice 与 instruction', async () => {
    const synthesizeStream = vi.fn(createAudioMock().synthesizeStream)
    const audio = { ...createAudioMock(), synthesizeStream }
    const handlers = captureHandlers({ ai: { audio } })
    const ws = createWsMock()
    handlers.onOpen({}, ws)
    handlers.onMessage({ data: JSON.stringify({ type: 'start', operation: 'synthesize', model: 'expensive-tts', voice: 'ClientVoice', instruction: 'client rule' }) }, ws)
    handlers.onMessage({ data: JSON.stringify({ type: 'text', segmentId: 'seg-1', text: '默认授权' }) }, ws)
    handlers.onMessage({ data: JSON.stringify({ type: 'done' }) }, ws)
    await flush()

    expect(synthesizeStream).toHaveBeenCalledWith(expect.objectContaining({ model: undefined, voice: undefined, instruction: undefined }))
  })

  it('连接结束后调用一次 onSessionEnd 释放并发占用', async () => {
    const onSessionEnd = vi.fn()
    const handlers = captureHandlers({ ai: { audio: createAudioMock() }, onSessionEnd })
    const ws = createWsMock()
    handlers.onOpen({}, ws)
    handlers.onMessage({ data: JSON.stringify({ type: 'start', operation: 'synthesize' }) }, ws)
    handlers.onMessage({ data: JSON.stringify({ type: 'text', segmentId: 'seg-1', text: '结束' }) }, ws)
    handlers.onMessage({ data: JSON.stringify({ type: 'done' }) }, ws)
    await flush()
    handlers.onClose()

    expect(onSessionEnd).toHaveBeenCalledOnce()
    expect(onSessionEnd).toHaveBeenCalledWith(TEST_SESSION, expect.objectContaining({ operation: 'synthesize' }))
  })

  it('createApp 启用 audio 时注册 WebSocket 升级注入器', () => {
    const contract = apiContract.create({})
    const procedures = serv.implement(contract).$context<ServContext>().router({})
    const app = serv.createApp({
      contract,
      procedures,
      audio: { ai: { audio: createAudioMock() }, verifyTicket: async () => ok(TEST_SESSION) },
      http: { openapi: false, docs: false, rpc: false },
    })
    expect(audioWsInjectors.has(app)).toBe(true)
  })
})
