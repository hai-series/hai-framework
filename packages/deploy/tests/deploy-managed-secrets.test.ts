import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { core } from '@h-ai/core'
import { afterEach, expect, it } from 'vitest'
import { createManagedSecretAssets } from '../src/container/deploy-managed-secrets.js'

const { parseEnv } = core.config

const roots: string[] = []
const shell = process.platform === 'win32' ? 'C:/Program Files/Git/usr/bin/bash.exe' : '/bin/sh'

afterEach(() => {
  for (const root of roots.splice(0)) {
    expect(dirname(resolve(root))).toBe(resolve(tmpdir()))
    expect(root).toContain('hai-managed-secrets-')
    rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  }
})

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'hai-managed-secrets-'))
  roots.push(root)
  const server = join(root, 'server')
  mkdirSync(server)
  const runtime = join(root, 'runtime.sh')
  writeFileSync(runtime, '#!/bin/sh\ntest ! -f "$(dirname "$0")/volume-error" || exit 125\nif [ -f "$(dirname "$0")/volume-exists" ]; then printf "hai-demo-test_db-data\\n"; fi\nexit 0\n')
  chmodSync(runtime, 0o700)
  let sequence = 0
  function bundle(password: string) {
    const directory = join(root, `computer-${sequence++}`)
    mkdirSync(directory)
    const native = `POSTGRES_PASSWORD=${password}\n`
    const assets = createManagedSecretAssets('demo-test', native, { services: { db: { env_file: ['middleware-runtime.env'], volumes: ['db-data:/data'] } }, volumes: { 'db-data': null } })
    mkdirSync(join(directory, '.hai'))
    mkdirSync(join(directory, 'config'))
    const metadata = Object.fromEntries(Object.entries(assets).filter(([name]) => !name.endsWith('.sh') && name !== 'managed-candidates.env'))
    writeFileSync(join(directory, 'manifest.json'), JSON.stringify({ bundleFormat: 2, metadata }))
    writeFileSync(join(directory, 'resolve-managed-secrets.sh'), assets['resolve-managed-secrets.sh']!)
    writeFileSync(join(directory, '.hai/managed-candidates.env'), assets['managed-candidates.env']!)
    writeFileSync(join(directory, '.hai/middleware-runtime.env'), native)
    writeFileSync(join(directory, 'config/.env.runtime'), core.config.stringifyEnv({ HAI_DB_URL: `postgresql://hai:${password}@db:5432/hai`, HAI_DB_PASSWORD: password, HAI_ADMIN_DEFAULT_PASSWORD: password, CUSTOM_REFERENCE: password }))
    const run = () => spawnSync(shell, [join(directory, 'resolve-managed-secrets.sh'), server, directory, runtime].map(value => value.replaceAll('\\', '/')), { encoding: 'utf8', windowsHide: true, env: { ...process.env, PATH: `${dirname(shell)}${delimiter}${process.env.PATH ?? ''}` } })
    return { directory, run }
  }
  return { root, server, bundle }
}

it('不同电脑的候选不同，服务器保持同一密码，应用与中间件一起替换且不改无关配置', () => {
  const { server, bundle } = fixture()
  const oldPassword = 'A'.repeat(32)
  const newPassword = 'B'.repeat(32)
  const first = bundle(oldPassword)
  const initialized = first.run()
  expect(initialized.status, initialized.stderr).toBe(0)
  expect(existsSync(join(server, 'managed-secrets.env'))).toBe(true)
  const second = bundle(newPassword)
  const reused = second.run()
  expect(reused.status, reused.stderr).toBe(0)
  expect(parseEnv(readFileSync(join(server, 'managed-secrets.env'), 'utf8')).DB_PASSWORD).toBe(oldPassword)
  expect(parseEnv(readFileSync(join(second.directory, '.hai/middleware-runtime.env'), 'utf8')).POSTGRES_PASSWORD).toBe(oldPassword)
  const application = parseEnv(readFileSync(join(second.directory, 'config/.env.runtime'), 'utf8'))
  expect(application.HAI_DB_PASSWORD).toBe(oldPassword)
  expect(application.HAI_ADMIN_DEFAULT_PASSWORD).toBe(newPassword)
  expect(application.CUSTOM_REFERENCE).toBe(newPassword)
  expect(readFileSync(join(second.directory, 'config/.env.runtime'), 'utf8')).toContain(`hai:${oldPassword}@db`)
})

