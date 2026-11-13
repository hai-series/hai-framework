import type { RunnerEvent, RunnerExecution, RunnerJson } from '@h-ai/runner'
import type { ChildProcess } from 'node:child_process'
import { execFile, fork } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { postgresEnv } from '../../reldb/tests/helpers/reldb-test-suite.js'

const engine = (process.env.HAI_ACP_E2E_ENGINE ?? process.env.HAI_TEST_CONTAINER_ENGINE) === 'docker'
  ? 'docker'
  : 'podman'
const image = process.env.HAI_ACP_MANAGED_TEST_IMAGE
const shell = promisify(execFile)
const childFixture = fileURLToPath(new URL('./fixtures/acp-platform-node.mjs', import.meta.url))
let sequence = 0

interface Reply<T> {
  id: number
  output?: T
  error?: string
  event?: RunnerJson
}

function call<T = unknown>(
  child: ChildProcess,
  method: string,
  input?: unknown,
  onEvent?: (event: RunnerJson) => void,
): Promise<T> {
  const id = ++sequence
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => fail(new Error(`ACP test node timeout: ${method}`)), 20_000)
    const exited = () => fail(new Error(`ACP test node exited during ${method}`))
    function release() {
      clearTimeout(timer)
      child.off('message', receive)
      child.off('exit', exited)
    }
    function fail(error: Error) {
      release()
      reject(error)
    }
    function receive(message: Reply<T>) {
      if (message.id !== id)
        return
      if (message.event !== undefined) {
        onEvent?.(message.event)
        return
      }
      if (message.error) {
        fail(new Error(message.error))
        return
      }
      release()
      resolve(message.output as T)
    }
    child.on('message', receive)
    child.once('exit', exited)
    child.send({ id, method, input }, (error) => {
      if (error)
        fail(error)
    })
  })
}

async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null)
    return
  const exit = once(child, 'exit')
  try {
    if (child.connected) {
      await call(child, 'close')
      child.disconnect()
    }
  }
  finally {
    // 只终止当前测试拥有的子进程，保留正常关闭错误供断言。
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000)
    try {
      await exit
    }
    finally {
      clearTimeout(timer)
    }
  }
}

describe.skipIf(!image)('independent ACP API and executor processes', () => {
  it('deduplicates runs across API nodes, reconnects from another process, and cancels through the shared journal', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hai-acp-distributed-'))
    const children: ChildProcess[] = []
    let release: (() => Promise<void>) | undefined
    try {
      const { config, release: releaseDatabase } = await postgresEnv()
      release = releaseDatabase
      const [{ stdout }, script] = await Promise.all([
        shell(engine, [
          'image',
          'inspect',
          '--format',
          '{{.Id}}',
          image!,
        ]),
        readFile(new URL('./fixtures/acp-multiplex.mjs', import.meta.url), 'utf8'),
      ])
      const imageId = stdout.trim().replace(/^(?:sha256:)?/u, 'sha256:')
      const start = async (nodeId: string, executor: boolean) => {
        const child = fork(childFixture, [], {
          execArgv: [],
          stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
        })
        children.push(child)
        expect(await call(child, 'init', {
          database: config,
          vectorDirectory: join(directory, nodeId),
          engine,
          nodeId,
          executor,
          image: imageId,
          script,
        })).toEqual({ isExecutor: executor })
        return child
      }
      const executor = await start('executor', true)
      const left = await start('api-left', false)
      const right = await start('api-right', false)
      const first = await call<{ success: true, data: { taskId: string } }>(left, 'run')
      expect(first).toMatchObject({
        success: true,
        data: {
          output: { text: 'cross-node' },
        },
      })
      expect(await call(right, 'run')).toMatchObject({
        success: true,
        data: { taskId: first.data.taskId },
      })

      const sessionId = await call<string>(left, 'open')
      await stop(left)
      let taskId: string | undefined
      let approvalObserved = false
      const pending = call(right, 'prompt', { sessionId, prompt: 'approval' }, (event) => {
        if (!event || typeof event !== 'object' || Array.isArray(event))
          return
        if (event.type === 'accepted' && typeof event.taskId === 'string')
          taskId = event.taskId
        if (event.type === 'approval')
          approvalObserved = true
      })
      void pending.catch(() => {})
      await expect.poll(() => approvalObserved, { timeout: 7000 }).toBe(true)
      expect(taskId).toBeDefined()
      const reconnect = await start('api-reconnect', false)
      expect(await call(reconnect, 'unauthorized', { taskId })).toMatchObject({ success: false })
      expect(await call(reconnect, 'get', { taskId })).toMatchObject({
        success: true,
        data: {
          owner: { nodeId: 'executor' },
          status: 'running',
        },
      } satisfies { success: true, data: Partial<RunnerExecution> })
      const history = await call<{ success: true, data: RunnerEvent[] }>(reconnect, 'events', { taskId, cursor: 0 })
      expect(history).toMatchObject({
        success: true,
        data: [
          {
            data: { type: 'approval', sessionId },
          },
        ],
      })
      expect(await call(reconnect, 'events', { taskId, cursor: history.data.at(-1)!.sequence }))
        .toMatchObject({ success: true, data: [] })
      expect(await call(reconnect, 'cancel', { taskId })).toMatchObject({ success: true })
      expect(await pending).toMatchObject({ success: false })
      expect(await call(reconnect, 'get', { taskId })).toMatchObject({
        success: true,
        data: { status: 'cancelled' },
      })
      await call(reconnect, 'end', { sessionId })
      await stop(executor)
    }
    finally {
      try {
        const closed = await Promise.allSettled(children.map(stop))
        expect(closed.filter(result => result.status === 'rejected')).toEqual([])
      }
      finally {
        try {
          await release?.()
        }
        finally {
          await rm(directory, { recursive: true, force: true })
        }
      }
    }
  }, 120_000)
})
