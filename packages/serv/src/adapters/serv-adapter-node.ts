/**
 * @h-ai/serv — Node.js 适配器
 *
 * 封装 `@hono/node-server`，将 ServHttpApp 以 Node.js HTTP 服务器形式启动。
 * 默认监听 `127.0.0.1`（仅本机可达）；如需对外暴露，需显式设置 `host: '0.0.0.0'` 或指定 IP。
 * @module adapters/serv-adapter-node
 */

import type { Http2Bindings, HttpBindings, ServerType } from '@hono/node-server'
import type { AddressInfo } from 'node:net'
import type { ServHttpApp } from '../serv-app.js'
import { errorMonitor } from 'node:events'
import process from 'node:process'
import { core } from '@h-ai/core'
import { serve } from '@hono/node-server'
import { audioWsServers } from '../serv-app.js'

/**
 * `serv.listen` 默认监听地址。仅本机可达，避免误暴露到公网。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const options: ServListenOptions = { host: DEFAULT_SERV_HOST, port: DEFAULT_SERV_PORT }
 * // 默认只绑定回环；对外监听须显式选择宿主地址。
 * ```
 */
export const DEFAULT_SERV_HOST = '127.0.0.1'

/**
 * `serv.listen` 默认监听端口。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const options: ServListenOptions = { host: DEFAULT_SERV_HOST, port: DEFAULT_SERV_PORT }
 * ```
 */
export const DEFAULT_SERV_PORT = 3000

const STREAM_SHUTDOWN_GRACE_MS = 1000
const AUDIO_RELEASE_TIMEOUT_MS = 5000

/**
 * Node 服务器启动配置。
 *
 * @example
 * ```ts
 *
 * import { type ServListenOptions, serv } from '@h-ai/serv'
 *
 * const options: ServListenOptions = { host: '127.0.0.1', port: 3000 }
 * // HOST/PORT 与配置文件的解析由应用显式完成后传入。
 * ```
 */
export interface ServListenOptions {
  /**
   * 监听端口。
   * 优先级：显式值 > 默认 `3000`。
   * 环境变量 / 配置文件的 host/port 由 `serv` 配置（`server`）解析后由应用显式传入。
   */
  readonly port?: number
  /**
   * 监听地址。
   * 优先级：显式值 > 默认 `'127.0.0.1'`（仅本机可达）。
   *
   * - `'127.0.0.1'`：仅本机（推荐用于本地开发、容器内 sidecar、反向代理后端）
   * - `'0.0.0.0'`：监听所有 IPv4 网卡（容器对外暴露、需公网/内网访问）
   * - 指定 IP：仅监听该网卡（多网卡精确绑定）
   */
  readonly host?: string
  /** 服务启动就绪后的回调。 */
  readonly onListening?: (info: AddressInfo) => void
  /**
   * 优雅关闭回调（释放业务模块资源）。
   *
   * 传入后 `serv.listen` 自动监听 `SIGINT` / `SIGTERM`，按以下顺序关闭：
   * 1. 停止接收新请求，在一秒内结束 SSE 和 Audio WebSocket 连接，等待其他 HTTP 请求完成
   * 2. 最多再等待五秒让语音授权和会话释放完成，再调用此回调释放业务资源
   *
   * 应用层无需手动注册 `process.once('SIGINT', ...)` 或维护 `shuttingDown` 标志。
   */
  readonly onClose?: () => Promise<void>
}

/**
 * Node 服务运行句柄。
 *
 * @example
 * ```ts
 *
 * import { type ServNodeServer, serv } from '@h-ai/serv'
 *
 * async function stop(handle: ServNodeServer) {
 *   await handle.close()
 * }
 * // close 只关闭监听句柄；业务资源由宿主生命周期关闭。
 * ```
 */
export interface ServNodeServer {
  /** 底层 Node.js HTTP Server 实例。 */
  readonly server: ServerType
  /** 绑定前为请求地址。绑定成功后为实际地址，包括系统为端口 0 分配的端口。 */
  readonly address: { readonly host: string, readonly port: number }
  /** 停止接入并清理流连接。并发关闭复用结果，监听失败或语音清理超时仍会拒绝。 */
  readonly close: () => Promise<void>
}

/**
 * 在 Node.js 中启动 ServHttpApp。
 *
 * 默认监听 `127.0.0.1:3000`；host/port 建议由应用从 `serv` 配置的 `server`
 * （支持 `HOST` / `PORT` 环境变量覆盖，环境变量高于配置文件）解析后显式传入。
 * 传入 `onClose` 后自动注册 SIGINT/SIGTERM 优雅关闭，应用层无需手动处理信号。
 *
 * @param app - `serv.createApp()` 返回的 HTTP app
 * @param options - 监听配置（port / host / onListening / onClose）
 * @returns 运行句柄
 *
 * @example
 * ```ts
 *
 * import { apiContract } from '@h-ai/api-contract'
 * import { type ServContext, serv } from '@h-ai/serv'
 *
 * const contract = apiContract.create({})
 * const procedures = serv.implement(contract).context<ServContext>().build()
 * const app = serv.createApp({ contract, procedures })
 *
 * const server = serv.listen(app, { host: '127.0.0.1', port: 3000 })
 * await server.close()
 * ```
 */
