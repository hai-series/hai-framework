/** 每次发送的统一上限，客户端与服务端使用同一组值。 */
export const feedbackLimits = Object.freeze({
  maxBodyLength: 5000,
  maxFiles: 5,
  maxFileBytes: 5 * 1024 * 1024,
  maxTotalFileBytes: 10 * 1024 * 1024,
  maxPlaintextBytes: 16 * 1024 * 1024,
  captureWindowMs: 5 * 60 * 1000,
  maxLogEntries: 1000,
  maxLogBytes: 512 * 1024,
  maxReplayBytes: 2 * 1024 * 1024,
  maxRecordingSeconds: 60,
})

/**
 * 声明有文件传输的路由上限。调用方可将结果合并进宿主的加密传输配置。
 * @example
 * ```ts
 * import { apiContract } from '@h-ai/api-contract/feedback'
 * const routePlaintextBytes = apiContract.feedbackTransportRoutes('/api')
 * ```
 */
export function feedbackTransportRoutes(apiPrefix = '/api'): Record<string, number> {
  const base = `${apiPrefix.replace(/\/+$/, '')}/feedback/reports`
  const bytes = feedbackLimits.maxPlaintextBytes
  return { [base]: bytes, [`${base}/*/messages`]: bytes, [`${base}/*/attachments/*`]: bytes }
}
