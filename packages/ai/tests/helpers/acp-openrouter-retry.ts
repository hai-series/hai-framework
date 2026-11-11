import type { SessionNotification } from '@agentclientprotocol/sdk'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const RATE_LIMIT_SIGNAL = /\b(?:429\s+Too Many Requests|(?:HTTP|status(?: code)?)[ :=\t]+429|rate_limit_exceeded)\b/i

/** Vitest 在本次夹具清理后只重试明确的限流失败。 */
export const openRouterRetry = {
  count: 2,
  delay: 30_000,
  condition: /^OpenRouter HTTP 429 during ACP prompt\./,
}

/** 限流信号只在当前模型请求及其结果校验期间有效。 */
export function trackOpenRouterPrompt() {
  let tail: string | undefined
  let sawRateLimit = false

  return {
    start() {
      tail = ''
      sawRateLimit = false
    },
    observe(update: SessionNotification['update']) {
      if (tail === undefined || sawRateLimit || update.sessionUpdate !== 'agent_message_chunk' || update.content.type !== 'text')
        return
      const message = tail + update.content.text
      sawRateLimit = RATE_LIMIT_SIGNAL.test(message)
      tail = message.slice(-128)
    },
    complete() {
      tail = undefined
    },
    rateLimited(error: unknown) {
      return tail !== undefined && (sawRateLimit || (error instanceof Error && RATE_LIMIT_SIGNAL.test(error.message)))
    },
  }
}

interface AttemptEvidence {
  id: string
  attempt: number
  status: 'running' | 'passed' | 'failed'
  cleanup: { status: 'pending' | 'passed' | 'failed' }
  rateLimited?: boolean
  error?: string
}

/** 保留会被重试覆盖的证据，继续用最终记录生成原有报告。 */
export async function finishOpenRouterAttempt(
  directory: string,
  evidence: AttemptEvidence,
  redact: (text: string) => string,
): Promise<void> {
  const content = redact(JSON.stringify(evidence, null, 2))
  const retryable = evidence.status === 'failed' && evidence.rateLimited && evidence.cleanup.status === 'passed'
  if (retryable && evidence.attempt <= openRouterRetry.count) {
    const attempts = join(directory, 'attempts')
    await mkdir(attempts, { recursive: true })
    await writeFile(join(attempts, `${evidence.id}-attempt-${evidence.attempt}.json`), content)
  }
  await writeFile(join(directory, `${evidence.id}.json`), content)

  if (evidence.status === 'failed') {
    const message = redact(evidence.error ?? 'ACP acceptance failed')
    throw new Error(retryable
      ? `OpenRouter HTTP 429 during ACP prompt. ${message}`
      : message)
  }
}
