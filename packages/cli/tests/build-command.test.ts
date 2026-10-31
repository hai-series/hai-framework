import { execFileSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { buildCommand } from '../src/commands/cli-build.js'

// 本文件验证构建调度；真实网络预检在下载配置与容器门禁中验证。
vi.mock('../src/commands/cli-build-downloads.js', async importOriginal => ({
  ...await importOriginal<typeof import('../src/commands/cli-build-downloads.js')>(),
  preflightDownloadProxy: vi.fn(),
}))

const state = vi.hoisted(() => ({ calls: [] as Array<{ command: string, args: string[], env: NodeJS.ProcessEnv }>, failPodman: false, failWeb: false, active: 0, peak: 0 }))
vi.mock('node:child_process', async importOriginal => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  spawn: (command: string, args: string[], options: { env: NodeJS.ProcessEnv }) => {
    const child = new EventEmitter()
    state.calls.push({ command, args, env: options.env })
    if (args[0] === 'build') {
      state.active++
      state.peak = Math.max(state.peak, state.active)
    }
    queueMicrotask(() => {
      if (args[0] === 'save')
        writeFileSync(args[args.indexOf('-o') + 1], 'image archive')
      const failed = (state.failPodman && command === 'podman' && args[0] === 'version') || (state.failWeb && args.some(value => value.endsWith('web.Dockerfile')))
      if (args[0] === 'build')
        state.active--
      child.emit('exit', failed ? 1 : 0)
    })
    return child
  },
}))
let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'hai-build-command-'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'sample-app', version: '1.2.3' }))
  writeFileSync(join(root, 'hai.json'), JSON.stringify({ build: { images: [{ name: 'serv', dockerfile: 'images/serv.Dockerfile' }, { name: 'web', dockerfile: 'images/web.Dockerfile', containerPort: 8080 }], desktop: ['apps/desktop'] } }))
  mkdirSync(join(root, 'images'), { recursive: true })
  writeFileSync(join(root, 'images/serv.Dockerfile'), 'FROM node:24.22.1-bookworm-slim')
  writeFileSync(join(root, 'images/web.Dockerfile'), 'FROM node:24.22.1-bookworm-slim')
  state.calls = []
  state.failPodman = false
  state.failWeb = false
  state.active = 0
  state.peak = 0
  vi.stubEnv('npm_execpath', '/tools/pnpm.cjs')
  // 本文件模拟构建器，不向真实引擎清理账本登记虚构镜像。
  vi.stubEnv('HAI_TEST_IMAGE_RUN', '')
  vi.stubEnv('HAI_TEST_IMAGE_LEDGER', '')
})

it.each([1, 2])('镜像并发上限 %s 保留清单顺序并等待全部任务退出', async (concurrency) => {
  await buildCommand({ cwd: root, target: 'image', runtime: 'docker', concurrency })
  expect(state.peak).toBe(concurrency)
  expect(state.active).toBe(0)
  const parent = join(root, '.hai/build/docker')
  const manifest = JSON.parse(readFileSync(join(parent, readFileSync(join(parent, 'latest'), 'utf8').trim(), 'manifest.json'), 'utf8'))
  expect(manifest.images.map((image: { name: string }) => image.name)).toEqual(['serv', 'web'])
})

it.each(['docker', 'podman'] as const)('选源和代理参数实际传递给 %s 构建', async (runtime) => {
  for (const name of ['serv', 'web'])
    writeFileSync(join(root, `images/${name}.Dockerfile`), ['ARG HAI_NODE_IMAGE=node:24.22.1-bookworm-slim', 'ARG HAI_NGINX_IMAGE=nginxinc/nginx-unprivileged:1.29.8-alpine', 'FROM $' + '{HAI_NODE_IMAGE}', 'ARG HAI_NPM_REGISTRY=https://registry.npmjs.org'].join('\n'))
  await buildCommand({ cwd: root, target: 'image', runtime, network: runtime === 'podman' ? 'pasta' : undefined, imageSource: 'cn', npmSource: 'cn', proxyUrl: 'http://127.0.0.1:10808', yes: true })
  const builds = state.calls.filter(call => call.args[0] === 'build')
  expect(builds).toHaveLength(2)
  for (const { args } of builds) {
    expect(args).toContain('HAI_NODE_IMAGE=docker.1ms.run/library/node:24.22.1-bookworm-slim')
    expect(args).toContain('HAI_NPM_REGISTRY=https://registry.npmmirror.com')
    expect(args).toContain(`HTTPS_PROXY=http://${runtime === 'podman' ? 'host.containers.internal' : 'host.docker.internal'}:10808`)
  }
})

