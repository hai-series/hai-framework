import type {
  AnyMessage,
  ContentBlock,
  McpServer,
  SessionNotification,
  Stream,
} from '@agentclientprotocol/sdk'
import type { z } from 'zod'
import type { ACPClientOptions, ACPTransport } from './ai-acp-types.js'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import process from 'node:process'
import { Readable, Writable } from 'node:stream'
import {
  client,
  methods,
  ndJsonStream,
  PROTOCOL_VERSION,
} from '@agentclientprotocol/sdk'
import { createHttpStream } from '@agentclientprotocol/sdk/experimental/http-client'
import { createWebSocketStream } from '@agentclientprotocol/sdk/experimental/ws-client'
import { WebSocket } from 'ws'
import { ACPConfigSchema } from './ai-acp-config.js'
import { ACPFailure } from './ai-acp-errors.js'
import { baseEnvironment, stopProcess } from './ai-acp-process.js'

/**
 * 创建实际 ACP 连接，失败和关闭都等待拥有的子进程退出。
 * @param transport - 实际原生传输配置。
 * @param options - 可信回调及初始化信号。
 * @param inputLimits - 超时、消息大小与事件数量限制。
 * @returns 已完成握手的连接；调用方必须关闭。
 * @example
 * ```ts
 * // 模块内部上下文。
 * async function probe(transport: ACPTransport) { const connection = await connectACP(transport); try { return connection.initialized } finally { await connection.close() } }
 * ```
 */
