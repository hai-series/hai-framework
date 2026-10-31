import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { parseEnv } from 'node:util'
import { core } from '@h-ai/core'
import { deploy, loadDeploymentEnvironment } from '@h-ai/deploy'
import * as deployModule from '@h-ai/deploy'
import { ReldbConfigSchema } from '@h-ai/reldb/schemas'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { parse, stringify } from 'yaml'
import { cliM } from '../src/cli-i18n.js'
import * as cliUtils from '../src/cli-utils.js'
import { moduleEnvironmentVariables } from '../src/commands/cli-config-environment.js'
import { createProject } from '../src/commands/cli-create.js'
import { configureDeployMiddleware } from '../src/commands/cli-deploy-middleware.js'
import { deployCommand } from '../src/commands/cli-deploy.js'

const mocked = vi.hoisted(() => ({ prompt: vi.fn() }))
vi.mock('prompts', () => ({ default: mocked.prompt }))
const roots: string[] = []
let stdinDescriptor: PropertyDescriptor | undefined

function setDeployment(app: string, content: string): void {
  const file = join(app, 'hai.json')
  const project = JSON.parse(readFileSync(file, 'utf8'))
  writeFileSync(file, JSON.stringify({ ...project, deploy: parse(content) }, null, 2))
}

it('asks once per email and SMS provider and reports saved services without environment variables', async () => {
  const { app, service } = await fullstackFixture()
  const scan = await deploy.scan(service, { environment: 'test', envDir: app })
  const environment = loadDeploymentEnvironment({ environment: 'test', envDir: app })
  expect(scan.success && environment.success).toBe(true)
  if (!scan.success || !environment.success)
    return
  mocked.prompt.mockImplementation(async question => ({ [question.name]: question.choices[question.initial ?? 0].value }))
  const output = vi.spyOn(cliUtils, 'writeCliMessage').mockImplementation(() => {})
  const reach = { ...scan.data, middlewares: scan.data.middlewares?.filter(item => item.configName === 'reach') }
  const modes = await configureDeployMiddleware(deployModule, reach, environment.data, { provider: { type: 'docker-ssh' } })
  expect(mocked.prompt.mock.calls.map(([question]) => question.message)).toEqual([
    cliM('cli_deploy_action', { params: { service: 'email' } }),
    cliM('cli_deploy_backend', { params: { service: 'email' } }),
    cliM('cli_deploy_action', { params: { service: 'sms' } }),
    cliM('cli_deploy_backend', { params: { service: 'sms' } }),
  ])
  expect(modes).toMatchObject({ email: 'default', sms: 'default', HAI_REACH_PROVIDERS_0: 'default', HAI_REACH_PROVIDERS_1: 'default' })
  const saved = loadDeploymentEnvironment({ environment: 'test', envDir: app })
  expect(saved.success).toBe(true)
  if (saved.success) {
    expect(deployModule.loadDeploymentConfig('reach', join(service, 'config/_reach.yml'), saved.data.values)).toMatchObject({ success: true, data: { providers: [{ name: 'email', type: 'console' }, { name: 'sms', type: 'console' }] } })
  }
  expect(output.mock.calls.map(([message]) => message).join('\n')).not.toMatch(/HAI_|NODE_ENV|PORT/)
  expect(output).toHaveBeenCalledWith(cliM('cli_deploy_saved', { params: { service: 'email' } }))
  expect(output).toHaveBeenCalledWith(cliM('cli_deploy_saved', { params: { service: 'sms' } }))
}, 30_000)

it.each(['container:\n', 'container: null\n', 'container: invalid\n'])('handles S3 engine configuration in project JSON (%s)', async (node) => {
  const { app, service } = await fullstackFixture()
  const file = join(app, 'hai.json')
  setDeployment(app, `provider:\n  type: docker-ssh\n${node}`)
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
    expect(JSON.parse(readFileSync(file, 'utf8')).deploy.container).toBe('invalid')
  }
  else {
    await expect(operation).resolves.toMatchObject({ storage: 'default' })
    expect(JSON.parse(readFileSync(file, 'utf8')).deploy.container.s3Engine).toBe(`\${HAI_DEPLOY_CONTAINER_S3ENGINE:rustfs}`)
    expect(JSON.parse(readFileSync(file, 'utf8')).build.images).toHaveLength(2)
  }
}, 30_000)

beforeEach(() => {
  core.i18n.setGlobalLocale('en-US')
  stdinDescriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY')
  Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
  mocked.prompt.mockReset()
  vi.spyOn(deploy.credentials, 'load').mockReturnValue({ success: true, data: [] })
})

