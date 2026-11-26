/** 未覆写时的反馈发送、采集及传输容量。 */
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
  maxReplayEvents: 2000,
  maxRecordingSeconds: 60,
})

const mib = 1024 * 1024

/**
 * 按单次原始文件容量计算提交路由的明文字节预算，包含 Base64 和 JSON 开销。
 * @example
 * ```ts
 * import { apiContract } from '@h-ai/api-contract/feedback'
 * const bytes = apiContract.feedbackRequestBytes(12 * 1024 * 1024)
 * ```
 */
export function feedbackRequestBytes(maxTotalFileBytes: number): number {
  const encodedWithEnvelope = 4 * Math.ceil(maxTotalFileBytes / 3) + mib
  return Math.max(feedbackLimits.maxPlaintextBytes, Math.ceil(encodedWithEnvelope / mib) * mib)
}

/**
 * 声明有文件传输的路由上限。调用方可将结果合并进宿主的加密传输配置。
 * @example
 * ```ts
 * import { apiContract } from '@h-ai/api-contract/feedback'
 * const routePlaintextBytes = apiContract.feedbackTransportRoutes('/api', 12 * 1024 * 1024)
 * ```
 */
export function feedbackTransportRoutes(apiPrefix = '/api', maxTotalFileBytes: number = feedbackLimits.maxTotalFileBytes): Record<string, number> {
  const base = `${apiPrefix.replace(/\/+$/, '')}/feedback/reports`
  const bytes = feedbackRequestBytes(maxTotalFileBytes)
  return {
    [base]: bytes,
    [`${base}/*/messages`]: bytes,
    [`${base}/*/attachments/*`]: feedbackLimits.maxPlaintextBytes,
  }
}