it('并行构建失败后不发布清单，全部子任务退出后清理本轮镜像', async () => {
  state.failWeb = true
  await expect(buildCommand({ cwd: root, target: 'image', runtime: 'docker' })).rejects.toThrow()
  expect(state.active).toBe(0)
  expect(existsSync(join(root, '.hai/build/docker/latest'))).toBe(false)
  const calls = state.calls.filter(call => call.args[0] === 'image' && call.args[1] === 'rm')
  expect(calls).toHaveLength(2)
})

it('reports malformed project JSON without exposing configuration values', async () => {
  writeFileSync(join(root, 'hai.json'), '{"deploy":{"provider":{"token":"private-config-value"}},')
  await expect(buildCommand({ cwd: root, target: 'image' })).rejects.toThrow('hai.json')
  await expect(buildCommand({ cwd: root, target: 'image' })).rejects.not.toThrow('private-config-value')
})
afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(root, { recursive: true, force: true })
})

it.each([{ names: ['serv'] }, { names: ['web'] }, { names: ['serv', 'web'] }])('按交付职责构建，镜像身份来自根包名而非目录：$names', async ({ names }) => {
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@example/Order_Portal', version: '1.2.3' }))
  writeFileSync(join(root, 'hai.json'), JSON.stringify({ build: { images: names.map(name => ({ name, dockerfile: `images/${name}.Dockerfile`, containerPort: name === 'serv' ? 3000 : 8080 })) } }))
  writeFileSync(join(root, 'images/serv.Dockerfile'), 'FROM node:24.22.1-bookworm-slim')
  await buildCommand({ cwd: root, target: 'image', runtime: 'docker' })
  const parent = join(root, '.hai/build/docker')
  const manifest = JSON.parse(readFileSync(join(parent, readFileSync(join(parent, 'latest'), 'utf8').trim(), 'manifest.json'), 'utf8'))
  expect(manifest).toMatchObject({ version: 4, primaryService: names.includes('serv') ? 'serv' : 'web', hasWeb: names.includes('web'), partial: false })
  expect(manifest.images.map((image: { name: string }) => image.name)).toEqual(names)
  for (const image of manifest.images)
    expect(image.imageRef).toBe(`localhost/hai-order-portal-${image.name}:${manifest.buildId}`)
})

it.each([undefined, '', '   ', '@@'])('镜像构建拒绝缺失或无法归一化的根包名：%s', async (name) => {
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name, version: '1.2.3' }))
  await expect(buildCommand({ cwd: root, target: 'image' })).rejects.toThrow()
  expect(state.calls).toEqual([])
})

it('从 workspace 构建仍使用工程根名称、配置与产物目录', async () => {
  const service = join(root, 'packages/different-serv')
  mkdirSync(service, { recursive: true })
  writeFileSync(join(service, 'package.json'), JSON.stringify({ name: 'different-serv', version: '9.9.9' }))
  await buildCommand({ cwd: service, target: 'image', images: 'serv', runtime: 'docker' })
  const parent = join(root, '.hai/build/docker')
  const manifest = JSON.parse(readFileSync(join(parent, readFileSync(join(parent, 'latest'), 'utf8').trim(), 'manifest.json'), 'utf8'))
  expect(manifest.appVersion).toBe('1.2.3')
  expect(manifest.images[0].imageRef).toMatch(/^localhost\/hai-sample-app-serv:1\.2\.3-/)
  expect(existsSync(join(service, '.hai'))).toBe(false)
})

