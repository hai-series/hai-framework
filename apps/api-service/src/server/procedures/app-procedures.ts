/**
 * api-service — App 领域 procedures
 *
 * 实现 `@h-ai/api-service-contract` 中定义的 app 端点，演示公开 route 与鉴权 route 的链式装配。
 */

import type { AppEchoOutputData, AppInfoOutputData } from '@h-ai/api-service-contract'
import type { ServContext } from '@h-ai/serv'
import { appContract } from '@h-ai/api-service-contract'
import { ok } from '@h-ai/core'
import { serv } from '@h-ai/serv'

/** App procedures 依赖项。 */
export interface AppProcedureDeps {
  /** 服务元信息：取自 core 配置或环境，避免在 handler 内重复读取。 */
  readonly info: {
    readonly name: string
    readonly version: string
    readonly transportEnabled: boolean
  }
  /** 进程启动时间戳（用于计算 uptime）。 */
  readonly startedAt: number
}

/** 创建 app 领域 procedures。 */
export function createAppProcedures(deps: AppProcedureDeps) {
  return serv
    .implement(appContract)
    .context<ServContext>()

    .route('info', () => {
      const data: AppInfoOutputData = {
        name: deps.info.name,
        version: deps.info.version,
        transportEnabled: deps.info.transportEnabled,
        uptimeMs: Math.max(0, Date.now() - deps.startedAt),
      }
      return ok(data)
    })

    .route('echo')
    .auth()
    .handle(({ input, context }) => {
      const data: AppEchoOutputData = {
        message: input.message,
        userId: context.session.userId,
        requestId: context.requestId,
        timestamp: new Date().toISOString(),
      }
      return ok(data)
    })

    .build()
}
