/**
 * @h-ai/serv — 统一语音 WebSocket 接入
 *
 * 基于 `@h-ai/ai` 的 `ai.audio` 提供开箱即用的语音 WebSocket 端点，同时支持非实时 / 实时
 * 的语音识别与语音合成。传输细节（WebSocket 帧、二进制/JSON 编解码）在此内部完成，
 * 客户端只使用统一的领域协议，不接触任何厂商原生事件。
 * @module features/serv-feature-audio
 */

import type { AIFunctions, AudioWsClientMessage, AudioWsServerMessage, AudioWsStartMessage } from '@h-ai/ai'
import type { HaiError, HaiResult } from '@h-ai/core'
import type { Hono } from 'hono'
import type { UpgradeWebSocket, WSContext } from 'hono/ws'
import type { ServSession } from '../serv-context.js'
import { Buffer } from 'node:buffer'
import { core } from '@h-ai/core'

const logger = core.logger.child({ module: 'serv', scope: 'audio-ws' })

/** 语音 WebSocket 接入依赖。 */
export interface AudioWsDeps {
  /** AI 服务对象的语音能力（`ai.audio`）。 */
  readonly ai: Pick<AIFunctions, 'audio'>
  /** 访问令牌校验（提供后连接必须携带有效令牌；未提供则不做鉴权）。 */
  readonly verifyToken?: (token: string) => Promise<HaiResult<ServSession>>
  /** 单条消息字节上限（默认 1 MiB，防止内存放大）。 */
  readonly maxMessageBytes?: number
  /** 单连接累计接收音频字节上限（默认 10 MiB，防止非流式缓冲无限增长）。 */
  readonly maxBufferedBytes?: number
  /** 单连接最长持续时间（毫秒，默认 5 分钟，防止恶意长连接）。 */
  readonly maxSessionMs?: number
}

const DEFAULT_MAX_MESSAGE_BYTES = 1_048_576
const DEFAULT_MAX_BUFFERED_BYTES = 10 * 1024 * 1024
const DEFAULT_MAX_SESSION_MS = 5 * 60 * 1000

/**
 * 在 Hono app 上注册统一语音 WebSocket 路由。
 *
 * @param app - Hono app
 * @param path - 绝对路径（已与 apiPrefix 拼接）
 * @param upgradeWebSocket - 由 `createNodeWebSocket` 提供的升级处理器
 * @param deps - 语音接入依赖
 */
export function registerAudioWsRoute(
  app: Hono,
  path: string,
  upgradeWebSocket: UpgradeWebSocket,
  deps: AudioWsDeps,
): void {
  const maxMessageBytes = deps.maxMessageBytes ?? DEFAULT_MAX_MESSAGE_BYTES
  const maxBufferedBytes = deps.maxBufferedBytes ?? DEFAULT_MAX_BUFFERED_BYTES
  const maxSessionMs = deps.maxSessionMs ?? DEFAULT_MAX_SESSION_MS

  app.get(path, upgradeWebSocket((c) => {
    // 浏览器 WebSocket 无法设置请求头，令牌优先取查询参数 access_token，其次 Authorization 头
    const token = c.req.query('access_token') ?? c.req.header('authorization')?.replace(/^Bearer\s+/i, '')
    const conn = new AudioConnection(deps, token, maxMessageBytes, maxBufferedBytes)
    let sessionTimer: ReturnType<typeof setTimeout> | undefined

    return {
      onOpen(_evt, ws) {
        sessionTimer = setTimeout(() => {
          conn.fail(ws, 'hai:ai:057', 'audio session timeout')
        }, maxSessionMs)
      },
      onMessage(evt, ws) {
        conn.handleMessage(ws, evt.data).catch((error: unknown) => {
          logger.debug('audio ws message handling failed', { error: error instanceof Error ? error.message : String(error) })
        })
      },
      onClose() {
        if (sessionTimer)
          clearTimeout(sessionTimer)
        conn.dispose()
      },
      onError() {
        if (sessionTimer)
          clearTimeout(sessionTimer)
        conn.dispose()
      },
    }
  }))
}

