import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseEnv } from 'node:util'
import { afterEach, expect, it, vi } from 'vitest'
import { loadDeploymentConfig, loadDeploymentEnvironment, saveDeploymentEnvironment } from '../src/index.js'

const roots: string[] = []
afterEach(() => {
  vi.unstubAllEnvs()
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true })
})
function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'hai-deploy-environment-'))
  roots.push(root)
  return root
}

it('requires the selected mode file and rejects path traversal/reserved private files', () => {
  const envDir = fixture()
  for (const environment of ['../prod', 'local', 'LOCAL', 'example', 'Example', 'prod'])
    expect(loadDeploymentEnvironment({ environment, envDir }).success).toBe(false)
})

it('resolves object overrides and special characters without interpolating raw YAML syntax', () => {
  const root = fixture()
  const file = join(root, '_deploy.yml')
  writeFileSync(file, `provider:\n  type: vercel\n  token: \${HAI_DEPLOY_PROVIDER_TOKEN}\n`)
  const token = 'test: key#value$&'
  expect(loadDeploymentConfig('deploy', file, { HAI_DEPLOY_PROVIDER_TOKEN: JSON.stringify(token) })).toMatchObject({ success: true, data: { provider: { type: 'vercel', token } } })
  expect(loadDeploymentConfig('deploy', file, { HAI_DEPLOY_PROVIDER: '{"type":"docker-ssh","ssh":{"host":"host"}}' })).toMatchObject({ success: true, data: { provider: { type: 'docker-ssh', ssh: { host: 'host' } } } })
})

it('uses process > local > selected environment > base, with an explicit deployment marker', () => {
  const envDir = fixture()
  writeFileSync(join(envDir, '.env'), 'HAI_DB_TYPE=sqlite\nHAI_CACHE_TYPE=memory\n')
  writeFileSync(join(envDir, '.env.test'), 'HAI_DB_TYPE=mysql\nHAI_CORE_ENV=production\n')
  writeFileSync(join(envDir, '.env.local'), 'HAI_DB_TYPE=postgresql\n')
  vi.stubEnv('HAI_CACHE_TYPE', 'redis')
  const result = loadDeploymentEnvironment({ environment: 'test', envDir })
  expect(result.success).toBe(true)
  if (!result.success)
    return
  expect(result.data.values).toMatchObject({ HAI_DB_TYPE: 'postgresql', HAI_CACHE_TYPE: 'redis', HAI_CORE_ENV: 'production', HAI_DEPLOY_ENVIRONMENT: 'test' })
  expect(result.data.targetValues).toEqual({ HAI_DB_TYPE: 'mysql', HAI_CORE_ENV: 'production' })
})

it('keeps secrets private, round-trips complex JSON values and preserves unrelated mode entries', () => {
  const envDir = fixture()
  writeFileSync(join(envDir, '.env.prod'), '# Production\nPUBLIC_API_BASE=https://api.example.test\n')
  const loaded = loadDeploymentEnvironment({ environment: 'prod', envDir })
  expect(loaded.success).toBe(true)
  if (!loaded.success)
    return
  const password = 'test-\'"#$&-password'
  const db = JSON.stringify({ type: 'postgresql', database: 'app', host: 'db', password })
  const result = saveDeploymentEnvironment(loaded.data, { HAI_DB: db, HAI_DEPLOY_PROVIDER_TOKEN: 'test-token', HAI_STORAGE: '{"type":"s3","bucket":"files","secretAccessKey":"test-storage-secret"}' })
  expect(result.success).toBe(true)
  const publicFile = readFileSync(join(envDir, '.env.prod'), 'utf8')
  expect(publicFile).toContain('# Production')
  expect(publicFile).not.toContain(password)
  expect(publicFile).not.toContain('test-token')
  expect(publicFile).not.toContain('test-storage-secret')
  expect(publicFile).toContain('PUBLIC_API_BASE=https://api.example.test')
  const merged = loadDeploymentEnvironment({ environment: 'prod', envDir })
  expect(merged.success).toBe(true)
  if (merged.success)
    expect(JSON.parse(merged.data.values.HAI_DB)).toEqual(JSON.parse(db))
  expect(readFileSync(join(envDir, '.gitignore'), 'utf8')).toContain('.env.local')
})

