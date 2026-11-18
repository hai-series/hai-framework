import type { Locale } from '@h-ai/core'
import type { PasswordConfig } from './crypto-types.js'
import { parentPort } from 'node:worker_threads'
import { core } from '@h-ai/core'
import { createPasswordFunctions } from './crypto-password.js'
import { createSM3 } from './crypto-sm3.js'

/**
 * 每条工作线程消息只携带一次密码操作所需的输入及请求语言。
 * @example 模块内部上下文
 * ```ts
 * const job: PasswordJob = { operation: 'hash', password: 'example', locale: 'zh-CN' }
 * ```
 */
export type PasswordJob = { password: string, locale: Locale } & (
  | { operation: 'hash', config?: PasswordConfig }
  | { operation: 'verify', hash: string }
)

const password = createPasswordFunctions({
  hash: createSM3(),
})
parentPort?.on('message', (job: PasswordJob) => {
  const result = core.i18n.runWithLocale(job.locale, () => (job.operation === 'hash'
    ? password.hash(job.password, job.config)
    : password.verify(job.password, job.hash)))
  parentPort?.postMessage(result)
})
