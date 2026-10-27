import { execFileSync } from 'node:child_process'
import { createECDH, createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import process from 'node:process'
import { parseEnv } from 'node:util'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { parse } from 'yaml'
import { deploy, DeploymentArtifactSchema, getDeployCommandState, HaiDeployError } from '../src/index.js'

const ssh = vi.hoisted(() => ({ ping: vi.fn(), exec: vi.fn(), upload: vi.fn() }))
vi.mock('../src/container/deploy-ssh.js', async importOriginal => ({ ...await importOriginal<typeof import('../src/container/deploy-ssh.js')>(), createSshExecutor: () => ssh }))
vi.mock('../src/container/deploy-command.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/container/deploy-command.js')>()
  return { ...original, runCommand: async (command: string, args: string[]) => {
    // 归档断言保留真实 tar；进程监管有独立用例，避免每份小包重复编译 Windows Job。
    let stdout = ''
    if (command === 'tar')
      stdout = execFileSync(command, args, { encoding: 'utf8', windowsHide: true, timeout: 5000 })
    else if (args[0] === 'save')
      writeFileSync(args[args.indexOf('-o') + 1]!, 'middleware archive')
    return { success: true, data: { code: 0, stdout, stderr: '', stdoutTruncated: false, stderrTruncated: false } }
  } }
})
let root: string
let artifacts: string

it.each(['missing', 'malformed', 'valid'])('部署启用 transport 的应用时提前校验密钥环并保持私有值完整：%s', async (state) => {
  writeFileSync(join(root, 'pnpm-lock.yaml'), JSON.stringify({ lockfileVersion: '9.0', importers: { '.': { dependencies: { '@h-ai/crypto': { version: '1' } } } }, packages: { '@h-ai/crypto@1': {} }, snapshots: { '@h-ai/crypto@1': {} } }))
  writeFileSync(join(root, 'config/_serv.yml'), 'transport:\n  maxPlaintextBytes: 1048576\nhttp:\n  apiPrefix: /api/v1\n')
  const key = createECDH('SM2')
  key.generateKeys()
  const ring = JSON.stringify({ activeKeyId: 'v1', keys: { v1: { publicKey: key.getPublicKey('hex'), privateKey: key.getPrivateKey('hex').padStart(64, '0') } } })
  if (state !== 'missing')
    writeFileSync(join(root, '.env.test.local'), `HAI_CRYPTO_TRANSPORT_SERVERKEYRING='${state === 'valid' ? ring : 'invalid-fixture-ring'}'\n`)
  await initialize(false)
  const result = await deploy.deployApp(root, { environment: 'test', bundleOnly: true })
  expect(result.success).toBe(state === 'valid')
  if (result.success) {
    const env = parseEnv(readBundleFile(deliveryDirectory(result), '.env.runtime'))
    expect(env.HAI_CRYPTO_TRANSPORT_SERVERKEYRING === ring).toBe(true)
  }
  else {
    expect(result.error.code).toBe(HaiDeployError.CONFIG_ERROR.code)
    expect(result.error.message).toContain('HAI_CRYPTO_TRANSPORT_SERVERKEYRING')
    expect(result.error.message).toContain('.env.test.local')
    expect(JSON.stringify(result).includes(ring)).toBe(false)
  }
  expect(ssh.upload).not.toHaveBeenCalled()
})
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'hai-fullstack-deploy-'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: basename(root) }))
  artifacts = join(root, '.hai/build/docker/release-1')
  mkdirSync(artifacts, { recursive: true })
  mkdirSync(join(root, 'config'))
  writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: \'9.0\'\nimporters:\n  .: {}\n')
  writeFileSync(join(root, '.env.test'), 'HAI_ADMIN_DEFAULT_PASSWORD=test-private-password\n')
  writeFileSync(join(root, 'config/_serv.yml'), 'http:\n  apiPrefix: /custom-api/v2\ncors:\n  origin: "*"\n')
  writeFileSync(join(root, '.hai/build/docker/latest'), 'release-1\n')
  writeArtifact()
  ssh.ping.mockResolvedValue({ success: true, data: undefined })
  ssh.upload.mockResolvedValue({ success: true, data: undefined })
  ssh.exec.mockResolvedValue({ success: true, data: { code: 0, stdout: '', stderr: '', stdoutTruncated: false, stderrTruncated: false } })
  vi.stubGlobal('fetch', vi.fn(async () => new Response('ok')))
})
afterEach(async () => {
  await deploy.close()
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  rmSync(root, { recursive: true, force: true })
})

/** 模拟已经完成的构建产物，不提供任何源码或构建工具。 */
function writeArtifact(web = true, appVersion = '1.2.3'): void {
  const images = (web ? ['serv', 'web'] : ['serv']).map((name) => {
    const file = `${name}-${appVersion}.tar`
    writeFileSync(join(artifacts, file), `prebuilt-${name}`)
    return { name, file, imageRef: `localhost/example-${name}:release-1`, sha256: createHash('sha256').update(`prebuilt-${name}`).digest('hex'), containerPort: name === 'web' ? 8080 : 3000 }
  })
  writeFileSync(join(artifacts, 'manifest.json'), JSON.stringify({ version: 4, primaryService: 'serv', hasWeb: web, appVersion, buildId: 'release-1', images }))
}

it('独立 Web 直接公开主容器，保留运行环境且不生成 API 代理', async () => {
  writeArtifact(true)
  const file = join(artifacts, 'manifest.json')
  const manifest = JSON.parse(readFileSync(file, 'utf8'))
  writeFileSync(file, JSON.stringify({ ...manifest, primaryService: 'web', images: manifest.images.filter((image: { name: string }) => image.name === 'web') }))
  await initialize(false)
  const result = await deploy.deployApp(root, { environment: 'test', bundleOnly: true })
  expect(result.success).toBe(true)
  const directory = deliveryDirectory(result)
  const compose = JSON.parse(readBundleFile(directory, 'compose.json'))
  expect(Object.keys(compose.services)).toEqual(['web'])
  expect(compose.services.web.container_name).toBe(`hai-${basename(root).toLowerCase()}-test-web`)
  expect(compose.services.web.ports).toEqual(['18080:8080'])
  expect(compose.services.web.env_file).toEqual(expect.arrayContaining([expect.stringMatching(/\/\.env.runtime$/)]))
  expect(readBundleFile(directory, 'layout')).toContain(':false:web:')
  const listing = execFileSync('tar', ['-tf', result.success ? result.data.bundlePath! : ''], { encoding: 'utf8' })
  expect(listing).not.toContain('web.conf')
  expect(listing).not.toContain('proxy-entry.json')
})
async function initialize(online = true, containerPort = 3000): Promise<void> {
  expect(await deploy.init({ provider: { type: 'docker-ssh', ...(online ? { ssh: { host: '127.0.0.1', username: 'deploy' } } : {}), remote: { runtime: 'docker' }, expose: { hostPort: 18080, containerPort } } })).toMatchObject({ success: true })
}

