/** 独立测试进程：真实 repository/SQL，只有节点本机 Date.now 带受控偏差。 */
import type { ReldbConfigInput } from '@h-ai/reldb'
import type { StoredExecution } from '../../src/repositories/scheduler-repository-execution.js'
import type { TaskDefinition, TaskExecutionLog } from '../../src/scheduler-types.js'
import process from 'node:process'
import { reldb } from '@h-ai/reldb'
import { scheduler } from '../../src/index.js'
import { SchedulerExecutionRepository } from '../../src/repositories/scheduler-repository-execution.js'

const actualNow = Date.now.bind(Date)
let offset = 0
Date.now = () => actualNow() + offset
let repository: SchedulerExecutionRepository | undefined
const rows = new Map<string, StoredExecution>()

interface Command { id: number, command: string, args: { config?: ReldbConfigInput, offset?: number, task?: TaskDefinition, receipt?: string, leaseMs?: number, row?: StoredExecution } }

async function dispatch({ command, args }: Command): Promise<unknown> {
  if (command === 'init') {
    if (!args.config)
      throw new Error('Database config missing')
    const initialized = await reldb.init(args.config)
    if (!initialized.success)
      return initialized
    repository = new SchedulerExecutionRepository(reldb)
    return repository.count()
  }
  if (command === 'clock') {
    offset = args.offset ?? 0
    return { success: true }
  }
  if (command === 'close') {
    await scheduler.close()
    return reldb.close()
  }
  if (command === 'initScheduler') {
    return scheduler.init({ tickInterval: 100, leaseMs: 1000, hooks: { onTaskExecute: async ({ context }) => {
      const suffix = reldb.config?.type === 'mysql' ? ' ON DUPLICATE KEY UPDATE call_count = call_count + 1' : ' ON CONFLICT(receipt) DO UPDATE SET call_count = scheduler_clock_effects.call_count + 1'
      const result = await reldb.sql.execute(`INSERT INTO scheduler_clock_effects (receipt, call_count) VALUES (?, 1)${suffix}`, [context.occurrenceId])
      if (!result.success)
        throw new Error('Durable clock effect failed')
      return 'done'
    } } })
  }
  if (command === 'register') {
    if (!args.task)
      throw new Error('Task missing')
    return scheduler.register(args.task)
  }
  if (command === 'start')
    return scheduler.start()
  if (command === 'stop')
    return scheduler.stop()
  if (!repository)
    throw new Error('Repository unavailable')
  const receipt = args.receipt ?? ''
  const leaseMs = args.leaseMs ?? 1000
  if (command === 'claim') {
    if (!args.task)
      throw new Error('Task missing')
    const result = await repository.claim(args.task, receipt, { type: 'manual', source: null }, 'clock-node', leaseMs)
    if (result.success && result.data)
      rows.set(receipt, result.data)
    return result
  }
  if (command === 'get')
    return repository.byOccurrence(receipt)
  if (command === 'expired')
    return repository.expired()
  if (command === 'time')
    return repository.currentTime()
  if (command === 'isolate') {
    if (!args.row)
      throw new Error('Row missing')
    return repository.isolateExpired(args.row)
  }
  const row = rows.get(receipt)
  if (!row)
    throw new Error('Claim handle missing')
  if (command === 'begin')
    return repository.begin(row, leaseMs)
  if (command === 'renew')
    return repository.renew(row, leaseMs)
  if (command === 'finish') {
    const log: TaskExecutionLog = { id: crypto.randomUUID(), occurrenceId: receipt, persistence: { status: 'pending' }, taskId: row.taskId, taskName: row.taskId, taskType: 'hook', triggerType: 'manual', triggerSource: null, status: 'success', result: 'committed', error: null, startedAt: Date.now(), finishedAt: Date.now(), duration: 0 }
    return repository.finish(row, log)
  }
  throw new Error('Unknown command')
}

process.on('message', (message: Command) => {
  process.send?.({ id: message.id, started: true })
  void dispatch(message).then(
    data => process.send?.({ id: message.id, data }),
    error => process.send?.({ id: message.id, error: error instanceof Error ? error.message : String(error) }),
  )
})
