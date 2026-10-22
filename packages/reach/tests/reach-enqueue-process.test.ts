import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'tsup'
import { expect, it } from 'vitest'

const packageDir = fileURLToPath(new URL('..', import.meta.url))
const workerPath = fileURLToPath(new URL('./fixtures/reach-queue-worker.mjs', import.meta.url))

async function runWorker(args: string[]): Promise<{ queueId: string, status: string, messageId?: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [workerPath, ...args], { cwd: packageDir, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => child.kill(), 10000)
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      const output = stdout.split('\n').find(line => line.startsWith('QUEUE_RESULT:'))
      if (code !== 0 || !output) {
        reject(new Error(`Queue worker failed (${code}): ${stderr}\n${stdout}`))
        return
      }
      resolve(JSON.parse(output.slice('QUEUE_RESULT:'.length)))
    })
  })
}

it('入队进程退出后，另一进程从同一持久化库恢复并实际投递', async () => {
  const received: string[] = []
  const server = createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => {
      body += chunk.toString()
    })
    request.on('end', () => {
      received.push(body)
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ messageId: 'callback-delivered' }))
    })
  })
  const tempRoot = join(packageDir, 'tmp')
  await mkdir(tempRoot, { recursive: true })
  const temporary = await mkdtemp(join(tempRoot, 'reach-enqueue-'))
  try {
    // 从当前源码创建隔离执行产物，不依赖本包可能过期的 dist。
    await build({
      config: false,
      entry: { index: join(packageDir, 'src/index.ts') },
      outDir: temporary,
      format: ['esm'],
      bundle: true,
      dts: false,
      silent: true,
      external: ['@h-ai/core', '@h-ai/cache', '@h-ai/reldb', 'zod', 'nodemailer'],
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Callback listener has no port')
    const bundle = pathToFileURL(join(temporary, 'index.js')).href
    const database = join(temporary, 'queue.sqlite')
    const url = `http://127.0.0.1:${address.port}/callback`
    const queued = await runWorker([bundle, 'enqueue', database, url])
    expect(queued.status).toBe('pending')
    expect(received).toHaveLength(0)
    const delivered = await runWorker([bundle, 'deliver', database, url, queued.queueId])
    expect(delivered).toEqual({ queueId: queued.queueId, status: 'sent', messageId: 'callback-delivered' })
    expect(received).toHaveLength(1)
    expect(JSON.parse(received[0])).toMatchObject({ to: 'process-test', body: 'durable across processes' })
  }
  finally {
    if (server.listening) {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
    // 仅清理本用例创建的目录；两个子进程均已退出后才删除 SQLite 文件。
    await rm(temporary, { recursive: true, force: true })
  }
}, 30000)
