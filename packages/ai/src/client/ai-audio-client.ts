/**
 * @h-ai/ai/client — 浏览器语音客户端
 *
 * 通过统一 WebSocket 连接 `@h-ai/serv` 的语音入口，向浏览器暴露与 Node 端一致的
 * `ai.audio.*` 业务 API。WebSocket 建立、消息编解码等传输细节在此内部完成，
 * 调用方不接触任何厂商原生事件。
 * @module client/ai-audio-client
 */

import type {
  SynthesisEvent,
  SynthesisRequest,
  SynthesisResult,
  SynthesisStreamRequest,
  SynthesisTextSegment,
  TranscriptionEvent,
  TranscriptionRequest,
  TranscriptionResult,
  TranscriptionStreamRequest,
} from '../audio/ai-audio-types.js'
import type { AudioWsServerMessage, AudioWsStartMessage } from '../audio/ai-audio-ws-protocol.js'

// ─── 客户端配置 ───

/** 浏览器语音客户端配置 */
export interface AudioClientConfig {
  /** 语音 WebSocket 完整 URL（如 `wss://host/api/v1/ai/audio`） */
  url: string
  /**
   * 获取短期、一次性的 Audio WebSocket ticket
   *
   * ticket 应由已登录 HTTP 请求签发，并在服务端首次校验时原子消费。
   */
  getTicket: () => string | Promise<string>
}

/**
 * 浏览器语音操作接口
 *
 * 与 Node 端 `AudioOperations` 业务形态一致；出错时抛出异常（浏览器 Client 约定）。
 */
export interface AudioClientOperations {
  /** 将完整音频识别为完整文本 */
  transcribe: (request: TranscriptionRequest) => Promise<TranscriptionResult>
  /** 持续输入音频或增量返回识别文本（含语音起止事件） */
  transcribeStream: (request: TranscriptionStreamRequest) => AsyncIterable<TranscriptionEvent>
  /** 将完整文本合成为完整音频 */
  synthesize: (request: SynthesisRequest) => Promise<SynthesisResult>
  /** 持续输入文本段并按段输出结构化音频事件 */
  synthesizeStream: (request: SynthesisStreamRequest) => AsyncIterable<SynthesisEvent>
}

// ─── 浏览器 WebSocket 辅助 ───

/** WebSocket 收到的消息 */
interface BrowserWsMessage {
  text?: string
  binary?: Uint8Array
  isBinary: boolean
}

/** 浏览器 WebSocket 连接封装 */
interface BrowserWsConnection {
  send: (data: string | Uint8Array) => void
  messages: () => AsyncIterableIterator<BrowserWsMessage>
  close: () => void
}

/** 建立浏览器 WebSocket 连接（内部消息队列 → 异步迭代） */
function openBrowserWs(url: string, signal?: AbortSignal): Promise<BrowserWsConnection> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.binaryType = 'arraybuffer'

    const queue: BrowserWsMessage[] = []
    let waiting: ((result: IteratorResult<BrowserWsMessage>) => void) | null = null
    let closed = false
    let opened = false
    let failure: Error | null = null

    const onAbort = (): void => ws.close()

    function settleClosed(): void {
      if (closed)
        return
      closed = true
      signal?.removeEventListener('abort', onAbort)
      if (waiting) {
        const w = waiting
        waiting = null
        w({ value: undefined, done: true })
      }
    }

    function push(message: BrowserWsMessage): void {
      if (waiting) {
        const w = waiting
        waiting = null
        w({ value: message, done: false })
      }
      else {
        queue.push(message)
      }
    }

    ws.onmessage = (event: MessageEvent): void => {
      if (typeof event.data === 'string')
        push({ isBinary: false, text: event.data })
      else
        push({ isBinary: true, binary: new Uint8Array(event.data as ArrayBuffer) })
    }
    ws.onerror = (): void => {
      if (!opened) {
        failure = new Error('Audio WebSocket connection failed')
        settleClosed()
        reject(failure)
      }
    }
    ws.onclose = (): void => settleClosed()

    if (signal) {
      if (signal.aborted)
        onAbort()
      else
        signal.addEventListener('abort', onAbort, { once: true })
    }

    ws.onopen = (): void => {
      opened = true
      resolve({
        // DOM WebSocket.send 的 BufferSource 泛型限定为 ArrayBuffer，Uint8Array 需显式收窄
        send: data => ws.send(data as string | Uint8Array<ArrayBuffer>),
        async* messages() {
          while (true) {
            if (queue.length > 0) {
              yield queue.shift() as BrowserWsMessage
              continue
            }
            if (closed) {
              if (failure)
                throw failure
              return
            }
            const next = await new Promise<IteratorResult<BrowserWsMessage>>((res) => {
              waiting = res
            })
            if (next.done) {
              if (failure)
                throw failure
              return
            }
            yield next.value
          }
        },
        close: () => ws.close(),
      })
    }
  })
}

// ─── 客户端实现 ───

/**
 * 创建浏览器语音客户端
 *
 * @param config - 语音客户端配置
 * @returns 浏览器语音操作接口
 */