it.each([
  { name: 'hai-delivery', expected: 'hai-delivery', online: true },
  { name: '@example/hai-delivery', expected: 'hai-delivery', online: false },
])('fullstack 使用工程名称统一交付包、远端、容器、卷与基线 ($expected)', async ({ name, expected, online }) => {
  const service = join(root, 'packages/hai-delivery-serv')
  mkdirSync(join(service, 'config'), { recursive: true })
  writeFileSync(join(service, 'config/_serv.yml'), 'http:\n  apiPrefix: /api/v1\n')
  writeFileSync(join(service, 'config/_db.yml'), 'type: postgresql\n')
  writeFileSync(join(service, 'package.json'), JSON.stringify({ name: 'hai-delivery-serv' }))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name }))
  writeFileSync(join(root, 'hai.json'), '{"build":{"images":[{"name":"serv"},{"name":"web"}]}}')
  writeFileSync(join(root, 'pnpm-lock.yaml'), JSON.stringify({ lockfileVersion: '9.0', importers: { '.': {}, 'packages/hai-delivery-serv': { dependencies: { '@h-ai/reldb': { version: '1' } } } }, packages: { '@h-ai/reldb@1': {} }, snapshots: { '@h-ai/reldb@1': {} } }))
  await initialize(online)
  const scanned = await deploy.scan(service, { environment: 'test' })
  expect(scanned).toMatchObject({ success: true, data: { appName: name, appDir: service, requiredServices: ['db'] } })
  const result = await deploy.deployApp(service, { environment: 'test', bundleOnly: !online })
  const directory = deliveryDirectory(result)
  const target = JSON.parse(readFileSync(join(directory, 'deploy-target.json'), 'utf8'))
  expect(target.directory).toBe(`/opt/hai/apps/${expected}-test`)
  if (online) {
    expect(ssh.upload).toHaveBeenCalledWith(join(directory, target.bundle), `${target.directory}/incoming/${target.bundle}`)
    expect(ssh.exec.mock.calls.some(([command]) => String(command).includes(`'${target.directory}'`))).toBe(true)
  }
  expect(target.bundle).toMatch(new RegExp(`^bundle-${expected}-test-.*-1\\.2\\.3\\.tar$`))
  expect(basename(directory)).toBe(target.bundle.slice(0, -4))
  expect(dirname(directory)).toBe(join(root, '.hai/deploy/test'))
  const compose = parse(readBundleFile(directory, 'compose.json'))
  for (const part of ['serv', 'web', 'db'])
    expect(compose.services[part].container_name).toBe(`hai-${expected}-test-${part}`)
  expect(compose.volumes).toHaveProperty(`${expected}-test-db-data`)
  const secretFile = join(service, '.hai/deploy/runtime', `${expected}-test.secrets.json`)
  expect(existsSync(secretFile)).toBe(false)
  const candidates = parseEnv(readBundleFile(directory, 'managed-candidates.env'))
  expect(candidates.DB_PASSWORD).toMatch(/^[\w-]{32}$/)
  expect(readBundleFile(directory, 'managed-volumes')).toContain(`DB_PASSWORD hai-${expected}-test_${expected}-test-db-data`)
  const unpacked = join(root, 'identity-proof')
  mkdirSync(unpacked)
  execFileSync('tar', ['-xf', join(directory, target.bundle), '-C', unpacked])
  const script = readFileSync(join(unpacked, 'apply.sh'), 'utf8')
  expect(script).toContain(`project='hai-${expected}-test'`)
  expect(script).toContain(`/opt/hai/apps/${expected}-test`)
  const updated = await deploy.deployApp(service, { environment: 'test', bundleOnly: true, selectedServices: ['web'] })
  const updatedTarget = JSON.parse(readFileSync(join(deliveryDirectory(updated), 'deploy-target.json'), 'utf8'))
  expect(updatedTarget.directory).toBe(target.directory)
  expect(existsSync(secretFile)).toBe(false)
  expect(parseEnv(readBundleFile(deliveryDirectory(updated), 'managed-candidates.env')).DB_PASSWORD === candidates.DB_PASSWORD).toBe(false)
})

