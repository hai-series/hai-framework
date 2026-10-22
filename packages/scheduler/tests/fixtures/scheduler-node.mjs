import process from 'node:process'
import { reldb } from '@h-ai/reldb'

let scheduler

async function dispatch(command, args) {
  if (command === 'init') {
    scheduler = (await import(args.entry)).scheduler
    const database = await reldb.init({ type: 'sqlite', database: args.database })
    if (!database.success)
      return database
    return scheduler.init({ enableDb: true, tickInterval: 100, leaseMs: args.leaseMs ?? 1000 })
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