export function createAudioClient(config: AudioClientConfig): AudioClientOperations {
  async function buildUrl(): Promise<string> {
    const ticket = await config.getTicket()
    if (!ticket)
      throw new Error('Audio WebSocket ticket is required')
    const separator = config.url.includes('?') ? '&' : '?'
    return `${config.url}${separator}ticket=${encodeURIComponent(ticket)}`
  }

  function startMessage(operation: 'transcribe' | 'synthesize', extra: Partial<AudioWsStartMessage>): string {
    return JSON.stringify({ type: 'start', operation, ...extra } satisfies AudioWsStartMessage)
  }

  async function* transcribeStream(request: TranscriptionStreamRequest): AsyncIterable<TranscriptionEvent> {
    const conn = await openBrowserWs(await buildUrl(), request.signal)
    try {
      const format = request.audio.format
      const sampleRate = request.audio.sampleRate
      conn.send(startMessage('transcribe', { stream: true, model: request.model, language: request.language, contextHints: request.contextHints, format, sampleRate, channels: request.audio.channels }))

      const sendAudio = (async () => {
        if ('chunks' in request.audio) {
          for await (const part of request.audio.chunks)
            conn.send(part)
        }
        else {
          conn.send(request.audio.data)
        }
        conn.send(JSON.stringify({ type: 'done' }))
      })()
      let sendError: unknown
      sendAudio.catch((e: unknown) => {
        sendError = e
      })

      for await (const message of conn.messages()) {
        if (message.isBinary || !message.text)
          continue
        const event = JSON.parse(message.text) as AudioWsServerMessage
        if (event.type === 'transcript')
          yield { type: 'transcript', text: event.text, final: event.final }
        else if (event.type === 'speech_started')
          yield { type: 'speech_started' }
        else if (event.type === 'speech_stopped')
          yield { type: 'speech_stopped' }
        else if (event.type === 'error')
          throw new Error(`${event.code}: ${event.message}`)
        else if (event.type === 'end')
          break
      }
      if (sendError)
        throw sendError
    }
    finally {
      conn.close()
    }
  }

  async function transcribe(request: TranscriptionRequest): Promise<TranscriptionResult> {
    // 完整识别：服务端缓冲全部音频后返回单条最终结果
    const conn = await openBrowserWs(await buildUrl(), request.signal)
    try {
      conn.send(startMessage('transcribe', { stream: false, model: request.model, language: request.language, contextHints: request.contextHints, format: request.audio.format, sampleRate: request.audio.sampleRate, channels: request.audio.channels }))
      conn.send(request.audio.data)
      conn.send(JSON.stringify({ type: 'done' }))

      let text = ''
      for await (const message of conn.messages()) {
        if (message.isBinary || !message.text)
          continue
        const event = JSON.parse(message.text) as AudioWsServerMessage
        if (event.type === 'transcript')
          text = event.text
        else if (event.type === 'error')
          throw new Error(`${event.code}: ${event.message}`)
        else if (event.type === 'end')
          break
      }
      return { text }
    }
    finally {
      conn.close()
    }
  }

  async function* synthesizeStream(request: SynthesisStreamRequest): AsyncIterable<SynthesisEvent> {
    const conn = await openBrowserWs(await buildUrl(), request.signal)
    try {
      conn.send(startMessage('synthesize', { model: request.model, voice: request.voice, instruction: request.instruction, format: request.format, sampleRate: request.sampleRate }))

      const sendText = (async () => {
        const segments = isSynthesisTextSegment(request.text) ? singleSegment(request.text) : request.text
        for await (const segment of segments)
          conn.send(JSON.stringify({ type: 'text', segmentId: segment.id, text: segment.text }))
        conn.send(JSON.stringify({ type: 'done' }))
      })()
      let sendError: unknown
      sendText.catch((e: unknown) => {
        sendError = e
      })

      let activeSegmentId: string | undefined
      for await (const message of conn.messages()) {
        if (message.isBinary && message.binary) {
          if (!activeSegmentId)
            throw new Error('Audio frame received outside a synthesis segment')
          yield { type: 'audio', segmentId: activeSegmentId, data: message.binary }
          continue
        }
        if (!message.text)
          continue
        const event = JSON.parse(message.text) as AudioWsServerMessage
        if (event.type === 'segment_started') {
          if (activeSegmentId)
            throw new Error('Synthesis segment started before the previous segment completed')
          activeSegmentId = event.segmentId
          yield event
        }
        else if (event.type === 'segment_done') {
          if (activeSegmentId !== event.segmentId)
            throw new Error('Synthesis segment completion does not match the active segment')
          yield event
          activeSegmentId = undefined
        }
        else if (event.type === 'error') {
          throw new Error(`${event.code}: ${event.message}`)
        }
        else if (event.type === 'end') {
          break
        }
      }
      if (sendError)
        throw sendError
    }
    finally {
      conn.close()
    }
  }

  async function synthesize(request: SynthesisRequest): Promise<SynthesisResult> {
    const chunks: Uint8Array[] = []
    for await (const event of synthesizeStream({ ...request, text: { id: 'synthesis', text: request.text } })) {
      if (event.type === 'audio')
        chunks.push(event.data)
    }
    const total = chunks.reduce((sum, c) => sum + c.length, 0)
    const data = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      data.set(chunk, offset)
      offset += chunk.length
    }
    const outFormat = request.format ?? 'pcm16'
    return { data, format: outFormat, sampleRate: outFormat === 'pcm16' ? (request.sampleRate ?? 24000) : undefined, channels: 1 }
  }

  return { transcribe, transcribeStream, synthesize, synthesizeStream }
}

function isSynthesisTextSegment(value: SynthesisStreamRequest['text']): value is SynthesisTextSegment {
  return typeof value === 'object' && value !== null && 'id' in value && 'text' in value
}

async function* singleSegment(segment: SynthesisTextSegment): AsyncIterable<SynthesisTextSegment> {
  yield segment
}

/** 未配置语音入口时的占位实现（调用即抛出，提示需配置 audio） */
export function createUnconfiguredAudioClient(): AudioClientOperations {
  const message = 'Audio client not configured. Provide `audio` in createAIClient() config.'
  return {
    transcribe: () => Promise.reject(new Error(message)),
    async* transcribeStream() { throw new Error(message) },
    synthesize: () => Promise.reject(new Error(message)),
    async* synthesizeStream() { throw new Error(message) },
  }
}