export function listen(app: ServHttpApp, options: ServListenOptions = {}): ServNodeServer {
  const host = options.host ?? DEFAULT_SERV_HOST
  const port = options.port ?? DEFAULT_SERV_PORT
  const address = { host, port }
  const audio = audioWsServers.get(app)
  const audioServer = audio?.server
  const logger = core.logger.child({ module: 'serv', scope: 'node-adapter' })
  const eventStreams = new Set<HttpBindings['outgoing'] | Http2Bindings['outgoing']>()
  let stopping = false

  const server = serve(
    {
      // 保留原 bindings 对象，WebSocket 升级状态由 Node adapter 在同一对象上共享。
      fetch: async (request, bindings) => {
        if (stopping) {
          return new Response(null, {
            status: 503,
            headers: { Connection: 'close' },
          })
        }

        const response = await app.fetch(request, Object.assign(bindings, { remoteAddress: bindings.incoming.socket.remoteAddress }))
        const { outgoing } = bindings
        const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
        if (outgoing && response.body && contentType === 'text/event-stream') {
          if (stopping || outgoing.destroyed) {
            void response.body.cancel().catch(() => {})
            return new Response(null, {
              status: 503,
              headers: { Connection: 'close' },
            })
          }
          eventStreams.add(outgoing)
          outgoing.once('close', () => eventStreams.delete(outgoing))
        }
        return response
      },
      hostname: host,
      port,
      websocket: audioServer
        ? { server: audioServer }
        : undefined,
    },
    (info) => {
      address.host = info.address
      address.port = info.port
      options.onListening?.(info)
    },
  )

  let listenFailure: Error | undefined
  const rememberListenFailure = (error: Error) => {
    listenFailure = error
    logger.error('Service listener failed', { error })
  }
  // 只观察错误，不消费 Node 的 error 事件；未安装业务错误处理器时仍按 Node 契约失败。
  server.on(errorMonitor, rememberListenFailure)

  let closing: Promise<void> | undefined
  let removeSignalListeners = () => {}
  const handle: ServNodeServer = {
    server,
    address,
    close: () => closing ??= (async () => {
      stopping = true
      removeSignalListeners()
      const httpClosed = new Promise<void>((resolve, reject) => {
        const deadline = eventStreams.size > 0
          ? setTimeout(() => {
              for (const stream of eventStreams)
                stream.destroy()
            }, STREAM_SHUTDOWN_GRACE_MS)
          : undefined
        server.close((error) => {
          clearTimeout(deadline)
          server.removeListener(errorMonitor, rememberListenFailure)
          if (listenFailure) {
            reject(listenFailure)
            return
          }
          // Node close 会取消尚未完成的 listen；只有确无监听且没有启动失败时才视为已关闭。
          if (error && !('code' in error && error.code === 'ERR_SERVER_NOT_RUNNING' && !server.listening))
            reject(error)
          else resolve()
        })
      })
      const audioClosed = new Promise<void>((resolve, reject) => {
        if (!audioServer) {
          resolve()
          return
        }
        // 先停止升级，再通知现有连接；不能等客户端的业务会话超时才释放上游流。
        const deadline = setTimeout(() => {
          for (const socket of audioServer.clients)
            socket.terminate()
        }, STREAM_SHUTDOWN_GRACE_MS)
        audioServer.close((error) => {
          clearTimeout(deadline)
          if (error)
            reject(error)
          else resolve()
        })
        for (const socket of audioServer.clients)
          socket.close(1001, 'Server shutting down')
      })
      const audioReleased = audio && audioClosed.catch(() => {}).then(() => waitForAudioRelease(audio.waitForSessionRelease))
      const results = await Promise.allSettled([httpClosed, audioClosed, audioReleased])
      const errors = results.filter(result => result.status === 'rejected').map(result => result.reason)
      if (errors.length)
        throw new AggregateError(errors, 'Service listener shutdown failed')
    })(),
  }

  // 注册 SIGINT / SIGTERM 优雅关闭（仅在传入 onClose 时启用）。
  if (options.onClose) {
    const onClose = options.onClose
    let shuttingDown = false
    const shutdown = async (): Promise<void> => {
      if (shuttingDown)
        return
      shuttingDown = true
      try {
        await handle.close()
      }
      catch (error) { logger.error('Service listener shutdown failed', { error }) }
      try {
        await onClose()
      }
      catch (error) { logger.error('Service resource shutdown failed', { error }) }
    }
    const onSignal = () => {
      void shutdown()
    }
    process.once('SIGINT', onSignal)
    process.once('SIGTERM', onSignal)
    removeSignalListeners = () => {
      process.removeListener('SIGINT', onSignal)
      process.removeListener('SIGTERM', onSignal)
    }
  }

  return handle
}

async function waitForAudioRelease(waitForSessionRelease: () => Promise<void>): Promise<void> {
  let deadline: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<never>((_resolve, reject) => {
    deadline = setTimeout(() => reject(new Error('Audio WebSocket session release timed out')), AUDIO_RELEASE_TIMEOUT_MS)
  })
  try {
    await Promise.race([
      waitForSessionRelease(),
      timedOut,
    ])
  }
  finally {
    clearTimeout(deadline)
  }
}
