import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { loadDeploymentConfig, loadDeploymentEnvironment, saveDeploymentEnvironment } from '../src/index.js'

const roots: string[] = []
beforeEach(() => {
  for (const key of Object.keys(process.env)) {
    if (/^(?:HAI_|PUBLIC_|VITE_)/.test(key))
      vi.stubEnv(key, undefined)
  }
})
afterEach(() => {
  vi.unstubAllEnvs()
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true })
})

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'hai-deploy-environment-reuse-'))
  roots.push(root)
  writeFileSync(join(root, '.env.test'), '# Test\n')
  writeFileSync(join(root, '.env.prod'), '# Production\n')
  writeFileSync(join(root, 'hai.json'), JSON.stringify({ deploy: { provider: { type: 'docker-ssh', remote: { baseDir: '/srv/apps', runtime: 'auto' }, expose: { hostPort: 8080 } } } }))
  return root
}

function readDeployment(root: string, mode = 'test'): Record<string, unknown> {
  const environment = loadDeploymentEnvironment({ environment: mode, envDir: root })
  expect(environment.success).toBe(true)
  if (!environment.success)
    throw new Error('Deployment environment was not loaded')
  const config = loadDeploymentConfig('deploy', join(root, 'hai.json'), environment.data.values)
  expect(config.success).toBe(true)
  if (!config.success)
    throw new Error('Deployment configuration was not loaded')
  return config.data
}

it.each(['001234', '  001234  ', 'false', 'null'])('creates a missing SSH node from known leaves and preserves textual password %j', (password) => {
  const root = fixture()
  const result = loadDeploymentConfig('deploy', join(root, 'hai.json'), {
    HAI_DEPLOY_PROVIDER_SSH_HOST: '12345',
    HAI_DEPLOY_PROVIDER_SSH_USERNAME: 'deploy',
    HAI_DEPLOY_PROVIDER_SSH_PORT: '2202',
    HAI_DEPLOY_PROVIDER_SSH_AUTH: 'password',
    HAI_DEPLOY_PROVIDER_SSH_PASSWORD: password,
    HAI_DEPLOY_PROVIDER_SSH_IDENTITYFILE: '  C:/keys/007  ',
    HAI_DEPLOY_PROVIDER_SSH_STRICTHOSTKEYCHECKING: 'false',
    HAI_DEPLOY_PROVIDER_SSH_UNKNOWNOPTION: 'must-not-create-a-field',
  })
  expect(result.success).toBe(true)
  expect(result).toEqual({ success: true, data: { provider: {
    type: 'docker-ssh',
    remote: { baseDir: '/srv/apps', runtime: 'auto' },
    expose: { hostPort: 8080 },
    ssh: { host: '12345', username: 'deploy', port: 2202, auth: 'password', password, identityFile: '  C:/keys/007  ', strictHostKeyChecking: false },
  } } })
})

it('does not create an SSH node for unknown environment fields', () => {
  const root = fixture()
  const result = loadDeploymentConfig('deploy', join(root, 'hai.json'), { HAI_DEPLOY_PROVIDER_SSH_UNKNOWNOPTION: 'ignored' })
  expect(result.success).toBe(true)
  expect(result).toEqual({ success: true, data: { provider: { type: 'docker-ssh', remote: { baseDir: '/srv/apps', runtime: 'auto' }, expose: { hostPort: 8080 } } } })
})

it('expands declared SSH placeholders as text and does not re-expand environment JSON password literals', () => {
  const root = fixture()
  writeFileSync(join(root, 'hai.json'), JSON.stringify({ deploy: { provider: { type: 'docker-ssh', expose: { hostPort: 8080 }, ssh: { host: `\${TARGET_HOST:12345}`, username: 'deploy', password: `\${CREDENTIAL}` } } } }))
  expect(loadDeploymentConfig('deploy', join(root, 'hai.json'), { CREDENTIAL: '  0001  ' })).toMatchObject({ success: true, data: { provider: { ssh: { host: '12345', password: '  0001  ' } } } })
  const password = ` "\${NOT_A_VARIABLE}" # 007 `
  expect(loadDeploymentConfig('deploy', join(root, 'hai.json'), { HAI_DEPLOY_PROVIDER_SSH: JSON.stringify({ host: 'host.test', username: 'deploy', password }) })).toMatchObject({ success: true, data: { provider: { ssh: { password } } } })
})

