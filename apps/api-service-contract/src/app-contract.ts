/**
 * api-service — App 领域 contract
 *
 * 本服务自身的 oRPC contract，挂在应用级 contract 的 `app` 命名下。
 * 客户端访问形如 `client.app.info()` / `client.app.echo({ message })`。
 *
 * 路由路径相对于服务端 `_serv.yml` 中的 `http.apiPrefix`。
 */

import { apiContract } from '@h-ai/api-contract'
import {
  AppEchoInputSchema,
  AppEchoOutputDataSchema,
  AppInfoOutputDataSchema,
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
    .output(apiContract.haiResultSchema(AppInfoOutputDataSchema)),
  echo: apiContract
    .route({
      method: 'POST',
      path: '/app/echo',
      operationId: 'app.echo',
      summary: 'Echo a message (auth required)',
      tags: ['app'],
    })
    .input(AppEchoInputSchema)
    .output(apiContract.haiResultSchema(AppEchoOutputDataSchema)),
}

export type AppContract = typeof appContract