it.each(['podman', 'docker'] as const)('托管 %s 测试构建登记 tag，Podman 同时标记中间层', async (runtime) => {
  const run = 'a1111111-1111-1111-1111-111111111111'
  const ledger = join(root, 'images.jsonl')
  vi.stubEnv('HAI_TEST_IMAGE_RUN', run)
  vi.stubEnv('HAI_TEST_IMAGE_LEDGER', ledger)
  await buildCommand({ cwd: root, target: 'image', runtime })
  const builds = state.calls.filter(call => call.args[0] === 'build')
  expect(builds).toHaveLength(2)
  for (const build of builds) {
    expect(build.args).toEqual(expect.arrayContaining(['--label', `org.h-ai.test.image-run=${run}`]))
    expect(build.args.includes('--layer-label')).toBe(runtime === 'podman')
  }
  const records = readFileSync(ledger, 'utf8').trim().split('\n').map(line => JSON.parse(line))
  expect(records).toEqual(builds.map(build => ({ runtime, imageRef: build.args[build.args.indexOf('-t') + 1] })))
})

it('pnpm build 默认编译源码，不选择环境、不调用容器工具', async () => {
  vi.stubEnv('HAI_DEPLOY_ENVIRONMENT', 'prod')
  vi.stubEnv('PUBLIC_API_BASE', 'https://private-env.example')
  vi.stubEnv('HAI_E2E', '1')
  vi.stubEnv('NODE_ENV', 'test')
  await buildCommand({ cwd: root })
  expect(state.calls).toHaveLength(1)
  expect(state.calls[0]).toMatchObject({ command: process.execPath, args: ['/tools/pnpm.cjs', 'run', 'compile'] })
  expect(state.calls[0].env.HAI_DEPLOY_ENVIRONMENT).toBeUndefined()
  expect(state.calls[0].env.PUBLIC_API_BASE).toBeUndefined()
  expect(state.calls[0].env.HAI_E2E).toBeUndefined()
  expect(state.calls[0].env.NODE_ENV).toBe('production')
})

it('compile 仅投递本次生成的构建身份，外层伪造值与凭据仍被过滤', async () => {
  vi.stubEnv('HAI_BUILD_ID', 'forged-outer-build')
  vi.stubEnv('HAI_BUILD_COMMIT', 'f'.repeat(40))
  vi.stubEnv('HAI_PRIVATE_TOKEN', 'private-build-secret')
  vi.stubEnv('VITE_PRIVATE_TOKEN', 'private-build-secret')
  await buildCommand({ cwd: root })
  const first = state.calls[0]!.env
  expect(first.HAI_BUILD_ID).toMatch(/^[\w.+-]+$/)
  expect(first.HAI_BUILD_ID).not.toBe('forged-outer-build')
  expect(first.HAI_BUILD_COMMIT).toBe('unknown')
  expect(first.HAI_PRIVATE_TOKEN).toBeUndefined()
  expect(first.VITE_PRIVATE_TOKEN).toBeUndefined()
  await buildCommand({ cwd: root })
  expect(state.calls[1]!.env.HAI_BUILD_ID).not.toBe(first.HAI_BUILD_ID)
  expect(process.env.HAI_BUILD_ID).toBe('forged-outer-build')
})

it('静态compile只透传两个已校验公开控制项，其他私有值继续过滤', async () => {
  vi.stubEnv('HAI_BUILD_STATIC', '1')
  vi.stubEnv('PUBLIC_BASE_PATH', '/hai-framework')
  vi.stubEnv('HAI_PRIVATE_TOKEN', 'private-static-sentinel')
  vi.stubEnv('PUBLIC_API_BASE', 'private-static-sentinel')
  vi.stubEnv('VITE_PRIVATE_TOKEN', 'private-static-sentinel')
  await buildCommand({ cwd: root })
  expect(state.calls[0]!.env).toMatchObject({ HAI_BUILD_STATIC: '1', PUBLIC_BASE_PATH: '/hai-framework', NODE_ENV: 'production' })
  for (const name of ['HAI_PRIVATE_TOKEN', 'PUBLIC_API_BASE', 'VITE_PRIVATE_TOKEN'])
    expect(state.calls[0]!.env[name]).toBeUndefined()
})

