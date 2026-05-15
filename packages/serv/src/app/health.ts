/**
 * @h-ai/serv — 健康检查 endpoint
 *
 * 在 Hono app 上挂载 `GET /health` 和可选的 `GET /ready` endpoint。
 * 这些路由不需认证，主要供容器编排/负载均衡探测使用。
 * @module app/health
 */

import type { Hono } from 'hono'
import type { ServHealthHttpConfig } from './http-config.js'

/**
 * 在 Hono app 上挂载健康检查 endpoint。
 *
 * @param app - Hono app
 * @param config - 健康检查 endpoint 配置
 */
export function mountHealthEndpoints(app: Hono, config: ServHealthHttpConfig): void {
  app.get(config.path, c => c.json({ status: 'ok' }))

  if (config.readyPath) {
    app.get(config.readyPath, c => c.json({ status: 'ready' }))
  }
}
