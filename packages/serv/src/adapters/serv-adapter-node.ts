/**
 * @h-ai/serv — Node.js 适配器
 *
 * 封装 `@hono/node-server`，将 ServHttpApp 以 Node.js HTTP 服务器形式启动。
 * 默认监听 `127.0.0.1`（仅本机可达）；如需对外暴露，需显式设置 `host: '0.0.0.0'` 或指定 IP。
 * @module adapters/serv-adapter-node
 */

import type { ServerType } from '@hono/node-server'
import type { AddressInfo } from 'node:net'
import type { ServHttpApp } from '../serv-app.js'
import process from 'node:process'
import { serve } from '@hono/node-server'
import { audioWsInjectors } from '../serv-app.js'

/** `serv.listen` 默认监听地址。仅本机可达，避免误暴露到公网。 */
export const DEFAULT_SERV_HOST = '127.0.0.1'

/** `serv.listen` 默认监听端口。 */
export const DEFAULT_SERV_PORT = 3000

/** Node 服务器启动配置。 */
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
   * 1. 停止接受新 HTTP 连接
   * 2. 调用此回调释放业务资源
   *
   * 应用层无需手动注册 `process.once('SIGINT', ...)` 或维护 `shuttingDown` 标志。
   */
  readonly onClose?: () => Promise<void>
}

/** Node 服务运行句柄。 */
export interface ServNodeServer {
  /** 底层 Node.js HTTP Server 实例。 */
  readonly server: ServerType
  /** 实际监听地址（host 与解析后的 port）。 */
  readonly address: { readonly host: string, readonly port: number }
  /** 优雅关闭服务器并等待已有连接断开。 */
  readonly close: () => Promise<void>
}

/**
 * 在 Node.js 中启动 ServHttpApp。
 *
 * 默认监听 `127.0.0.1:3000`；host/port 建议由应用从 `serv` 配置的 `server`
 *（支持 `HOST` / `PORT` 环境变量覆盖，环境变量高于配置文件）解析后显式传入。
 * 传入 `onClose` 后自动注册 SIGINT/SIGTERM 优雅关闭，应用层无需手动处理信号。
 *
 * @param app - `serv.createApp()` 返回的 HTTP app
 * @param options - 监听配置（port / host / onListening / onClose）
 * @returns 运行句柄
 *
 * @example
 * ```ts
 * // host/port 来自已解析的 serv 配置（env > 配置文件 > 默认）
 * const { server } = core.config.getOrThrow<ServConfig>('serv')
 * serv.listen(app, {
 *   host: server.host,
 *   port: server.port,
 *   onListening: info => logger.info('listening', { port: info.port }),
 *   onClose: closeApp,
 * })
 * ```
 */
export function listen(app: ServHttpApp, options: ServListenOptions = {}): ServNodeServer {
  const host = options.host ?? DEFAULT_SERV_HOST
  const port = options.port ?? DEFAULT_SERV_PORT

  const server = serve(
    { fetch: app.fetch, hostname: host, port },
    options.onListening,
  )

  // 若启用了语音 WebSocket 入口，注入升级处理器以支持 ws 握手
  const injectWebSocket = audioWsInjectors.get(app)
  if (injectWebSocket)
    injectWebSocket(server)

  const handle: ServNodeServer = {
    server,
    address: { host, port },
    close: () => new Promise((resolve, reject) => {
      server.close((error) => {
        if (error)
          reject(error)
        else resolve()
      })
    }),
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
      catch { /* 忽略 HTTP server 关闭错误 */ }
      try {
        await onClose()
      }
      catch { /* 忽略业务模块关闭错误 */ }
    }
    process.once('SIGINT', () => void shutdown())
    process.once('SIGTERM', () => void shutdown())
  }

  return handle
}