it('网站挂载前缀只作为Web镜像的公开构建参数，不传给serv或原生目标', async () => {
  vi.stubEnv('PUBLIC_BASE_PATH', '/yyy/sub')
  await buildCommand({ cwd: root, target: 'image', runtime: 'docker' })
  const builds = state.calls.filter(call => call.args[0] === 'build')
  const parent = join(root, '.hai/build/docker')
  const manifest = JSON.parse(readFileSync(join(parent, readFileSync(join(parent, 'latest'), 'utf8').trim(), 'manifest.json'), 'utf8'))
  expect(manifest.webBasePath).toBe('/yyy/sub')
  expect(manifest.version).toBe(5)
  expect(builds.find(call => call.args.includes(join(root, 'images/web.Dockerfile')))?.args).toEqual(expect.arrayContaining(['--build-arg', 'PUBLIC_BASE_PATH=/yyy/sub']))
  expect(builds.find(call => call.args.includes(join(root, 'images/serv.Dockerfile')))?.args).not.toContain('PUBLIC_BASE_PATH=/yyy/sub')
  await buildCommand({ cwd: root, target: 'image', images: 'serv', runtime: 'docker' })
  const partial = JSON.parse(readFileSync(join(parent, readFileSync(join(parent, 'latest'), 'utf8').trim(), 'manifest.json'), 'utf8'))
  expect(partial).toMatchObject({ version: 5, webBasePath: '/yyy/sub', partial: true, hasWeb: true })
  expect(partial.images.map((image: { name: string }) => image.name)).toEqual(['serv'])
  for (const target of ['app', 'desktop'] as const)
    await expect(buildCommand({ cwd: root, target })).rejects.toThrow()
})

it('没有声明Web镜像时，在探测容器引擎前拒绝网站挂载配置', async () => {
  vi.stubEnv('PUBLIC_BASE_PATH', '/yyy')
  writeFileSync(join(root, 'hai.json'), JSON.stringify({ build: { images: [{ name: 'serv', dockerfile: 'images/serv.Dockerfile' }] } }))
  await expect(buildCommand({ cwd: root, target: 'image', runtime: 'docker' })).rejects.toThrow('web')
  expect(state.calls).toEqual([])
})

it.each(['https://example.invalid', '//example.invalid', '/a/../b', '/a/%2e%2e/b', '/a\\b', '/a/', '/a?x=1'])('compile在运行子进程前拒绝非法PUBLIC_BASE_PATH：%s', async (base) => {
  vi.stubEnv('HAI_BUILD_STATIC', '1')
  vi.stubEnv('PUBLIC_BASE_PATH', base)
  await expect(buildCommand({ cwd: root })).rejects.toThrow('PUBLIC_BASE_PATH')
  expect(state.calls).toEqual([])
})

it.each(['true', 'false', '2'])('静态构建标记不接受含糊值：%s', async (value) => {
  vi.stubEnv('HAI_BUILD_STATIC', value)
  await expect(buildCommand({ cwd: root })).rejects.toThrow('HAI_BUILD_STATIC')
  expect(state.calls).toEqual([])
})

it.each(['docker', 'app', 'desktop'] as const)('静态开关不改变%s目标的既有交付策略', async (target) => {
  vi.stubEnv('HAI_BUILD_STATIC', '1')
  await expect(buildCommand({ cwd: root, target })).rejects.toThrow()
  expect(state.calls).toEqual([])
})

it('构建身份使用当前受Git管理工程的精确提交，未跟踪的子工程不能冒用父仓库HEAD', async () => {
  execFileSync('git', ['init', '--quiet'], { cwd: root })
  execFileSync('git', ['add', 'package.json'], { cwd: root })
  execFileSync('git', ['-c', 'user.name=Build fixture', '-c', 'user.email=build@example.invalid', 'commit', '--quiet', '-m', 'fixture'], { cwd: root })
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  await buildCommand({ cwd: root })
  expect(state.calls[0]!.env.HAI_BUILD_COMMIT).toBe(commit)
  const nested = join(root, 'temporary-project')
  mkdirSync(nested)
  writeFileSync(join(nested, 'package.json'), JSON.stringify({ version: 'compile-is-not-semver-restricted' }))
  await buildCommand({ cwd: nested })
  expect(state.calls[1]!.env.HAI_BUILD_COMMIT).toBe('unknown')
  await buildCommand({ cwd: root, target: 'image', runtime: 'docker' })
  for (const build of state.calls.filter(call => call.args[0] === 'build'))
    expect(build.args).toContain(`HAI_BUILD_COMMIT=${commit}`)
})

