/** 真实 LanceDB 子进程：从本轮源码构建，进程之间只共享持久目录。 */
import { fork } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'tsup'

/**
 * 创建真实 Node 测试进程工厂；调用方在 finally 关闭每个进程，再清理临时目录。
 * @param directory - 本轮测试专属临时目录
 * @returns 按数据库路径启动独立公开 vecdb 单例的工厂
 * @example const startNode = await createLancedbNodeFactory(directory)
 */
export async function createLancedbNodeFactory(directory: string) {
  // 子进程使用本轮源码构建的独立产物，不依赖仓库既有 dist。
  const output = path.join(directory, 'bundle')
  await build({
    config: false,
    entry: { index: path.resolve(import.meta.dirname, '../../src/index.ts') },
    outDir: output,
    format: ['esm'],
    platform: 'node',
    external: ['@h-ai/core', '@lancedb/lancedb', '@qdrant/js-client-rest', 'chromadb', 'pg', 'zod'],
    silent: true,
  })
  const workerFile = path.join(directory, 'worker.mjs')
  await writeFile(workerFile, `
import process from 'node:process'
import { vecdb } from ${JSON.stringify(pathToFileURL(path.join(output, 'index.js')).href)}
const initialized = await vecdb.init({ type: 'lancedb', path: process.argv[2], metric: 'dot' })
if (!initialized.success) throw new Error(JSON.stringify(initialized.error))
process.on('message', async message => {
  if (message.action === 'close') {
    await vecdb.close()
    process.disconnect()
    return
  }
  const result = message.action === 'upsert'
    ? await vecdb.vector.upsert(message.name, message.documents)
    : message.action === 'insert'
    ? await vecdb.vector.insert(message.name, message.documents)
    : { info: await vecdb.collection.info(message.name), search: await vecdb.vector.search(message.name, message.vector, { topK: 3 }) }
  process.send({ requestId: message.requestId, result })
})
process.send({ ready: true })
`)

  /** 启动持有独立公开 vecdb 单例的真实 Node 进程，通过 IPC 顺序执行操作。 */
  return async function independentNode(database: string) {
    const child = fork(workerFile, [database], { windowsHide: true, silent: true })
    child.stdout?.resume()
    let stderr = ''
    child.stderr?.on('data', chunk => stderr += chunk.toString())
    let requestId = 0
    const pending = new Map<number, { resolve: (value: unknown) => void, reject: (error: Error) => void }>()
    let readyResolve: () => void
    let readyReject: (error: Error) => void
    const ready = new Promise<void>((resolve, reject) => {
      readyResolve = resolve
      readyReject = reject
    })
    const closed = new Promise<number | null>(resolve => child.once('close', resolve))
    const timer = setTimeout(() => child.kill(), 20_000)
    child.on('message', (message) => {
      if (!message || typeof message !== 'object')
        return
      if ('ready' in message)
        readyResolve()
      if ('requestId' in message && typeof message.requestId === 'number' && 'result' in message) {
        pending.get(message.requestId)?.resolve(message.result)
        pending.delete(message.requestId)
      }
    })
    child.once('error', error => readyReject(error))
    child.once('close', (code) => {
      clearTimeout(timer)
      const error = new Error(`LanceDB worker closed: ${code}; ${stderr}`)
      readyReject(error)
      for (const request of pending.values())
        request.reject(error)
      pending.clear()
    })
    await ready
    return {
      pid: child.pid,
      invoke(action: string, input: Record<string, unknown>) {
        const id = ++requestId
        return new Promise<unknown>((resolve, reject) => {
          pending.set(id, { resolve, reject })
          child.send({ requestId: id, action, ...input }, (error) => {
            if (error) {
              pending.delete(id)
              reject(error)
            }
          })
        })
      },
      async close() {
        if (child.connected)
          child.send({ action: 'close' })
        const code = await closed
        if (code !== 0)
          throw new Error(`LanceDB worker failed: ${code}; ${stderr}`)
      },
    }
  }
}