it('applies same-source SSH leaves after their parent JSON irrespective of declaration order', () => {
  const root = fixture()
  writeFileSync(join(root, '.env.test'), 'HAI_DEPLOY_PROVIDER_SSH_HOST=leaf.test\nHAI_DEPLOY_PROVIDER_SSH_PASSWORD="  0007  "\nHAI_DEPLOY_PROVIDER=\'{"type":"docker-ssh","expose":{"hostPort":8080},"ssh":{"host":"parent.test","username":"deploy","password":"old"}}\'\n')
  expect(readDeployment(root)).toMatchObject({ provider: { ssh: { host: 'leaf.test', username: 'deploy', password: '  0007  ' } } })
})

it('lets a selected public deployment target replace old global JSON and lower-source SSH leaves', () => {
  const root = fixture()
  writeFileSync(join(root, '.env'), 'HAI_DEPLOY_PROVIDER_SSH_HOST=base-leaf.test\nHAI_DEPLOY_PROVIDER_SSH_PORT=2222\n')
  writeFileSync(join(root, '.env.local'), 'HAI_DEPLOY_PROVIDER=\'{"type":"docker-ssh","expose":{"hostPort":9000},"ssh":{"host":"legacy.test","username":"legacy","password":"legacy"}}\'\n')
  writeFileSync(join(root, '.env.test'), 'HAI_DEPLOY_PROVIDER=\'{"type":"docker-ssh","expose":{"hostPort":8081},"ssh":{"host":"selected.test","username":"selected","port":2203}}\'\n')
  expect(readDeployment(root)).toEqual({ provider: { type: 'docker-ssh', expose: { hostPort: 8081 }, ssh: { host: 'selected.test', username: 'selected', port: 2203 } } })
})

it('applies mode-private leaves above the selected parent and process parent above all lower leaves', () => {
  const root = fixture()
  writeFileSync(join(root, '.env.test'), 'HAI_DEPLOY_PROVIDER=\'{"type":"docker-ssh","expose":{"hostPort":8081},"ssh":{"host":"selected.test","username":"selected","port":2203}}\'\n')
  writeFileSync(join(root, '.env.test.local'), 'HAI_DEPLOY_PROVIDER_SSH_HOST=private.test\nHAI_DEPLOY_PROVIDER_SSH_PASSWORD="  0010  "\n')
  expect(readDeployment(root)).toMatchObject({ provider: { ssh: { host: 'private.test', username: 'selected', password: '  0010  ' } } })
  vi.stubEnv('HAI_DEPLOY_PROVIDER_SSH', JSON.stringify({ host: 'process.test', username: 'operator', password: '0003' }))
  expect(readDeployment(root)).toMatchObject({ provider: { ssh: { host: 'process.test', username: 'operator', password: '0003' } } })
})

it('keeps a complete old global target as a compatible fallback without rewriting it', () => {
  const root = fixture()
  const legacy = '# Shared fallback\nHAI_DEPLOY_PROVIDER=\'{"type":"docker-ssh","expose":{"hostPort":9000},"ssh":{"host":"legacy.test","username":"legacy"}}\'\n'
  writeFileSync(join(root, '.env.local'), legacy)
  expect(readDeployment(root)).toMatchObject({ provider: { ssh: { host: 'legacy.test', username: 'legacy' } } })
  expect(readFileSync(join(root, '.env.local'), 'utf8')).toBe(legacy)
})