it('中间件原生变量与应用、持久配置和离线服务环境隔离', async () => {
  writeFileSync(join(root, 'pnpm-lock.yaml'), JSON.stringify({ lockfileVersion: '9.0', importers: { '.': { dependencies: { '@h-ai/reldb': { version: '1' }, '@h-ai/storage': { version: '1' } } } }, packages: { '@h-ai/reldb@1': {}, '@h-ai/storage@1': {} }, snapshots: { '@h-ai/reldb@1': {}, '@h-ai/storage@1': {} } }))
  writeFileSync(join(root, 'config/_db.yml'), 'type: postgresql\nhost: db\nport: 5432\ndatabase: hai\n')
  writeFileSync(join(root, 'config/_storage.yml'), 'type: s3\nbucket: hai\n')
  await initialize(false)
  const result = await deploy.deployApp(root, { environment: 'test', bundleOnly: true })
  const directory = deliveryDirectory(result)
  const application = parseEnv(readBundleFile(directory, '.env.runtime'))
  expect(application).not.toHaveProperty('POSTGRES_USER')
  expect(application).not.toHaveProperty('RUSTFS_ADDRESS')
  expect(application.HAI_DB).toBeTruthy()
  expect(application.HAI_STORAGE).toBeTruthy()
  const native = parseEnv(readBundleFile(directory, 'middleware-runtime.env'))
  expect(native).toMatchObject({ POSTGRES_USER: 'hai', POSTGRES_DB: 'hai', RUSTFS_ADDRESS: '0.0.0.0:9000', RUSTFS_VOLUMES: '/data', RUSTFS_CONSOLE_ENABLE: 'false' })
  expect(native.POSTGRES_PASSWORD).toBeTruthy()
  expect(native.RUSTFS_SECRET_KEY).toBeTruthy()
  expect(Object.keys(native).some(name => name.startsWith('HAI_'))).toBe(false)
  for (const file of ['.env.test', '.env.test.local']) {
    const saved = parseEnv(readFileSync(join(root, file), 'utf8'))
    expect(saved).not.toHaveProperty('POSTGRES_USER')
    expect(saved).not.toHaveProperty('RUSTFS_ADDRESS')
  }
  if (!result.success || !result.data.bundlePath)
    throw new Error('Expected a deployment bundle')
  const unpacked = join(root, 'middleware-env-proof')
  mkdirSync(unpacked)
  execFileSync('tar', ['-xf', result.data.bundlePath, '-C', unpacked])
  expect(parseEnv(readFileSync(join(unpacked, 'middleware-runtime.env'), 'utf8'))).toEqual(native)
  const bundled = JSON.parse(readFileSync(join(unpacked, 'compose.json'), 'utf8'))
  expect(bundled.services.serv.env_file.map((file: string) => file.split('/').at(-1))).toEqual(['.env.runtime', 'middleware.env'])
  for (const service of ['db', 'storage'])
    expect(bundled.services[service].env_file.map((file: string) => file.split('/').at(-1))).toEqual(['middleware-runtime.env'])
  const inherited = parseEnv(readFileSync(join(unpacked, 'middleware.env'), 'utf8'))
  expect(Object.keys(inherited).every(name => name.startsWith('HAI_'))).toBe(true)
})

it('custom SSH 密码变量不进入应用环境或离线归档', async () => {
  writeFileSync(join(root, 'hai.json'), JSON.stringify({ deploy: { provider: { type: 'docker-ssh', ssh: { host: '127.0.0.1', username: 'deploy', auth: 'password', password: `\${CUSTOM_CONNECTION_VALUE}` } } } }))
  writeFileSync(join(root, '.env.test'), 'CUSTOM_CONNECTION_VALUE=0012\nAPP_LABEL=0012\n')
  expect(await deploy.init({ provider: { type: 'docker-ssh', ssh: { host: '127.0.0.1', username: 'deploy', auth: 'password', password: '0012' }, expose: { hostPort: 18080 } } })).toMatchObject({ success: true })
  const result = await deploy.deployApp(root, { environment: 'test', bundleOnly: true })
  expect(result, JSON.stringify(result)).toMatchObject({ success: true })
  const directory = deliveryDirectory(result)
  const environment = parseEnv(readBundleFile(directory, '.env.runtime'))
  expect(environment.CUSTOM_CONNECTION_VALUE).toBeUndefined()
  expect(environment.APP_LABEL).toBe('0012')
  const unpacked = join(root, 'password-reference-proof')
  mkdirSync(unpacked)
  if (!result.success || !result.data.bundlePath)
    throw new Error('Expected a deployment bundle')
  execFileSync('tar', ['-xf', result.data.bundlePath, '-C', unpacked])
  expect(parseEnv(readFileSync(join(unpacked, '.env.runtime'), 'utf8')).CUSTOM_CONNECTION_VALUE).toBeUndefined()
})

it.each(['HAI_DEPLOY', 'HAI_DEPLOY_PROVIDER'])('父对象覆盖 %s 不进入应用环境或离线归档', async (variable) => {
  const provider = { type: 'docker-ssh', ssh: { host: '127.0.0.1', username: 'deploy', auth: 'password', password: 'private-parent-password' }, expose: { hostPort: 18080 } }
  writeFileSync(join(root, '.env.test.local'), `${variable}='${JSON.stringify(variable === 'HAI_DEPLOY' ? { provider } : provider)}'\n`)
  await initialize(false)
  const result = await deploy.deployApp(root, { environment: 'test', bundleOnly: true })
  const directory = deliveryDirectory(result)
  const content = readBundleFile(directory, '.env.runtime')
  expect(content).not.toContain('private-parent-password')
  expect(parseEnv(content)[variable]).toBeUndefined()
  const unpacked = join(root, 'parent-password-proof')
  mkdirSync(unpacked)
  if (!result.success || !result.data.bundlePath)
    throw new Error('Expected a deployment bundle')
  execFileSync('tar', ['-xf', result.data.bundlePath, '-C', unpacked])
  expect(readFileSync(join(unpacked, '.env.runtime'), 'utf8')).not.toContain('private-parent-password')
})

/** 从成功结果定位本次独立交付目录，避免读取上一次部署文件。 */
function deliveryDirectory(result: Awaited<ReturnType<typeof deploy.deployApp>>): string {
  expect(result.success).toBe(true)
  if (!result.success || !result.data.bundlePath)
    throw new Error('Expected a deployment bundle')
  return dirname(result.data.bundlePath)
}

/** 直接读取交付 tar 中实际部署的配置，外层目录不再暴露副本。 */
function readBundleFile(directory: string, file: string): string {
  const archive = readdirSync(directory).find(name => name.endsWith('.tar'))
  if (!archive)
    throw new Error('Expected deployment archive')
  return execFileSync('tar', ['-xOf', join(directory, archive), `./${file}`], { encoding: 'utf8' })
}

