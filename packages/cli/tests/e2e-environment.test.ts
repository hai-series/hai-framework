import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { createECDH } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createE2eNotificationEnv, createE2eServerEnv, createE2eTransportRing } from '../../../scripts/e2e-env.js'
import { withDatabaseIsolation } from './fixtures/e2e-db-isolation.js'

const roots: string[] = []
afterEach(() => {
  vi.unstubAllEnvs()
  for (const root of roots.splice(0)) {
    try {
      // 仅保留已知安全的计数与进程诊断；不复制 .env.local 或本轮业务数据。
      const source = path.join(root, 'evidence')
      if (existsSync(source)) {
        const evidence = new URL(`../../../tmp/validation/module-review/e2e-environment/${path.basename(root)}/`, import.meta.url)
        mkdirSync(evidence, { recursive: true })
        for (const name of ['database-isolation.json', 'database-isolation-process.log']) {
          if (existsSync(path.join(source, name)))
            copyFileSync(path.join(source, name), new URL(name, evidence))
        }
      }
    }
    finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
})

function temporaryRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'hai-e2e-isolation-'))
  roots.push(root)
  return root
}

describe('e2E server environment', () => {
  it('removes ambient module/public values while preserving owned controls without mutating the parent', () => {
    const root = temporaryRoot()
    vi.stubEnv('HAI_DB', '{"type":"postgresql"}')
    vi.stubEnv('HAI_DB_URL', 'postgresql://127.0.0.1/ambient')
    vi.stubEnv('PUBLIC_TOKEN', 'ambient')
    vi.stubEnv('VITE_TOKEN', 'ambient')
    vi.stubEnv('HAI_E2E_DATA_ROOT', root)
    vi.stubEnv('HAI_AUTH_EVIDENCE_DIR', path.join(root, 'evidence'))
    vi.stubEnv('HAI_CORE_NAME', 'Configured scaffold')
    const env = createE2eServerEnv({ HAI_DB: JSON.stringify({ type: 'sqlite', database: path.join(root, 'test.db') }) })
    expect(JSON.parse(env.HAI_DB).type).toBe('sqlite')
    expect(env.HAI_DB_URL).toBeUndefined()
    expect(env.PUBLIC_TOKEN).toBeUndefined()
    expect(env.VITE_TOKEN).toBeUndefined()
    expect(env.HAI_AUTH_EVIDENCE_DIR).toBe(path.join(root, 'evidence'))
    expect(env.HAI_CORE_NAME).toBe('Configured scaffold')
    expect(env.NODE_ENV).toBe('test')
    expect(env.HAI_E2E).toBe('1')
    expect(process.env.HAI_DB).toBe('{"type":"postgresql"}')
  })

  it('requires an absolute owned data directory and a loopback API', () => {
    vi.stubEnv('HAI_E2E_DATA_ROOT', '')
    expect(() => createE2eServerEnv({})).toThrow('absolute')
    expect(() => createE2eServerEnv({ HAI_E2E_DATA_ROOT: './data' })).toThrow('absolute')
    expect(() => createE2eServerEnv({ HAI_E2E_DATA_ROOT: temporaryRoot(), PUBLIC_API_BASE: 'https://example.invalid/api' })).toThrow('loopback')
    expect(() => createE2eServerEnv({ HAI_E2E_DATA_ROOT: temporaryRoot(), PUBLIC_API_BASE: 'http://user:password@localhost/api' })).toThrow('loopback')
  })

  it('generates distinct real SM2 keys with matching public/private material', () => {
    const first = JSON.parse(createE2eTransportRing())
    const second = JSON.parse(createE2eTransportRing())
    expect(first.activeKeyId).toBe('e2e-v1')
    const key = first.keys[first.activeKeyId]
    const ecdh = createECDH('SM2')
    ecdh.setPrivateKey(Buffer.from(key.privateKey, 'hex'))
    expect(ecdh.getPublicKey('hex')).toBe(key.publicKey)
    expect(second.keys['e2e-v1'].publicKey).not.toBe(key.publicKey)
  })

  it('only forwards an explicitly owned loopback notification fixture', () => {
    vi.stubEnv('IAM_NOTIFICATION_URL', '')
    expect(createE2eNotificationEnv()).toEqual({})
    vi.stubEnv('IAM_NOTIFICATION_URL', 'https://example.invalid')
    expect(() => createE2eNotificationEnv()).toThrow('loopback')
    vi.stubEnv('IAM_NOTIFICATION_URL', 'http://127.0.0.1:12580')
    const env = createE2eNotificationEnv()
    expect(JSON.parse(env.HAI_REACH_PROVIDERS)).toEqual([
      { name: 'email', type: 'api', url: 'http://127.0.0.1:12580/send' },
      { name: 'sms', type: 'api', url: 'http://127.0.0.1:12580/send' },
    ])
    expect(env.HAI_IAM_LOGIN_OTP).toBe('true')
  })

  it('ships the identical tested helper to generated applications', () => {
    expect(readFileSync(new URL('../templates/shared/e2e-env.ts', import.meta.url), 'utf8'))
      .toBe(readFileSync(new URL('../../../scripts/e2e-env.ts', import.meta.url), 'utf8'))
  })
})