it('preserves legacy middleware secrets above public JSON and adds mode-private and process precedence', () => {
  const root = fixture()
  writeFileSync(join(root, '.env.test'), 'HAI_DB=\'{"type":"postgresql","host":"public.test","database":"app"}\'\nHAI_CACHE_TYPE=memory\n')
  writeFileSync(join(root, '.env.local'), 'HAI_DB=\'{"type":"postgresql","host":"private.test","database":"app","password":"existing-secret"}\'\nHAI_CACHE_TYPE=redis\n')
  writeFileSync(join(root, '.env.test.local'), 'HAI_CACHE_TYPE=memory\n')
  const result = loadDeploymentEnvironment({ environment: 'test', envDir: root })
  expect(result.success).toBe(true)
  if (!result.success)
    return
  expect(JSON.parse(result.data.values.HAI_DB)).toMatchObject({ host: 'private.test', password: 'existing-secret' })
  expect(result.data.values.HAI_CACHE_TYPE).toBe('memory')
  vi.stubEnv('HAI_CACHE_TYPE', 'redis')
  expect(loadDeploymentEnvironment({ environment: 'test', envDir: root })).toMatchObject({ success: true, data: { values: { HAI_CACHE_TYPE: 'redis' } } })
})

it('saves separate test/prod private targets and secrets without modifying the shared legacy file', () => {
  const root = fixture()
  const legacy = '# Retained fallback\nHAI_AI_LLM_APIKEY=legacy-key\n'
  writeFileSync(join(root, '.env.local'), legacy)
  for (const mode of ['test', 'prod']) {
    const snapshot = loadDeploymentEnvironment({ environment: mode, envDir: root })
    expect(snapshot.success).toBe(true)
    if (!snapshot.success)
      return
    const provider = { type: 'docker-ssh', expose: { hostPort: 8080 }, ssh: { host: `${mode}.test`, username: 'deploy', auth: 'password', password: `  000-${mode}  ` } }
    expect(saveDeploymentEnvironment(snapshot.data, { HAI_DEPLOY_PROVIDER: JSON.stringify(provider), HAI_DB_PASSWORD: `${mode}-db-password` }, { private: true }).success).toBe(true)
    expect(readDeployment(root, mode)).toEqual({ provider })
    const privateFile = readFileSync(join(root, `.env.${mode}.local`), 'utf8')
    expect(privateFile).toContain(`${mode}-db-password`)
    expect(readFileSync(join(root, `.env.${mode}`), 'utf8')).not.toContain('password')
  }
  expect(readDeployment(root, 'test')).toMatchObject({ provider: { ssh: { host: 'test.test', password: '  000-test  ' } } })
  expect(readDeployment(root, 'prod')).toMatchObject({ provider: { ssh: { host: 'prod.test', password: '  000-prod  ' } } })
  expect(readFileSync(join(root, '.env.local'), 'utf8')).toBe(legacy)
  expect(readFileSync(join(root, '.gitignore'), 'utf8')).toContain('.env.*.local')
})

it('switches a saved middleware backend without deleting its old shared fallback or unrelated secrets', () => {
  const root = fixture()
  const legacy = 'HAI_DB=\'{"type":"postgresql","database":"old","password":"old-secret"}\'\nHAI_AI_LLM_APIKEY=keep-key\n'
  writeFileSync(join(root, '.env.local'), legacy)
  const snapshot = loadDeploymentEnvironment({ environment: 'test', envDir: root })
  expect(snapshot.success).toBe(true)
  if (!snapshot.success)
    return
  expect(saveDeploymentEnvironment(snapshot.data, { HAI_DB: '{"type":"sqlite","database":"./data/new.db"}' }).success).toBe(true)
  const selected = loadDeploymentEnvironment({ environment: 'test', envDir: root })
  expect(selected.success).toBe(true)
  if (selected.success)
    expect(JSON.parse(selected.data.values.HAI_DB)).toEqual({ type: 'sqlite', database: './data/new.db' })
  expect(readFileSync(join(root, '.env.local'), 'utf8')).toBe(legacy)
  expect(existsSync(join(root, '.env.test.local'))).toBe(true)
})