it.each([false, true])('完整与增量模式 %s 从正式配置生成一致密文预算并携带代理更新产物', async (partial) => {
  writeFileSync(join(root, 'config/_serv.yml'), `http:\n  apiPrefix: /custom-api/v2\ntransport:\n  maxPlaintextBytes: \${HAI_SERV_TRANSPORT_MAXPLAINTEXTBYTES:1048576}\n`)
  writeFileSync(join(root, '.env.test'), 'HAI_SERV_TRANSPORT_MAXPLAINTEXTBYTES=8388608\n')
  await initialize(false)
  const result = await deploy.deployApp(root, { environment: 'test', bundleOnly: true, selectedServices: partial ? ['serv'] : undefined })
  if (!result.success || !result.data.bundlePath)
    throw new Error('Expected a deployment bundle')
  const directory = dirname(result.data.bundlePath)
  expect(readBundleFile(directory, 'web.conf')).toContain('client_max_body_size 16809984;')
  expect(parseEnv(readBundleFile(directory, '.env.runtime')).HAI_SERV).toContain('"maxPlaintextBytes":8388608')
  const proof = join(directory, 'capacity-proof')
  mkdirSync(proof)
  execFileSync('tar', ['-xf', result.data.bundlePath, '-C', proof])
  const proxy = readFileSync(join(proof, 'web.conf'), 'utf8')
  expect(proxy).toContain('client_max_body_size 16809984;')
  const overlay = JSON.parse(readFileSync(join(proof, 'proxy-entry.json'), 'utf8'))
  expect(overlay.services.web.volumes[0]).toContain('/web.conf:/etc/nginx/conf.d/default.conf:ro')
})

it('部署阶段拒绝非法传输容量而不生成阈值不一致的代理', async () => {
  writeFileSync(join(root, 'config/_serv.yml'), 'transport:\n  maxPlaintextBytes: 0\n')
  await initialize(false)
  const result = await deploy.deployApp(root, { environment: 'test', bundleOnly: true })
  expect(result).toMatchObject({ success: false, error: { code: HaiDeployError.CONFIG_ERROR.code } })
})

it('svelteKit 部署从同一 _kit 配置推导 adapter-node 正文预算', async () => {
  writeArtifact(false)
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'capacity-adapter', version: '1.2.3', dependencies: { '@sveltejs/kit': '^2' } }))
  writeFileSync(join(root, 'pnpm-lock.yaml'), JSON.stringify({ lockfileVersion: '9.0', importers: { '.': { dependencies: { '@sveltejs/kit': { version: '2.0.0' } } } }, packages: { '@sveltejs/kit@2.0.0': {} }, snapshots: { '@sveltejs/kit@2.0.0': {} } }))
  writeFileSync(join(root, 'config/_kit.yml'), `transport:\n  maxPlaintextBytes: \${HAI_KIT_TRANSPORT_MAXPLAINTEXTBYTES:1048576}\n`)
  writeFileSync(join(root, '.env.test'), 'HAI_KIT_TRANSPORT_MAXPLAINTEXTBYTES=8388608\n')
  await initialize(false)
  const result = await deploy.deployApp(root, { environment: 'test', bundleOnly: true })
  if (!result.success || !result.data.bundlePath)
    throw new Error('Expected a SvelteKit deployment bundle')
  expect(parseEnv(readBundleFile(dirname(result.data.bundlePath), '.env.runtime')).BODY_SIZE_LIMIT).toBe('16809984')
})

it('存储初始化是内部任务，不能作为独立部署服务', async () => {
  writeFileSync(join(root, 'pnpm-lock.yaml'), JSON.stringify({ lockfileVersion: '9.0', importers: { '.': { dependencies: { '@h-ai/storage': { version: '1' } } } }, packages: { '@h-ai/storage@1': {} }, snapshots: { '@h-ai/storage@1': {} } }))
  writeFileSync(join(root, 'config/_storage.yml'), 'type: s3\nbucket: test-bucket\n')
  await initialize(false)
  expect(await deploy.deployApp(root, { environment: 'test', bundleOnly: true, selectedServices: ['storage-init'] })).toMatchObject({ success: false, error: { code: HaiDeployError.CONFIG_ERROR.code, message: expect.stringContaining('storage-init') } })
  expect(ssh.ping).not.toHaveBeenCalled()
})

it('部署只上传一个完整 tar，API/Web 使用已有构建且私有配置仅进入 API', async () => {
  await initialize()
  mkdirSync(join(root, '.hai/deploy/test'), { recursive: true })
  writeFileSync(join(root, '.hai/deploy/test/.env.runtime'), 'REMOVED_SETTING=stale\n')
  const result = await deploy.deployApp(root, { environment: 'test', skipMiddleware: true })
  expect(result).toMatchObject({ success: true, data: { url: 'http://127.0.0.1:18080', healthCheck: 'passed' } })
  expect(ssh.upload).toHaveBeenCalledTimes(1)
  const directory = deliveryDirectory(result)
  const compose = parse(readBundleFile(directory, 'compose.json'))
  expect(compose['x-hai-version']).toBe('1.2.3')
  expect(compose.services.serv.labels['org.opencontainers.image.version']).toBe('1.2.3')
  expect(result.success && result.data.bundlePath).toMatch(/-1\.2\.3\.tar$/)
  expect(compose.services.serv.ports).toBeUndefined()
  expect(compose.services.serv.env_file.map((file: string) => file.split('/').at(-1))).toEqual(['.env.runtime', 'middleware.env'])
  expect(compose.services.serv.image).toBe('localhost/example-serv:release-1')
  expect(compose.services.web).toMatchObject({ image: 'localhost/example-web:release-1', ports: ['18080:8080'], depends_on: ['serv'], pull_policy: 'never' })
  expect(compose.services.web.env_file).toBeUndefined()
  expect(readBundleFile(directory, 'web.conf')).toContain('location /custom-api/v2/')
  expect(readBundleFile(directory, '.env.runtime')).toContain('test-private-password')
  expect(readBundleFile(directory, '.env.runtime')).not.toContain('REMOVED_SETTING')
  expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual(['http://127.0.0.1:18080/health', 'http://127.0.0.1:18080/_hai/web-health', 'http://127.0.0.1:18080/'])
  expect(ssh.exec.mock.calls.some(([command]) => /build|pnpm/.test(String(command)))).toBe(false)
  writeFileSync(join(root, 'config/_serv.yml'), 'http:\n  apiPrefix: /custom-api/v2\ncors:\n  origin: https://app.example.test\n')
  const updated = await deploy.deployApp(root, { environment: 'test', skipMiddleware: true })
  expect(updated).toMatchObject({ success: true })
  expect(JSON.parse(parseEnv(readBundleFile(deliveryDirectory(updated), '.env.runtime')).HAI_SERV!)).toMatchObject({ cors: { origin: 'https://app.example.test' } })
})

