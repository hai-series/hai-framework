import { err } from '@h-ai/core'
import { ZodError } from 'zod'
import { aiM } from '../ai-i18n.js'
import { HaiAIError } from '../ai-types.js'

/**
 * 内部可公开错误类别。
 * @example
 * ```ts
 * // 模块内部上下文。
 * const kind: ACPFailureKind = 'busy'
 * ```
 */
export type ACPFailureKind
  = | 'invalid'
    | 'missing'
    | 'busy'
    | 'unsupported'
    | 'cancelled'
    | 'timeout'
    | 'output'
    | 'conflict'
    | 'partial'
    | 'closed'
    | 'runtime'
    | 'model'
    | 'cleanup'
    | 'gitMissing'
    | 'failed'
/**
 * 内部异常只携带允许公开的诊断数据。
 * @example
 * ```ts
 * // 模块内部上下文。
 * const failure = new ACPFailure('busy')
 * ```
 */
export class ACPFailure extends Error {
  /**
   * 创建只携带允许公开诊断信息的内部异常。
   * @param kind - 固定错误类别。
   * @param details - 脱敏数据，不得包含凭据或原始 stderr。
   * @returns 内部异常实例。
   * @example
   * ```ts
   * // 内部上下文：runtime/git/connection 为相应工厂已创建的句柄。
   * const failure = new ACPFailure('busy')
   * ```
   */
  constructor(
    readonly kind: ACPFailureKind,
    readonly details?: unknown,
  ) {
    super(kind)
  }
}
const mappings = {
  invalid: ['ACP_INVALID_REQUEST', 'ai_acpInvalid'],
  missing: ['ACP_NOT_FOUND', 'ai_acpNotFound'],
  busy: ['ACP_BUSY', 'ai_acpBusy'],
  unsupported: ['ACP_UNSUPPORTED', 'ai_acpUnsupported'],
  cancelled: ['ACP_CANCELLED', 'ai_acpCancelled'],
  timeout: ['ACP_TIMEOUT', 'ai_acpTimeout'],
  output: ['ACP_OUTPUT_INVALID', 'ai_acpOutput'],
  conflict: ['ACP_CONFLICT', 'ai_acpConflict'],
  partial: ['ACP_PARTIAL_FAILURE', 'ai_acpPartial'],
  closed: ['ACP_CLOSED', 'ai_acpClosed'],
  runtime: ['ACP_RUNTIME_UNAVAILABLE', 'ai_acpRuntime'],
  model: ['ACP_MODEL_INCOMPATIBLE', 'ai_acpModel'],
  cleanup: ['ACP_CLEANUP_FAILED', 'ai_acpCleanup'],
  gitMissing: ['ACP_GIT_NOT_FOUND', 'ai_acpGitNotFound'],
  failed: ['ACP_OPERATION_FAILED', 'ai_acpOperationFailed'],
} as const
/**
 * 普通 API 统一异常边界，不将凭据、源代码和原始 stderr 放进错误。
 * @param error - 内部异常或未知错误，不直接公开原始异常信息。
 * @returns 本地化、脱敏的 HaiResult 失败值。
 * @example
 * ```ts
 * // 模块内部上下文。
 * const result = acpError(new ACPFailure('closed'))
 * if (!result.success) { const code = result.error.code }
 * ```
 */
export function acpError(error: unknown) {
  const failure
    = error instanceof ACPFailure
      ? error
      : new ACPFailure(error instanceof ZodError
          ? 'invalid'
          : 'failed')
  const [code, message] = mappings[failure.kind]
  return err(HaiAIError[code], aiM(message), failure.details)
}