/** 背压友好的异步队列（桥接 WebSocket 事件 → ai.audio 的 AsyncIterable 输入）。 */
class AsyncQueue<T> {
  private items: T[] = []
  private waiting: ((result: IteratorResult<T>) => void) | null = null
  private ended = false

  push(item: T): void {
    if (this.ended)
      return
    if (this.waiting) {
      const w = this.waiting
      this.waiting = null
      w({ value: item, done: false })
    }
    else {
      this.items.push(item)
    }
  }

  end(): void {
    if (this.ended)
      return
    this.ended = true
    if (this.waiting) {
      const w = this.waiting
      this.waiting = null
      w({ value: undefined as never, done: true })
    }
  }

  async* iterate(): AsyncIterableIterator<T> {
    while (true) {
      if (this.items.length > 0) {
        yield this.items.shift() as T
        continue
      }
      if (this.ended)
        return
      const next = await new Promise<IteratorResult<T>>((res) => {
        this.waiting = res
      })
      if (next.done)
        return
      yield next.value
    }
  }
}

/** 单个语音 WebSocket 连接的状态机。 */
class AudioConnection {
  private started = false
  private start?: AudioWsStartMessage
  private readonly audioQueue = new AsyncQueue<Uint8Array>()
  private readonly textQueue = new AsyncQueue<string>()
  private readonly audioBuffer: Uint8Array[] = []
  private receivedBytes = 0
  private readonly controller = new AbortController()
  private closed = false

  constructor(
    private readonly deps: AudioWsDeps,
    private readonly token: string | undefined,
    private readonly maxMessageBytes: number,
    private readonly maxBufferedBytes: number,
  ) {}

  async handleMessage(ws: WSContext, data: unknown): Promise<void> {
    if (this.closed)
      return

    // 二进制帧 → 音频分片
    const bytes = toBytes(data)
    if (bytes) {
      // start 之前不得发送音频帧
      if (!this.started) {
        this.fail(ws, 'hai:ai:050', 'audio frame before start')
        return
      }
      if (bytes.length > this.maxMessageBytes) {
        this.fail(ws, 'hai:ai:058', 'audio frame too large')
        return
      }
      // 累计接收字节背压：超过上限立即终止，避免内存耗尽
      this.receivedBytes += bytes.length
      if (this.receivedBytes > this.maxBufferedBytes) {
        this.fail(ws, 'hai:ai:058', 'buffered audio exceeds limit')
        return
      }
      if (this.start?.stream)
        this.audioQueue.push(bytes)
      else
        this.audioBuffer.push(bytes)
      return
    }

    // 文本帧 → JSON 控制消息
    if (typeof data !== 'string')
      return
    if (data.length > this.maxMessageBytes) {
      this.fail(ws, 'hai:ai:058', 'message too large')
      return
    }
    let message: AudioWsClientMessage
    try {
      message = JSON.parse(data) as AudioWsClientMessage
    }
    catch {
      this.fail(ws, 'hai:ai:050', 'invalid json message')
      return
    }

    if (message.type === 'start') {
      await this.onStart(ws, message)
    }
    else if (!this.started) {
      // start 之前不得发送 text / done 控制帧
      this.fail(ws, 'hai:ai:050', 'message before start')
    }
    else if (message.type === 'text') {
      this.textQueue.push(message.text)
    }
    else if (message.type === 'done') {
      this.audioQueue.end()
      this.textQueue.end()
      if (this.start && !this.start.stream && this.start.operation === 'transcribe')
        await this.runBufferedTranscribe(ws)
    }
  }

  private async onStart(ws: WSContext, message: AudioWsStartMessage): Promise<void> {
    if (this.started) {
      this.fail(ws, 'hai:ai:050', 'session already started')
      return
    }
    this.started = true
    this.start = message

    // 鉴权：配置了 verifyToken 则要求有效令牌
    if (this.deps.verifyToken) {
      if (!this.token) {
        this.fail(ws, 'hai:ai:054', 'missing access token')
        return
      }
      const auth = await this.deps.verifyToken(this.token)
      if (!auth.success) {
        this.fail(ws, 'hai:ai:054', 'unauthorized')
        return
      }
    }

    if (message.operation === 'synthesize')
      void this.runSynthesize(ws, message)
    else if (message.operation === 'transcribe' && message.stream)
      void this.runStreamTranscribe(ws, message)
    // 非流式识别在收到 done 后由 runBufferedTranscribe 处理
  }