it('docker 将同一次制品身份显式交给每个镜像编译，不继承外层metadata', async () => {
  vi.stubEnv('HAI_BUILD_ID', 'forged-docker-build')
  vi.stubEnv('HAI_BUILD_COMMIT', 'f'.repeat(40))
  await buildCommand({ cwd: root, target: 'image', runtime: 'docker' })
  const parent = join(root, '.hai/build/docker')
  const buildId = readFileSync(join(parent, 'latest'), 'utf8').trim()
  for (const build of state.calls.filter(call => call.args[0] === 'build')) {
    expect(build.args).toEqual(expect.arrayContaining(['--build-arg', `HAI_BUILD_ID=${buildId}`, '--build-arg', 'HAI_BUILD_COMMIT=unknown']))
    expect(build.args).not.toContain('HAI_BUILD_ID=forged-docker-build')
  }
})
it('优先 Podman，全部镜像构建成功才发布清单，清单不含环境', async () => {
  await buildCommand({ cwd: root, target: 'image', httpProxy: false })
  const builds = state.calls.filter(call => call.args[0] === 'build')
  expect(builds).toHaveLength(2)
  expect(builds.every(call => call.command === 'podman')).toBe(true)
  expect(builds[1].args).toEqual(expect.arrayContaining(['--format', 'docker', '--jobs', '1', '--http-proxy=false', '-f', join(root, 'images/web.Dockerfile')]))
  expect(JSON.stringify(builds)).not.toContain('HAI_CORE_ENV')
  const parent = join(root, '.hai/build/docker')
  const latest = readFileSync(join(parent, 'latest'), 'utf8').trim()
  const manifest = JSON.parse(readFileSync(join(parent, latest, 'manifest.json'), 'utf8'))
  expect(manifest.appVersion).toBe('1.2.3')
  expect(latest).toMatch(/^1\.2\.3-/)
  expect(manifest.images).toHaveLength(2)
  expect(manifest.images[0].sha256).toMatch(/^[a-f0-9]{64}$/)
  expect(manifest.images[0].imageRef.split(':').at(-1)).toBe(manifest.images[1].imageRef.split(':').at(-1))
  expect(manifest.images[0].imageRef).toContain(':1.2.3-')
  expect(existsSync(join(parent, latest, 'serv-1.2.3.tar'))).toBe(true)
  expect(existsSync(join(parent, latest, 'web-1.2.3.tar'))).toBe(true)
  expect(readdirSync(parent).some(name => name.startsWith('.building-'))).toBe(false)
})
it('只构建 Web 并记录部分制品，未知镜像名在启动引擎前失败', async () => {
  await buildCommand({ cwd: root, target: 'image', images: 'web' })
  const calls = state.calls.filter(call => call.args[0] === 'build')
  expect(calls).toHaveLength(1)
  expect(calls[0]!.args).toContain(join(root, 'images/web.Dockerfile'))
  expect(calls[0]!.args).not.toContain('--target')
  const parent = join(root, '.hai/build/docker')
  const manifest = JSON.parse(readFileSync(join(parent, readFileSync(join(parent, 'latest'), 'utf8').trim(), 'manifest.json'), 'utf8'))
  expect(manifest).toMatchObject({ version: 4, primaryService: 'serv', partial: true, hasWeb: true, images: [{ name: 'web' }] })
  expect(manifest.servContainerPort).toBeUndefined()
  expect(manifest.webContainerPort).toBe(8080)
  state.calls = []
  await expect(buildCommand({ cwd: root, target: 'image', images: 'unknown' })).rejects.toThrow()
  expect(state.calls).toEqual([])
})

it.each(['serv', 'web'])('部分构建保留未选镜像的显式容器端口：%s', async (selected) => {
  writeFileSync(join(root, 'hai.json'), JSON.stringify({ build: { images: [{ name: 'serv', dockerfile: 'images/serv.Dockerfile', containerPort: 4100 }, { name: 'web', dockerfile: 'images/web.Dockerfile', containerPort: 8181 }] } }))
  await buildCommand({ cwd: root, target: 'image', images: selected })
  const parent = join(root, '.hai/build/docker')
  const manifest = JSON.parse(readFileSync(join(parent, readFileSync(join(parent, 'latest'), 'utf8').trim(), 'manifest.json'), 'utf8'))
  expect(manifest).toMatchObject({ partial: true, hasWeb: true, servContainerPort: 4100, webContainerPort: 8181, images: [{ name: selected }] })
  expect(manifest.images).toHaveLength(1)
})

