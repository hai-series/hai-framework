import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { core } from '@h-ai/core'
import { expect, it } from 'vitest'
import { serializeEnvFile } from '../src/container/deploy-container-compose.js'

const { parseEnv } = core.config

function prepare(mode: string, next: Record<string, string>, previous: Record<string, string> = {}, state = '', metadata: Record<string, string> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'hai-runtime-prepare-'))
  try {
    const program = join(root, 'runtime-env.mjs')
    copyFileSync(new URL('../src/container/deploy-runtime-env.mjs', import.meta.url), program)
    mkdirSync(join(root, 'config'))
    writeFileSync(join(root, 'config/.env.runtime'), serializeEnvFile(next))
    const shared = { 'managed-app-keys': 'HAI_STORAGE\n', 'managed-bindings': 'STORAGE_PASSWORD HAI_STORAGE prefix\n', 'managed-project': 'hai-example-test\n' }
    writeFileSync(join(root, 'manifest.json'), JSON.stringify({ deploymentId: 'next', metadata }))
    writeFileSync(join(root, 'previous.json'), JSON.stringify({ deploymentId: 'before', metadata: shared }))
    writeFileSync(join(root, 'previous.env'), serializeEnvFile(previous))
    writeFileSync(join(root, 'state.env'), state)
    const url = (name: string) => pathToFileURL(join(root, name)).href
    return spawnSync(process.execPath, [program, 'prepare', `${url('')}/`, url('previous.json'), url('previous.env'), state ? url('state.env') : '-', mode], { encoding: 'utf8', timeout: 5000, windowsHide: true, env: { ...process.env, NODE_OPTIONS: undefined } })
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
}

it('局部后端发布保留实际运行连接和 publicEndpoint，更新业务参数并采用服务器托管密码', () => {
  const secret = `server-password-with-'"-中-$`
  const previous = { HAI_STORAGE: JSON.stringify({ type: 's3', endpoint: 'http://storage:9000', publicEndpoint: 'https://files.example.test:8443/files', secretAccessKey: 'stale-password' }), APP_BUSINESS: 'old', APP_REMOVED: 'old' }
  const next = { HAI_STORAGE: JSON.stringify({ type: 's3', publicEndpoint: 'https://local.example.test/files', secretAccessKey: 'laptop-password' }), APP_BUSINESS: 'new\n"quoted" $value' }
  const result = prepare('partial', next, previous, `FORMAT_VERSION=2\nPROJECT=hai-example-test\nSTORAGE_PASSWORD=${Buffer.from(secret).toString('hex')}\n`)
  expect(result.status, result.stderr).toBe(0)
  const output = JSON.parse(result.stdout)
  const environment = parseEnv(output.environment)
  expect(environment.APP_BUSINESS).toBe(next.APP_BUSINESS)
  expect(environment.APP_REMOVED).toBeUndefined()
  expect(environment).toMatchObject({ HAI_STORAGE_ENDPOINT: 'http://storage:9000', HAI_STORAGE_PUBLICENDPOINT: 'https://files.example.test:8443/files', HAI_STORAGE_SECRETACCESSKEY: secret })
  expect(output.manifest.metadata['managed-app-keys']).toContain('HAI_STORAGE')
  expect(JSON.stringify(output.manifest)).not.toContain(secret)
})

it('完整发布采用新包的业务配置', () => {
  const previous = { APP: 'server-current' }
  const next = { APP: 'incoming' }
  const full = prepare('full', next, previous)
  expect(full.status, full.stderr).toBe(0)
  expect(parseEnv(JSON.parse(full.stdout).environment).APP).toBe('incoming')
})

it('数据库 URL 的托管密码保留百分号和 URI 特殊字符', () => {
  const secret = `percent-%20-:@/中-'"`
  const result = prepare('full', { HAI_DB: JSON.stringify({ type: 'postgresql', url: 'postgresql://hai:laptop@db:5432/hai?application_name=example' }) }, {}, `FORMAT_VERSION=2\nPROJECT=hai-example-test\nDB_PASSWORD=${Buffer.from(secret).toString('hex')}\n`, { 'managed-project': 'hai-example-test\n', 'managed-app-keys': 'HAI_DB\n', 'managed-bindings': 'DB_PASSWORD HAI_DB prefix\n' })
  expect(result.status, result.stderr).toBe(0)
  const environment = parseEnv(JSON.parse(result.stdout).environment)
  const connection = new URL(environment.HAI_DB_URL!)
  expect(decodeURIComponent(connection.password)).toBe(secret)
  expect(connection.hostname).toBe('db')
  expect(connection.searchParams.get('application_name')).toBe('example')
})

it('托管 JSON 无效时在启动业务前失败且不输出配置值', () => {
  const result = prepare('partial', {}, { HAI_STORAGE: 'private-invalid-json' }, `STORAGE_PASSWORD=${'a'.repeat(32)}\n`)
  expect(result.status).not.toBe(0)
  expect(result.stdout).toBe('')
  expect(result.stderr).not.toContain('private-invalid-json')
})
