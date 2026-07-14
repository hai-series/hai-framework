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
      yield { text: '临时', final: false }
      yield { text: '最终', final: true }
    },
    synthesize: async () => ok({ data: new Uint8Array([1]), format: 'pcm16' }),
    async* synthesizeStream() {
      yield new Uint8Array([1, 2])
      yield new Uint8Array([3, 4])
    },
  }
}

/** 取出 registerAudioWsRoute 注册的连接处理器 */
function captureHandlers(deps: AudioWsDeps, token?: string): WsHandlers {
  let factory: ((c: unknown) => WsHandlers) | undefined
  const app = { get: (_path: string, _handler: unknown) => {} } as unknown as Hono
  const upgradeWebSocket = ((f: (c: unknown) => WsHandlers) => {
    factory = f
    return () => {}
  }) as unknown as UpgradeWebSocket
  registerAudioWsRoute(app, '/api/v1/ai/audio', upgradeWebSocket, deps)
  const honoContext = { req: { query: () => token, header: () => undefined } }
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
      { type: 'transcript', text: '临时', final: false },
      { type: 'transcript', text: '最终', final: true },
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
    handlers.onMessage({ data: JSON.stringify({ type: 'text', text: '你好' }) }, ws)
    handlers.onMessage({ data: JSON.stringify({ type: 'done' }) }, ws)
    await flush()

    const binaryFrames = ws.messages.filter(m => m instanceof ArrayBuffer)
    expect(binaryFrames.length).toBe(2)
    const jsonMsgs = parseJsonMessages(ws)
    expect(jsonMsgs).toEqual([{ type: 'end' }])
  })

  it('配置 verifyToken 时缺失/无效令牌返回错误并关闭', async () => {
    const verifyToken = async (): Promise<HaiResult<{ userId: string, roles: string[], permissions: string[] }>> => err(HaiCommonError.UNAUTHORIZED, 'invalid')
    const handlers = captureHandlers({ ai: { audio: createAudioMock() }, verifyToken }, 'bad-token')
    const ws = createWsMock()
    handlers.onOpen({}, ws)
    handlers.onMessage({ data: JSON.stringify({ type: 'start', operation: 'transcribe', stream: true }) }, ws)
    await flush()

    const msgs = parseJsonMessages(ws)
    expect(msgs[0]).toMatchObject({ type: 'error' })
    expect(ws.close).toHaveBeenCalled()
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

  it('createApp 启用 audio 时注册 WebSocket 升级注入器', () => {
    const contract = apiContract.create({})
    const procedures = serv.implement(contract).$context<ServContext>().router({})
    const app = serv.createApp({
      contract,
      procedures,
      audio: { ai: { audio: createAudioMock() } },
      http: { openapi: false, docs: false, rpc: false },
    })
    expect(audioWsInjectors.has(app)).toBe(true)
  })
})
