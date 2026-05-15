/**
 * @h-ai/serv — Node.js 适配器
 *
 * 封装 `@hono/node-server`，将 Hono app 以 Node.js http 服务器形式启动。
 * @module adapters/node
 */

import type { ServerType } from '@hono/node-server'
import type { Hono } from 'hono'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'

/** Node 服务器启动配置。 */
export interface ServNodeListenOptions {
  /** 监听端口，默认 3000。 */
  readonly port?: number
  /** 监听地址，默认由 Node.js 决定。 */
  readonly hostname?: string
  /** 服务启动就绪后的回调。 */
  readonly onListening?: (info: AddressInfo) => void
}

/** Node 服务运行句柄。 */
export interface ServNodeServer {
  /** 底层 Node.js HTTP Server 实例。 */
  readonly server: ServerType
  /** 优雅关闭服务器并等待已有连接断开。 */
  readonly close: () => Promise<void>
}

/**
 * 在 Node.js 中启动 Hono app。
 *
 * @param app - Hono app
 * @param options - 监听配置
 * @returns 运行句柄
 *
 * @example
 * ```ts
 * const { close } = serv.adapters.node.listen(app, {
 *   port: 3000,
 *   onListening: (info) => console.info(`Listening on port ${info.port}`),
 * })
 * // 应用退出前：
 * await close()
 * ```
 */
export function listen(app: Hono, options: ServNodeListenOptions = {}): ServNodeServer {
  const server = serve(
    {
      fetch: app.fetch,
      port: options.port ?? 3000,
      hostname: options.hostname,
    },
    options.onListening,
  )

  return {
    server,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    }),
  }
}

export const node = {
  listen,
}