it.each(['files', 'letsencrypt'])('configures the optional HTTPS step and reuses it non-interactively (%s)', async (type) => {
  const { app, service } = await fullstackFixture()
  setDeployment(app, 'provider:\n  type: docker-ssh\n  ssh:\n    host: https-server.internal\n    username: deploy\n  expose:\n    hostPort: 8080\n')
  mocked.prompt.mockImplementation(async (question) => {
    const answers: Record<string, unknown> = {
      httpsMode: type,
      httpsDomain: 'app.example.test',
      httpsPort: '443',
      httpsCertificate: '.hai/certificates/fullchain.pem',
      httpsPrivateKey: '.hai/certificates/privkey.pem',
      httpsEmail: 'operator@example.test',
      acceptTerms: true,
    }
    if (Object.hasOwn(answers, question.name))
      return { [question.name]: answers[question.name] }
    return { [question.name]: question.type === 'multiselect' ? question.choices.map((item: { value: string }) => item.value) : question.choices?.[0]?.value }
  })
  const init = vi.spyOn(deploy, 'init')
  vi.spyOn(deploy, 'deployApp').mockResolvedValue({ success: true, data: { url: 'https://app.example.test', deploymentId: 'https-test', status: 'ready', envVarsSet: [] } })
  await deployCommand({ appDir: service, env: 'test', skipMiddleware: true })
  expect(init).toHaveBeenLastCalledWith(expect.objectContaining({ provider: expect.objectContaining({ expose: expect.objectContaining({ hostPort: type === 'letsencrypt' ? 80 : 18080, https: expect.objectContaining({ type, domain: 'app.example.test', port: 443 }) }) }) }))
  expect(readFileSync(join(app, '.env.test.local'), 'utf8')).toContain('app.example.test')
  expect(readFileSync(join(app, '.env.test'), 'utf8')).not.toContain('app.example.test')
  mocked.prompt.mockClear()
  await deployCommand({ appDir: service, env: 'test', yes: true, skipMiddleware: true })
  expect(mocked.prompt).not.toHaveBeenCalled()
}, 30_000)

it('lets a complete environment bypass every middleware prompt and preserves environment files', async () => {
  const { app, service } = await fullstackFixture()
  writeFileSync(join(app, '.env.test'), 'HAI_DEPLOY_PROVIDER=\'{"type":"docker-ssh","ssh":{"host":"existing.test","username":"deploy"},"expose":{"hostPort":8080}}\'\nHAI_DB_TYPE=sqlite\n')
  const before = readFileSync(join(app, '.env.test'), 'utf8')
  mocked.prompt.mockImplementation(async question => ({ [question.name]: question.name === 'httpsMode' ? 'keep' : question.type === 'multiselect' ? question.choices.map((item: { value: string }) => item.value) : 'skip' }))
  const run = vi.spyOn(deploy, 'deployApp').mockResolvedValue({ success: true, data: { url: 'http://existing.test:8080', deploymentId: 'test', status: 'ready', envVarsSet: [] } })
  await deployCommand({ appDir: service, env: 'test' })
  expect(mocked.prompt).toHaveBeenCalledTimes(3)
  expect(mocked.prompt.mock.calls.some(([question]) => question.name === 'httpsMode')).toBe(true)
  expect(run).toHaveBeenCalledWith(service, expect.objectContaining({ skipMiddleware: true, serviceModes: expect.objectContaining({ db: 'keep', cache: 'keep', storage: 'keep' }) }))
  expect(readFileSync(join(app, '.env.test'), 'utf8')).toBe(before)
  expect(deploy.config?.services).toBeUndefined()
}, 30_000)

it('首次部署先保存下载源和代理选择，后续交互仍沿用中间件流程', async () => {
  const { app, service } = await fullstackFixture(false)
  writeFileSync(join(app, '.env.test'), 'HAI_DEPLOY_PROVIDER=\'{"type":"docker-ssh","ssh":{"host":"existing.test","username":"deploy"},"expose":{"hostPort":8080}}\'\nHAI_DB_TYPE=sqlite\n')
  mocked.prompt.mockImplementation(async (question) => {
    if ([cliM('cli_download_choose_image'), cliM('cli_download_choose_npm')].includes(question.message))
      return { value: 'cn' }
    if (question.message === cliM('cli_download_choose_proxy'))
      return { value: 'none' }
    return { [question.name]: question.name === 'httpsMode' ? 'keep' : question.type === 'multiselect' ? question.choices.map((item: { value: string }) => item.value) : 'skip' }
  })
  const run = vi.spyOn(deploy, 'deployApp').mockResolvedValue({ success: true, data: { url: 'http://existing.test:8080', deploymentId: 'first-download-selection', status: 'ready', envVarsSet: [] } })
  await deployCommand({ appDir: service, env: 'test' })
  const downloadQuestions = [cliM('cli_download_choose_image'), cliM('cli_download_choose_npm'), cliM('cli_download_choose_proxy')]
  expect(mocked.prompt.mock.calls.map(([question]) => question.message).filter(message => downloadQuestions.includes(message))).toEqual([
    cliM('cli_download_choose_image'),
    cliM('cli_download_choose_npm'),
    cliM('cli_download_choose_proxy'),
  ])
  expect(JSON.parse(readFileSync(join(app, 'hai.json'), 'utf8')).build).toMatchObject({ sources: { image: { type: 'cn' }, npm: { type: 'cn' } }, proxy: { mode: 'none' } })
  expect(run).toHaveBeenCalledWith(service, expect.objectContaining({ imageSource: { type: 'cn' }, proxy: { mode: 'none' }, skipMiddleware: true }))
}, 30_000)