it('仅打包不需要 SSH 或本地容器引擎，tar 可搬运且暂存目录自动清理', async () => {
  await initialize(false)
  const result = await deploy.deployApp(root, { environment: 'test', bundleOnly: true, output: join(root, 'release-test.tar') })
  expect(result).toMatchObject({ success: true, data: { status: 'packaged', url: '', healthCheck: 'skipped' } })
  if (!result.success)
    return
  expect(ssh.ping).not.toHaveBeenCalled()
  expect(ssh.exec).not.toHaveBeenCalled()
  expect(ssh.upload).not.toHaveBeenCalled()
  expect(result.data.bundlePath).toBe(join(root, 'release-test-1.2.3', 'release-test-1.2.3.tar'))
  expect(result.data.instructions).toContain(result.data.bundlePath)
  const scripts = dirname(result.data.bundlePath!)
  const target = JSON.parse(readFileSync(join(scripts, 'deploy-target.json'), 'utf8'))
  expect(target).toMatchObject({ host: 'SERVER_HOST', port: 22, username: 'deploy', identityFile: '', knownHostsFile: '', strictHostKeyChecking: true, connectTimeoutSeconds: 10, bundle: 'release-test-1.2.3.tar' })
  expect(Object.keys(target._comments).sort()).toEqual(Object.keys(target).filter(key => key !== '_comments').sort())
  expect(Object.values(target._comments).every(description => typeof description === 'string' && description.length > 0)).toBe(true)
  expect(existsSync(join(scripts, 'read-target.awk'))).toBe(true)
  const files = execFileSync('tar', ['-tf', result.data.bundlePath!], { encoding: 'utf8' })
  for (const file of ['compose.json', 'manifest.json', '.env.runtime', 'images/serv-1.2.3.tar', 'images/web-1.2.3.tar', 'web.conf', 'SHA256SUMS', 'README.txt', 'apply.sh'])
    expect(files).toContain(file)
  expect(result.data.instructions).toContain('deploy-local.sh')
  const extracted = join(root, 'extracted')
  mkdirSync(extracted)
  execFileSync('tar', ['-xf', result.data.bundlePath!, '-C', extracted])
  const script = readFileSync(join(extracted, 'apply.sh'), 'utf8')
  expect(script).toContain('HAI_DEPLOY_ENVIRONMENT=\'test\'')
  expect(script).toContain('sha256sum -c SHA256SUMS')
  expect(script).toContain('image inspect')
  expect(script).toContain('compose-files')
  expect(readFileSync(join(extracted, 'README.txt'), 'utf8')).toContain('1.2.3')
  expect(JSON.parse(readFileSync(join(extracted, 'manifest.json'), 'utf8')).appVersion).toBe('1.2.3')
  expect(script).not.toContain(' build ')
  expect(existsSync(`${result.data.bundlePath}.partial`)).toBe(false)
  expect(readdirSync(scripts).some(file => file.startsWith('.bundle-'))).toBe(false)
})

it('制品缺失或校验失败不连接服务器，不尝试重新构建', async () => {
  await initialize()
  writeFileSync(join(artifacts, 'web-1.2.3.tar'), 'corrupt')
  expect(await deploy.deployApp(root, { environment: 'test' })).toMatchObject({ success: false, error: { code: HaiDeployError.CONFIG_ERROR.code } })
  expect(ssh.ping).not.toHaveBeenCalled()
  expect(ssh.upload).not.toHaveBeenCalled()
})

