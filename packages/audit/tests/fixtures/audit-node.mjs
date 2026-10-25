/** 公开构建产物在独立Node进程中的首次初始化与立即访问。 */
import process from 'node:process'
import { audit } from '@h-ai/audit'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'

core.init({ logging: { level: 'fatal' } })
/** 执行独立节点并在退出前关闭自身依赖。 */
async function main() {
  try {
    const config = JSON.parse(process.env.AUDIT_DB_INPUT)
    const ready = await reldb.init(config)
    if (!ready.success)
      throw new Error('Database init failed', { cause: ready.error })
    await new Promise((resolve) => {
      process.once('message', resolve)
      process.send({ phase: 'ready' })
    })
    const initialized = await audit.init()
    if (!initialized.success)
      throw new Error('Audit init failed', { cause: initialized.error })
    for (const result of [await audit.log({ action: 'worker', resource: 'readiness' }), await audit.list(), await audit.getStats(), await audit.cleanup(90)]) {
      if (!result.success)
        throw new Error('Immediate operation failed', { cause: result.error })
    }
    process.stdout.write(JSON.stringify({ success: true }))
  }
  catch (error) {
    process.exitCode = 1
    process.stderr.write(JSON.stringify(core.sanitize.sanitizeSensitiveFields(error)))
  }
  finally {
    await audit.close()
    await reldb.close()
    process.disconnect()
  }
}
void main()
