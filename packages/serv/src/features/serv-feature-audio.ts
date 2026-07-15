/**
 * @h-ai/serv — 统一语音 WebSocket 接入
 *
 * 基于 `@h-ai/ai` 的 `ai.audio` 提供开箱即用的语音 WebSocket 端点，同时支持非实时 / 实时
 * 的语音识别与语音合成。传输细节（WebSocket 帧、二进制/JSON 编解码）在此内部完成，
 * 客户端只使用统一的领域协议，不接触任何厂商原生事件。
 *
 * 安全与健壮性：
 * - 连接建立后立即用一次性 ticket 完成鉴权（独立预鉴权超时），未鉴权不处理任何业务帧；
 * - 每一帧经运行时 Zod 校验，按严格状态机接受（识别只收音频、合成只收文本、start/done 各一次）；
 * - 输入队列、消息积压、发送缓冲均有上限，超限即以领域错误关闭，取消时级联中止。
 * @module features/serv-feature-audio
 */

import type { AIFunctions, AudioWsClientMessage, AudioWsServerMessage, AudioWsStartMessage, SynthesisTextSegment } from '@h-ai/ai'
import type { HaiError, HaiResult } from '@h-ai/core'
import type { Hono } from 'hono'
import type { UpgradeWebSocket, WSContext } from 'hono/ws'
import type { AudioTicketGrant, AudioTicketVerification, AuthorizedAudioRequest } from '../serv-app.js'
import type { ServSession } from '../serv-context.js'
import { Buffer } from 'node:buffer'
import { AudioWsClientMessageSchema } from '@h-ai/ai'
import { core, err, HaiCommonError, ok } from '@h-ai/core'

const logger = core.logger.child({ module: 'serv', scope: 'audio-ws' })

/** 语音 WebSocket 接入依赖。 */
export interface AudioWsDeps {
  /** AI 服务对象的语音能力（`ai.audio`）。 */
  readonly ai: Pick<AIFunctions, 'audio'>
  /** 校验并原子消费短期、一次性的 Audio ticket，返回会话与可选授权。 */
  readonly verifyTicket: (ticket: string) => Promise<HaiResult<AudioTicketVerification>>
  /** 基于会话授权操作、模型、音色、格式和配额；第三参为票据绑定授权（如有）。 */
  readonly authorize?: (session: ServSession, request: AudioWsStartMessage, grant?: AudioTicketGrant) => Promise<HaiResult<AuthorizedAudioRequest>>
  /** 会话结束时释放应用侧并发占用。 */
  readonly onSessionEnd?: (session: ServSession, request: AuthorizedAudioRequest) => void | Promise<void>
  /** 单条消息字节上限（默认 1 MiB，防止内存放大）。 */
  readonly maxMessageBytes?: number
  /** 单连接累计接收音频字节上限（默认 10 MiB，防止非流式缓冲无限增长）。 */
  readonly maxBufferedBytes?: number
  /** 单连接累计接收文本字节上限（默认 1 MiB，防止 TTS 文本输入无限增长与上游费用失控）。 */
  readonly maxTextBytes?: number
  /** 单连接最长持续时间（毫秒，默认 5 分钟，防止恶意长连接）。 */
  readonly maxSessionMs?: number
  /** 预鉴权超时（毫秒，默认 5000）：连接建立后未完成鉴权并收到 start 即关闭。 */
  readonly preAuthTimeoutMs?: number
  /** 未处理消息积压上限（默认 256）：串行处理链积压超过此数立即关闭。 */
  readonly maxPendingMessages?: number
  /** 发送缓冲高水位（字节，默认 8 MiB）：bufferedAmount 超过即关闭慢客户端。 */
  readonly maxSendBufferBytes?: number
}

const DEFAULT_MAX_MESSAGE_BYTES = 1_048_576
const DEFAULT_MAX_BUFFERED_BYTES = 10 * 1024 * 1024
const DEFAULT_MAX_TEXT_BYTES = 1 * 1024 * 1024
const DEFAULT_MAX_SESSION_MS = 5 * 60 * 1000
const DEFAULT_PRE_AUTH_TIMEOUT_MS = 5000
const DEFAULT_MAX_PENDING_MESSAGES = 256
const DEFAULT_MAX_SEND_BUFFER_BYTES = 8 * 1024 * 1024
/** 输入队列单向最大缓存帧数（背压：超过即以领域错误关闭）。 */
const MAX_QUEUE_ITEMS = 4096