it('服务器凭据状态丢失且数据卷已存在时，在变更服务前明确停止', () => {
  const { root, server, bundle } = fixture()
  writeFileSync(join(root, 'volume-exists'), 'owned fixture volume')
  const password = 'C'.repeat(32)
  const incoming = bundle(password)
  const result = incoming.run()
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('existing persistent volume')
  expect(result.stderr).not.toContain(password)
  expect(existsSync(join(server, 'managed-secrets.env'))).toBe(false)
})

it('损坏的服务器状态不会被候选覆盖，错误不泄漏值', () => {
  const { server, bundle } = fixture()
  const invalid = 'DB_PASSWORD=invalid private value\n'
  writeFileSync(join(server, 'managed-secrets.env'), invalid)
  const result = bundle('D'.repeat(32)).run()
  expect(result.status).not.toBe(0)
  expect(result.stderr).not.toContain('invalid private value')
  expect(readFileSync(join(server, 'managed-secrets.env'), 'utf8')).toBe(invalid)
})

it('容器引擎无法列出卷时不把探测失败当作首次部署', () => {
  const { root, server, bundle } = fixture()
  writeFileSync(join(root, 'volume-error'), 'owned fixture failure')
  const result = bundle('E'.repeat(32)).run()
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('Cannot check persistent volumes')
  expect(existsSync(join(server, 'managed-secrets.env'))).toBe(false)
})

it('声明实际原生凭据、应用范围和卷身份，不把外部配置加入绑定', () => {
  const password = 'F'.repeat(32)
  const assets = createManagedSecretAssets('demo-test', `MYSQL_PASSWORD=${password}\nMYSQL_ROOT_PASSWORD=${password}\nPOSTGRES_PASSWORD=${password}\nMINIO_ROOT_PASSWORD=${password}\nLDAP_ADMIN_PASSWORD=${password}\n`, {
    services: {
      db: { env_file: ['middleware-runtime.env'], volumes: ['db-data:/data'] },
      vecdb: { env_file: ['middleware-runtime.env'], volumes: ['vector-data:/data'] },
      storage: { env_file: ['middleware-runtime.env'], volumes: ['storage-data:/data'] },
      ldap: { env_file: ['middleware-runtime.env'], volumes: ['ldap-data:/data'] },
    },
    volumes: { 'db-data': null, 'vector-data': { name: 'explicit-vector-volume' }, 'storage-data': { external: true }, 'ldap-data': null },
  })
  expect(Object.keys(parseEnv(assets['managed-candidates.env']!)).sort()).toEqual(['DB_PASSWORD', 'LDAP_PASSWORD', 'STORAGE_PASSWORD'])
  expect(assets['managed-bindings']).toContain('DB_PASSWORD HAI_VECDB prefix')
  expect(assets['managed-bindings']).toContain('LDAP_PASSWORD HAI_IAM_LDAP prefix')
  expect(assets['managed-volumes']).toBe('DB_PASSWORD hai-demo-test_db-data\nDB_PASSWORD explicit-vector-volume\nSTORAGE_PASSWORD storage-data\nLDAP_PASSWORD hai-demo-test_ldap-data\n')
  const external = createManagedSecretAssets('demo-test', `POSTGRES_PASSWORD=${password}\n`, { services: { db: { image: 'external-only' } } })
  expect(external['managed-bindings']).not.toContain('HAI_DB')
  expect(external['managed-volumes']).toBe('')
})

it('导入的 v2 状态保留特殊字符和卷身份，连接 URL 正确编码，换打包机仍复用旧密码', () => {
  const { root, server, bundle } = fixture()
  const password = 'synthetic #$\'"\\:= @秘密'
  writeFileSync(join(root, 'volume-exists'), 'owned fixture volume')
  const state = `FORMAT_VERSION=2\nPROJECT=hai-demo-test\nDB_PASSWORD=${Buffer.from(password).toString('hex')}\nVOLUME_1=DB_PASSWORD:hai-demo-test_db-data\n`
  writeFileSync(join(server, 'managed-secrets.env'), state, { mode: 0o600 })
  const incoming = bundle('G'.repeat(32))
  const result = incoming.run()
  expect(result.status, result.stderr).toBe(0)
  const connection = { url: parseEnv(readFileSync(join(incoming.directory, 'config/.env.runtime'), 'utf8')).HAI_DB_URL! }
  expect(decodeURIComponent(new URL(connection.url).password)).toBe(password)
  expect(readFileSync(join(server, 'managed-secrets.env'), 'utf8')).toBe(state)
  expect(JSON.stringify({ stdout: result.stdout, stderr: result.stderr })).not.toContain(password)
})
