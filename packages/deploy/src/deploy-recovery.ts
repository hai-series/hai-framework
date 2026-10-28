import type { HaiError, HaiResult } from '@h-ai/core'
import type { DeployCommandState, DeployRecoveryInfo } from './deploy-types.js'
import { err } from '@h-ai/core'
import { z } from 'zod'
import { deployM } from './deploy-i18n.js'

const RecoverySchema = z.object({
  projectName: z.string(),
  stage: z.string(),
  platformProjectId: z.string().optional(),
  resources: z.array(z.object({
    serviceType: z.enum(['db', 'cache', 'storage', 'email', 'sms']),
    provisionerName: z.string(),
    resourceInfo: z.string(),
    resourceStatus: z.enum(['created', 'reused', 'unknown']),
  })),
})

const CommandStateSchema = z.object({
  reason: z.enum(['timeout', 'output', 'input', 'spawn', 'exit', 'configuration']),
  localTermination: z.enum(['confirmed', 'unknown', 'not-started']),
  remoteExecution: z.enum(['unknown', 'finished']).optional(),
  deploymentId: z.string().optional(),
  resultFile: z.string().optional(),
  remoteExitCode: z.number().int().optional(),
  remoteStage: z.string().optional(),
  remoteRecovery: z.enum(['not-needed', 'passed', 'failed', 'stopped']).optional(),
})

/**
 * 读取命令失败的安全状态；不把本地 SSH 退出解释为远端停止。
 * @param error - 部署错误
 * @returns 通过结构校验的命令状态，或 undefined
 * @example
 * ```ts
 * import { getDeployCommandState, HaiDeployError } from '@h-ai/deploy'
 * const state = getDeployCommandState({ ...HaiDeployError.REMOTE_COMMAND_FAILED, message: 'SSH connection interrupted', ext: { commandExecution: { reason: 'exit', localTermination: 'confirmed', remoteExecution: 'unknown' } } })
 * if (state?.remoteExecution === 'unknown') process.stderr.write('Remote execution is unknown\n')
 * ```
 */
export function getDeployCommandState(error: HaiError): DeployCommandState | undefined {
  const parsed = CommandStateSchema.safeParse(error.ext?.commandExecution)
  return parsed.success ? parsed.data : undefined
}

/**
 * 读取错误中的恢复清单；仅返回明确允许展示的字段。
 * @param error - 上层捕获的部署 HaiError；不直接展示其 cause。
 * @returns 安全恢复清单；结构不满足约定时为 undefined。
 * @example
 * ```ts
 * import { getDeployRecovery, HaiDeployError } from '@h-ai/deploy'
 * const recovery = getDeployRecovery({ ...HaiDeployError.PROVISION_FAILED, message: 'Provisioning failed', ext: { recovery: { projectName: 'shop', stage: 'provision', resources: [] } } })
 * if (recovery) {
 *   const stage = recovery.stage
 * }
 * ```
 */
export function getDeployRecovery(error: HaiError): DeployRecoveryInfo | undefined {
  const parsed = RecoverySchema.safeParse(error.ext?.recovery)
  return parsed.success ? parsed.data : undefined
}

/**
 * 在错误中保留可展示的恢复信息，避免异常 cause/命令/URL 泄漏凭证。
 * @param error - 上层捕获的部署 HaiError；不直接展示其 cause。
 * @param recovery - 允许展示的恢复阶段与资源清单。
 * @returns 仅含安全恢复字段的失败 HaiResult。
 * @example 模块内部上下文
 * ```ts
 * const { HaiDeployError } = await import('./deploy-types.js')
 * const failure = recoveryFailure({ ...HaiDeployError.PROVISION_FAILED, message: 'Provisioning failed' }, { projectName: 'shop', stage: 'provision', resources: [] })
 * if (!failure.success) {
 *   const safeMessage = failure.error.message
 * }
 * ```
 */
export function recoveryFailure(error: HaiError, recovery: DeployRecoveryInfo): HaiResult<never> {
  return err({
    code: error.code,
    httpStatus: error.httpStatus,
    system: error.system,
    module: error.module,
    message: deployM('deploy_recoveryFailure', { params: { stage: recovery.stage } }),
    suggestion: deployM('deploy_recoverySuggestion'),
    ext: { recovery },
  })
}