it('infers Web selection from a partial artifact before configuring middleware', async () => {
  const { app, service } = await fullstackFixture()
  const artifacts = join(app, '.hai/build/docker/partial')
  mkdirSync(artifacts, { recursive: true })
  writeFileSync(join(app, '.hai/build/docker/latest'), 'partial\n')
  const file = 'web-1.2.3.tar'
  writeFileSync(join(artifacts, file), 'prebuilt-web')
  writeFileSync(join(artifacts, 'manifest.json'), JSON.stringify({ version: 4, primaryService: 'serv', appVersion: '1.2.3', buildId: 'partial', partial: true, hasWeb: true, images: [{ name: 'web', file, imageRef: 'localhost/test-web:1.2.3', sha256: await deployModule.artifactChecksum(join(artifacts, file)) }] }))
  writeFileSync(join(app, '.env.test'), 'HAI_ADMIN_DEFAULT_PASSWORD=fixture-password\n')
  const output = vi.spyOn(cliUtils, 'writeCliMessage').mockImplementation(() => {})
  const run = vi.spyOn(deploy, 'deployApp').mockResolvedValue({ success: true, data: { url: 'http://example.test:18080', deploymentId: 'test', status: 'ready', envVarsSet: [] } })
  await deployCommand({ appDir: service, env: 'test', yes: true })
  expect(run).toHaveBeenCalledWith(service, expect.objectContaining({ selectedServices: ['web'], skipMiddleware: true }))
  expect(mocked.prompt).not.toHaveBeenCalled()
  expect(readFileSync(join(app, '.env.test'), 'utf8')).toBe('HAI_ADMIN_DEFAULT_PASSWORD=fixture-password\n')
  expect(output.mock.calls.flat().join('\n')).not.toContain('HAI_ADMIN_DEFAULT_PASSWORD')
}, 30_000)

