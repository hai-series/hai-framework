/**
 * api-service — App 领域 contract
 *
 * 本服务自身的 oRPC contract，挂在应用级 contract 的 `app` 命名下。
 * 客户端访问形如 `client.app.info()` / `client.app.echo({ message })`。
 *
 * 路由路径相对于 `_serv.yml` 的 `apiPrefix`（默认 `/api/v1`）。
 */

import { apiContract } from '@h-ai/api-contract'
import {
  AppEchoInputSchema,
  AppEchoOutputSchema,
  AppInfoOutputSchema,
} from './app-schemas.js'

/** api-service 自定义 app contract。 */
export const appContract = {
  info: apiContract
    .route({
      method: 'POST',
      path: '/app/info',
      operationId: 'app.info',
      summary: 'Get service info',
      tags: ['app'],
    })
    .output(AppInfoOutputSchema),
  echo: apiContract
    .route({
      method: 'POST',
      path: '/app/echo',
      operationId: 'app.echo',
      summary: 'Echo a message (auth required)',
      tags: ['app'],
    })
    .input(AppEchoInputSchema)
    .output(AppEchoOutputSchema),
}

export type AppContract = typeof appContract
