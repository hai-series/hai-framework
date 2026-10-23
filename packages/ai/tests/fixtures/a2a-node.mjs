/** A2A真实Node节点，业务执行器只使用公开ai接口，SQLite持久记录执行次数。 */
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { ai } from '@h-ai/ai'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { vecdb } from '@h-ai/vecdb'

async function main() {
  const input = JSON.parse(process.env.A2A_NODE_INPUT)
  const running = new Map()
  let exit
  const stopped = new Promise((resolve) => {
    exit = resolve
  })
  try {
    core.init({ logging: { level: 'fatal' } })
    for (const initialize of [() => reldb.init(input.dbConfig), () => vecdb.init(input.vecdbConfig), () => ai.init({ a2a: { agentCard: { name: 'node', url: 'https://agent.example' }, execution: { leaseMs: 1000, pollIntervalMs: 20, maxExecutionMs: 15000 } } })]) {
      const result = await initialize()
      if (!result.success)
        throw new Error(`Node initialization failed: ${result.error.message}`)
    }
    const registered = ai.a2a.registerExecutor({
      async execute(context, bus) {
        const content = context.userMessage.parts.find(part => part.kind === 'text')?.text
        const effect = await reldb.sql.execute('INSERT INTO a2a_test_effects (task_id, message_id) VALUES (?, ?)', [context.taskId, context.userMessage.messageId])
        if (!effect.success)
          throw new Error('Effect tracking failed')
        bus.publish({ kind: 'task', id: context.taskId, contextId: context.contextId, status: { state: 'working' } })
        if (content === 'input') {
          bus.publish({ kind: 'status-update', taskId: context.taskId, contextId: context.contextId, status: { state: 'input-required' }, final: true })
        }
        else if (content === 'hold') {
          await new Promise(resolve => running.set(context.taskId, resolve))
          return
        }
        else if (content === 'pause') {
          await delay(80)
          process.send({ phase: 'paused', taskId: context.taskId })
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2600)
          bus.publish({ kind: 'status-update', taskId: context.taskId, contextId: context.contextId, status: { state: 'completed' }, final: true })
        }
        else {
          bus.publish({ kind: 'status-update', taskId: context.taskId, contextId: context.contextId, status: { state: 'completed' }, final: true })
        }
        bus.finished()
      },
      async cancelTask(taskId, bus) {
        if (!running.has(taskId))
          throw new Error('Cancellation reached a different node')
        const result = await reldb.sql.execute('INSERT INTO a2a_test_cancels (task_id) VALUES (?)', [taskId])
        if (!result.success)
          throw new Error('Cancel tracking failed')
        bus.publish({ kind: 'status-update', taskId, status: { state: 'canceled' }, final: true })
        bus.finished()
        running.get(taskId)()
        running.delete(taskId)
      },
    })
    if (!registered.success)
      throw new Error('Executor registration failed')
    process.on('message', async (message) => {
      try {
        if (message.action === 'close') {
          exit()
          return
        }
        const result = await ai.a2a.handleRequest(message.request, { agentId: 'alice' })
        if (result.streaming) {
          for await (const event of result.stream) process.send({ id: message.id, event })
          process.send({ id: message.id, done: true })
        }
        else {
          process.send({ id: message.id, body: result.body })
        }
      }
      catch { process.send({ id: message.id, failed: true }) }
    })
    process.send({ phase: 'ready' })
    await stopped
  }
  catch (error) {
    process.stderr.write(error instanceof Error ? error.message : 'Node failed')
    process.exitCode = 1
  }
  finally {
    await ai.close()
    await vecdb.close()
    await reldb.close()
    process.disconnect()
  }
}
void main()