it('前端增量包只携带 Web，生成可执行脚本且不改写服务器成功状态', async () => {
  await initialize(false)
  writeFileSync(join(root, 'pnpm-lock.yaml'), JSON.stringify({ lockfileVersion: '9.0', importers: { '.': { dependencies: { '@h-ai/cache': { version: '1' } } } }, packages: { '@h-ai/cache@1': {} }, snapshots: { '@h-ai/cache@1': {} } }))
  writeFileSync(join(root, 'config/_cache.yml'), 'type: redis\n')
  const manifestPath = join(artifacts, 'manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.images = manifest.images.filter((image: { name: string }) => image.name === 'web')
  writeFileSync(manifestPath, JSON.stringify({ ...manifest, partial: true, hasWeb: true }))
  const result = await deploy.deployApp(root, { environment: 'test', bundleOnly: true })
  expect(result.success).toBe(true)
  if (!result.success)
    return
  const files = execFileSync('tar', ['-tf', result.data.bundlePath!], { encoding: 'utf8' })
  expect(files).toContain('images/web-1.2.3.tar')
  expect(files).not.toContain('images/serv-1.2.3.tar')
  expect(files).not.toMatch(/images\/middleware-[^\r\n]*\.tar/)
  expect(existsSync(join(root, '.hai/deploy/runtime'))).toBe(false)
  expect(files).toContain('compose.json')
  const scripts = dirname(result.data.bundlePath!)
  expect(existsSync(join(scripts, 'deploy.ps1'))).toBe(true)
  expect(existsSync(join(scripts, 'deploy.sh'))).toBe(true)
  expect(ssh.ping).not.toHaveBeenCalled()
})

it.each([
  { selected: 'web', servContainerPort: 4100, webContainerPort: 8181 },
  { selected: 'serv', servContainerPort: 4100, webContainerPort: 8181 },
  { selected: 'web', servContainerPort: undefined, webContainerPort: undefined },
])('部分交付保持完整布局端口；未显式指定时使用部署默认值（$selected/$servContainerPort/$webContainerPort）', async ({ selected, servContainerPort, webContainerPort }) => {
  await initialize(false, 4300)
  const manifestPath = join(artifacts, 'manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.hasWeb = true
  manifest.servContainerPort = servContainerPort
  manifest.webContainerPort = webContainerPort
  manifest.images = manifest.images.map((image: { name: string }) => ({ ...image, containerPort: image.name === 'serv' ? servContainerPort : webContainerPort }))
  writeFileSync(manifestPath, JSON.stringify(manifest))
  const full = await deploy.deployApp(root, { environment: 'test', bundleOnly: true })
  expect(full.success).toBe(true)
  if (!full.success)
    return
  const layout = execFileSync('tar', ['-xOf', full.data.bundlePath!, './layout'], { encoding: 'utf8' })
  manifest.images = manifest.images.filter((image: { name: string }) => image.name === selected)
  writeFileSync(manifestPath, JSON.stringify({ ...manifest, partial: true }))
  const partial = await deploy.deployApp(root, { environment: 'test', bundleOnly: true })
  expect(partial.success).toBe(true)
  if (!partial.success)
    return
  expect(execFileSync('tar', ['-xOf', partial.data.bundlePath!, './layout'], { encoding: 'utf8' })).toBe(layout)
  const directory = deliveryDirectory(partial)
  const proxy = readBundleFile(directory, 'web.conf')
  expect(proxy).toContain(`proxy_pass http://serv:${servContainerPort ?? 4300};`)
  expect(proxy).toContain(`listen ${webContainerPort ?? 8080};`)
  const compose = parse(readBundleFile(deliveryDirectory(full), 'compose.json'))
  expect(compose.services.web.ports).toEqual([`18080:${webContainerPort ?? 8080}`])
  expect(Object.keys(parse(readBundleFile(directory, 'compose.json')).services)).toEqual([selected])
  expect(parseEnv(readBundleFile(directory, '.env.runtime')).PORT).toBe(String(servContainerPort ?? 4300))
})

it('完整离线包自动携带自建数据库镜像，不依赖目标服务器拉取', async () => {
  writeArtifact(false)
  writeFileSync(join(root, 'pnpm-lock.yaml'), JSON.stringify({ lockfileVersion: '9.0', importers: { '.': { dependencies: { '@h-ai/reldb': { version: '1' } } } }, packages: { '@h-ai/reldb@1': {} }, snapshots: { '@h-ai/reldb@1': {} } }))
  writeFileSync(join(root, 'config/_db.yml'), 'type: postgresql\n')
  await initialize(false)
  const result = await deploy.deployApp(root, { environment: 'test', bundleOnly: true })
  expect(result.success).toBe(true)
  if (!result.success)
    return
  const files = execFileSync('tar', ['-tf', result.data.bundlePath!], { encoding: 'utf8' })
  expect(files).toContain('images/middleware-2.tar')
  expect(files).toContain('compose.json')
})

it('跳过中间件配置时，完整包仍携带已保存的自建 Redis', async () => {
  writeArtifact(false)
  writeFileSync(join(root, 'pnpm-lock.yaml'), JSON.stringify({ lockfileVersion: '9.0', importers: { '.': { dependencies: { '@h-ai/cache': { version: '1' } } } }, packages: { '@h-ai/cache@1': {} }, snapshots: { '@h-ai/cache@1': {} } }))
  writeFileSync(join(root, 'config/_cache.yml'), 'type: redis\nurl: redis://cache:6379\n')
  await initialize(false)
  const result = await deploy.deployApp(root, { environment: 'test', bundleOnly: true, skipMiddleware: true })
  expect(result.success).toBe(true)
  if (!result.success)
    return
  const extracted = join(root, 'offline-cache')
  mkdirSync(extracted)
  execFileSync('tar', ['-xf', result.data.bundlePath!, '-C', extracted])
  const compose = JSON.parse(readFileSync(join(extracted, 'compose.json'), 'utf8'))
  expect(compose.services.cache.image).toMatch(/^docker.io\/library\/redis:/)
  expect(readFileSync(join(extracted, 'image-list'), 'utf8')).toContain('redis:')
  expect(existsSync(join(extracted, 'images/middleware-2.tar'))).toBe(true)
})

// Git Bash 不提供 Linux flock；Windows 在 deploy-lock.e2e.test.ts 的真实 Linux 容器门禁执行此流程。
it.skipIf(process.platform === 'win32')('实际执行交付脚本：拒绝首次增量，支持同版本更新，健康失败不推进成功状态', async () => {
  writeArtifact(false)
  await initialize(false)
  const destination = join(root, 'server').replaceAll('\\', '/')
  const bin = join(root, 'bin')
  mkdirSync(bin)
  const engine = `#!/bin/sh
printf '%s\\n' "$*" >> "$HAI_TEST_COMMANDS"
case "$*" in
  *'up --help'*) printf 'never\\n';;
  *'config --services'*) printf 'serv\\n';;
  *'image inspect --format'*) printf 'amd64\\n';;
  *'{{.Image}} {{.Config.Image}}'*) printf 'previous-image localhost/example-serv:release-1\\n';;
  *'inspect --format'*) printf 'true\\n';;
  *'ps -aq'*) printf 'previous-container\\n';;
  *'ps -q'*) printf 'running-container\\n';;
esac
`
  writeFileSync(join(bin, 'docker'), engine, { mode: 0o700 })
  writeFileSync(join(bin, 'curl'), '#!/bin/sh\nif [ "$HAI_TEST_HTTP_FAIL" = 1 ]; then exit 22; fi\n', { mode: 0o700 })
  writeFileSync(join(bin, 'sleep'), '#!/bin/sh\nexit 0\n', { mode: 0o700 })
  const commands = join(root, 'commands.txt')
  const env = { ...process.env, PATH: `${bin}${process.platform === 'win32' ? ';C:/Program Files/Git/usr/bin;' : ':'}${process.env.PATH}`, HAI_TEST_COMMANDS: commands.replaceAll('\\', '/'), HAI_TEST_HTTP_FAIL: '0' }
  const shell = process.platform === 'win32' ? 'C:/Program Files/Git/usr/bin/bash.exe' : '/bin/sh'
  const pack = async (selectedServices?: string[]) => {
    const result = await deploy.deployApp(root, { environment: 'test', bundleOnly: true, selectedServices })
    expect(result.success).toBe(true)
    if (!result.success)
      throw new Error(result.error.message)
    const extracted = join(root, result.data.deploymentId)
    mkdirSync(extracted)
    execFileSync('tar', ['-xf', result.data.bundlePath!, '-C', extracted])
    return { id: result.data.deploymentId, script: join(extracted, 'apply.sh').replaceAll('\\', '/') }
  }
  const firstPartial = await pack(['serv'])
  expect(() => execFileSync(shell, [firstPartial.script, destination], { env, stdio: 'pipe' })).toThrow()
  expect(existsSync(join(destination, 'current'))).toBe(false)
  const full = await pack()
  execFileSync(shell, [full.script, destination], { env, stdio: 'pipe' })
  expect(readFileSync(join(destination, 'current'), 'utf8').trim()).toBe(full.id)
  const partial = await pack(['serv'])
  execFileSync(shell, [partial.script, destination], { env, stdio: 'pipe' })
  expect(readFileSync(join(destination, 'current'), 'utf8').trim()).toBe(partial.id)
  const failed = await pack(['serv'])
  expect(() => execFileSync(shell, [failed.script, destination], { env: { ...env, HAI_TEST_HTTP_FAIL: '1' }, stdio: 'pipe' })).toThrow()
  expect(readFileSync(join(destination, 'current'), 'utf8').trim()).toBe(partial.id)
  expect(JSON.parse(readFileSync(join(destination, `result-${failed.id}.json`), 'utf8'))).toMatchObject({ stage: 'health', exitCode: 1 })
  expect(existsSync(join(destination, `diagnostics-${failed.id}.log`))).toBe(true)
  const calls = readFileSync(commands, 'utf8')
  expect(calls).not.toMatch(/\bdown\b|\bpull\s+(?!never)/)
  expect(calls).toContain('--no-deps --no-build --pull never --force-recreate --remove-orphans serv')
  expect(calls).toContain('rm -f previous-container')
  expect(calls).toContain('--no-deps --no-build --pull never --no-recreate serv')
  expect(calls).toContain('tag previous-image localhost/example-serv:release-1')
  expect(calls).toContain('logs --tail 80 previous-container')
}, 30_000)

it('服务包的环境目录独立时，API workspace 默认消费工程根的构建产物', async () => {
  writeArtifact(false)
  const service = join(root, 'apps/service')
  mkdirSync(service, { recursive: true })
  writeFileSync(join(service, '.env.test'), 'HAI_CORE_ENV=test\n')
  writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: \'9.0\'\nimporters:\n  .: {}\n  apps/service: {}\n')
  await initialize(false)
  const initial = await deploy.deployApp(service, { environment: 'test', bundleOnly: true })
  expect(initial).toMatchObject({ success: true, data: { status: 'packaged' } })
  expect(readBundleFile(deliveryDirectory(initial), 'compose.json')).toContain('localhost/example-serv:release-1')
  expect(existsSync(join(service, '.hai/deploy'))).toBe(false)
  const packaged = await deploy.deployApp(service, { environment: 'test', bundleOnly: true })
  expect(packaged.success).toBe(true)
  if (packaged.success) {
    expect(packaged.data.bundlePath).toContain(join(root, '.hai/deploy/test'))
    expect(existsSync(join(deliveryDirectory(packaged), 'deploy.sh'))).toBe(true)
  }
})
it('完整 tar 上传失败不启动半份部署', async () => {
  await initialize()
  ssh.upload.mockResolvedValue({ success: false, error: { ...HaiDeployError.IMAGE_TRANSFER_FAILED, message: 'transfer failed' } })
  expect(await deploy.deployApp(root, { environment: 'test' })).toMatchObject({ success: false, error: { code: HaiDeployError.IMAGE_TRANSFER_FAILED.code } })
  expect(ssh.exec.mock.calls.some(([command]) => String(command).includes('start-test.sh'))).toBe(false)
})

it.each(['missing', 'mismatch', 'truncated', 'finished-failure', 'finished-success'])('ssh 失败只读核对匹配终态结果，保留准确执行状态且不重跑 (%s)', async (mode) => {
  await initialize()
  let applyCalls = 0
  ssh.exec.mockImplementation(async (command: string) => {
    const data = { code: 0, stdout: '', stderr: '', stdoutTruncated: false, stderrTruncated: false }
    if (command.includes('apply.sh')) {
      applyCalls++
      return { success: false, error: { ...HaiDeployError.REMOTE_COMMAND_FAILED, message: 'SSH disconnected', ext: { commandExecution: { reason: 'timeout', localTermination: 'confirmed', remoteExecution: 'unknown' } } } }
    }
    if (command.includes('result-')) {
      const id = /result-([a-z0-9-]+)\.json/.exec(command)?.[1]
      data.stdout = mode === 'missing' ? '' : JSON.stringify({ deploymentId: mode === 'mismatch' ? 'older-deployment' : id, stage: 'health', exitCode: mode === 'finished-success' ? 0 : 1, durationSeconds: 1 })
      data.stdoutTruncated = mode === 'truncated'
    }
    return { success: true, data }
  })
  const result = await deploy.deployApp(root, { environment: 'test', skipMiddleware: true })
  expect(result.success).toBe(false)
  if (result.success)
    throw new Error('Connection failure must remain visible')
  const state = getDeployCommandState(result.error)
  expect(state).toMatchObject({ reason: 'timeout', localTermination: 'confirmed', remoteExecution: mode.startsWith('finished') ? 'finished' : 'unknown' })
  expect(state?.resultFile).toContain(`result-${state?.deploymentId}.json`)
  if (mode.startsWith('finished'))
    expect(state?.remoteExitCode).toBe(mode === 'finished-success' ? 0 : 1)
  expect(applyCalls).toBe(1)
})
it('aPI 正常但 Web 不健康时不会报告部署成功', async () => {
  await initialize()
  vi.useFakeTimers()
  vi.mocked(fetch).mockImplementation(async input => new Response('health', { status: String(input).endsWith('/_hai/web-health') ? 503 : 200 }))
  const pending = deploy.deployApp(root, { environment: 'test' })
  await vi.waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled(), { timeout: 5000 })
  await vi.runAllTimersAsync()
  expect(await pending).toMatchObject({ success: false, error: { code: HaiDeployError.HEALTH_CHECK_FAILED.code } })
})
it('单服务制品仅部署 API；未提供 SSH 时提示仅打包选项', async () => {
  writeArtifact(false)
  await initialize()
  const result = await deploy.deployApp(root, { environment: 'test' })
  expect(result).toMatchObject({ success: true })
  const compose = parse(readBundleFile(deliveryDirectory(result), 'compose.json'))
  expect(compose.services.serv.ports).toEqual(['18080:3000'])
  expect(compose.services.web).toBeUndefined()
  await initialize(false)
  expect(await deploy.deployApp(root, { environment: 'test' })).toMatchObject({ success: false, error: { code: HaiDeployError.CONFIG_ERROR.code } })
})
it('非法 API 前缀不会写入代理配置或上传', async () => {
  await initialize()
  writeFileSync(join(root, 'config/_serv.yml'), 'http:\n  apiPrefix: "/api; injection"\n')
  expect(await deploy.deployApp(root, { environment: 'test' })).toMatchObject({ success: false, error: { code: HaiDeployError.CONFIG_ERROR.code } })
  expect(ssh.upload).not.toHaveBeenCalled()
})

