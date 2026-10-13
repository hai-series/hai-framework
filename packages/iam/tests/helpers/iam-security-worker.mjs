/** 独立进程验证共享安全状态，输入只通过测试进程环境传递。 */
import process from 'node:process'
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { reldb } from '@h-ai/reldb'

async function main() {
  const input = JSON.parse(process.env.IAM_SECURITY_WORKER_INPUT)
  core.init({ logging: { level: 'fatal' } })
  try {
    for (const [stage, initialize] of [
      ['reldb', () => reldb.init(input.db)],
      ['cache', () => cache.init(input.cache)],
      ['iam', () => iam.init({ ...input.iam, seedDefaultData: false, onOtpSendEmail: async () => {} })],
    ]) {
      const result = await initialize()
      if (!result.success)
        throw new Error(`Worker ${stage} initialization failed (${result.error.code})`)
    }
    const result = input.operation === 'password'
      ? await iam.auth.login(input.credentials)
      : input.operation === 'otp'
        ? await iam.auth.loginWithOtp(input.credentials)
        : input.operation === 'send'
          ? await iam.auth.sendOtp(input.identifier)
          : await iam.user.confirmPasswordReset(input.token, input.password)
    process.stdout.write(JSON.stringify({ success: result.success, code: result.success ? undefined : result.error.code }))
  }
  catch (error) {
    process.exitCode = 1
    process.stderr.write(error instanceof Error ? error.message : 'IAM security worker failed')
  }
  finally {
    await iam.close()
    await cache.close()
    await reldb.close()
  }
}

void main()
