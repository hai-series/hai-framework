/** 首次打开共享 SQLite 的真实独立节点；初始化前等待同一 IPC 闸门。 */
import process from 'node:process'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'

async function main() {
  const config = JSON.parse(process.argv[2])
  core.init({ logging: { level: 'fatal' } })
  const released = new Promise(resolve => process.once('message', resolve))
  process.send({ phase: 'ready' })
  await released
  let outcome
  try {
    const initialized = await reldb.init(config)
    if (!initialized.success)
      throw new Error(initialized.error.message)
    const mode = await reldb.sql.get('PRAGMA journal_mode')
    const budget = await reldb.sql.get('PRAGMA busy_timeout')
    if (!mode.success || !budget.success)
      throw new Error('SQLite startup probe failed')
    outcome = { success: true, mode: mode.data?.journal_mode, timeout: budget.data?.timeout }
  }
  catch (error) {
    outcome = { success: false, error: error instanceof Error ? error.message : String(error) }
  }
  finally {
    const closed = await reldb.close()
    process.send({ phase: 'result', ...outcome, closed: closed.success, initialized: reldb.isInitialized })
    process.disconnect()
  }
}

void main().catch(() => {
  process.exitCode = 1
})