it('完整离线包包含中间件归档，打包不会创建服务器成功状态', async () => {
  writeArtifact(false)
  writeFileSync(join(root, 'pnpm-lock.yaml'), JSON.stringify({ lockfileVersion: '9.0', importers: { '.': { dependencies: { '@h-ai/reldb': { version: '1' } } } }, packages: { '@h-ai/reldb@1': {} }, snapshots: { '@h-ai/reldb@1': {} } }))
  writeFileSync(join(root, 'config/_db.yml'), 'type: mysql\n')
  await initialize(false)
  const first = await deploy.deployApp(root, { environment: 'test', bundleOnly: true })
  expect(first).toMatchObject({ success: true })
  const directory = deliveryDirectory(first)
  const previous = parse(readBundleFile(directory, 'compose.json'))
  expect(previous.services.db.image).toContain('mysql:8.4')
  writeArtifact(false, '1.2.4')
  const output = join(root, 'release-1.2.4.tar')
  const updated = await deploy.deployApp(root, { environment: 'test', bundleOnly: true, skipMiddleware: true, output })
  const archive = join(root, 'release-1.2.4', 'release-1.2.4.tar')
  expect(updated).toMatchObject({ success: true, data: { bundlePath: archive } })
  const next = parse(readBundleFile(deliveryDirectory(updated), 'compose.json'))
  expect(next['x-hai-version']).toBe('1.2.4')
  expect(existsSync(join(directory, 'latest'))).toBe(false)
  const packed = execFileSync('tar', ['-tf', archive], { encoding: 'utf8' })
  expect(packed).toContain('apply.sh')
  expect(previous.volumes).toBeDefined()
})

