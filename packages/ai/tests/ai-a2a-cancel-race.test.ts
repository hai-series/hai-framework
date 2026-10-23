/** 旧执行的取消回调未确认时，同 taskId 不得启动下一代执行。 */
import type { MessageSendParams, Task } from '@a2a-js/sdk'
import type { A2AImplementation } from '../src/a2a/ai-a2a-functions.js'
import { expect, it, vi } from 'vitest'
import { createA2AOperations, createA2AStores } from '../src/a2a/ai-a2a-functions.js'
import { createMemoryStoreProvider } from '../src/store/providers/ai-store-provider-memory.js'

/** 门闩用于控制真实取消回调与执行结束的先后，不依赖固定 sleep。 */
function latch() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

it('input-required 已持久化但旧取消尚未确认时，跨节点拒绝新消息并保留原消息重试', async () => {
  const stores = createA2AStores(createMemoryStoreProvider())
  const finishExecute = latch()
  const cancelEntered = latch()
  const finishCancel = latch()
  const cancelCompleted = latch()
  let executions = 0
  const affectedGenerations: number[] = []
  const owner = createA2AOperations({
    agentCard: { name: 'cancel-owner', url: 'https://owner.example' },
    runtime: { leaseMs: 1000, pollIntervalMs: 10, maxExecutionMs: 10000 },
    executor: {
      async execute(context, bus) {
        executions++
        bus.publish({ kind: 'task', id: context.taskId, contextId: context.contextId, status: { state: 'working' } })
        await finishExecute.promise
        bus.publish({ kind: 'status-update', taskId: context.taskId, contextId: context.contextId, status: { state: 'input-required' }, final: true })
        bus.finished()
      },
      async cancelTask() {
        cancelEntered.release()
        await finishCancel.promise
        // 常见执行器以 taskId 找到当前控制器；旧取消不得跨代作用到新执行。
        affectedGenerations.push(executions)
        cancelCompleted.release()
      },
    },
  }, stores)
  const forbidden = vi.fn(async () => {
    throw new Error('Remote node must not execute or cancel')
  })
  const remote = createA2AOperations({ agentCard: { name: 'remote', url: 'https://remote.example' }, executor: { execute: forbidden, cancelTask: forbidden }, runtime: { leaseMs: 1000, pollIntervalMs: 10, maxExecutionMs: 10000 } }, stores)
  const request = (api: A2AImplementation, method: string, params: unknown) => api.handleRequest({ jsonrpc: '2.0', id: 'race', method, params }, { agentId: 'alice' })
  const first: MessageSendParams = { message: { kind: 'message', role: 'user', messageId: 'first', parts: [{ kind: 'text', text: 'first' }] }, configuration: { blocking: false } }
  try {
    const started = await request(owner, 'message/send', first)
    expect(started.streaming).toBe(false)
    expect(started.body).not.toHaveProperty('error')
    const task = (started.body as { result: Task }).result
    const cancellation = request(remote, 'tasks/cancel', { id: task.id })
    await cancelEntered.promise
    finishExecute.release()
    await vi.waitFor(async () => {
      const current = await stores.journalStore.get(task.id)
      expect(current?.finished).toBe(true)
      expect(current?.task.status.state).toBe('input-required')
      expect(current?.cancelRequested).toBe(true)
    })

    const next = await request(remote, 'message/send', { message: { ...first.message, taskId: task.id, messageId: 'second' }, configuration: { blocking: false } })
    expect(next.streaming).toBe(false)
    expect(next.body).toHaveProperty('error.code', -32602)
    expect(executions).toBe(1)

    const replay = await request(remote, 'message/send', first)
    expect(replay.body).not.toHaveProperty('error')
    expect(replay.body).toHaveProperty('result.id', task.id)
    expect(executions).toBe(1)
    finishCancel.release()
    await cancelCompleted.promise
    await cancellation
    expect(affectedGenerations).toEqual([1])
    expect(forbidden).not.toHaveBeenCalled()
  }
  finally {
    finishExecute.release()
    finishCancel.release()
    await Promise.all([owner.close(), remote.close()])
  }
})
