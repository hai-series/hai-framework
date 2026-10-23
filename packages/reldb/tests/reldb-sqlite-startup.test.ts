/** 真实双进程同时首次打开同一新文件，覆盖同步、worker 和混合引擎。 */
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

interface StartupResult {
  phase: 'result'
  success: boolean
  mode?: string
  timeout?: number
  closed: boolean
  initialized: boolean
}

function startupNode(database: string, executor: 'sync' | 'worker') {
  const child = spawn(process.execPath, [
    fileURLToPath(new URL('./fixtures/sqlite-startup-node.mjs', import.meta.url)),
    JSON.stringify({ type: 'sqlite', database, sqlite: { executor } }),
  ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] })
  let stderr = ''
  let result: StartupResult | undefined
  const ready = Promise.withResolvers<void>()
  const done = Promise.withResolvers<StartupResult>()
  const timer = setTimeout(() => child.kill(), 10_000)
  child.stderr.on('data', chunk => stderr = (stderr + chunk.toString()).slice(-4096))
  child.on('message', (message: { phase: string }) => {
    if (message.phase === 'ready')
      ready.resolve()
    if (message.phase === 'result')
      result = message as StartupResult
  })
  child.once('error', (error) => {
    ready.reject(error)
    done.reject(error)
  })
  child.once('close', (code) => {
    clearTimeout(timer)
    ready.reject(new Error(`SQLite node exited before startup: ${stderr}`))
    if (code === 0 && result)
      done.resolve(result)
    else
      done.reject(new Error(`SQLite node failed (${code}): ${stderr}`))
  })
  // 断言或启动失败时 finally 仍需停止全部节点，提前观察拒绝以免产生孤立 Promise。
  void ready.promise.catch(() => {})
  void done.promise.catch(() => {})
  return { child, ready: ready.promise, done: done.promise }
}

it.each([
  ['sync', 'sync'],
  ['worker', 'worker'],
  ['sync', 'worker'],
] as const)('fresh shared SQLite starts concurrently with %s/%s and releases both nodes', async (first, second) => {
  const root = fileURLToPath(new URL('../tmp/', import.meta.url))
  await mkdir(root, { recursive: true })
  const directory = await mkdtemp(join(root, 'sqlite-startup-'))
  const nodes = [startupNode(join(directory, 'shared.sqlite'), first), startupNode(join(directory, 'shared.sqlite'), second)]
  try {
    await Promise.all(nodes.map(node => node.ready))
    for (const node of nodes)
      node.child.send({ action: 'initialize' })
    const results = await Promise.all(nodes.map(node => node.done))
    for (const result of results)
      expect(result).toMatchObject({ success: true, mode: 'wal', timeout: 5000, closed: true, initialized: false })
  }
  finally {
    for (const node of nodes) {
      if (node.child.exitCode === null && node.child.signalCode === null)
        node.child.kill()
    }
    await Promise.allSettled(nodes.map(node => node.done))
    // 仅回收本测试 mkdtemp 的已解析绝对目录，等两个进程退出后再删除数据库。
    expect(dirname(directory)).toBe(root.replace(/[\\/]$/, ''))
    await rm(directory, { recursive: true, force: true })
  }
}, 10_000)
