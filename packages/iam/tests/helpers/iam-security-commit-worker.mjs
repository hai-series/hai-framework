/** 实际阻塞 Node 事件循环超过旧租约期限，再恢复原存储提交。 */
import process from 'node:process'
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { reldb } from '@h-ai/reldb'

async function main() {
  const input = JSON.parse(process.env.IAM_COMMIT_WORKER_INPUT)
  core.init({ logging: { level: 'fatal' } })
  let pausedFor = 0
  async function pause() {
    await new Promise((resolve, reject) => process.send({ phase: 'paused', operation: input.operation }, error => error ? reject(error) : resolve()))
    const started = Date.now()
    // Atomics.wait 真正停止 JS 与续租定时器；不使用只暂停业务 Promise 的测试替身。
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 45_000)
    pausedFor = Date.now() - started
  }
  try {
    for (const initialize of [
      () => reldb.init(input.db),
      () => cache.init(input.cache),
      () => iam.init({ seedDefaultData: false, otp: { resendInterval: 30, expiresIn: 120 }, onOtpSendEmail: async () => {} }),
    ]) {
      const initialized = await initialize()
      if (!initialized.success)
        throw new Error(`Commit worker initialization failed (${initialized.error.code})`)
    }
    let first = true
    if (input.operation === 'otp') {
      const commit = cache.kv.compareAndSwap.bind(cache.kv)
      cache.kv.compareAndSwap = async (...args) => {
        if (first && args[0] === `hai:iam:otp:${input.identifier}`) {
          first = false
          await pause()
        }
        return commit(...args)
      }
    }
    else {
      const commit = reldb.sql.execute.bind(reldb.sql)
      reldb.sql.execute = async (...args) => {
        if (first && args[0].startsWith('UPDATE hai_iam_users SET password_hash') && args[0].includes('reset_hash = ?')) {
          first = false
          await pause()
        }
        return commit(...args)
      }
    }
    const result = input.operation === 'otp'
      ? await iam.auth.loginWithOtp({ identifier: input.identifier, code: input.code })
      : await iam.user.confirmPasswordReset(input.token, 'OldWorkerPassword234')
    process.stdout.write(JSON.stringify({ success: result.success, code: result.success ? undefined : result.error.code, pausedFor }))
  }
  catch (error) {
    process.exitCode = 1
    process.stderr.write(error instanceof Error ? error.message : 'Commit worker failed')
  }
  finally {
    await iam.close()
    await cache.close()
    await reldb.close()
    process.disconnect()
  }
}

void main()
