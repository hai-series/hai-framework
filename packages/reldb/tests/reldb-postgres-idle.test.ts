/** 独立 Node 进程持有真实 PG 空闲连接，服务端断开后进程和连接池必须继续工作。 */
import { fork } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { Pool } from 'pg'
import { build } from 'tsup'
import { expect, it, vi } from 'vitest'
import { acquirePostgresContainer } from './helpers/postgres-container.js'

it('a killed idle PG backend cannot crash the application; a later query opens a new connection', async () => {
  const temporaryRoot = path.resolve(import.meta.dirname, '../../..', 'tmp')
  await mkdir(temporaryRoot, { recursive: true })
  const directory = await mkdtemp(path.join(temporaryRoot, 'reldb-idle-'))
  if (!path.resolve(directory).startsWith(`${temporaryRoot}${path.sep}`))
    throw new Error('Refusing a directory outside the test temporary root')
  let lease: Awaited<ReturnType<typeof acquirePostgresContainer>> | undefined
  let observer: Pool | undefined
  let child: ReturnType<typeof fork> | undefined
  let closed: Promise<number | null> | undefined
  let killTimer: ReturnType<typeof setTimeout> | undefined
  try {
    await build({
      config: false,
      entry: { index: path.resolve(import.meta.dirname, '../src/index.ts') },
      outDir: path.join(directory, 'bundle'),
      format: ['esm'],
      platform: 'node',
      external: ['@h-ai/core', 'better-sqlite3', 'pg', 'mysql2', 'zod'],
      silent: true,
    })
    const script = path.join(directory, 'application.mjs')
    await writeFile(script, `
import { reldb } from ${JSON.stringify(pathToFileURL(path.join(directory, 'bundle/index.js')).href)}
const config = JSON.parse(process.argv[2])
const initialized = await reldb.init(config)
if (!initialized.success) throw new Error(initialized.error.message)
const first = await reldb.sql.get('SELECT pg_backend_pid()::INTEGER AS pid')
if (!first.success) throw new Error(first.error.message)
process.on('message', async message => {
  if (message.action === 'probe') {
    const result = await reldb.sql.get('SELECT pg_backend_pid()::INTEGER AS pid')
    process.send({ stage: 'probed', result })
  }
  else if (message.action === 'close') {
    const result = await reldb.close()
    process.send({ stage: 'closed', result })
    process.disconnect()
  }
})
process.send({ stage: 'ready', pid: process.pid, backend: first.data.pid })
`)
    lease = await acquirePostgresContainer()
    const config = { type: 'postgresql', host: lease.host, port: lease.port, database: lease.database, user: lease.user, password: lease.password }
    observer = new Pool(config)
    child = fork(script, [JSON.stringify(config)], { windowsHide: true, silent: true })
    let output = ''
    child.stdout?.on('data', chunk => output += chunk.toString())
    child.stderr?.on('data', chunk => output += chunk.toString())
    let exited = false
    closed = new Promise(resolve => child!.once('close', (code) => {
      exited = true
      resolve(code)
    }))
    killTimer = setTimeout(() => child?.kill(), 20_000)
    const reports = new Map<string, Record<string, unknown>>()
    child.on('message', (message) => {
      if (message && typeof message === 'object' && 'stage' in message && typeof message.stage === 'string') {
        // IPC 边界只接受带 stage 的普通消息，具体结果在断言中校验。
        reports.set(message.stage, message as Record<string, unknown>)
      }
    })
    await vi.waitFor(() => expect(reports.has('ready'), output).toBe(true), { timeout: 10_000 })
    expect(reports.get('ready')!.pid).not.toBe(process.pid)
    const oldBackend = reports.get('ready')!.backend
    const terminated = await observer.query<{ terminated: boolean }>('SELECT pg_terminate_backend($1) AS terminated', [oldBackend])
    expect(terminated.rows[0].terminated).toBe(true)
    await vi.waitFor(() => {
      expect(exited, output).toBe(false)
      expect(output).toContain('PostgreSQL idle connection error')
    }, { timeout: 5_000 })
    child.send({ action: 'probe' })
    await vi.waitFor(() => expect(reports.has('probed'), output).toBe(true), { timeout: 5_000 })
    expect(reports.get('probed')!.result).toEqual({ success: true, data: { pid: expect.any(Number) } })
    expect(reports.get('probed')!.result).not.toEqual({ success: true, data: { pid: oldBackend } })
    expect(output).not.toContain(lease.password)
    expect(output).not.toContain('terminating connection due to administrator command')
    child.send({ action: 'close' })
    expect(await closed).toBe(0)
    expect(reports.get('closed')!.result).toEqual({ success: true })
  }
  finally {
    if (child && child.exitCode === null)
      child.kill()
    await closed
    if (killTimer)
      clearTimeout(killTimer)
    await observer?.end()
    await lease?.release()
    await rm(directory, { recursive: true, force: true })
  }
}, 180_000)