it('缺少应用版本、路径伪装或镜像 tar 版本不一致的清单被拒绝', () => {
  const artifact = JSON.parse(readFileSync(join(artifacts, 'manifest.json'), 'utf8'))
  expect(DeploymentArtifactSchema.safeParse(artifact).success).toBe(true)
  for (const appVersion of [undefined, '../outside', '1.2.4'])
    expect(DeploymentArtifactSchema.safeParse({ ...artifact, appVersion }).success).toBe(false)
  expect(DeploymentArtifactSchema.safeParse({ ...artifact, version: 1 }).success).toBe(false)
  for (const name of ['servContainerPort', 'webContainerPort']) {
    for (const port of [0, 65536, 1.5, '3000'])
      expect(DeploymentArtifactSchema.safeParse({ ...artifact, [name]: port }).success).toBe(false)
  }
})

it('每次部署的归档、配置和入口均位于唯一交付目录中', async () => {
  await initialize(false)
  const result = await deploy.deployApp(root, { environment: 'test', bundleOnly: true })
  expect(result.success).toBe(true)
  if (!result.success)
    return
  const parent = join(root, '.hai/deploy/test')
  const entries = readdirSync(parent)
  expect(entries).toHaveLength(1)
  const directory = join(parent, entries[0]!)
  expect(result.data.bundlePath).toBe(join(directory, `${entries[0]}.tar`))
  expect(readdirSync(directory).sort()).toEqual([basename(result.data.bundlePath!), 'deploy.sh', 'deploy.ps1', 'deploy-target.json', 'deploy-local.sh', 'read-target.awk', 'README.txt'].sort())
  const saved = execFileSync('tar', ['-xOf', result.data.bundlePath!, './manifest.json'], { encoding: 'utf8' })
  expect(JSON.parse(saved)).toMatchObject({ partial: false, selectedServices: ['serv', 'web'] })
  expect(readFileSync(join(directory, 'README.txt'), 'utf8')).toContain(result.data.deploymentId)
  expect(existsSync(join(directory, 'images'))).toBe(false)
  expect(readFileSync(join(directory, 'README.txt'), 'utf8')).toContain('deploy-local.sh')
})

it('自定义同名交付目录不覆盖已有完整包', async () => {
  await initialize(false)
  const output = join(root, 'release.tar')
  const first = await deploy.deployApp(root, { environment: 'test', bundleOnly: true, output })
  const directory = deliveryDirectory(first)
  const manifest = readBundleFile(directory, 'manifest.json')
  expect(await deploy.deployApp(root, { environment: 'test', bundleOnly: true, output })).toMatchObject({ success: false, error: { code: HaiDeployError.CONFIG_ERROR.code } })
  expect(readBundleFile(directory, 'manifest.json')).toBe(manifest)
})

it('只更新 storage 无需应用镜像或初始化服务', async () => {
  writeFileSync(join(root, 'pnpm-lock.yaml'), JSON.stringify({ lockfileVersion: '9.0', importers: { '.': { dependencies: { '@h-ai/storage': { version: '1' } } } }, packages: { '@h-ai/storage@1': {} }, snapshots: { '@h-ai/storage@1': {} } }))
  writeFileSync(join(root, 'config/_storage.yml'), 'type: s3\nbucket: test-bucket\n')
  const manifestPath = join(artifacts, 'manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.images = manifest.images.filter((image: { name: string }) => image.name === 'web')
  writeFileSync(manifestPath, JSON.stringify({ ...manifest, partial: true, hasWeb: true }))
  await initialize(false)
  const result = await deploy.deployApp(root, { environment: 'test', bundleOnly: true, selectedServices: ['storage'] })
  const directory = deliveryDirectory(result)
  const saved = JSON.parse(readBundleFile(directory, 'manifest.json'))
  expect(saved).toMatchObject({ partial: true, selectedServices: ['storage'], images: [] })
  if (!result.success)
    return
  const files = execFileSync('tar', ['-tf', result.data.bundlePath!], { encoding: 'utf8' })
  expect(files).toContain('images/middleware-1.tar')
  expect(files).not.toContain('images/serv-')
  expect(files).not.toContain('images/web-')
  expect(files).not.toContain('initialize-storage')
})