// 领域错误码（对齐 @h-ai/ai audio 错误段 hai:ai:05x）
const CODE_PROTOCOL = 'hai:ai:050'
const CODE_TICKET = 'hai:ai:054'
const CODE_TOO_LARGE = 'hai:ai:058'
const CODE_TIMEOUT = 'hai:ai:057'

/** 连接状态机 */
type ConnectionState
  = | 'connecting'
    | 'authenticated'
    | 'awaiting_start'
    | 'transcribing'
    | 'synthesizing'
    | 'input_completed'
    | 'completed'
    | 'failed'
    | 'cancelled'

/** 连接级限额。 */
interface ConnectionLimits {
  readonly maxMessageBytes: number
  readonly maxBufferedBytes: number
  readonly maxTextBytes: number
  readonly maxPendingMessages: number
  readonly maxSendBufferBytes: number
}

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
  const limits: ConnectionLimits = {
    maxMessageBytes: deps.maxMessageBytes ?? DEFAULT_MAX_MESSAGE_BYTES,
    maxBufferedBytes: deps.maxBufferedBytes ?? DEFAULT_MAX_BUFFERED_BYTES,
    maxTextBytes: deps.maxTextBytes ?? DEFAULT_MAX_TEXT_BYTES,
    maxPendingMessages: deps.maxPendingMessages ?? DEFAULT_MAX_PENDING_MESSAGES,
    maxSendBufferBytes: deps.maxSendBufferBytes ?? DEFAULT_MAX_SEND_BUFFER_BYTES,
  }
  const maxSessionMs = deps.maxSessionMs ?? DEFAULT_MAX_SESSION_MS
  const preAuthTimeoutMs = deps.preAuthTimeoutMs ?? DEFAULT_PRE_AUTH_TIMEOUT_MS

  app.get(path, upgradeWebSocket((c) => {
    const ticket = c.req.query('ticket')
    const conn = new AudioConnection(deps, ticket, limits)
    let sessionTimer: ReturnType<typeof setTimeout> | undefined

    return {
      onOpen(_evt, ws) {
        // 连接建立即启动鉴权与预鉴权超时；会话超时另行计时。
        conn.begin(ws, preAuthTimeoutMs)
        sessionTimer = setTimeout(() => {
          conn.fail(ws, CODE_TIMEOUT, 'audio session timeout')
        }, maxSessionMs)
      },
      onMessage(evt, ws) {
        // 串行处理同一连接的消息，鉴权完成前不处理业务帧（付费 ASR/TTS）
        conn.enqueue(ws, evt.data)
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

/** 背压友好的有界异步队列（桥接 WebSocket 事件 → ai.audio 的 AsyncIterable 输入）。 */
class AsyncQueue<T> {
  private items: T[] = []
  private waiting: ((result: IteratorResult<T>) => void) | null = null
  private ended = false

  constructor(private readonly maxItems: number) {}

  /** 入队；超过上限返回 false（背压信号，调用方据此关闭连接）。 */
  push(item: T): boolean {
    if (this.ended)
      return true
    if (this.waiting) {
      const w = this.waiting
      this.waiting = null
      w({ value: item, done: false })
      return true
    }
    if (this.items.length >= this.maxItems)
      return false
    this.items.push(item)
    return true
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
  private state: ConnectionState = 'connecting'
  private start?: AudioWsStartMessage
  private session?: ServSession
  private grant?: AudioTicketGrant
  private authorizedRequest?: AuthorizedAudioRequest
  private doneReceived = false
  private readonly audioQueue: AsyncQueue<Uint8Array>
  private readonly textQueue: AsyncQueue<SynthesisTextSegment>
  private readonly audioBuffer: Uint8Array[] = []
  private receivedBytes = 0
  private receivedTextBytes = 0
  /** 合成文本段 ID 去重（同一会话内唯一）。 */
  private readonly seenSegmentIds = new Set<string>()
  private readonly controller = new AbortController()
  private closed = false
  private preAuthTimer?: ReturnType<typeof setTimeout>
  /** 待处理消息数（含鉴权任务）：积压过多即关闭。 */
  private pending = 0
  /** 消息串行处理链：确保同一连接的消息按到达顺序处理，鉴权完成前不处理业务帧。 */
  private queue: Promise<void> = Promise.resolve()

  constructor(
    private readonly deps: AudioWsDeps,
    private readonly ticket: string | undefined,
    private readonly limits: ConnectionLimits,
  ) {
    this.audioQueue = new AsyncQueue<Uint8Array>(MAX_QUEUE_ITEMS)
    this.textQueue = new AsyncQueue<SynthesisTextSegment>(MAX_QUEUE_ITEMS)
  }

  /** 连接建立：立即鉴权（串行链首个任务）并启动预鉴权超时。 */
  begin(ws: WSContext, preAuthTimeoutMs: number): void {
    this.preAuthTimer = setTimeout(() => {
      // 鉴权完成并进入业务态前未收到 start：以预鉴权超时关闭（独立于会话超时）
      if (this.state === 'connecting' || this.state === 'authenticated' || this.state === 'awaiting_start')
        this.fail(ws, CODE_TIMEOUT, 'pre-auth timeout: authenticate and send start in time')
    }, preAuthTimeoutMs)
    this.chain(ws, () => this.authenticate(ws))
  }

  /** 将任务追加到串行处理链（含积压上限保护）。 */
  private chain(ws: WSContext, task: () => Promise<void>): void {
    if (this.closed)
      return
    this.pending++
    if (this.pending > this.limits.maxPendingMessages) {
      // 积压超限：立即以领域错误关闭，避免 Promise 链无界增长
      this.pending--
      this.fail(ws, CODE_TOO_LARGE, 'too many pending messages')
      return
    }
    this.queue = this.queue
      .then(() => task())
      .catch((error: unknown) => {
        logger.debug('audio ws task failed', { error: error instanceof Error ? error.message : String(error) })
        if (!this.closed)
          this.failFromError(ws, error)
      })
      .finally(() => {
        this.pending--
      })
  }

  /** 将消息追加到串行处理链，保证按序处理（鉴权完成前不处理业务帧）。 */
  enqueue(ws: WSContext, data: unknown): void {
    this.chain(ws, () => this.handleMessage(ws, data))
  }

  /** 连接建立即执行：校验并原子消费 ticket，成功后进入 awaiting_start。 */
  private async authenticate(ws: WSContext): Promise<void> {
    if (this.closed)
      return
    if (!this.ticket) {
      this.fail(ws, CODE_TICKET, 'missing audio ticket')
      return
    }
    const verified = await this.deps.verifyTicket(this.ticket)
    if (this.closed)
      return
    if (!verified.success) {
      this.fail(ws, String(verified.error.code), verified.error.message)
      return
    }
    this.session = verified.data.session
    this.grant = verified.data.grant
    this.state = 'awaiting_start'
  }

  async handleMessage(ws: WSContext, data: unknown): Promise<void> {
    if (this.closed)
      return

    // 二进制帧 → 音频分片
    const bytes = toBytes(data)
    if (bytes) {
      this.handleAudioFrame(ws, bytes)
      return
    }

    // 文本帧 → JSON 控制消息（UTF-8 实际字节计，非 JS 字符数）
    if (typeof data !== 'string')
      return
    if (Buffer.byteLength(data, 'utf8') > this.limits.maxMessageBytes) {
      this.fail(ws, CODE_TOO_LARGE, 'message too large')
      return
    }

    let raw: unknown
    try {
      raw = JSON.parse(data)
    }
    catch {
      this.fail(ws, CODE_PROTOCOL, 'invalid json message')
      return
    }

    // 运行时结构校验：非法帧在进入业务逻辑前拒绝（TypeScript 类型在网络运行时不生效）
    const parsed = AudioWsClientMessageSchema.safeParse(raw)
    if (!parsed.success) {
      this.fail(ws, CODE_PROTOCOL, `invalid message: ${parsed.error.issues[0]?.message ?? 'schema validation failed'}`)
      return
    }
    const message = parsed.data as AudioWsClientMessage

    if (message.type === 'start') {
      await this.onStart(ws, message)
      return
    }

    // 非 start 帧必须在鉴权且已 start 之后
    if (this.state === 'connecting' || this.state === 'authenticated' || this.state === 'awaiting_start') {
      this.fail(ws, CODE_PROTOCOL, 'message before start')
      return
    }

    if (message.type === 'text')
      this.handleTextFrame(ws, message)
    else if (message.type === 'done')
      this.handleDone(ws)
  }

  /** 处理音频二进制帧（仅识别操作、输入未结束时接受）。 */
  private handleAudioFrame(ws: WSContext, bytes: Uint8Array): void {
    if (this.state !== 'transcribing') {
      // 合成会话或未 start / 已结束时收到音频帧：协议违规
      this.fail(ws, CODE_PROTOCOL, 'unexpected audio frame')
      return
    }
    if (bytes.length > this.limits.maxMessageBytes) {
      this.fail(ws, CODE_TOO_LARGE, 'audio frame too large')
      return
    }
    this.receivedBytes += bytes.length
    if (this.receivedBytes > this.limits.maxBufferedBytes) {
      this.fail(ws, CODE_TOO_LARGE, 'buffered audio exceeds limit')
      return
    }
    if (this.start?.stream) {
      if (!this.audioQueue.push(bytes))
        this.fail(ws, CODE_TOO_LARGE, 'audio backpressure limit exceeded')
    }
    else {
      this.audioBuffer.push(bytes)
    }
  }

  /** 处理文本控制帧（仅合成操作、输入未结束时接受；segmentId 唯一）。 */
  private handleTextFrame(ws: WSContext, message: { segmentId: string, text: string }): void {
    if (this.state !== 'synthesizing') {
      this.fail(ws, CODE_PROTOCOL, 'unexpected text frame')
      return
    }
    if (this.seenSegmentIds.has(message.segmentId)) {
      this.fail(ws, CODE_PROTOCOL, `duplicate segmentId: ${message.segmentId}`)
      return
    }
    this.receivedTextBytes += Buffer.byteLength(message.text, 'utf8')
    if (this.receivedTextBytes > this.limits.maxTextBytes) {
      this.fail(ws, CODE_TOO_LARGE, 'buffered text exceeds limit')
      return
    }
    this.seenSegmentIds.add(message.segmentId)
    if (!this.textQueue.push({ id: message.segmentId, text: message.text }))
      this.fail(ws, CODE_TOO_LARGE, 'text backpressure limit exceeded')
  }

  /** 处理输入结束帧（只允许一次）。 */
  private handleDone(ws: WSContext): void {
    if (this.doneReceived) {
      this.fail(ws, CODE_PROTOCOL, 'duplicate done')
      return
    }
    this.doneReceived = true
    this.audioQueue.end()
    this.textQueue.end()
    if (this.state === 'transcribing' || this.state === 'synthesizing')
      this.state = 'input_completed'
    if (this.start && !this.start.stream && this.start.operation === 'transcribe')
      void this.runBufferedTranscribe(ws)
  }

  private async onStart(ws: WSContext, message: AudioWsStartMessage): Promise<void> {
    // 必须已鉴权且尚未开始
    if (this.state === 'connecting' || this.state === 'authenticated') {
      this.fail(ws, CODE_TICKET, 'not authenticated')
      return
    }
    if (this.state !== 'awaiting_start') {
      this.fail(ws, CODE_PROTOCOL, 'session already started')
      return
    }
    const session = this.session
    if (!session) {
      this.fail(ws, CODE_TICKET, 'not authenticated')
      return
    }

    const authorized = this.deps.authorize
      ? await this.deps.authorize(session, message, this.grant)
      : this.defaultAuthorize(message)
    if (this.closed)
      return
    if (!authorized.success) {
      this.fail(ws, String(authorized.error.code), authorized.error.message)
      return
    }

    const confirmed: AudioWsStartMessage = {
      ...message,
      operation: authorized.data.operation,
      model: authorized.data.model,
      voice: authorized.data.voice,
      instruction: authorized.data.instruction,
      format: authorized.data.format,
      sampleRate: authorized.data.sampleRate,
    }

    this.start = confirmed
    this.authorizedRequest = authorized.data
    // 进入业务态并清除预鉴权超时
    this.state = confirmed.operation === 'synthesize' ? 'synthesizing' : 'transcribing'
    if (this.preAuthTimer) {
      clearTimeout(this.preAuthTimer)
      this.preAuthTimer = undefined
    }

    if (confirmed.operation === 'synthesize')
      void this.runSynthesize(ws, confirmed)
    else if (confirmed.operation === 'transcribe' && confirmed.stream)
      void this.runStreamTranscribe(ws, confirmed)
    // 非流式识别在收到 done 后由 runBufferedTranscribe 处理
  }

  /** 无 authorize 回调时的默认授权：仅保留操作与格式，并交叉校验票据 grant。 */
  private defaultAuthorize(message: AudioWsStartMessage): HaiResult<AuthorizedAudioRequest> {
    // 票据绑定了操作但与请求不符：拒绝（防止越权复用票据）
    if (this.grant?.operation && this.grant.operation !== message.operation) {
      return err(HaiCommonError.FORBIDDEN, 'operation not permitted by ticket')
    }
    return ok({
      operation: message.operation,
      // 无 authorize 回调时不透传客户端 model/voice/instruction；仅采用票据 grant 绑定的 model
      model: this.grant?.model,
      format: message.format,
    })
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
        if (this.closed)
          return
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
      if (this.closed)
        return
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

  /** 语音合成：桥接文本输入，流式返回音频二进制帧（带发送缓冲背压） */
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
      for await (const event of stream) {
        if (this.closed)
          return
        if (event.type === 'audio') {
          // 发送缓冲高水位保护：慢客户端导致底层缓冲膨胀时以领域错误关闭
          if (sendBufferedAmount(ws) > this.limits.maxSendBufferBytes) {
            this.fail(ws, CODE_TOO_LARGE, 'client send buffer exceeded high-water mark')
            return
          }
          ws.send(toArrayBuffer(event.data))
        }
        else {
          this.send(ws, event)
        }
      }
      this.end(ws)
    }
    catch (error) {
      this.failFromError(ws, error)
    }
  }

  fail(ws: WSContext, code: string, message: string): void {
    if (this.closed)
      return
    this.state = 'failed'
    this.send(ws, { type: 'error', code, message } satisfies AudioWsServerMessage)
    this.dispose()
    ws.close()
  }

  private failFromError(ws: WSContext, error: unknown): void {
    if (this.closed)
      return
    const hai = error as Partial<HaiError>
    const code = typeof hai?.code === 'string' ? hai.code : CODE_TICKET
    const message = error instanceof Error ? error.message : String(error)
    this.fail(ws, code, message)
  }

  private end(ws: WSContext): void {
    if (this.closed)
      return
    this.state = 'completed'
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
    if (this.state !== 'completed' && this.state !== 'failed')
      this.state = 'cancelled'
    if (this.preAuthTimer) {
      clearTimeout(this.preAuthTimer)
      this.preAuthTimer = undefined
    }
    this.audioQueue.end()
    this.textQueue.end()
    // 级联取消：中止上游 provider 流与所有等待
    this.controller.abort()
    if (this.session && this.authorizedRequest && this.deps.onSessionEnd) {
      void Promise.resolve(this.deps.onSessionEnd(this.session, this.authorizedRequest)).catch((error: unknown) => {
        logger.warn('audio ws session end hook failed', { error: error instanceof Error ? error.message : String(error) })
      })
    }
  }
}

/** 读取 WebSocket 底层发送缓冲字节数（不可用时返回 0）。 */
function sendBufferedAmount(ws: WSContext): number {
  const raw = (ws as { raw?: { bufferedAmount?: number } }).raw
  return typeof raw?.bufferedAmount === 'number' ? raw.bufferedAmount : 0
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
