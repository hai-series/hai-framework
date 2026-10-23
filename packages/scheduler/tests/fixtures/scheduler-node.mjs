import process from 'node:process'
import { reldb } from '@h-ai/reldb'

let scheduler
let loggingFault = { write: 'none', read: false }

async function dispatch(command, args) {
  if (command === 'init') {
    scheduler = (await import(args.entry)).scheduler
    const database = await reldb.init(args.dbConfig ?? { type: 'sqlite', database: args.database })
    if (!database.success)
      return database
    if (args.logEffects) {
      const execute = reldb.sql.execute.bind(reldb.sql)
      const get = reldb.sql.get.bind(reldb.sql)
      const logWrite = /INSERT INTO ["`]?hai_scheduler_logs["`]?\s/i
      reldb.sql.execute = async (sql, params) => {
        const fault = { success: false, error: { code: 'hai:reldb:002', message: 'Injected log acknowledgement failure' } }
        if (logWrite.test(sql) && loggingFault.write === 'before')
          return fault
        const result = await execute(sql, params)
        return logWrite.test(sql) && loggingFault.write === 'after'
          ? fault
          : result
      }
      reldb.sql.get = (sql, params) => /FROM ["`]?hai_scheduler_logs["`]?\s/i.test(sql) && loggingFault.read
        ? Promise.resolve({ success: false, error: { code: 'hai:reldb:002', message: 'Injected log confirmation read failure' } })
        : get(sql, params)
    }
    return scheduler.init({
      enableDb: true,
      tickInterval: 100,
      leaseMs: args.leaseMs ?? 1000,
      ...(args.logEffects
        ? { hooks: { onTaskExecute: async (event) => {
            if (event.context.attempt <= (event.context.params.failAttempts ?? 0))
              throw new Error('Business retry before effect')
            const suffix = reldb.config.type === 'mysql'
              ? ' ON DUPLICATE KEY UPDATE occurrence_id = occurrence_id'
              : ' ON CONFLICT(occurrence_id) DO NOTHING'
            // 唯一主键即持久幂等账本，重复发生不会累加副作用；不依赖进程内 Set。
            const effect = await reldb.sql.execute(`INSERT INTO scheduler_log_effects (occurrence_id, value) VALUES (?, 1)${suffix}`, [event.context.occurrenceId])
            if (!effect.success)
              throw new Error('Business effect failed')
            if (event.context.params.expireBeforeReturn) {
              const expired = await reldb.sql.execute('UPDATE hai_scheduler_executions SET leased_until = 0 WHERE occurrence_id = ?', [event.context.occurrenceId])
              if (!expired.success)
                throw new Error('Lease expiration failed')
            }
            return '完整大结果"引号"'.repeat(2000)
          } } }
        : {}),
    })
  }
  if (command === 'tasks')
    return [...scheduler.tasks.values()]
  if (command === 'pause') {
    // 实际暂停进程事件循环，使续租与旧请求都停顿；不伪造 DB 时间或仅 mock renew。
    setImmediate(() => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, args.milliseconds))
    return { success: true }
  }
  if (command === 'executionGet')
    return scheduler.execution.get(...args)
  if (command === 'executionUnknown')
    return scheduler.execution.listUnknown(...args)
  if (command === 'executionResolve')
    return scheduler.execution.resolveUnknown(...args)
  if (command === 'executionRepairLog')
    return scheduler.execution.repairLog(...args)
  if (command === 'executionLogFailures')
    return scheduler.execution.listLogFailures(...args)
  if (command === 'logFault') {
    loggingFault = args
    return { success: true }
  }
  if (command === 'close') {
    await scheduler.close()
    await reldb.close()
    return { success: true }
  }
  return scheduler[command](...args)
}

process.on('message', ({ id, command, args }) => {
  void dispatch(command, args).then(
    data => process.send({ id, data }),
    error => process.send({ id, error: String(error) }),
  )
})