it('依赖输入保留真实本地归档并忽略缓存，未变时保留时间戳并清理已删除的元数据', async () => {
  mkdirSync(join(root, 'packages/shared'), { recursive: true })
  const manifest = join(root, 'packages/shared/package.json')
  writeFileSync(manifest, '{"name":"shared"}')
  mkdirSync(join(root, 'dependencies'))
  writeFileSync(join(root, 'dependencies/shared.tgz'), 'local dependency')
  for (const directory of ['.pnpm-store', 'packages/shared/.cache']) {
    mkdirSync(join(root, directory), { recursive: true })
    writeFileSync(join(root, directory, 'package.json'), '{"name":"cached-package"}')
    writeFileSync(join(root, directory, 'cached.tgz'), 'cached download')
  }
  writeFileSync(join(root, '.env.local'), 'PRIVATE_TEST=secret')
  await buildCommand({ cwd: root, target: 'image', images: 'serv' })
  const cached = join(root, 'images/dependencies/packages/shared/package.json')
  const date = new Date('2020-01-01T00:00:00Z')
  utimesSync(cached, date, date)
  await buildCommand({ cwd: root, target: 'image', images: 'serv' })
  expect(statSync(cached).mtimeMs).toBe(date.getTime())
  expect(existsSync(join(root, 'images/dependencies/.env.local'))).toBe(false)
  expect(readFileSync(join(root, 'images/dependencies/dependencies/shared.tgz'), 'utf8')).toBe('local dependency')
  expect(existsSync(join(root, 'images/dependencies/.pnpm-store/package.json'))).toBe(false)
  expect(existsSync(join(root, 'images/dependencies/packages/shared/.cache/cached.tgz'))).toBe(false)
  unlinkSync(manifest)
  await buildCommand({ cwd: root, target: 'image', images: 'serv' })
  expect(existsSync(cached)).toBe(false)
})

it('podman 不可达则用 Docker；显式 Docker 不探测 Podman', async () => {
  state.failPodman = true
  await buildCommand({ cwd: root, target: 'image' })
  expect(state.calls.some(call => call.command === 'docker' && call.args[0] === 'build')).toBe(true)
  state.calls = []
  await buildCommand({ cwd: root, target: 'image', runtime: 'docker' })
  expect(state.calls.some(call => call.command === 'podman')).toBe(false)
  expect(state.calls.filter(call => call.args[0] === 'save').every(call => !call.args.includes('--format'))).toBe(true)
})
it('构建时显式向 Podman 传递主机代理，关闭时不传递', async () => {
  vi.stubEnv('HTTPS_PROXY', 'http://host.containers.internal:10808')
  await buildCommand({ cwd: root, target: 'image', runtime: 'podman', network: 'pasta' })
  expect(state.calls.find(call => call.args[0] === 'build')?.args).toEqual(expect.arrayContaining(['--network', 'pasta']))
  expect(state.calls.find(call => call.args[0] === 'build')?.args).toContain('HTTPS_PROXY=http://host.containers.internal:10808')
  state.calls = []
  await buildCommand({ cwd: root, target: 'image', runtime: 'podman', httpProxy: false })
  expect(state.calls.find(call => call.args[0] === 'build')?.args).not.toContain('HTTPS_PROXY=http://host.containers.internal:10808')
})