  /** 流式识别：桥接持续音频输入，流式返回临时/最终结果与语音起止事件 */
  private async runStreamTranscribe(ws: WSContext, start: AudioWsStartMessage): Promise<void> {
    try {
      const stream = this.deps.ai.audio.transcribeStream({
        audio: {
          chunks: this.audioQueue.iterate(),
          format: start.format ?? 'pcm16',
          sampleRate: start.sampleRate ?? 16000,
          channels: start.channels,
        },
        language: start.language,
        contextHints: start.contextHints,
        model: start.model,
        signal: this.controller.signal,
      })
      for await (const event of stream) {
        if (event.type === 'transcript')
          this.send(ws, { type: 'transcript', text: event.text, final: event.final })
        else if (event.type === 'speech_started')
          this.send(ws, { type: 'speech_started' })
        else if (event.type === 'speech_stopped')
          this.send(ws, { type: 'speech_stopped' })
      }
      this.end(ws)
    }
    catch (error) {
      this.failFromError(ws, error)
    }
  }

  /** 非流式识别：缓冲完整音频后返回单条最终结果 */
  private async runBufferedTranscribe(ws: WSContext): Promise<void> {
    const start = this.start
    if (!start)
      return
    try {
      const result = await this.deps.ai.audio.transcribe({
        audio: {
          data: concat(this.audioBuffer),
          format: start.format ?? 'wav',
          sampleRate: start.sampleRate,
          channels: start.channels,
        },
        language: start.language,
        contextHints: start.contextHints,
        model: start.model,
        signal: this.controller.signal,
      })
      if (!result.success) {
        this.fail(ws, String(result.error.code), result.error.message)
        return
      }
      this.send(ws, { type: 'transcript', text: result.data.text, final: true })
      this.end(ws)
    }
    catch (error) {
      this.failFromError(ws, error)
    }
  }

  /** 语音合成：桥接文本输入，流式返回音频二进制帧 */
  private async runSynthesize(ws: WSContext, start: AudioWsStartMessage): Promise<void> {
    try {
      const stream = this.deps.ai.audio.synthesizeStream({
        text: this.textQueue.iterate(),
        voice: start.voice,
        instruction: start.instruction,
        format: start.format,
        sampleRate: start.sampleRate,
        model: start.model,
        signal: this.controller.signal,
      })
      for await (const audio of stream)
        ws.send(toArrayBuffer(audio))
      this.end(ws)
    }
    catch (error) {
      this.failFromError(ws, error)
    }
  }

  fail(ws: WSContext, code: string, message: string): void {
    this.send(ws, { type: 'error', code, message } satisfies AudioWsServerMessage)
    this.dispose()
    ws.close()
  }

  private failFromError(ws: WSContext, error: unknown): void {
    const hai = error as Partial<HaiError>
    const code = typeof hai?.code === 'string' ? hai.code : 'hai:ai:054'
    const message = error instanceof Error ? error.message : String(error)
    this.fail(ws, code, message)
  }

  private end(ws: WSContext): void {
    this.send(ws, { type: 'end' })
    this.dispose()
    ws.close()
  }

  private send(ws: WSContext, message: AudioWsServerMessage): void {
    if (!this.closed)
      ws.send(JSON.stringify(message))
  }

  dispose(): void {
    if (this.closed)
      return
    this.closed = true
    this.audioQueue.end()
    this.textQueue.end()
    this.controller.abort()
  }
}

/** 将 WebSocket 消息数据转换为二进制字节（非二进制返回 undefined）。 */
function toBytes(data: unknown): Uint8Array | undefined {
  if (typeof data === 'string')
    return undefined
  if (data instanceof ArrayBuffer)
    return new Uint8Array(data)
  if (ArrayBuffer.isView(data))
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  if (Buffer.isBuffer(data))
    return new Uint8Array(data)
  return undefined
}

/** 顺序拼接音频分片。 */
function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

/** 将 Uint8Array 转为独立 ArrayBuffer（供 WSContext.send 二进制发送）。 */
function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(data.length)
  new Uint8Array(buffer).set(data)
  return buffer
}
