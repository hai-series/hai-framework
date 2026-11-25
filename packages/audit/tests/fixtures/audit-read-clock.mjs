/** 使用真实包入口验证不同进程时区观察到同一审计时间。 */
import process from 'node:process'
import { audit } from '@h-ai/audit'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'

core.init({
  logging: { level: 'fatal' },
})

/** 仅查询由本夹具写入的事件，避免度量受其他测试事件影响。 */
async function main() {
  try {
    const connected = await reldb.init(JSON.parse(process.env.AUDIT_DB_INPUT))
    if (!connected.success)
      throw new Error('Database init failed', { cause: connected.error })
    const initialized = await audit.init()
    if (!initialized.success)
      throw new Error('Audit init failed', { cause: initialized.error })
    const event = { action: 'read-clock', resource: 'audit-tz-fixture' }
    const inputEpoch = process.argv[2]
    if (inputEpoch === undefined) {
      const written = await audit.log(event)
      if (!written.success)
        throw new Error('Audit write failed', { cause: written.error })
      process.stdout.write(JSON.stringify(written.data.createdAt.getTime()))
      return
    }
    const time = new Date(Number(inputEpoch))
    const read = await audit.list({ ...event, startDate: time, endDate: time })
    if (!read.success)
      throw new Error('Audit read failed', { cause: read.error })
    process.stdout.write(JSON.stringify({
      epoch: read.data.items[0]?.createdAt.getTime(),
      count: read.data.total,
    }))
  }
  catch (error) {
    process.exitCode = 1
    process.stderr.write(JSON.stringify(core.sanitize.sanitizeSensitiveFields(error)))
  }
  finally {
    await audit.close()
    await reldb.close()
  }
}

void main()
