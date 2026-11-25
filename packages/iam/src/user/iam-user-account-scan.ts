import type { Logger } from '@h-ai/core'
import type { IamConfig } from '../iam-config.js'
import type { UserOperations } from './iam-user-types.js'

/**
 * 调度不重叠的闲置账号扫描。停止时返回在途工作，供 IAM 关闭流程等待。
 * @param logger - IAM 所用的诊断日志。
 * @returns 启停单个运行期扫描任务的方法；空闲策略启用时才创建计时器。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * function startScan(logger: Logger, users: UserOperations, accounts: IamConfig['accounts']) {
 *   const scan = createIamAccountScan(logger)
 *   scan.start(users, accounts)
 *   return scan.stop
 * }
 * ```
 */
export function createIamAccountScan(logger: Logger) {
  let timer: ReturnType<typeof setInterval> | undefined
  let running: Promise<void> | undefined

  return {
    start(users: UserOperations, accounts: IamConfig['accounts']) {
      if ((accounts?.dormantAfterDays ?? 0) <= 0)
        return
      timer = setInterval(() => {
        if (running)
          return
        running = users.scanInactiveAccounts().then((result) => {
          if (!result.success)
            logger.error('Inactive account scan failed', { error: result.error })
        }).catch((error: unknown) => {
          logger.error('Inactive account scan failed', { error })
        }).finally(() => { running = undefined })
      }, (accounts?.scanIntervalSeconds ?? 3600) * 1000)
      timer.unref()
    },
    stop() {
      clearInterval(timer)
      timer = undefined
      return running
    },
  }
}
