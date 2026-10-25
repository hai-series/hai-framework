/** 三种真实数据库中两个独立进程同时首次建表，成功init后立即访问。 */
import type { ReldbConfigInput } from '@h-ai/reldb'
import type { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { reldb } from '@h-ai/reldb'
import { GenericContainer, Wait } from 'testcontainers'
import { expect, it } from 'vitest'

/** 双进程同时完成数据库连接后才释放audit.init屏障。 */
async function simultaneous(config: ReldbConfigInput) {
  const children: ReturnType<typeof spawn>[] = []
  let ready = 0
  try {
    await Promise.all(Array.from({ length: 2 }, () => new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, [fileURLToPath(new URL('./fixtures/audit-node.mjs', import.meta.url))], {
        env: { ...process.env, AUDIT_DB_INPUT: JSON.stringify(config) },
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      })
      children.push(child)
      let stderr = ''
      let stdout = ''
      child.stderr!.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
      })
      child.stdout!.on('data', (chunk: Buffer) => {
        stdout += chunk.toString()
      })
      const timer = setTimeout(() => {
        child.kill()
        reject(new Error('Audit worker timed out'))
      }, 30000)
      child.on('message', (message) => {
        if (typeof message === 'object' && message && 'phase' in message && message.phase === 'ready') {
          ready++
          if (ready === 2) {
            for (const node of children) node.send({ phase: 'go' })
          }
        }
      })
      child.on('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        if (code === 0 && stdout === '{"success":true}')
          resolve()
        else reject(new Error(stderr || 'Invalid worker result'))
      })
    })))
  }
  finally {
    await Promise.all(children.map(child => new Promise<void>((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) {
        resolve()
        return
      }
      child.once('close', () => resolve())
      child.kill()
    })))
  }
}

/** 删除仅由本测试创建且位于系统临时目录的目标。 */
async function removeFixture(directory: string) {
  const target = resolve(directory)
  if (dirname(target) !== resolve(tmpdir()) || !target.startsWith(join(resolve(tmpdir()), 'hai-audit-ready-')))
    throw new Error('Unexpected audit fixture cleanup target')
  await rm(target, { recursive: true, force: true })
}

for (const type of ['sqlite', 'postgresql', 'mysql'] as const) {
  it(`双Node首次初始化及立即查询: ${type}`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hai-audit-ready-'))
    let container: Awaited<ReturnType<GenericContainer['start']>> | undefined
    try {
      let config: ReldbConfigInput = { type: 'sqlite', database: join(directory, 'shared.db') }
      if (type !== 'sqlite') {
        const pg = type === 'postgresql'
        const port = pg ? 5432 : 3306
        container = await new GenericContainer(pg ? 'docker.io/library/postgres:16.15-alpine' : 'docker.io/library/mysql:8.4.11')
          .withExposedPorts(port)
          .withEnvironment(pg ? { POSTGRES_DB: 'audit_ready', POSTGRES_USER: 'audit_test', POSTGRES_PASSWORD: 'audit_test' } : { MYSQL_DATABASE: 'audit_ready', MYSQL_ROOT_PASSWORD: 'audit_test' })
          .withWaitStrategy(pg ? Wait.forLogMessage('database system is ready to accept connections', 2) : Wait.forLogMessage(/ready for connections\..*port: 3306/))
          .withStartupTimeout(120000)
          .start()
        config = { type, host: container.getHost(), port: container.getMappedPort(port), user: pg ? 'audit_test' : 'root', password: 'audit_test', database: 'audit_ready' }
      }
      expect((await reldb.init(config)).success).toBe(true)
      expect((await reldb.ddl.createTable('hai_iam_users', { id: { type: 'TEXT', primaryKey: true }, username: { type: 'TEXT' } }, true)).success).toBe(true)
      for (let round = 0;
        round < 3;
        round++) {
        expect((await reldb.ddl.dropTable('hai_audit_logs', true)).success).toBe(true)
        await simultaneous(config)
        const count = await reldb.sql.get<{ total: number }>('SELECT COUNT(*) AS total FROM hai_audit_logs')
        expect(count.success && Number(count.data?.total)).toBe(2)
      }
      if (type === 'postgresql') {
        // 用真实权限错误验证子进程错误链，避免成功用例掩盖诊断信息丢失。
        expect((await reldb.ddl.dropTable('hai_audit_logs', true)).success).toBe(true)
        expect((await reldb.sql.execute('REVOKE CREATE ON SCHEMA public FROM PUBLIC')).success).toBe(true)
        expect((await reldb.sql.execute('CREATE ROLE audit_denied LOGIN PASSWORD \'audit_denied_password\'')).success).toBe(true)
        const denied = simultaneous({ ...config, user: 'audit_denied', password: 'audit_denied_password' })
        await expect(denied).rejects.toThrow(/42501/)
        await expect(denied).rejects.toThrow(/"traceId":/)
        await expect(denied).rejects.not.toThrow('audit_denied_password')
      }
    }
    finally {
      await reldb.close()
      await container?.stop({ timeout: 10000, remove: true, removeVolumes: true })
      await removeFixture(directory)
    }
  }, 180000)
}
