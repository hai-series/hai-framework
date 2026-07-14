/**
 * @h-ai/ai — Audio Provider 内部接口与共享传输辅助
 *
 * 定义 audio 子系统内部的协议适配接口 `AudioProvider`，以及各 Provider 复用的
 * Node WebSocket 连接、Base64、取消等底层辅助。这些类型与函数是 audio 子系统内部实现，
 * 不从 `@h-ai/ai` 根入口导出，也不作为模块消费者需要了解的概念。
 * @internal
 * @module audio/providers/ai-audio-provider
 */

import type { HaiError, HaiErrorDef, HaiResult } from '@h-ai/core'

import type { ResolvedAudioModel } from '../../ai-config.js'
import type {
  AudioContent,
  AudioFormat,
  AudioInputStream,
  SynthesisResult,
  TranscriptionChunk,
  TranscriptionResult,
} from '../ai-audio-types.js'

import { Buffer } from 'node:buffer'
import { core } from '@h-ai/core'
import WebSocket from 'ws'

// ─── Provider 请求类型（已解析模型 + 公共请求字段） ───

/** Provider 层完整识别请求 */
export interface ProviderTranscriptionRequest {
  /** 已解析模型配置 */
  model: ResolvedAudioModel
  /** 完整音频 */
  audio: AudioContent
  /** 语言提示 */
  language?: string
  /** 取消信号 */
  signal?: AbortSignal
}

/** Provider 层流式识别请求 */
export interface ProviderTranscriptionStreamRequest {
  /** 已解析模型配置 */
  model: ResolvedAudioModel
  /** 完整音频或持续音频输入流 */
  audio: AudioContent | AudioInputStream
  /** 语言提示 */
  language?: string
  /** 取消信号 */
  signal?: AbortSignal
}

/** Provider 层完整合成请求 */
export interface ProviderSynthesisRequest {
  /** 已解析模型配置 */
  model: ResolvedAudioModel
  /** 待合成文本 */
  text: string
  /** 音色 */
  voice?: string
  /** 输出格式 */
  format?: AudioFormat
  /** 输出采样率 */
  sampleRate?: number
  /** 取消信号 */
  signal?: AbortSignal
}

/** Provider 层流式合成请求 */
export interface ProviderSynthesisStreamRequest {
  /** 已解析模型配置 */
  model: ResolvedAudioModel
  /** 完整文本或持续文本流 */
  text: string | AsyncIterable<string>
  /** 音色 */
  voice?: string
  /** 输出格式 */
  format?: AudioFormat
  /** 输出采样率 */
  sampleRate?: number
  /** 取消信号 */
  signal?: AbortSignal
}

/**
 * Audio Provider 内部接口
 *
 * 每个平台一个实现，负责厂商协议转换、连接、响应解析与错误映射。
 * 使用工厂函数 + 闭包实现，不使用抽象基类。
 */
export interface AudioProvider {
  /** 完整语音识别 */
  transcribe: (request: ProviderTranscriptionRequest) => Promise<HaiResult<TranscriptionResult>>
  /** 流式语音识别 */
  transcribeStream: (request: ProviderTranscriptionStreamRequest) => AsyncIterable<TranscriptionChunk>
  /** 完整语音合成 */
  synthesize: (request: ProviderSynthesisRequest) => Promise<HaiResult<SynthesisResult>>
  /** 流式语音合成 */
  synthesizeStream: (request: ProviderSynthesisStreamRequest) => AsyncIterable<Uint8Array>
}

// ─── Base64 辅助 ───

/** 将二进制数据编码为 Base64 字符串 */
export function toBase64(data: Uint8Array): string {
  return Buffer.from(data).toString('base64')
}

/** 将 Base64 字符串解码为二进制数据 */
export function fromBase64(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, 'base64'))
}

/** 顺序拼接多个二进制分片 */
export function concatChunks(chunks: Uint8Array[]): Uint8Array {
  return new Uint8Array(Buffer.concat(chunks.map(c => Buffer.from(c))))
}

/** 提取错误对象的简要消息（不含敏感请求体 / 凭据） */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 构造可抛出的 HaiError（供流式 async generator 在迭代期间抛出）
 *
 * @internal
 */