describe('independent database connection counter', () => {
  function fixture() {
    const root = temporaryRoot()
    const evidence = path.join(root, 'evidence')
    mkdirSync(evidence)
    const local = path.join(root, '.env.local')
    writeFileSync(local, 'PRIVATE_FIXTURE=preserved\n')
    return { root, evidence, local }
  }

  it('has a real positive connection, then confirms no connection and a real process exit for isolated children', async () => {
    const { root, evidence, local } = fixture()
    const env = { ...process.env }
    await withDatabaseIsolation(root, evidence, env, () => {
      expect(readFileSync(local, 'utf8')).toContain('HAI_DB=')
      const serverEnv = createE2eServerEnv({ HAI_E2E_DATA_ROOT: root, HAI_DB: JSON.stringify({ type: 'sqlite', database: path.join(root, 'owned.db') }) })
      const result = spawnSync(process.execPath, ['-e', 'if (JSON.parse(process.env.HAI_DB).type !== "sqlite") process.exit(2)'], { env: { ...env, ...serverEnv } })
      expect(result.status).toBe(0)
    })
    expect(readFileSync(local, 'utf8')).toBe('PRIVATE_FIXTURE=preserved\n')
    expect(JSON.parse(readFileSync(path.join(evidence, 'database-isolation.json'), 'utf8'))).toMatchObject({ connections: 1, closed: true })
  })

  it('detects actual consumption of the ambient database and still restores files and stops its process', async () => {
    const { root, evidence, local } = fixture()
    const env = { ...process.env }
    await expect(withDatabaseIsolation(root, evidence, env, () => {
      const result = spawnSync(process.execPath, ['-e', 'const n=require("node:net"); const c=JSON.parse(process.env.HAI_DB); const s=n.createConnection({host:c.host,port:c.port}); s.on("error",()=>process.exit(1)); s.on("connect",()=>s.end())'], { env })
      expect(result.status).toBe(0)
    })).rejects.toThrow('unexpected connections')
    expect(readFileSync(local, 'utf8')).toBe('PRIVATE_FIXTURE=preserved\n')
    expect(JSON.parse(readFileSync(path.join(evidence, 'database-isolation.json'), 'utf8'))).toMatchObject({ connections: 2, closed: true })
  })

  it('keeps the original gate failure while restoring files and stopping its counter', async () => {
    const { root, evidence, local } = fixture()
    await expect(withDatabaseIsolation(root, evidence, { ...process.env }, async () => {
      await Promise.resolve()
      throw new Error('Original gate failure')
    })).rejects.toThrow('Original gate failure')
    expect(readFileSync(local, 'utf8')).toBe('PRIVATE_FIXTURE=preserved\n')
    expect(JSON.parse(readFileSync(path.join(evidence, 'database-isolation.json'), 'utf8'))).toMatchObject({ connections: 1, closed: true })
  }, 30_000)
})