it('web 构建失败清理半成品和镜像，不覆盖已有成功构建', async () => {
  const parent = join(root, '.hai/build/docker')
  mkdirSync(parent, { recursive: true })
  writeFileSync(join(parent, 'latest'), 'previous-build')
  state.failWeb = true
  await expect(buildCommand({ cwd: root, target: 'image' })).rejects.toThrow()
  expect(readFileSync(join(parent, 'latest'), 'utf8')).toBe('previous-build')
  expect(readdirSync(parent)).toEqual(['latest'])
  expect(state.calls.filter(call => call.args[0] === 'image' && call.args[1] === 'rm')).toHaveLength(2)
})
it('当前 pnpm 是原生可执行文件时直接启动；JS 入口继续由 Node 启动', async () => {
  for (const entry of ['/tools/pnpm.exe', '/tools/pnpm', '/tools/pnpm-native.exe', '/tools/pnpm-native', '/tools/pnpm.mjs']) {
    state.calls = []
    vi.stubEnv('npm_execpath', entry)
    await buildCommand({ cwd: root })
    expect(state.calls[0]).toMatchObject(entry.endsWith('.mjs')
      ? { command: process.execPath, args: [entry, 'run', 'compile'] }
      : { command: entry, args: ['run', 'compile'] })
  }
})

it.skipIf(process.platform !== 'win32')('直接调用 CLI 时支持 PATH 中的独立 pnpm.exe', async () => {
  vi.stubEnv('npm_execpath', undefined)
  vi.stubEnv('PATH', root)
  const executable = join(root, 'pnpm.exe')
  writeFileSync(executable, '')
  await buildCommand({ cwd: root })
  expect(state.calls[0]).toMatchObject({ command: executable, args: ['run', 'compile'] })
})

it('tauri 构建传递真实 Rust target 和系统安装包类型，拒绝其他系统的伪跨编译', async () => {
  vi.stubEnv('CI', '1')
  await buildCommand({ cwd: root, target: 'desktop', arch: 'x64' })
  expect(state.calls[0].env.CI).toBe('true')
  expect(state.calls[0].args).toEqual(expect.arrayContaining(['exec', 'tauri', 'build', '--target', process.platform === 'win32' ? 'x86_64-pc-windows-msvc' : process.platform === 'darwin' ? 'x86_64-apple-darwin' : 'x86_64-unknown-linux-gnu']))
  expect(JSON.parse(state.calls[0].args[state.calls[0].args.indexOf('--config') + 1])).toMatchObject({ version: '1.2.3' })
  state.calls = []
  await expect(buildCommand({ cwd: root, target: 'desktop', platform: process.platform === 'win32' ? 'linux' : 'windows' })).rejects.toThrow()
  expect(state.calls).toHaveLength(0)
})

it('错误版本、容器端口或不适用的构建参数在启动工具前失败', async () => {
  for (const version of ['../escape', '', '1.2']) {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ version }))
    await expect(buildCommand({ cwd: root, target: 'image' })).rejects.toThrow()
  }
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '1.2.3' }))
  writeFileSync(join(root, 'hai.json'), JSON.stringify({ build: { images: [{ name: 'serv', containerPort: 70000 }] } }))
  await expect(buildCommand({ cwd: root, target: 'image' })).rejects.toThrow()
  await expect(buildCommand({ cwd: root, target: 'compile', runtime: 'docker' })).rejects.toThrow()
  await expect(buildCommand({ cwd: root, target: 'compile', network: 'pasta' })).rejects.toThrow()
  await expect(buildCommand({ cwd: root, target: 'image', arch: 'arm64' })).rejects.toThrow()
  await expect(buildCommand({ cwd: root, target: 'desktop', runtime: 'docker' })).rejects.toThrow()
  expect(state.calls).toHaveLength(0)
})

it('dockerfile 阶段与 SQLite 镜像参数传给所选引擎，非法镜像地址不会启动构建', async () => {
  await buildCommand({ cwd: root, target: 'image', runtime: 'docker', sqlitePrebuildMirror: 'http://mirror.internal/better-sqlite3' })
  expect(state.calls.filter(call => call.args[0] === 'build').map(call => call.args)).toEqual([
    expect.arrayContaining(['-f', join(root, 'images/serv.Dockerfile'), '--build-arg', 'SQLITE_PREBUILD_MIRROR=http://mirror.internal/better-sqlite3']),
    expect.arrayContaining(['-f', join(root, 'images/web.Dockerfile')]),
  ])
  state.calls = []
  for (const url of ['file:///binary', 'https://user:password@mirror.internal', 'https://mirror.internal?token=private'])
    await expect(buildCommand({ cwd: root, target: 'image', sqlitePrebuildMirror: url })).rejects.toThrow()
  expect(state.calls.filter(call => call.args[0] === 'build')).toHaveLength(0)
})
