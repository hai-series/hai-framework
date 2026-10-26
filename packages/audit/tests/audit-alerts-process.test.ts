/** 多个独立进程、节点时钟偏差和外部效果后崩溃的真实验收。 */
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { reldb } from '@h-ai/reldb'
import { build } from 'tsup'
import { expect, it } from 'vitest'
import { postgresEnv } from '../../reldb/tests/helpers/reldb-test-suite.js'
import { audit } from '../src/index.js'

it('独立 PostgreSQL 节点并发不重复通知；外部已收请求后进程崩溃，重启不盲目重发', async () => {
  const packageDir = fileURLToPath(new URL('..', import.meta.url))
  const root = path.join(packageDir, 'tmp')
  await mkdir(root, { recursive: true })
  const directory = await mkdtemp(path.join(root, 'audit-alert-nodes-'))
  let environment: Awaited<ReturnType<typeof postgresEnv>> | undefined
  const workers: ReturnType<typeof startWorker>[] = []
  let received = 0
  let hold = false
  let notifyReceived: (() => void) | undefined
  const server = createServer((request, response) => {
    request.resume()
    request.on('end', () => {
      received++
      notifyReceived?.()
      if (!hold)
        response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ messageId: 'accepted' }))
    })
  })
  function startWorker(config: string, offset = 0) {
    const child = spawn(process.execPath, [fileURLToPath(new URL('./fixtures/audit-alert-worker.mjs', import.meta.url)), pathToFileURL(path.join(directory, 'index.js')).href, config, String(offset)], { cwd: packageDir, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
    let stdout = ''
    let stderr = ''
    let result: unknown
    child.stdout.on('data', chunk => stdout += chunk.toString())
    child.stderr.on('data', chunk => stderr += chunk.toString())
    let initialized = false
    let rejectReady: (error: Error) => void
    const ready = new Promise<void>((resolve, reject) => {
      rejectReady = reject
      child.on('message', (message: unknown) => {
        if (message && typeof message === 'object' && 'ready' in message) {
          initialized = true
          resolve()
        }
        if (message && typeof message === 'object' && 'result' in message)
          result = message.result
      })
    })
    const timer = setTimeout(() => child.kill(), 20000)
    const completed = new Promise<{ code: number | null, result: unknown }>((resolve) => {
      child.on('error', error => rejectReady(error))
      child.on('close', (code) => {
        clearTimeout(timer)
        if (!initialized)
          rejectReady(new Error(`Alert worker initialization failed (${code}): ${stderr}\n${stdout}`))
        resolve({ code, result })
      })
    })
    const worker = { child, ready, completed }
    workers.push(worker)
    return worker
  }
  try {
    environment = await postgresEnv()
    await build({ config: false, entry: { index: path.join(packageDir, 'src/index.ts') }, outDir: directory, format: ['esm'], bundle: true, dts: false, silent: true, external: ['@h-ai/core', '@h-ai/reldb', '@h-ai/reach', 'zod'] })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Missing owned alert receiver')
    const config = {
      database: environment.config,
      url: `http://127.0.0.1:${address.port}`,
      alerts: { enabled: true, rules: [{ id: 'multiprocess', actions: ['node.alert'], threshold: 1, windowSeconds: 86400, severity: 'critical', targets: [{ id: 'security', provider: 'notify', to: 'security@example.invalid' }] }] },
    }
    expect((await reldb.init(environment.config)).success).toBe(true)
    expect((await audit.init()).success).toBe(true)
    expect((await audit.log({ action: 'node.alert', resource: 'auth', outcome: 'failure' })).success).toBe(true)
    await audit.close()
    await reldb.close()
    const configFile = path.join(directory, 'private-config.json')
    await writeFile(configFile, JSON.stringify(config))
    const nodes = [-3600000, 0, 3600000].map(offset => startWorker(configFile, offset))
    await Promise.all(nodes.map(node => node.ready))
    nodes.forEach(node => node.child.send('check'))
    const results = await Promise.all(nodes.map(node => node.completed))
    expect(results.every(result => result.code === 0)).toBe(true)
    expect(results.map(result => result.result)).toEqual(expect.arrayContaining([expect.objectContaining({ success: true, data: expect.objectContaining({ submitted: 1 }) })]))
    expect(received).toBe(1)

    // 新规则用于独立故障场景；不更改既有领取。服务已收请求但未回复时终止该进程。
    config.alerts.rules[0].id = 'crashed-at-provider'
    await writeFile(configFile, JSON.stringify(config))
    hold = true
    const accepted = new Promise<void>((resolve) => {
      notifyReceived = resolve
    })
    const crashed = startWorker(configFile)
    await crashed.ready
    crashed.child.send('check')
    await Promise.race([accepted, crashed.completed.then(() => {
      throw new Error('Worker exited before receiver accepted request')
    })])
    crashed.child.kill()
    await crashed.completed
    hold = false
    notifyReceived = undefined
    const restarted = startWorker(configFile)
    await restarted.ready
    restarted.child.send('check')
    expect(await restarted.completed).toMatchObject({ code: 0, result: { success: true, data: { submitted: 0 } } })
    expect(received).toBe(2)
  }
  finally {
    workers.forEach(worker => worker.child.kill())
    await Promise.allSettled(workers.map(worker => worker.completed))
    await audit.close()
    await reldb.close()
    server.closeAllConnections()
    if (server.listening)
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    await environment?.release?.()
    const actual = await realpath(directory)
    expect(actual.startsWith(`${await realpath(root)}${path.sep}audit-alert-nodes-`), 'Owned alert fixture cleanup path').toBe(true)
    await rm(actual, { recursive: true, force: true })
  }
}, 90000)