export async function connectACP(
  transport: ACPTransport,
  options: ACPClientOptions = {},
  inputLimits?: z.input<typeof ACPConfigSchema>,
) {
  const limits = ACPConfigSchema.parse(inputLimits ?? {})
  const handlers = options.handlers ?? {}
  const capabilities = options.capabilities ?? {}
  const required: string[] = []
  if (capabilities.fs?.readTextFile)
    required.push(methods.client.fs.readTextFile)
  if (capabilities.fs?.writeTextFile)
    required.push(methods.client.fs.writeTextFile)
  if (capabilities.terminal)
    required.push(...Object.values(methods.client.terminal))
  if (capabilities.elicitation)
    required.push(methods.client.elicitation.create)
  if (required.some(name => !Object.hasOwn(handlers, name))) {
    throw new ACPFailure('invalid')
  }
  if (options.signal?.aborted)
    throw new ACPFailure('cancelled')
  let stop: () => Promise<void> = async () => {}
  let stream: Stream
  if (transport.type === 'stdio') {
    const child = spawn(transport.command, transport.args ?? [], {
      cwd: transport.cwd,
      env: { ...baseEnvironment(), ...transport.env },
      detached: process.platform !== 'win32',
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let childClosed = false
    child.once('close', () => {
      childClosed = true
    })
    child.stderr.resume()
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', resolve)
      child.once('error', () => reject(new ACPFailure('runtime')))
    })
    stop = () => stopProcess(child, { ownedTree: true, closeObserved: childClosed })
    // Node 与 DOM 流声明不同；pipe stdout 始终产生 Uint8Array。
    stream = ndJsonStream(
      Writable.toWeb(child.stdin),
      Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
      { maxMessageBytes: limits.maxContentBytes },
    )
  }
  else if (transport.type === 'http') {
    stream = createHttpStream(transport.url, {
      headers: transport.headers,
      maxMessageBytes: limits.maxContentBytes,
    })
  }
  else {
    class BoundedWebSocket extends WebSocket {
      constructor(
        url: string,
        protocols?: string | string[],
        options?: { headers?: Record<string, string> },
      ) {
        super(url, protocols, {
          ...options,
          maxPayload: limits.maxContentBytes,
        })
      }
    }
    stream = createWebSocketStream(transport.url, {
      headers: transport.headers,
      WebSocket: BoundedWebSocket,
    })
  }
  const requests = new Set<string | number>()
  const originalWriter = stream.writable.getWriter()
  const guardedStream: Stream = {
    writable: new WritableStream<AnyMessage>({
      async write(message) {
        if (
          'method' in message
          && 'id' in message
          && message.id !== undefined
          && message.id !== null
        ) {
          requests.add(message.id)
        }
        await originalWriter.write(message)
      },
      close: () => originalWriter.close(),
      abort: reason => originalWriter.abort(reason),
    }),
    readable: stream.readable.pipeThrough(
      new TransformStream<AnyMessage, AnyMessage>({
        transform(message, controller) {
          if (
            !('method' in message)
            && 'id' in message
            && message.id !== undefined
            && message.id !== null
          ) {
            requests.delete(message.id)
          }
          controller.enqueue(message)
        },
      }),
    ),
  }
  let sessionId: string | undefined
  let sessionOpening = false
  let closed = false
  let failure: unknown
  let closePromise: Promise<void> | undefined
  const listeners = new Set<(event: SessionNotification) => void>()
  const app = client({ name: 'hai-ai' })
  // 通知优先注册：SDK 顺序尝试异步处理器，避免同一数据帧中的响应抢先结束 prompt。
  app.onNotification(methods.client.session.update, ({ params }) => {
    if (sessionId && params.sessionId !== sessionId)
      return
    try {
      options.onEvent?.(params)
      for (const listener of listeners) listener(params)
    }
    catch (error) {
      failure = error
      void close().catch(() => {})
    }
  })
  function owned(id: string) {
    if (!sessionId || id !== sessionId)
      throw new ACPFailure('missing')
  }
  app.onRequest(methods.client.session.requestPermission, async (context) => {
    owned(context.params.sessionId)
    const handler = handlers['session/request_permission']
    if (!handler)
      return { outcome: { outcome: 'cancelled' } }
    return handler(context)
  })
  app.onRequest(methods.client.fs.readTextFile, async (context) => {
    owned(context.params.sessionId)
    const handler = handlers['fs/read_text_file']
    if (!handler)
      throw new ACPFailure('unsupported')
    return handler(context)
  })
  app.onRequest(methods.client.fs.writeTextFile, async (context) => {
    owned(context.params.sessionId)
    const handler = handlers['fs/write_text_file']
    if (!handler)
      throw new ACPFailure('unsupported')
    return handler(context)
  })
  app.onRequest(methods.client.terminal.create, async (context) => {
    owned(context.params.sessionId)
    const handler = handlers['terminal/create']
    if (!handler)
      throw new ACPFailure('unsupported')
    return handler(context)
  })
  app.onRequest(methods.client.terminal.output, async (context) => {
    owned(context.params.sessionId)
    const handler = handlers['terminal/output']
    if (!handler)
      throw new ACPFailure('unsupported')
    return handler(context)
  })
  app.onRequest(methods.client.terminal.release, async (context) => {
    owned(context.params.sessionId)
    const handler = handlers['terminal/release']
    if (!handler)
      throw new ACPFailure('unsupported')
    return handler(context)
  })
  app.onRequest(methods.client.terminal.waitForExit, async (context) => {
    owned(context.params.sessionId)
    const handler = handlers['terminal/wait_for_exit']
    if (!handler)
      throw new ACPFailure('unsupported')
    return handler(context)
  })
  app.onRequest(methods.client.terminal.kill, async (context) => {
    owned(context.params.sessionId)
    const handler = handlers['terminal/kill']
    if (!handler)
      throw new ACPFailure('unsupported')
    return handler(context)
  })
  app.onRequest(methods.client.elicitation.create, async (context) => {
    if (
      'sessionId' in context.params
      && typeof context.params.sessionId === 'string'
    ) {
      owned(context.params.sessionId)
    }
    else if (
      !('requestId' in context.params)
      || (typeof context.params.requestId !== 'string'
        && typeof context.params.requestId !== 'number')
      || !requests.has(context.params.requestId)
    ) {
      throw new ACPFailure('missing')
    }
    const handler = handlers['elicitation/create']
    if (!handler)
      throw new ACPFailure('unsupported')
    return handler(context)
  })
  const connection = app.connect(guardedStream)
  function close() {
    closed = true
    if (!closePromise) {
      const task = (async () => {
        // 先停止拥有的进程树，避免先关 stdin 导致主进程自然退出后无法核验后台工具。
        try {
          await stop()
        }
        finally {
          connection.close()
        }
      })()
      closePromise = task
      // 保留关闭失败的资源占用，但允许显式重试清理；并发关闭仍共享同一轮 Promise。
      void task.catch(() => {
        if (closePromise === task)
          closePromise = undefined
      })
    }
    return closePromise
  }
  async function request<T>(
    operation: () => Promise<T>,
    timeout = limits.requestTimeout,
    signal?: AbortSignal,
    prompt = false,
    isCancelledResponse?: (output: T) => boolean,
  ) {
    if (closed)
      throw new ACPFailure('closed')
    if (signal?.aborted)
      throw new ACPFailure('cancelled')
    let timer: ReturnType<typeof setTimeout> | undefined
    let abort: () => void = () => {}
    let reason: ACPFailure | undefined
    const deadline = new Promise<never>((_, reject) => {
      const fail = (kind: 'timeout' | 'cancelled') => {
        if (reason)
          return
        reason = new ACPFailure(kind)
        if (prompt && sessionId) {
          void connection.agent
            .notify(methods.agent.session.cancel, { sessionId })
            .catch(() => {})
        }
        // 合作取消不能保证对端响应，期限后必须关闭拥有的传输。
        clearTimeout(timer)
        timer = setTimeout(
          () => {
            void close().then(() => reject(reason), reject)
          },
          prompt ? limits.cancelTimeout : 0,
        )
      }
      timer = setTimeout(fail, timeout, 'timeout')
      abort = () => fail('cancelled')
      signal?.addEventListener('abort', abort, { once: true })
    })
    try {
      const output = await Promise.race([operation(), deadline])
      if (failure)
        throw failure
      if (reason) {
        // 主动取消已获原生终态确认时保留会话；超时或未确认仍关闭，目录占用始终由宿主控制。
        if (!(reason.kind === 'cancelled' && prompt && isCancelledResponse?.(output)))
          await close()
        throw reason
      }
      return output
    }
    catch (error) {
      if (failure)
        throw failure
      if (reason)
        throw reason
      throw error
    }
    finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
    }
  }
  try {
    const initialized = await request(
      () =>
        connection.agent.request(methods.agent.initialize, {
          protocolVersion: PROTOCOL_VERSION,
          clientCapabilities: capabilities,
        }),
      limits.requestTimeout,
      options.signal,
    )
    if (initialized.protocolVersion !== PROTOCOL_VERSION)
      throw new ACPFailure('unsupported')
    const agentCapabilities = initialized.agentCapabilities ?? {}
    function checkMcp(servers: McpServer[]) {
      for (const server of servers) {
        if (
          'type' in server
          && server.type === 'http'
          && !agentCapabilities.mcpCapabilities?.http
        ) {
          throw new ACPFailure('unsupported')
        }
        if (
          'type' in server
          && server.type === 'sse'
          && !agentCapabilities.mcpCapabilities?.sse
        ) {
          throw new ACPFailure('unsupported')
        }
      }
    }
    let activePrompt: AbortController | undefined
    async function prompt(content: ContentBlock[], signal?: AbortSignal) {
      if (activePrompt)
        throw new ACPFailure('busy')
      if (!sessionId)
        throw new ACPFailure('missing')
      if (Buffer.byteLength(JSON.stringify(content)) > limits.maxContentBytes)
        throw new ACPFailure('output')
      for (const item of content) {
        if (
          (item.type === 'image'
            && !agentCapabilities.promptCapabilities?.image)
          || (item.type === 'audio'
            && !agentCapabilities.promptCapabilities?.audio)
          || (item.type === 'resource'
            && !agentCapabilities.promptCapabilities?.embeddedContext)
        ) {
          throw new ACPFailure('unsupported')
        }
      }
      const events: SessionNotification[] = []
      let bytes = 0
      let text = ''
      let messageId: string | null | undefined
      const listener = (event: SessionNotification) => {
        bytes += Buffer.byteLength(JSON.stringify(event))
        if (
          events.length >= limits.maxPendingEvents
          || bytes > limits.maxContentBytes
        ) {
          throw new ACPFailure('output')
        }
        events.push(event)
        if (
          event.update.sessionUpdate === 'agent_message_chunk'
          && event.update.content.type === 'text'
        ) {
          if (event.update.messageId && event.update.messageId !== messageId)
            text = ''
          messageId = event.update.messageId
          text += event.update.content.text
        }
      }
      listeners.add(listener)
      activePrompt = new AbortController()
      try {
        const response = await request(
          () =>
            connection.agent.request(methods.agent.session.prompt, {
              sessionId: sessionId!,
              prompt: content,
            }),
          limits.promptTimeout,
          signal
            ? AbortSignal.any([activePrompt.signal, signal])
            : activePrompt.signal,
          true,
          output => output.stopReason === 'cancelled',
        )
        if (response.stopReason === 'cancelled')
          throw new ACPFailure('cancelled')
        return { ...response, text, events }
      }
      finally {
        listeners.delete(listener)
        activePrompt = undefined
      }
    }
    return {
      initialized,
      /**
       * 关闭传输并终止拥有的进程树，可重复调用。
       * @returns 清理完成的 Promise；清理失败抛错。
       * @example
       * ```ts
       * // 内部上下文：runtime/git/connection 为相应工厂已创建的句柄。
       * await connection.close()
       * ```
       */
      close,
      /**
       * 执行单轮原生请求并收集有限事件。
       * @param content - 原生内容块。
       * @param signal - 本轮取消信号。
       * @returns 最终文本、停止原因及事件；业务边界负责转换异常。
       * @example
       * ```ts
       * // 内部上下文：runtime/git/connection 为相应工厂已创建的句柄。
       * const response = await connection.prompt([{ type: 'text', text: '检查工程' }])
       * ```
       */
      prompt,
      /**
       * 订阅会话事件；返回取消订阅函数。
       * @param listener - 消费原生事件的回调；抛错会关闭连接。
       * @returns 取消订阅函数。
       * @example
       * ```ts
       * // 模块内部，connection 为 connectACP 返回值，异常由业务边界转换。
       * const unsubscribe = connection.subscribe(event => consume(event)); unsubscribe()
       * ```
       */
      subscribe(listener: (event: SessionNotification) => void) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      /**
       * 发送原生取消通知并触发正在执行轮次的取消期限。
       * @returns 通知发送后的 Promise；本轮终止由 prompt 的取消期限保证。
       * @example
       * ```ts
       * // 模块内部，connection 为 connectACP 返回值，异常由业务边界转换。
       * await connection.cancel()
       * ```
       */
      cancel: async () => {
        activePrompt?.abort()
        if (sessionId && !closed) {
          await connection.agent.notify(methods.agent.session.cancel, {
            sessionId,
          })
        }
      },
      /**
       * 选择握手 authMethods 中的认证方法，凭据由原生进程或远程服务提供。
       * @param methodId - 对端握手声明的认证方法。
       * @returns 原生认证响应。
       * @example
       * ```ts
       * // 模块内部，connection 为 connectACP 返回值，异常由业务边界转换。
       * await connection.authenticate('api-key')
       * ```
       */
      authenticate: (methodId: string) =>
        request(() =>
          connection.agent.request(methods.agent.authenticate, { methodId }),
        ),
      /**
       * 创建此连接唯一的原生会话；MCP 类型必须由智能体声明支持。
       * @param cwd - 对端可见的绝对工作目录。
       * @param mcpServers - 原生 MCP 定义，默认空列表。
       * @returns 包含原生 sessionId 的新建响应。
       * @example
       * ```ts
       * // 模块内部，connection 为 connectACP 返回值，异常由业务边界转换。
       * await connection.createSession('/srv/project', [])
       * ```
       */
      async createSession(cwd: string, mcpServers: McpServer[] = []) {
        if (sessionId || sessionOpening)
          throw new ACPFailure('busy')
        sessionOpening = true
        try {
          checkMcp(mcpServers)
          const response = await request(() =>
            connection.agent.request(methods.agent.session.new, {
              cwd,
              mcpServers,
            }),
          )
          sessionId = response.sessionId
          return response
        }
        finally {
          sessionOpening = false
        }
      },
      /**
       * 优先调用原生 resume，否则使用已声明的 load；均不支持则失败。
       * @param id - 原生会话 ID。
       * @param cwd - 原会话绝对工作目录。
       * @param mcpServers - 当前原生 MCP 定义。
       * @returns 恢复或加载响应；能力缺失时抛错。
       * @example
       * ```ts
       * // 模块内部，connection 为 connectACP 返回值，异常由业务边界转换。
       * await connection.resumeSession('native-id', '/srv/project')
       * ```
       */
      async resumeSession(
        id: string,
        cwd: string,
        mcpServers: McpServer[] = [],
      ) {
        if (sessionId || sessionOpening)
          throw new ACPFailure('busy')
        checkMcp(mcpServers)
        sessionId = id
        if (agentCapabilities.sessionCapabilities?.resume) {
          return request(() =>
            connection.agent.request(methods.agent.session.resume, {
              sessionId: id,
              cwd,
              mcpServers,
            }),
          )
        }
        if (agentCapabilities.loadSession) {
          return request(() =>
            connection.agent.request(methods.agent.session.load, {
              sessionId: id,
              cwd,
              mcpServers,
            }),
          )
        }
        throw new ACPFailure('unsupported')
      },
      /**
       * 按智能体原生游标列出会话；未声明 list 能力则失败。
       * @param cursor - 可选分页游标。
       * @returns 原生分页会话列表。
       * @example
       * ```ts
       * // 模块内部，connection 为 connectACP 返回值，异常由业务边界转换。
       * const page = await connection.listSessions()
       * ```
       */
      async listSessions(cursor?: string) {
        if (!agentCapabilities.sessionCapabilities?.list)
          throw new ACPFailure('unsupported')
        return request(() =>
          connection.agent.request(methods.agent.session.list, { cursor }),
        )
      },
      /**
       * 要求远端删除指定原生会话；不代替框架工作区清理。
       * @param id - 原生会话 ID。
       * @returns 原生删除响应。
       * @example
       * ```ts
       * // 模块内部，connection 为 connectACP 返回值，异常由业务边界转换。
       * await connection.deleteSession('native-id')
       * ```
       */
      async deleteSession(id: string) {
        if (!agentCapabilities.sessionCapabilities?.delete)
          throw new ACPFailure('unsupported')
        return request(() =>
          connection.agent.request(methods.agent.session.delete, {
            sessionId: id,
          }),
        )
      },
      /**
       * 若远端声明 close 能力则关闭原生会话；进程停止由 close 负责。
       * @returns 原生关闭完成的 Promise；未声明能力时无需请求。
       * @example
       * ```ts
       * // 模块内部，connection 为 connectACP 返回值，异常由业务边界转换。
       * await connection.closeSession()
       * ```
       */
      async closeSession() {
        if (
          !closed
          && sessionId
          && agentCapabilities.sessionCapabilities?.close
        ) {
          await request(() =>
            connection.agent.request(methods.agent.session.close, {
              sessionId: sessionId!,
            }),
          )
        }
      },
      /**
       * 给当前原生会话设置智能体公布的模式。
       * @param modeId - 原生模式 ID。
       * @returns 原生模式响应。
       * @example
       * ```ts
       * // 模块内部，connection 为 connectACP 返回值，异常由业务边界转换。
       * await connection.setMode('code')
       * ```
       */
      setMode: (modeId: string) =>
        request(() =>
          connection.agent.request(methods.agent.session.setMode, {
            sessionId: sessionId!,
            modeId,
          }),
        ),
      /**
       * 给当前原生会话设置智能体公布的配置选项。
       * @param configId - 原生配置选项 ID。
       * @param value - 智能体允许的选项值。
       * @returns 原生配置响应。
       * @example
       * ```ts
       * // 模块内部，connection 为 connectACP 返回值，异常由业务边界转换。
       * await connection.setConfigOption('model', 'coding')
       * ```
       */
      setConfigOption: (configId: string, value: string) =>
        request(() =>
          connection.agent.request(methods.agent.session.setConfigOption, {
            sessionId: sessionId!,
            configId,
            value,
          }),
        ),
    }
  }
  catch (error) {
    await close()
    throw error
  }
}
/**
 * 拥有明确关闭行为的协议连接。
 * @example
 * ```ts
 * // 模块内部上下文。
 * async function release(connection: ACPConnection) { await connection.close() }
 * ```
 */
export type ACPConnection = Awaited<ReturnType<typeof connectACP>>