export function audioError(def: HaiErrorDef, message: string, cause?: unknown): HaiError {
  return core.error.buildHaiErrorInst(def, message, cause)
}

// ─── Node WebSocket 连接辅助 ───

/** WebSocket 收到的单条消息 */
export interface AudioWsMessage {
  /** 文本帧的字符串内容（`isBinary=false` 时有效） */
  text?: string
  /** 二进制帧内容（`isBinary=true` 时有效） */
  binary?: Uint8Array
  /** 是否为二进制帧 */
  isBinary: boolean
}

/** WebSocket 连接封装（隐藏 ws 事件模型，向 Provider 暴露异步迭代） */
export interface AudioWsConnection {
  /** 发送文本或二进制帧 */
  send: (data: string | Uint8Array) => void
  /** 按到达顺序异步迭代服务端消息，连接关闭时正常结束，出错时抛出 */
  messages: () => AsyncIterableIterator<AudioWsMessage>
  /** 主动关闭连接并释放资源 */
  close: () => void
}

const logger = core.logger.child({ module: 'ai', scope: 'audio-ws' })

/**
 * 建立 Node WebSocket 连接
 *
 * 内部维护消息队列，将 ws 的事件模型转换为背压友好的异步迭代。连接失败或超时返回 rejected Promise。
 * 传入的 `signal` 触发时立即关闭连接并终止迭代。
 *
 * @internal
 */
export function openAudioWebSocket(
  url: string,
  headers: Record<string, string>,
  options?: { signal?: AbortSignal, timeout?: number },
): Promise<AudioWsConnection> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers, handshakeTimeout: options?.timeout ?? 15000 })
    ws.binaryType = 'arraybuffer'

    // 消息队列 + 等待者：经典异步队列，实现背压友好的 for await
    const queue: AudioWsMessage[] = []
    let waiting: ((result: IteratorResult<AudioWsMessage>) => void) | null = null
    let closed = false
    let opened = false
    let failure: Error | null = null

    const onSignalAbort = (): void => {
      try {
        ws.close()
      }
      catch { /* 忽略 */ }
    }

    function settleClosed(): void {
      if (closed)
        return
      closed = true
      if (options?.signal)
        options.signal.removeEventListener('abort', onSignalAbort)
      if (waiting) {
        const w = waiting
        waiting = null
        w({ value: undefined, done: true })
      }
    }

    function pushMessage(msg: AudioWsMessage): void {
      if (waiting) {
        const w = waiting
        waiting = null
        w({ value: msg, done: false })
      }
      else {
        queue.push(msg)
      }
    }

    ws.on('message', (data: ArrayBuffer | Buffer, isBinary: boolean) => {
      if (isBinary) {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer)
        pushMessage({ isBinary: true, binary: new Uint8Array(buf) })
      }
      else {
        const text = Buffer.isBuffer(data) ? data.toString('utf8') : Buffer.from(data as ArrayBuffer).toString('utf8')
        pushMessage({ isBinary: false, text })
      }
    })

    ws.on('error', (error: Error) => {
      // open 之前出错视为连接建立失败，直接 reject
      if (!opened) {
        settleClosed()
        reject(error)
        return
      }
      failure = error
      logger.debug('Audio WebSocket error', { error: error.message })
      settleClosed()
    })

    ws.on('close', () => {
      settleClosed()
    })

    if (options?.signal) {
      if (options.signal.aborted)
        onSignalAbort()
      else
        options.signal.addEventListener('abort', onSignalAbort, { once: true })
    }

    ws.on('open', () => {
      opened = true
      const connection: AudioWsConnection = {
        send(data) {
          ws.send(data)
        },
        async* messages() {
          while (true) {
            if (queue.length > 0) {
              yield queue.shift() as AudioWsMessage
              continue
            }
            if (closed) {
              if (failure)
                throw failure
              return
            }
            const next = await new Promise<IteratorResult<AudioWsMessage>>((res) => {
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
        close() {
          try {
            ws.close()
          }
          catch { /* 忽略 */ }
        },
      }
      resolve(connection)
    })
  })
}