it('guides SSH setup once, saves parameters privately and reuses them without prompts', async () => {
  const { app, service } = await fullstackFixture()
  setDeployment(app, 'provider:\n  type: docker-ssh\n  expose:\n    hostPort: 8080\n')
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
      return { [question.name]: question.choices.map((item: { value: string }) => item.value) }
    if (question.choices)
      return { [question.name]: question.choices[0].value }
    const name = Object.keys(inputs).find(key => question.message === cliM(`cli_deploy_input${key.split('_').at(-1)}` as Parameters<typeof cliM>[0]))
    return { [question.name]: name ? inputs[name] : question.initial }
  })
  const run = vi.spyOn(deploy, 'deployApp').mockResolvedValue({ success: true, data: { url: 'http://server.internal:8080', deploymentId: 'test', status: 'ready', envVarsSet: [] } })
  const init = vi.spyOn(deploy, 'init')
  await deployCommand({ appDir: service, env: 'test', skipMiddleware: true })
  expect(readFileSync(join(app, '.env.test.local'), 'utf8')).toContain('server.internal')
  expect(readFileSync(join(app, '.env.test'), 'utf8')).not.toContain('server.internal')
  mocked.prompt.mockClear()
  await deployCommand({ appDir: service, env: 'test', yes: true, skipMiddleware: true })
  expect(mocked.prompt).not.toHaveBeenCalled()
  expect(run).toHaveBeenCalledTimes(2)
  expect(init).toHaveBeenLastCalledWith(expect.objectContaining({ provider: expect.objectContaining({ type: 'docker-ssh', ssh: expect.objectContaining({ host: 'server.internal', port: 2202, username: 'deployer', identityFile: 'C:/keys/deploy' }), expose: expect.objectContaining({ hostPort: 8080 }) }) }))
}, 30_000)
it('saves a hidden SSH password unchanged and reuses it without another prompt', async () => {
  const { app, service } = await fullstackFixture()
  setDeployment(app, 'provider:\n  type: docker-ssh\n  expose:\n    hostPort: 8080\n')
  const password = '  0012#\'"$中文  '
  const inputs: Record<string, string> = {
    HAI_DEPLOY_PROVIDER_SSH_HOST: 'password-server.internal',
    HAI_DEPLOY_PROVIDER_SSH_PORT: '2202',
    HAI_DEPLOY_PROVIDER_SSH_USERNAME: 'deployer',
    HAI_DEPLOY_PROVIDER_SSH_PASSWORD: password,
    HAI_DEPLOY_PROVIDER_REMOTE_BASEDIR: '/srv/apps',
    HAI_DEPLOY_PROVIDER_EXPOSE_HOSTPORT: '8080',
    HAI_DEPLOY_PROVIDER_EXPOSE_CONTAINERPORT: '3000',
  }
  mocked.prompt.mockImplementation(async (question) => {
    if (question.message === cliM('cli_deploy_target_auth'))
      return { [question.name]: 'password' }
    if (question.type === 'multiselect')
      return { [question.name]: question.choices.map((item: { value: string }) => item.value) }
    if (question.choices)
      return { [question.name]: question.choices[0].value }
    const name = Object.keys(inputs).find(key => question.message === cliM(`cli_deploy_input${key.split('_').at(-1)}` as Parameters<typeof cliM>[0]))
    return { [question.name]: name ? inputs[name] : question.initial ?? '' }
  })
  const output = vi.spyOn(cliUtils, 'writeCliMessage').mockImplementation(() => {})
  vi.spyOn(deploy, 'deployApp').mockResolvedValue({ success: true, data: { url: 'http://password-server.internal:8080', deploymentId: 'password-test', status: 'ready', envVarsSet: [] } })
  const init = vi.spyOn(deploy, 'init')
  await deployCommand({ appDir: service, env: 'test', skipMiddleware: true })
  expect(init).toHaveBeenLastCalledWith(expect.objectContaining({ provider: expect.objectContaining({ ssh: expect.objectContaining({ auth: 'password', password }) }) }))
  expect(mocked.prompt.mock.calls.some(([question]) => question.type === 'password' && question.message === cliM('cli_deploy_inputPASSWORD'))).toBe(true)
  const privatePath = join(app, '.env.test.local')
  const saved = readFileSync(privatePath, 'utf8')
  expect(readFileSync(join(app, '.env.test'), 'utf8')).not.toContain('password-server.internal')
  expect(readFileSync(join(app, '.env.test'), 'utf8')).not.toContain(password)
  mocked.prompt.mockClear()
  await deployCommand({ appDir: service, env: 'test', yes: true, skipMiddleware: true })
  expect(mocked.prompt).not.toHaveBeenCalled()
  expect(readFileSync(privatePath, 'utf8')).toBe(saved)
  expect(init).toHaveBeenLastCalledWith(expect.objectContaining({ provider: expect.objectContaining({ ssh: expect.objectContaining({ auth: 'password', password }) }) }))
  expect(output.mock.calls.map(([message]) => message).join('\n')).not.toContain(password)
}, 30_000)

it.each(['missing', 'partial', 'saved'])('bundle-only skips SSH prompts and only reuses complete saved SSH settings (%s)', async (targetState) => {
  const { app, service } = await fullstackFixture()
  const savedTarget = targetState === 'saved'
  setDeployment(app, `provider:\n  type: docker-ssh\n  expose:\n    hostPort: 8080\n${targetState === 'partial' ? '  ssh:\n    host: partial-server.internal\n' : ''}`)
  const ssh = { host: 'saved-server.internal', username: 'deployer', port: 2202 }
  if (savedTarget)
    writeFileSync(join(app, '.env.local'), `HAI_DEPLOY_PROVIDER='${JSON.stringify({ type: 'docker-ssh', ssh, expose: { hostPort: 8080 } })}'\n`)
  const run = vi.spyOn(deploy, 'deployApp').mockResolvedValue({ success: true, data: { url: '', deploymentId: 'bundle-only', status: 'packaged', envVarsSet: [] } })
  const init = vi.spyOn(deploy, 'init')

  await deployCommand({ appDir: service, env: 'test', yes: true, skipMiddleware: true, bundleOnly: true })

  expect(mocked.prompt).not.toHaveBeenCalled()
  expect(run).toHaveBeenCalledWith(service, expect.objectContaining({ bundleOnly: true }))
  const provider = init.mock.calls[0][0].provider
  expect(provider.type).toBe('docker-ssh')
  if (provider.type === 'docker-ssh')
    expect(provider.ssh).toEqual(savedTarget ? expect.objectContaining(ssh) : undefined)
  if (!savedTarget) {
    await expect(deployCommand({ appDir: service, env: 'test', yes: true, skipMiddleware: true })).rejects.toThrow('provider.ssh')
    expect(run).toHaveBeenCalledOnce()
  }
}, 30_000)

