import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { core } from '@h-ai/core'
import { deploy, loadDeploymentEnvironment } from '@h-ai/deploy'
import * as deployModule from '@h-ai/deploy'
import { ReldbConfigSchema } from '@h-ai/reldb'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { stringify } from 'yaml'
import { cliM } from '../src/cli-i18n.js'
import { moduleEnvironmentVariables } from '../src/commands/cli-config-environment.js'
import { createProject } from '../src/commands/cli-create.js'
import { configureDeployMiddleware, displayDeployValue } from '../src/commands/cli-deploy-middleware.js'
import { deployCommand } from '../src/commands/cli-deploy.js'

const mocked = vi.hoisted(() => ({ prompt: vi.fn() }))
vi.mock('prompts', () => ({ default: mocked.prompt }))
const roots: string[] = []
let stdinDescriptor: PropertyDescriptor | undefined

it('redacts API headers and access key identifiers in connection previews', () => {
  const preview = displayDeployValue('HAI_REACH_PROVIDERS_0', JSON.stringify({ headers: { 'X-API-Key': 'test-private-header' }, accessKeyId: 'test-private-access-id' }))
  expect(preview).not.toContain('test-private-header')
  expect(preview).not.toContain('test-private-access-id')
})

it.each(['container:\n', 'container: null\n', 'container: invalid\n'])('handles S3 engine configuration with YAML %s', async (node) => {
  const { app, service } = await fullstackFixture()
  const file = join(service, 'config/_deploy.yml')
  writeFileSync(file, `provider:\n  type: docker-ssh\n${node}`)
  writeFileSync(join(service, 'config/_storage.yml'), 'type: s3\n')
  writeFileSync(join(app, '.env.test'), 'HAI_STORAGE=\'{"type":"s3"}\'\n')
  const scan = await deploy.scan(service, { environment: 'test', envDir: app })
  const environment = loadDeploymentEnvironment({ environment: 'test', envDir: app })
  expect(scan.success && environment.success).toBe(true)
  if (!scan.success || !environment.success)
    return
  const operation = configureDeployMiddleware(deployModule, { ...scan.data, middlewares: scan.data.middlewares?.filter(item => item.service === 'storage') }, environment.data, { provider: { type: 'docker-ssh' } }, true)
  if (node.includes('invalid')) {
    await expect(operation).rejects.toThrow(file)
    expect(readFileSync(file, 'utf8')).toContain('container: invalid')
  }
  else {
    await expect(operation).resolves.toMatchObject({ storage: 'default' })
    expect(readFileSync(file, 'utf8')).toContain('s3Engine:')
  }
}, 30_000)

beforeEach(() => {
  core.i18n.setGlobalLocale('en-US')
  stdinDescriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY')
  Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
  mocked.prompt.mockReset()
  vi.spyOn(deploy.credentials, 'load').mockReturnValue({ success: true, data: [] })
})

it('lets a complete environment bypass every middleware prompt and preserves environment files', async () => {
  const { app, service } = await fullstackFixture()
  writeFileSync(join(app, '.env.test'), 'HAI_DEPLOY_PROVIDER=\'{"type":"docker-ssh","ssh":{"host":"existing.test","username":"deploy"},"expose":{"hostPort":8080}}\'\nHAI_DB_TYPE=sqlite\n')
  const before = readFileSync(join(app, '.env.test'), 'utf8')
  mocked.prompt.mockImplementation(async question => ({ value: question.type === 'multiselect' ? question.choices.map((item: { value: string }) => item.value) : 'skip' }))
  const run = vi.spyOn(deploy, 'deployApp').mockResolvedValue({ success: true, data: { url: 'http://existing.test:8080', deploymentId: 'test', status: 'ready', envVarsSet: [] } })
  await deployCommand({ appDir: service, env: 'test' })
  expect(mocked.prompt).toHaveBeenCalledTimes(2)
  expect(run).toHaveBeenCalledWith(service, expect.objectContaining({ skipMiddleware: true, serviceModes: expect.objectContaining({ db: 'keep', cache: 'keep', storage: 'keep' }) }))
  expect(readFileSync(join(app, '.env.test'), 'utf8')).toBe(before)
  expect(deploy.config?.services).toBeUndefined()
}, 30_000)

