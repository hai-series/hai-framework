/**
 * 延迟队列进程验收助手；先运行 enqueue 并退出，再由独立 deliver 进程恢复。
 * @example node reach-queue-worker.mjs bundleUrl enqueue databasePath callbackUrl
 */
import process from 'node:process'
import { setTimeout } from 'node:timers/promises'
import { reldb } from '@h-ai/reldb'

async function main() {
  const [moduleUrl, phase, database, url, queueId] = process.argv.slice(2)
  const { reach } = await import(moduleUrl)

  // 只控制免打扰的本地钟点；租约、超时与数据库时间戳仍使用真实时钟。
  const ActualDate = Date
  globalThis.Date = class extends ActualDate {
    getHours() {
      return phase === 'enqueue' ? 23 : 9
    }

    getMinutes() {
      return 0
    }
  }

  try {
    const db = await reldb.init({ type: 'sqlite', database })
    if (!db.success)
      throw new Error(db.error.message)
    const initialized = await reach.init({
      providers: [{ name: 'callback', type: 'api', url }],
      dnd: { enabled: true, strategy: 'delay', start: '22:00', end: '08:00' },
    })
    if (!initialized.success)
      throw new Error(initialized.error.message)

    if (phase === 'enqueue') {
      const result = await reach.send({ provider: 'callback', to: 'process-test', body: 'durable across processes' })
      if (!result.success || !result.data.deferred || !result.data.queueId)
        throw new Error('Message was not durably queued')
      const record = await reldb.sql.get('SELECT status FROM hai_reach_send_log WHERE queue_id = ?', [result.data.queueId])
      if (!record.success || record.data?.status !== 'pending')
        throw new Error('Pending message was not persisted')
      process.stdout.write(`QUEUE_RESULT:${JSON.stringify({ queueId: result.data.queueId, status: record.data.status })}\n`)
    }
    else {
      const deadline = Date.now() + 5000
      let sent = false
      while (Date.now() < deadline) {
        const record = await reldb.sql.get('SELECT status, message_id FROM hai_reach_send_log WHERE queue_id = ?', [queueId])
        if (!record.success)
          throw new Error(record.error.message)
        if (record.data?.status === 'sent') {
          process.stdout.write(`QUEUE_RESULT:${JSON.stringify({ queueId, status: record.data.status, messageId: record.data.message_id })}\n`)
          sent = true
          break
        }
        await setTimeout(10)
      }
      if (!sent)
        throw new Error('Another process did not deliver the persisted message')
    }
  }
  finally {
    await reach.close()
    await reldb.close()
    globalThis.Date = ActualDate
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