it.each(['missing', 'partial', 'saved', 'password'])('离线打包最后确认 SSH，按环境保存并用于本次及后续 target：%s', async (state) => {
  const { app, service } = await fullstackFixture()
  const password = '  synthetic updated SSH password 001  '
  const original = { type: 'docker-ssh', ssh: state === 'missing' ? undefined : { host: 'old.internal', ...(state !== 'partial' ? { username: 'old-user', port: 2222 } : {}), ...(state === 'password' ? { auth: 'password', password: 'synthetic old SSH password' } : {}) }, expose: { hostPort: 8080 } }
  setDeployment(app, stringify({ provider: original }))
  const artifacts = join(app, '.hai/build/docker/release')
  mkdirSync(artifacts, { recursive: true })
  writeFileSync(join(app, '.hai/build/docker/latest'), 'release\n')
  writeFileSync(join(artifacts, 'serv-1.2.3.tar'), 'synthetic app image')
  writeFileSync(join(artifacts, 'manifest.json'), JSON.stringify({ version: 4, primaryService: 'serv', appVersion: '1.2.3', buildId: 'release', images: [{ name: 'serv', file: 'serv-1.2.3.tar', imageRef: 'localhost/wizard:1.2.3', sha256: await deployModule.artifactChecksum(join(artifacts, 'serv-1.2.3.tar')) }] }))
  const inputs: Record<string, string> = { HOST: 'new.internal', PORT: '2202', USERNAME: 'new-user', IDENTITYFILE: 'C:/keys/deploy', KNOWNHOSTSFILE: '', BASEDIR: '/srv/apps', HOSTPORT: '8080', CONTAINERPORT: '3000' }
  mocked.prompt.mockImplementation(async (question) => {
    if (question.type === 'confirm')
      return { [question.name]: true }
    if (question.message === cliM('cli_deploy_target_auth') && state === 'password')
      return { [question.name]: 'password' }
    if (question.type === 'password') {
      expect(question.initial).toBeUndefined()
      return { [question.name]: password }
    }
    if (question.choices)
      return { [question.name]: question.choices[0].value }
    const name = Object.keys(inputs).find(key => question.message === cliM(`cli_deploy_input${key}` as Parameters<typeof cliM>[0]))
    return { [question.name]: name ? inputs[name] : question.initial }
  })
  const publicBefore = readFileSync(join(app, '.env.test'), 'utf8')
  const deploymentBefore = readFileSync(join(app, 'hai.json'), 'utf8')
  const run = vi.spyOn(deploy, 'deployApp')
  await deployCommand({ appDir: service, env: 'test', bundleOnly: true, services: 'serv', skipMiddleware: true })
  expect(mocked.prompt.mock.calls[0]?.[0].type).toBe('confirm')
  const environment = loadDeploymentEnvironment({ environment: 'test', envDir: app })
  expect(environment.success).toBe(true)
  if (!environment.success)
    return
  const configuration = deployModule.loadDeploymentConfig('deploy', join(app, 'hai.json'), environment.data.values)
  expect(configuration).toMatchObject({ success: true, data: { provider: { ssh: { host: 'new.internal', port: 2202, username: 'new-user' }, remote: { baseDir: '/srv/apps' } } } })
  if (state === 'password')
    expect(configuration).toMatchObject({ success: true, data: { provider: { ssh: { password } } } })
  expect(parseEnv(readFileSync(join(app, '.env.test'), 'utf8'))).toMatchObject(parseEnv(publicBefore))
  expect(readFileSync(join(app, '.env.test'), 'utf8')).not.toContain('new.internal')
  expect(readFileSync(join(app, 'hai.json'), 'utf8')).toBe(deploymentBefore)
  mocked.prompt.mockClear()
  await deployCommand({ appDir: service, env: 'test', yes: true, bundleOnly: true, services: 'serv', skipMiddleware: true })
  expect(mocked.prompt).not.toHaveBeenCalled()
  for (const promise of run.mock.results.map(result => result.value)) {
    const result = await promise
    expect(result.success).toBe(true)
    if (!result.success || !result.data.bundlePath)
      throw new Error('Expected offline bundle')
    const target = JSON.parse(readFileSync(join(result.data.bundlePath, '..', 'deploy-target.json'), 'utf8'))
    expect(target).toMatchObject({ host: 'new.internal', port: 2202, username: 'new-user', auth: state === 'password' ? 'password' : 'key', identityFile: state === 'password' ? '' : 'C:/keys/deploy', directory: '/srv/apps/deploy-app-test' })
    expect(target.password).toBeUndefined()
    expect(readFileSync(result.data.bundlePath).includes(password)).toBe(false)
  }
}, 30_000)