it('keeps nested SMTP pass values out of the public environment file', () => {
  const envDir = fixture()
  writeFileSync(join(envDir, '.env.test'), '# Test\n')
  const snapshot = loadDeploymentEnvironment({ environment: 'test', envDir })
  if (!snapshot.success)
    throw new Error('Missing fixture')
  const connection = { name: 'mail', type: 'smtp', host: 'smtp.example.test', pass: 'test-smtp-private' }
  expect(saveDeploymentEnvironment(snapshot.data, { HAI_REACH_PROVIDERS_0: JSON.stringify(connection) }).success).toBe(true)
  expect(readFileSync(join(envDir, '.env.test'), 'utf8')).not.toContain('test-smtp-private')
  expect(readFileSync(join(envDir, '.env.local'), 'utf8')).toContain('test-smtp-private')
})

it('keeps HTTP API headers and access key identifiers private', () => {
  const envDir = fixture()
  writeFileSync(join(envDir, '.env.test'), '# Test\n')
  const snapshot = loadDeploymentEnvironment({ environment: 'test', envDir })
  if (!snapshot.success)
    throw new Error('Missing fixture')
  const config = { name: 'callback', type: 'api', url: 'https://notify.example.test', headers: { 'X-API-Key': 'test-private-header' } }
  expect(saveDeploymentEnvironment(snapshot.data, { HAI_REACH_PROVIDERS_0: JSON.stringify(config), HAI_DEPLOY_SERVICES_STORAGE_ACCESSKEYID: 'test-private-access-id' }).success).toBe(true)
  const publicFile = readFileSync(join(envDir, '.env.test'), 'utf8')
  expect(publicFile).not.toContain('test-private-header')
  expect(publicFile).not.toContain('test-private-access-id')
  expect(readFileSync(join(envDir, '.env.local'), 'utf8')).toContain('test-private-header')
})

it('stores machine-specific host, port and key paths privately and reloads them', () => {
  const envDir = fixture()
  writeFileSync(join(envDir, '.env.prod'), '# Production\nHAI_DEPLOY_PROVIDER_TYPE=vercel\n')
  const snapshot = loadDeploymentEnvironment({ environment: 'prod', envDir })
  if (!snapshot.success)
    throw new Error('Missing fixture')
  const provider = { type: 'docker-ssh', ssh: { host: 'deploy.internal', port: 2202, username: 'deploy', identityFile: 'C:/Users/test/.ssh/id_ed25519' }, expose: { hostPort: 8080 } }
  expect(saveDeploymentEnvironment(snapshot.data, { HAI_DEPLOY_PROVIDER: JSON.stringify(provider) }, { private: true }).success).toBe(true)
  expect(readFileSync(join(envDir, '.env.prod'), 'utf8')).not.toContain('deploy.internal')
  const loaded = loadDeploymentEnvironment({ environment: 'prod', envDir })
  if (!loaded.success)
    throw new Error('Missing fixture')
  expect(JSON.parse(loaded.data.values.HAI_DEPLOY_PROVIDER)).toEqual(provider)
  const file = join(envDir, '_deploy.yml')
  writeFileSync(file, 'provider:\n  type: vercel\n  token: placeholder\n')
  expect(loadDeploymentConfig('deploy', file, loaded.data.values)).toMatchObject({ success: true, data: { provider } })
})

it('switches away from an old private whole-object override without deleting other private values', () => {
  const envDir = fixture()
  writeFileSync(join(envDir, '.env.test'), 'HAI_DB_TYPE=postgresql\n')
  writeFileSync(join(envDir, '.env.local'), 'HAI_DB=\'{"type":"postgresql","database":"old","password":"old-password"}\'\nHAI_AI_LLM_APIKEY=test-key\n')
  const loaded = loadDeploymentEnvironment({ environment: 'test', envDir })
  if (!loaded.success)
    throw new Error('Missing fixture')
  expect(saveDeploymentEnvironment(loaded.data, { HAI_DB: '{"type":"sqlite","database":"./data/new.db"}' }).success).toBe(true)
  const local = parseEnv(readFileSync(join(envDir, '.env.local'), 'utf8'))
  expect(local.HAI_DB).toBeUndefined()
  expect(local.HAI_AI_LLM_APIKEY).toBe('test-key')
})