it('infers Web selection from a partial artifact before configuring middleware', async () => {
  const { app, service } = await fullstackFixture()
  const artifacts = join(app, '.hai/build/docker/partial')
  mkdirSync(artifacts, { recursive: true })
  writeFileSync(join(app, '.hai/build/docker/latest'), 'partial\n')
  const file = 'web-1.2.3.tar'
  writeFileSync(join(artifacts, file), 'prebuilt-web')
  writeFileSync(join(artifacts, 'manifest.json'), JSON.stringify({ version: 3, appVersion: '1.2.3', buildId: 'partial', partial: true, hasWeb: true, images: [{ name: 'web', file, imageRef: 'localhost/test-web:1.2.3', sha256: await deployModule.artifactChecksum(join(artifacts, file)) }] }))
  writeFileSync(join(app, '.env.test'), '\n')
  const run = vi.spyOn(deploy, 'deployApp').mockResolvedValue({ success: true, data: { url: 'http://example.test:18080', deploymentId: 'test', status: 'ready', envVarsSet: [] } })
  await deployCommand({ appDir: service, env: 'test', yes: true })
  expect(run).toHaveBeenCalledWith(service, expect.objectContaining({ selectedServices: ['web'], skipMiddleware: true }))
  expect(mocked.prompt).not.toHaveBeenCalled()
  expect(readFileSync(join(app, '.env.test'), 'utf8')).toBe('\n')
}, 30_000)

it('guides SSH setup once, saves parameters privately and reuses them without prompts', async () => {
  const { app, service } = await fullstackFixture()
  writeFileSync(join(service, 'config/_deploy.yml'), 'provider:\n  type: docker-ssh\n  expose:\n    hostPort: 8080\n')
  const inputs: Record<string, string> = {
    HAI_DEPLOY_PROVIDER_SSH_HOST: 'server.internal',
    HAI_DEPLOY_PROVIDER_SSH_PORT: '2202',
    HAI_DEPLOY_PROVIDER_SSH_USERNAME: 'deployer',
    HAI_DEPLOY_PROVIDER_SSH_IDENTITYFILE: 'C:/keys/deploy',
    HAI_DEPLOY_PROVIDER_SSH_KNOWNHOSTSFILE: 'C:/keys/known_hosts',
    HAI_DEPLOY_PROVIDER_REMOTE_BASEDIR: '/srv/apps',
    HAI_DEPLOY_PROVIDER_EXPOSE_HOSTPORT: '8080',
    HAI_DEPLOY_PROVIDER_EXPOSE_CONTAINERPORT: '3000',
  }
  mocked.prompt.mockImplementation(async (question) => {
    if (question.type === 'multiselect')
      return { value: question.choices.map((item: { value: string }) => item.value) }
    if (question.choices)
      return { value: question.choices[0].value }
    const name = Object.keys(inputs).find(key => question.message === cliM(`cli_deploy_input${key.split('_').at(-1)}` as Parameters<typeof cliM>[0]))
    return { value: name ? inputs[name] : question.initial }
  })
  const run = vi.spyOn(deploy, 'deployApp').mockResolvedValue({ success: true, data: { url: 'http://server.internal:8080', deploymentId: 'test', status: 'ready', envVarsSet: [] } })
  const init = vi.spyOn(deploy, 'init')
  await deployCommand({ appDir: service, env: 'test', skipMiddleware: true })
  expect(readFileSync(join(app, '.env.local'), 'utf8')).toContain('server.internal')
  expect(readFileSync(join(app, '.env.test'), 'utf8')).not.toContain('server.internal')
  mocked.prompt.mockClear()
  await deployCommand({ appDir: service, env: 'test', yes: true, skipMiddleware: true })
  expect(mocked.prompt).not.toHaveBeenCalled()
  expect(run).toHaveBeenCalledTimes(2)
  expect(init).toHaveBeenLastCalledWith(expect.objectContaining({ provider: expect.objectContaining({ type: 'docker-ssh', ssh: expect.objectContaining({ host: 'server.internal', port: 2202, username: 'deployer', identityFile: 'C:/keys/deploy' }), expose: expect.objectContaining({ hostPort: 8080 }) }) }))
}, 30_000)
afterEach(async () => {
  await deploy.close()
  core.config.clear()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  if (stdinDescriptor)
    Object.defineProperty(process.stdin, 'isTTY', stdinDescriptor)
  else
    Reflect.deleteProperty(process.stdin, 'isTTY')
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true })
})