it.each([false, undefined])('离线 SSH 提示允许跳过，取消时不继续打包：%s', async (answer) => {
  const { app, service } = await fullstackFixture()
  mocked.prompt.mockResolvedValue({ value: answer })
  const run = vi.spyOn(deploy, 'deployApp').mockResolvedValue({ success: true, data: { url: '', deploymentId: 'offline', status: 'packaged', envVarsSet: [] } })
  const init = vi.spyOn(deploy, 'init')
  const command = deployCommand({ appDir: service, env: 'test', bundleOnly: true, services: 'serv', skipMiddleware: true })
  if (answer === undefined) {
    await expect(command).rejects.toThrow(cliM('cli_deploy_cancelled'))
    expect(run).not.toHaveBeenCalled()
    expect(init).not.toHaveBeenCalled()
  }
  else {
    await command
    expect(run).toHaveBeenCalledOnce()
    expect(init).toHaveBeenCalledWith(expect.objectContaining({ provider: expect.objectContaining({ ssh: expect.objectContaining({ host: 'example.test' }) }) }))
  }
  expect(mocked.prompt).toHaveBeenCalledOnce()
  expect(readFileSync(join(app, '.env.test'), 'utf8')).not.toContain('HAI_DEPLOY_PROVIDER')
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

async function fullstackFixture(downloadsConfigured = true): Promise<{ root: string, app: string, service: string }> {
  const root = mkdtempSync(join(tmpdir(), 'hai-deploy-fullstack-'))
  roots.push(root)
  await createProject({ name: 'deploy-app', appType: 'fullstack', frontends: ['web'], defaults: true, install: false, git: false, cwd: root })
  const app = join(root, 'deploy-app')
  if (downloadsConfigured) {
    // 旧向导用例验证中间件和 SSH；已保存下载偏好时不应插入首次选择问题。
    const path = join(app, 'hai.json')
    const project = JSON.parse(readFileSync(path, 'utf8'))
    project.build.sources = { image: { type: 'official' }, npm: { type: 'official' } }
    project.build.proxy = { mode: 'inherit' }
    writeFileSync(path, JSON.stringify(project, null, 2))
  }
  expect(JSON.parse(readFileSync(join(app, 'package.json'), 'utf8')).devDependencies['@h-ai/deploy']).toBe('catalog:')
  const service = join(app, 'packages/deploy-app-serv')
  writeFileSync(join(app, 'pnpm-lock.yaml'), stringify({ lockfileVersion: '9.0', importers: { 'packages/deploy-app-serv': { dependencies: Object.fromEntries(['iam', 'reldb', 'cache', 'storage', 'reach'].map(name => [`@h-ai/${name}`, { version: '1' }])) } }, packages: Object.fromEntries(['iam', 'reldb', 'cache', 'storage', 'reach'].map(name => [`@h-ai/${name}@1`, {}])), snapshots: Object.fromEntries(['iam', 'reldb', 'cache', 'storage', 'reach'].map(name => [`@h-ai/${name}@1`, {}])) }))
  setDeployment(app, 'provider:\n  type: docker-ssh\n  ssh:\n    host: example.test\n    username: deploy\n  expose:\n    hostPort: 18080\n')
  return { root, app, service }
}

it('rejects build concurrency without requesting a build before reading deployment configuration', async () => {
  await expect(deployCommand({ env: 'test', yes: true, concurrency: 1 })).rejects.toThrow(cliM('cli_deploy_build_options_required'))
  expect(deploy.credentials.load).not.toHaveBeenCalled()
  expect(mocked.prompt).not.toHaveBeenCalled()
})

it('requires the selected file before loading credentials or starting deployment', async () => {
  const { app, service } = await fullstackFixture()
  unlinkSync(join(app, '.env.test'))
  await expect(deployCommand({ appDir: service, env: 'test', yes: true })).rejects.toThrow('.env.test')
  expect(deploy.credentials.load).not.toHaveBeenCalled()
  expect(mocked.prompt).not.toHaveBeenCalled()
}, 30_000)

it('部署完成后显示当前模式初始管理员密码的实际来源，不受日志级别影响且不显示秘密值', async () => {
  const { app, service } = await fullstackFixture()
  const password = 'Private-fixture-password-Aa1!'
  writeFileSync(join(app, '.env.test.local'), `HAI_ADMIN_DEFAULT_PASSWORD='${password}'\nHAI_CORE_LOGGING_LEVEL=error\n`)
  const output = vi.spyOn(cliUtils, 'writeCliMessage').mockImplementation(() => {})
  vi.spyOn(deploy, 'deployApp').mockResolvedValue({ success: true, data: { url: 'http://example.test:18080', deploymentId: 'test', status: 'ready', envVarsSet: [] } })
  await deployCommand({ appDir: service, env: 'test', yes: true, skipMiddleware: true })
  const text = output.mock.calls.map(([message]) => message).join('\n')
  expect(text).toContain('HAI_ADMIN_DEFAULT_PASSWORD')
  expect(text).toContain(join(app, '.env.test.local'))
  expect(text).not.toContain(password)
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
    HAI_DB_SSL: JSON.stringify({ rejectUnauthorized: true, verifyIdentity: true, ca: 'test-ca-pem', cert: 'test-cert-pem', key: '-----BEGIN PRIVATE KEY-----\ntest-private-client-key\n-----END PRIVATE KEY-----' }),
  }
  mocked.prompt.mockImplementation(async (question) => {
    if (question.type === 'multiselect')
      return { [question.name]: question.choices.map((item: { value: string }) => item.value) }
    questions.push(question.message)
    if (question.name === 'environment')
      return { environment: 'test' }
    if (question.message.includes('How should db'))
      return { [question.name]: 'custom' }
    if (question.message.includes('How should cache')) {
      expect(question.choices.map((item: { value: string }) => item.value)).toContain('keep')
      return { [question.name]: 'keep' }
    }
    if (question.message.includes('How should'))
      return { [question.name]: 'default' }
    if (question.message.includes('Select the backend for db'))
      return { [question.name]: 'mysql' }
    if (question.type === 'select')
      return { [question.name]: question.choices[question.initial ?? 0].value }
    const name = moduleEnvironmentVariables('db').find(item => question.message.startsWith(item.description))?.name
    if (name === 'HAI_DB_PORT')
      expect(question.validate('70000')).not.toBe(true)
    if (name === 'HAI_DB_SSL') {
      for (const invalid of ['true', 'require', 'prefer', 'allow', 'disable', '{ ca: "" }', '{ rejectUnauthorized: "true" }', '{ cert: cert-only }', '{ key: key-only }', '{ unknown: true }'])
        expect(question.validate(invalid), invalid).not.toBe(true)
      expect(question.validate('{}')).toBe(true)
      expect(question.validate('false')).toBe(true)
      expect(question.validate(inputValues.HAI_DB_SSL)).toBe(true)
    }
    return { [question.name]: name ? inputValues[name] ?? question.initial : question.initial }
  })
  const run = vi.spyOn(deploy, 'deployApp').mockResolvedValue({ success: true, data: { url: 'https://example.test', deploymentId: 'test', status: 'ready', envVarsSet: [] } })
  await deployCommand({ appDir: service })
  expect(questions[0]).toContain('Deployment environment')
  expect(run).toHaveBeenCalledWith(service, expect.objectContaining({ environment: 'test', envDir: app, serviceModes: expect.objectContaining({ db: 'custom', cache: 'keep' }) }))
  const mode = readFileSync(join(app, '.env.test'), 'utf8')
  expect(mode).not.toContain('test-private-password')
  expect(mode).not.toContain('test-private-client-key')
  expect(readFileSync(join(app, '.env.test.local'), 'utf8')).toContain('test-private-client-key')
  expect(mode).toContain('mysql.internal')
  expect(mode).toContain('HAI_CACHE=\'{"type":"memory"}\'')
  const loaded = loadDeploymentEnvironment({ environment: 'test', envDir: app })
  expect(loaded.success).toBe(true)
  if (!loaded.success)
    return
  for (const [key, value] of Object.entries(loaded.data.values))
    vi.stubEnv(key, value)
  const database = core.config.load('db', join(service, 'config/_db.yml'), ReldbConfigSchema)
  expect(database).toMatchObject({ success: true, data: { type: 'mysql', host: 'mysql.internal', port: 3307, database: 'business', user: 'operator', password: 'test-private-password', ssl: JSON.parse(inputValues.HAI_DB_SSL!) } })
}, 30_000)

it.each(['true', 'require', 'prefer', 'allow', 'disable', '{ ca: "" }', '{ cert: cert-only }', '{ key: key-only }', '{ unexpected: true }', '[false]'])('rejects invalid MySQL TLS %s before changing YAML or either environment file', async (ssl) => {
  const { app, service } = await fullstackFixture()
  writeFileSync(join(service, 'config/_db.yml'), 'type: mysql\ndatabase: business\nhost: mysql.internal\nssl: false\n')
  const environment = loadDeploymentEnvironment({ environment: 'test', envDir: app })
  const scanned = await deploy.scan(service, { environment: 'test', envDir: app })
  expect(environment.success && scanned.success).toBe(true)
  if (!environment.success || !scanned.success)
    return
  const files = [join(service, 'config/_db.yml'), join(app, '.env.test'), join(app, '.env.local')]
  const before = files.map(file => readFileSync(file, 'utf8'))
  mocked.prompt.mockImplementation(async (question) => {
    if (question.choices)
      return { [question.name]: question.message.includes('How should') ? 'custom' : 'mysql' }
    const name = moduleEnvironmentVariables('db').find(item => question.message.startsWith(item.description))?.name
    return { [question.name]: name === 'HAI_DB_SSL' ? ssl : question.initial }
  })
  await expect(configureDeployMiddleware(deployModule, { ...scanned.data, middlewares: scanned.data.middlewares?.filter(item => item.service === 'db') }, environment.data, { provider: { type: 'docker-ssh' } })).rejects.toThrow()
  expect(files.map(file => readFileSync(file, 'utf8'))).toEqual(before)
}, 30_000)

it('rejects invalid noninteractive MySQL TLS before persistence', async () => {
  const { app, service } = await fullstackFixture()
  writeFileSync(join(app, '.env.test'), 'HAI_CORE_ENV=test\nHAI_DB_TYPE=mysql\nHAI_DB_SSL=true\n')
  writeFileSync(join(service, 'config/_db.yml'), 'type: mysql\ndatabase: business\nhost: mysql.internal\nssl: true\n')
  const environment = loadDeploymentEnvironment({ environment: 'test', envDir: app })
  const scanned = await deploy.scan(service, { environment: 'test', envDir: app })
  expect(environment.success && scanned.success).toBe(true)
  if (!environment.success || !scanned.success)
    return
  const files = [join(service, 'config/_db.yml'), join(app, '.env.test'), join(app, '.env.local')]
  const before = files.map(file => readFileSync(file, 'utf8'))
  await expect(configureDeployMiddleware(deployModule, { ...scanned.data, middlewares: scanned.data.middlewares?.filter(item => item.service === 'db') }, environment.data, { provider: { type: 'docker-ssh' } }, true)).rejects.toThrow()
  expect(files.map(file => readFileSync(file, 'utf8'))).toEqual(before)
  expect(mocked.prompt).not.toHaveBeenCalled()
}, 30_000)

it.each([
  ['mysql', '{}', { rejectUnauthorized: true, verifyIdentity: true }],
  ['mysql', 'false', false],
  ['postgresql', 'true', true],
  ['postgresql', 'require', 'require'],
  ['postgresql', 'prefer', 'prefer'],
  ['postgresql', 'allow', 'allow'],
  ['postgresql', 'disable', 'disable'],
] as const)('round trips %s TLS %s through the wizard and actual Core schema loader', async (backend, ssl, expected) => {
  const { app, service } = await fullstackFixture()
  writeFileSync(join(service, 'config/_db.yml'), `type: ${backend}\ndatabase: business\nhost: db.internal\nssl: false\n`)
  const environment = loadDeploymentEnvironment({ environment: 'test', envDir: app })
  const scanned = await deploy.scan(service, { environment: 'test', envDir: app })
  expect(environment.success && scanned.success).toBe(true)
  if (!environment.success || !scanned.success)
    return
  mocked.prompt.mockImplementation(async (question) => {
    if (question.choices)
      return { [question.name]: question.message.includes('How should') ? 'custom' : backend }
    const name = moduleEnvironmentVariables('db').find(item => question.message.startsWith(item.description))?.name
    if (name === 'HAI_DB_SSL')
      expect(question.validate(ssl)).toBe(true)
    return { [question.name]: name === 'HAI_DB_SSL' ? ssl : question.initial }
  })
  await configureDeployMiddleware(deployModule, { ...scanned.data, middlewares: scanned.data.middlewares?.filter(item => item.service === 'db') }, environment.data, { provider: { type: 'docker-ssh' } })
  const loaded = loadDeploymentEnvironment({ environment: 'test', envDir: app })
  expect(loaded.success).toBe(true)
  if (!loaded.success)
    return
  for (const [key, value] of Object.entries(loaded.data.values)) vi.stubEnv(key, value)
  const database = core.config.load('db', join(service, 'config/_db.yml'), ReldbConfigSchema)
  expect(database).toMatchObject({ success: true, data: { type: backend, ssl: expected } })
}, 30_000)
