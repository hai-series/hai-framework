import type { ChildProcess } from 'node:child_process'
import { fork } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'tsup'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

describe('scheduler across real processes', () => {
  let directory: string
  const children: ChildProcess[] = []
  let sequence = 0
  let nodeA: ChildProcess
  let nodeB: ChildProcess

  function call(child: ChildProcess, command: string, args: unknown = []): Promise<unknown> {
    const id = ++sequence
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        child.off('message', receive)
        reject(new Error(`Child request timed out: ${command}`))
      }, 10000)
      function receive(message: { id: number, data?: unknown, error?: string }) {
        if (message.id !== id)
          return
        clearTimeout(timer)
        child.off('message', receive)
        if (message.error)
          reject(new Error(message.error))
        else
          resolve(message.data)
      }
      child.on('message', receive)
      child.send({ id, command, args })
    })
  }

  beforeAll(async () => {
    const root = fileURLToPath(new URL('../', import.meta.url))
    await mkdir(path.join(root, '.cache'), { recursive: true })
    directory = await mkdtemp(path.join(root, '.cache/multinode-'))
    await build({
      config: false,
      entry: { 'index': path.join(root, 'src/index.ts'), 'scheduler-js-worker': path.join(root, 'src/scheduler-js-worker.js') },
      outDir: directory,
      format: ['esm'],
      target: 'node22',
      dts: false,
      silent: true,
      external: ['@h-ai/core', '@h-ai/reldb', 'croner', 'zod'],
    })
    const initialize = async () => {
      const child = fork(fileURLToPath(new URL('./fixtures/scheduler-node.mjs', import.meta.url)), [], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'], execArgv: [] })
      children.push(child)
      expect(await call(child, 'init', {
        entry: pathToFileURL(path.join(directory, 'index.js')).href,
        database: path.join(directory, 'shared.db'),
      })).toMatchObject({ success: true })
      return child
    }
    // 顺序建表；之后两个进程只依赖同一数据库，不依赖 cache 锁。
    nodeA = await initialize()
    nodeB = await initialize()
  }, 120000)

  afterAll(async () => {
    await Promise.all(children.map(async (child) => {
      try {
        if (child.connected)
          await call(child, 'close')
      }
      finally {
        const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
        child.kill()
        await exited
      }
    }))
    if (directory)
      await rm(directory, { recursive: true, force: true })
  })

  it('converges after register, update, disable, delete and one-time execution', async () => {
    expect(await call(nodeA, 'start')).toMatchObject({ success: true })
    expect(await call(nodeB, 'start')).toMatchObject({ success: true })
    const task = { id: 'shared', name: 'shared', cron: '0 0 1 1 *', params: { version: 1 }, handler: { kind: 'js', code: 'context => context.params.version' } }
    expect(await call(nodeA, 'register', [task])).toMatchObject({ success: true })
    await vi.waitFor(async () => expect(await call(nodeB, 'tasks')).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'shared' })])), { timeout: 3000 })
    expect(await call(nodeA, 'updateTask', ['shared', { params: { version: 2 } }])).toMatchObject({ success: true })
    expect(await call(nodeB, 'trigger', ['shared'])).toMatchObject({ success: true, data: { status: 'success', result: '2' } })
    expect(await call(nodeA, 'updateTask', ['shared', { enabled: false }])).toMatchObject({ success: true })
    expect(await call(nodeB, 'trigger', ['shared'])).toMatchObject({ success: true, data: { status: 'interrupted' } })
    await vi.waitFor(async () => expect(await call(nodeB, 'tasks')).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'shared', enabled: false })])), { timeout: 3000 })
    expect(await call(nodeA, 'unregister', ['shared'])).toMatchObject({ success: true })
    await vi.waitFor(async () => expect(await call(nodeB, 'tasks')).toEqual([]), { timeout: 3000 })
    expect(await call(nodeB, 'trigger', ['shared'])).toMatchObject({ success: false })
    expect(await call(nodeA, 'register', [{ ...task, id: 'once', deleteAfterRun: true }])).toMatchObject({ success: true })
    expect(await call(nodeB, 'trigger', ['once'])).toMatchObject({ success: true, data: { status: 'success' } })
    await vi.waitFor(async () => expect(await call(nodeA, 'tasks')).toEqual([]), { timeout: 3000 })
    expect(await call(nodeA, 'register', [{ ...task, id: 'contended', cron: '* * * * *' }])).toMatchObject({ success: true })
    expect(await call(nodeA, 'stop')).toMatchObject({ success: true })
    expect(await call(nodeB, 'stop')).toMatchObject({ success: true })
    expect(await call(nodeA, 'start')).toMatchObject({ success: true })
    expect(await call(nodeB, 'start')).toMatchObject({ success: true })
    await vi.waitFor(async () => {
      const logs = await call(nodeA, 'getLogs', [{ taskId: 'contended' }]) as { success: boolean, data: { items: { status: string }[] } }
      expect(logs.success).toBe(true)
      expect(logs.data.items.filter(log => log.status === 'success')).toHaveLength(1)
      expect(logs.data.items.some(log => log.status === 'interrupted')).toBe(true)
    }, { timeout: 3000 })
  }, 20000)
})