async function fullstackFixture(): Promise<{ root: string, app: string, service: string }> {
  const root = mkdtempSync(join(tmpdir(), 'hai-deploy-fullstack-'))
  roots.push(root)
  await createProject({ name: 'deploy-app', appType: 'fullstack', frontends: ['web'], template: 'default', features: ['db', 'cache', 'storage', 'iam', 'deploy'], yes: true, install: false, git: false, cwd: root })
  const app = join(root, 'deploy-app')
  expect(JSON.parse(readFileSync(join(app, 'package.json'), 'utf8')).devDependencies['@h-ai/deploy']).toBe('catalog:')
  const service = join(app, 'packages/deploy-app-serv')
  writeFileSync(join(app, 'pnpm-lock.yaml'), stringify({ lockfileVersion: '9.0', importers: { 'packages/deploy-app-serv': { dependencies: Object.fromEntries(['iam', 'reldb', 'cache', 'storage', 'reach'].map(name => [`@h-ai/${name}`, { version: '1' }])) } }, packages: Object.fromEntries(['iam', 'reldb', 'cache', 'storage', 'reach'].map(name => [`@h-ai/${name}@1`, {}])), snapshots: Object.fromEntries(['iam', 'reldb', 'cache', 'storage', 'reach'].map(name => [`@h-ai/${name}@1`, {}])) }))
  writeFileSync(join(service, 'config/_deploy.yml'), 'provider:\n  type: docker-ssh\n  ssh:\n    host: example.test\n    username: deploy\n  expose:\n    hostPort: 18080\n')
  return { root, app, service }
}

it('requires the selected file before loading credentials or starting deployment', async () => {
  const { app, service } = await fullstackFixture()
  unlinkSync(join(app, '.env.test'))
  await expect(deployCommand({ appDir: service, env: 'test', yes: true })).rejects.toThrow('.env.test')
  expect(deploy.credentials.load).not.toHaveBeenCalled()
  expect(mocked.prompt).not.toHaveBeenCalled()
}, 30_000)

it('asks for the environment first, configures MySQL field-by-field and skips a kept cache', async () => {
  const { app, service } = await fullstackFixture()
  writeFileSync(join(app, '.env.test'), 'HAI_CORE_ENV=test\nHAI_DEPLOY_PROVIDER=\'{"type":"docker-ssh","ssh":{"host":"example.test","username":"deploy"},"expose":{"hostPort":18080}}\'\nHAI_CACHE=\'{"type":"memory"}\'\n')
  const questions: string[] = []
  const inputValues: Record<string, string> = {
    HAI_DB_URL: '',
    HAI_DB_HOST: 'mysql.internal',
    HAI_DB_PORT: '3307',
    HAI_DB_DATABASE: 'business',
    HAI_DB_USER: 'operator',
    HAI_DB_PASSWORD: 'test-private-password',
    HAI_DB_SSL: 'true',
  }
  mocked.prompt.mockImplementation(async (question) => {
    if (question.type === 'multiselect')
      return { value: question.choices.map((item: { value: string }) => item.value) }
    questions.push(question.message)
    if (question.name === 'environment')
      return { environment: 'test' }
    if (question.message.includes('How should db'))
      return { value: 'custom' }
    if (question.message.includes('How should cache')) {
      expect(question.choices.map((item: { value: string }) => item.value)).toContain('keep')
      return { value: 'keep' }
    }
    if (question.message.includes('How should'))
      return { value: 'default' }
    if (question.message.includes('Select the backend for db'))
      return { value: 'mysql' }
    if (question.type === 'select')
      return { value: question.choices[question.initial ?? 0].value }
    const name = moduleEnvironmentVariables('db').find(item => question.message.startsWith(item.description))?.name
    if (name === 'HAI_DB_PORT')
      expect(question.validate('70000')).not.toBe(true)
    return { value: name ? inputValues[name] ?? question.initial : question.initial }
  })
  const run = vi.spyOn(deploy, 'deployApp').mockResolvedValue({ success: true, data: { url: 'https://example.test', deploymentId: 'test', status: 'ready', envVarsSet: [] } })
  await deployCommand({ appDir: service })
  expect(questions[0]).toContain('Deployment environment')
  expect(run).toHaveBeenCalledWith(service, expect.objectContaining({ environment: 'test', envDir: app, serviceModes: expect.objectContaining({ db: 'custom', cache: 'keep' }) }))
  const mode = readFileSync(join(app, '.env.test'), 'utf8')
  expect(mode).not.toContain('test-private-password')
  expect(mode).toContain('mysql.internal')
  expect(mode).toContain('HAI_CACHE=\'{"type":"memory"}\'')
  const loaded = loadDeploymentEnvironment({ environment: 'test', envDir: app })
  expect(loaded.success).toBe(true)
  if (!loaded.success)
    return
  for (const [key, value] of Object.entries(loaded.data.values))
    vi.stubEnv(key, value)
  const database = core.config.load('db', join(service, 'config/_db.yml'), ReldbConfigSchema)
  expect(database).toMatchObject({ success: true, data: { type: 'mysql', host: 'mysql.internal', port: 3307, database: 'business', user: 'operator', password: 'test-private-password', ssl: true } })
}, 30_000)
