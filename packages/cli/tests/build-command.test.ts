import type { ExecFileSyncOptions, SpawnOptions } from 'node:child_process'
import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { existsSync, linkSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, truncateSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { readDeploymentArtifact } from '@h-ai/deploy'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { buildCommand } from '../src/commands/cli-build.js'

// 本文件验证构建调度；真实网络预检在下载配置与容器门禁中验证。
vi.mock('../src/commands/cli-build-downloads.js', async importOriginal => ({
  ...await importOriginal<typeof import('../src/commands/cli-build-downloads.js')>(),
  preflightDownloadProxy: vi.fn(),
}))

const state = vi.hoisted(() => ({
  calls: [] as Array<{ command: string, args: string[], env: NodeJS.ProcessEnv, stdio: SpawnOptions['stdio'] }>,
  failPodman: false,
  failWeb: false,
  platform: 'linux/arm64',
  active: 0,
  peak: 0,
  copiedAppData: false,
  shortPathAlias: false,
  blockedRemoval: '',
  removedPaths: [] as string[],
  failDependencyPublish: '',
  failDependencyCleanup: '',
  dependencyPublishFailures: 0,
  dependencyCleanupFailures: 0,
  dependencyLstatReplacements: 0,
  afterDependencyLstat: undefined as ((file: string) => void) | undefined,
}))
vi.mock('node:fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs')>()
  return {
    ...original,
    // JS realpath不会展开DOS短名，Git/native会；模拟同一目录的两种合法拼写。
    realpathSync: Object.assign((file: string) => {
      const actual = original.realpathSync(file)
      return state.shortPathAlias && !file.includes('/')
        ? actual.replace(/\\users\\[^\\]+/i, '\\Users\\RUNNER~1')
        : actual
    }, { native: original.realpathSync.native }),
    rmSync: (file: Parameters<typeof original.rmSync>[0], options?: Parameters<typeof original.rmSync>[1]) => {
      state.removedPaths.push(String(file))
      if (String(file) !== state.blockedRemoval)
        original.rmSync(file, options)
    },
    lstatSync: (file: Parameters<typeof original.lstatSync>[0], options?: Parameters<typeof original.lstatSync>[1]) => {
      const metadata = original.lstatSync(file, options)
      state.afterDependencyLstat?.(String(file))
      return metadata
    },
    renameSync: (source: Parameters<typeof original.renameSync>[0], destination: Parameters<typeof original.renameSync>[1]) => {
      if (String(destination) === state.failDependencyPublish) {
        state.dependencyPublishFailures++
        throw Object.assign(new Error('Injected dependency publish failure'), { code: 'EACCES' })
      }
      original.renameSync(source, destination)
    },
    unlinkSync: (file: Parameters<typeof original.unlinkSync>[0]) => {
      if (String(file) === state.failDependencyCleanup) {
        state.dependencyCleanupFailures++
        throw Object.assign(new Error('Injected dependency cleanup failure'), { code: 'EACCES' })
      }
      original.unlinkSync(file)
    },
  }
})
vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:child_process')>()
  return {
    ...original,
    execFileSync(file: string, args: string[], options: ExecFileSyncOptions) {
      if (['docker', 'podman'].includes(file) && args[0] === 'image' && args[1] === 'inspect')
        return `${state.platform}\n`
      return original.execFileSync(file, args, options)
    },
    spawn: (command: string, args: string[], options: { cwd: string, env: NodeJS.ProcessEnv, stdio: SpawnOptions['stdio'] }) => {
      const child = new EventEmitter()
      state.calls.push({
        command,
        args,
        env: options.env,
        stdio: options.stdio,
      })
      if (args[0] === 'build') {
        state.active++
        state.peak = Math.max(state.peak, state.active)
      }
      queueMicrotask(() => {
        if (args[0] === 'save')
          writeFileSync(args[args.indexOf('-o') + 1], 'image archive')
        if (args.includes('tauri')) {
          const bundle = join(options.cwd, 'src-tauri', 'target', args[args.indexOf('--target') + 1], args.includes('--debug')
            ? 'debug'
            : 'release', 'bundle')
          mkdirSync(bundle, { recursive: true })
          writeFileSync(join(bundle, process.platform === 'win32'
            ? 'test.exe'
            : process.platform === 'darwin'
              ? 'test.dmg'
              : 'test.deb'), 'installer')
        }
        if (args[0] === 'run' && args.includes('hai-android') && args.includes('Release')) {
          const workspace = args.find(arg => arg.endsWith('target=/workspace'))?.match(/^type=bind,"source=(.+)",target=\/workspace$/)?.[1]
          if (workspace) {
            state.copiedAppData = existsSync(join(workspace, args.at(-1)!, 'src/data/example.json'))
            const output = join(workspace, args.at(-1)!, 'android/app/build/outputs/apk/release')
            mkdirSync(output, { recursive: true })
            writeFileSync(join(output, 'app-release-unsigned.apk'), 'PK-container-apk')
          }
        }
        const failed = (state.failPodman && command === 'podman' && args[0] === 'version') || (state.failWeb && args.some(value => value.endsWith('web.Dockerfile')))
        if (args[0] === 'build')
          state.active--
        child.emit('exit', failed ? 1 : 0)
      })
      return child
    },
  }
})
let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'hai-build-command-'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'sample-app', version: '1.2.3' }))
  writeFileSync(join(root, 'hai.json'), JSON.stringify({
    build: {
      images: [
        { name: 'serv', dockerfile: 'images/serv.Dockerfile' },
        { name: 'web', dockerfile: 'images/web.Dockerfile', containerPort: 8080 },
      ],
      desktop: ['apps/desktop'],
    },
  }))
  mkdirSync(join(root, 'images'), { recursive: true })
  mkdirSync(join(root, 'apps/desktop'), { recursive: true })
  writeFileSync(join(root, 'images/serv.Dockerfile'), 'FROM node:24.22.1-bookworm-slim')
  writeFileSync(join(root, 'images/web.Dockerfile'), 'FROM node:24.22.1-bookworm-slim')
  state.calls = []
  state.failPodman = false
  state.failWeb = false
  state.platform = 'linux/arm64'
  state.active = 0
  state.peak = 0
  state.copiedAppData = false
  state.shortPathAlias = false
  state.blockedRemoval = ''
  state.removedPaths = []
  state.failDependencyPublish = ''
  state.failDependencyCleanup = ''
  state.dependencyPublishFailures = 0
  state.dependencyCleanupFailures = 0
  state.dependencyLstatReplacements = 0
  state.afterDependencyLstat = undefined
  vi.stubEnv('npm_execpath', '/tools/pnpm.cjs')
  // 本文件模拟构建器，不向真实引擎清理账本登记虚构镜像。
  vi.stubEnv('HAI_TEST_IMAGE_RUN', '')
  vi.stubEnv('HAI_TEST_IMAGE_LEDGER', '')
})

it.each([1, 2])('镜像并发上限 %s 保留清单顺序并等待全部任务退出', async (concurrency) => {
  await buildCommand({
    cwd: root,
    target: 'image',
    runtime: 'docker',
    concurrency,
  })
  expect(state.peak).toBe(concurrency)
  expect(state.active).toBe(0)
  const parent = join(root, '.hai/build/docker')
  const manifest = JSON.parse(readFileSync(join(parent, readFileSync(join(parent, 'latest'), 'utf8').trim(), 'manifest.json'), 'utf8'))
  expect(manifest.images.map((image: { name: string }) => image.name)).toEqual(['serv', 'web'])
})

it('jSON 返回各次独立构建的真实来源、平台和归档校验值', async () => {
  writeFileSync(join(root, '.gitignore'), '.hai/\nimages/dependencies/\n')
  execFileSync('git', ['init', '--quiet'], { cwd: root })
  execFileSync('git', ['add', '.'], { cwd: root })
  execFileSync('git', [
    '-c',
    'user.name=Build fixture',
    '-c',
    'user.email=build@example.invalid',
    'commit',
    '--quiet',
    '-m',
    'fixture',
  ], { cwd: root })
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  try {
    await Promise.all(['serv', 'web'].map(images => buildCommand({
      cwd: root,
      target: 'image',
      images,
      runtime: 'docker',
      json: true,
    })))
    const results = stdout.mock.calls.map(([line]) => JSON.parse(String(line)))
    expect(results).toHaveLength(2)
    expect(new Set(results.map(result => result.artifactDir)).size).toBe(2)
    expect(results.map(result => result.manifest.images[0].name).sort()).toEqual(['serv', 'web'])
    for (const result of results) {
      expect(result).toMatchObject({
        schemaVersion: 1,
        manifest: {
          source: { commit, dirty: false },
          images: [
            {
              platform: 'linux/arm64',
              sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
            },
          ],
        },
      })
      expect(result.manifestPath).toBe(join(result.artifactDir, 'manifest.json'))
      expect(await readDeploymentArtifact(result.artifactDir)).toEqual(result.manifest)
    }
    writeFileSync(join(root, 'draft.txt'), 'untracked input')
    await buildCommand({
      cwd: root,
      target: 'image',
      runtime: 'docker',
      json: true,
    })
    expect(JSON.parse(String(stdout.mock.lastCall?.[0])).manifest.source).toEqual({ commit, dirty: true })
    state.platform = 'invalid platform'
    await expect(buildCommand({
      cwd: root,
      target: 'image',
      runtime: 'docker',
      json: true,
    })).rejects.toThrow()
    expect(stdout).toHaveBeenCalledTimes(3)
  }
  finally {
    stdout.mockRestore()
  }
})

it.skipIf(process.platform !== 'win32')('windows DOS短名与大小写别名保持真实Git来源，外部上下文仍为未知', async () => {
  writeFileSync(join(root, '.gitignore'), '.hai/\nimages/dependencies/\n')
  execFileSync('git', ['init', '--quiet'], { cwd: root })
  execFileSync('git', ['add', '.'], { cwd: root })
  execFileSync('git', [
    '-c',
    'user.name=Build fixture',
    '-c',
    'user.email=build@example.invalid',
    'commit',
    '--quiet',
    '-m',
    'fixture',
  ], { cwd: root })
  state.shortPathAlias = true
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  try {
    await buildCommand({
      cwd: root.toUpperCase(),
      target: 'image',
      runtime: 'docker',
      json: true,
    })
    expect(JSON.parse(String(stdout.mock.lastCall?.[0])).manifest.source.dirty).toBe(false)
    writeFileSync(join(root, 'draft.txt'), 'untracked')
    await buildCommand({
      cwd: root.toUpperCase(),
      target: 'image',
      runtime: 'docker',
      json: true,
    })
    expect(JSON.parse(String(stdout.mock.lastCall?.[0])).manifest.source.dirty).toBe(true)
    const external = join(root, 'external-context')
    mkdirSync(external)
    execFileSync('git', ['init', '--quiet'], { cwd: external })
    writeFileSync(join(root, 'hai.json'), JSON.stringify({
      build: {
        images: [
          { name: 'web', context: external, dockerfile: 'images/web.Dockerfile' },
        ],
      },
    }))
    await buildCommand({
      cwd: root,
      target: 'image',
      runtime: 'docker',
      json: true,
    })
    expect(JSON.parse(String(stdout.mock.lastCall?.[0])).manifest.source.dirty).toBeNull()
  }
  finally {
    stdout.mockRestore()
  }
})

it.skipIf(process.platform !== 'win32')('依赖缓存元数据不能触发跨盘清理，也不信任非字符串条目', async () => {
  const destination = join(root, 'images/dependencies')
  mkdirSync(destination, { recursive: true })
  state.blockedRemoval = 'Z:\\unrelated-codeql-probe.txt'
  writeFileSync(join(destination, '.managed.json'), JSON.stringify([
    state.blockedRemoval,
    42,
    { file: '../outside' },
  ]))
  await buildCommand({ cwd: root, target: 'image', runtime: 'docker' })
  expect(state.removedPaths).not.toContain(state.blockedRemoval)
})

it('镜像来源覆盖子工程之外的真实构建上下文', async () => {
  const app = join(root, 'apps/frontend')
  mkdirSync(join(app, 'images'), { recursive: true })
  mkdirSync(join(root, 'packages/shared'), { recursive: true })
  writeFileSync(join(root, '.gitignore'), '.hai/\nimages/dependencies/\n')
  writeFileSync(join(root, 'packages/shared/input.ts'), 'export const value = 1\n')
  writeFileSync(join(app, 'package.json'), JSON.stringify({ name: 'frontend', version: '1.2.3' }))
  writeFileSync(join(app, 'hai.json'), JSON.stringify({
    build: {
      images: [
        { name: 'web', context: '../..', dockerfile: 'images/web.Dockerfile' },
      ],
    },
  }))
  writeFileSync(join(app, 'images/web.Dockerfile'), 'FROM node:24.22.1-bookworm-slim')
  execFileSync('git', ['init', '--quiet'], { cwd: root })
  execFileSync('git', ['add', '.'], { cwd: root })
  execFileSync('git', [
    '-c',
    'user.name=Build fixture',
    '-c',
    'user.email=build@example.invalid',
    'commit',
    '--quiet',
    '-m',
    'fixture',
  ], { cwd: root })
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  try {
    await buildCommand({
      cwd: app,
      target: 'image',
      runtime: 'docker',
      json: true,
    })
    expect(JSON.parse(String(stdout.mock.lastCall?.[0])).manifest.source.dirty).toBe(false)
    writeFileSync(join(root, 'packages/shared/input.ts'), 'export const value = 2\n')
    await buildCommand({
      cwd: app,
      target: 'image',
      runtime: 'docker',
      json: true,
    })
    expect(JSON.parse(String(stdout.mock.lastCall?.[0])).manifest.source.dirty).toBe(true)
  }
  finally {
    stdout.mockRestore()
  }
})

it('上下文属于被父仓库忽略的嵌套仓库时不能冒用工程提交标为干净', async () => {
  const nested = join(root, 'external-context')
  writeFileSync(join(root, '.gitignore'), '.hai/\nimages/dependencies/\nexternal-context/\n')
  writeFileSync(join(root, 'hai.json'), JSON.stringify({
    build: {
      images: [
        { name: 'web', context: 'external-context', dockerfile: 'images/web.Dockerfile' },
      ],
    },
  }))
  execFileSync('git', ['init', '--quiet'], { cwd: root })
  execFileSync('git', ['add', '.'], { cwd: root })
  execFileSync('git', [
    '-c',
    'user.name=Build fixture',
    '-c',
    'user.email=build@example.invalid',
    'commit',
    '--quiet',
    '-m',
    'project',
  ], { cwd: root })
  mkdirSync(nested)
  writeFileSync(join(nested, 'input.txt'), 'separate repository input')
  execFileSync('git', ['init', '--quiet'], { cwd: nested })
  execFileSync('git', ['add', '.'], { cwd: nested })
  execFileSync('git', [
    '-c',
    'user.name=Build fixture',
    '-c',
    'user.email=build@example.invalid',
    'commit',
    '--quiet',
    '-m',
    'context',
  ], { cwd: nested })
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  try {
    await buildCommand({
      cwd: root,
      target: 'image',
      runtime: 'docker',
      json: true,
    })
    expect(JSON.parse(String(stdout.mock.lastCall?.[0])).manifest.source.dirty).toBeNull()
  }
  finally {
    stdout.mockRestore()
  }
})

it.each(['docker', 'podman'] as const)('选源和代理参数实际传递给 %s 构建', async (runtime) => {
  for (const name of ['serv', 'web']) {
    writeFileSync(join(root, `images/${name}.Dockerfile`), [
      'ARG HAI_NODE_IMAGE=node:24.22.1-bookworm-slim',
      'ARG HAI_NGINX_IMAGE=nginxinc/nginx-unprivileged:1.29.8-alpine',
      'FROM $' + '{HAI_NODE_IMAGE}',
      'ARG HAI_NPM_REGISTRY=https://registry.npmjs.org',
    ].join('\n'))
  }
  await buildCommand({
    cwd: root,
    target: 'image',
    runtime,
    network: runtime === 'podman'
      ? 'pasta'
      : undefined,
    imageSource: 'cn',
    npmSource: 'cn',
    proxyUrl: 'http://127.0.0.1:10808',
    yes: true,
  })
  const builds = state.calls.filter(call => call.args[0] === 'build')
  expect(builds).toHaveLength(2)
  for (const { args } of builds) {
    expect(args).toContain('HAI_NODE_IMAGE=docker.1ms.run/library/node:24.22.1-bookworm-slim')
    expect(args).toContain('HAI_NPM_REGISTRY=https://registry.npmmirror.com')
    expect(args).toContain(`HTTPS_PROXY=http://${runtime === 'podman'
      ? 'host.containers.internal'
      : 'host.docker.internal'}:10808`)
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
  vi.useRealTimers()
  vi.unstubAllEnvs()
  rmSync(root, { recursive: true, force: true })
})

it('构建批次使用工程标识、可读本地时间和末尾版本，清单身份独立于目录名', async () => {
  vi.useFakeTimers({
    toFake: ['Date'],
  })
  vi.setSystemTime(new Date(2026, 10, 5, 17, 19, 24))
  await buildCommand({ cwd: root, target: 'image', runtime: 'docker' })
  const parent = join(root, '.hai/build/docker')
  const directory = readFileSync(join(parent, 'latest'), 'utf8').trim()
  expect(directory).toMatch(/^build-sample-app-image-20261105-171924-[a-f0-9]{6}-1\.2\.3$/)
  const manifest = JSON.parse(readFileSync(join(parent, directory, 'manifest.json'), 'utf8'))
  expect(manifest.buildId).toMatch(/^20261105-171924-[a-f0-9]{6}-1\.2\.3$/)
  expect(directory).toBe(`build-sample-app-image-${manifest.buildId}`)
  expect((await readDeploymentArtifact(join(parent, directory))).buildId).toBe(manifest.buildId)
})

it.each([
  {
    names: ['serv'],
  },
  {
    names: ['web'],
  },
  {
    names: ['serv', 'web'],
  },
])('按交付职责构建，镜像身份来自根包名而非目录：$names', async ({ names }) => {
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@example/Order_Portal', version: '1.2.3' }))
  writeFileSync(join(root, 'hai.json'), JSON.stringify({
    build: {
      images: names.map(name => ({
        name,
        dockerfile: `images/${name}.Dockerfile`,
        containerPort: name === 'serv'
          ? 3000
          : 8080,
      })),
    },
  }))
  writeFileSync(join(root, 'images/serv.Dockerfile'), 'FROM node:24.22.1-bookworm-slim')
  await buildCommand({ cwd: root, target: 'image', runtime: 'docker' })
  const parent = join(root, '.hai/build/docker')
  const manifest = JSON.parse(readFileSync(join(parent, readFileSync(join(parent, 'latest'), 'utf8').trim(), 'manifest.json'), 'utf8'))
  expect(manifest).toMatchObject({
    version: 5,
    webBasePath: '',
    primaryService: names.includes('serv')
      ? 'serv'
      : 'web',
    hasWeb: names.includes('web'),
    partial: false,
  })
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
  await buildCommand({
    cwd: service,
    target: 'image',
    images: 'serv',
    runtime: 'docker',
  })
  const parent = join(root, '.hai/build/docker')
  const manifest = JSON.parse(readFileSync(join(parent, readFileSync(join(parent, 'latest'), 'utf8').trim(), 'manifest.json'), 'utf8'))
  expect(manifest.appVersion).toBe('1.2.3')
  expect(manifest.images[0].imageRef).toMatch(/^localhost\/hai-sample-app-serv:\d{8}-\d{6}-[a-f0-9]{6}-1\.2\.3$/)
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
  expect(state.calls[0]).toMatchObject({
    command: process.execPath,
    args: ['/tools/pnpm.cjs', 'run', 'compile'],
  })
  expect(state.calls[0].env.HAI_DEPLOY_ENVIRONMENT).toBeUndefined()
  expect(state.calls[0].env.PUBLIC_API_BASE).toBeUndefined()
  expect(state.calls[0].env.HAI_E2E).toBeUndefined()
  expect(state.calls[0].env.NODE_ENV).toBe('production')
})

it.skipIf(process.platform !== 'win32')('windows 编译使用管道和追加式日志，保留标准输入', async () => {
  vi.stubEnv('npm_config_reporter', 'default')
  vi.stubEnv('pnpm_config_reporter', 'default')
  await buildCommand({ cwd: root })
  expect(state.calls[0]).toMatchObject({
    stdio: ['inherit', 'pipe', 'pipe'],
    env: { npm_config_reporter: 'append-only', pnpm_config_reporter: 'append-only' },
  })
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
  await buildCommand({
    cwd: root,
    target: 'image',
    images: 'serv',
    runtime: 'docker',
  })
  const partial = JSON.parse(readFileSync(join(parent, readFileSync(join(parent, 'latest'), 'utf8').trim(), 'manifest.json'), 'utf8'))
  expect(partial).toMatchObject({
    version: 5,
    webBasePath: '/yyy/sub',
    partial: true,
    hasWeb: true,
  })
  expect(partial.images.map((image: { name: string }) => image.name)).toEqual(['serv'])
  for (const target of ['app', 'desktop'] as const)
    await expect(buildCommand({ cwd: root, target })).rejects.toThrow()
})

it('没有声明Web镜像时，在探测容器引擎前拒绝网站挂载配置', async () => {
  vi.stubEnv('PUBLIC_BASE_PATH', '/yyy')
  writeFileSync(join(root, 'hai.json'), JSON.stringify({
    build: {
      images: [
        { name: 'serv', dockerfile: 'images/serv.Dockerfile' },
      ],
    },
  }))
  await expect(buildCommand({ cwd: root, target: 'image', runtime: 'docker' })).rejects.toThrow('web')
  expect(state.calls).toEqual([])
})

it.each([
  'https://example.invalid',
  '//example.invalid',
  '/a/../b',
  '/a/%2e%2e/b',
  '/a\\b',
  '/a/',
  '/a?x=1',
])('compile在运行子进程前拒绝非法PUBLIC_BASE_PATH：%s', async (base) => {
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
  // Windows runner 的 tmpdir 可能使用 8.3 短名；manifest 跟踪状态必须由当前目录下的 Git 判断。
  execFileSync('git', ['init', '--quiet'], { cwd: root })
  execFileSync('git', ['add', 'package.json'], { cwd: root })
  execFileSync('git', [
    '-c',
    'user.name=Build fixture',
    '-c',
    'user.email=build@example.invalid',
    'commit',
    '--quiet',
    '-m',
    'fixture',
  ], { cwd: root })
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
  const directory = readFileSync(join(parent, 'latest'), 'utf8').trim()
  const { buildId } = JSON.parse(readFileSync(join(parent, directory, 'manifest.json'), 'utf8'))
  for (const build of state.calls.filter(call => call.args[0] === 'build')) {
    expect(build.args).toEqual(expect.arrayContaining([
      '--build-arg',
      `HAI_BUILD_ID=${buildId}`,
      '--build-arg',
      'HAI_BUILD_COMMIT=unknown',
    ]))
    expect(build.args).not.toContain('HAI_BUILD_ID=forged-docker-build')
  }
})
it('优先 Podman，全部镜像构建成功才发布清单，清单不含环境', async () => {
  await buildCommand({ cwd: root, target: 'image', httpProxy: false })
  const builds = state.calls.filter(call => call.args[0] === 'build')
  expect(builds).toHaveLength(2)
  expect(builds.every(call => call.command === 'podman')).toBe(true)
  expect(builds[1].args).toEqual(expect.arrayContaining([
    '--format',
    'docker',
    '--jobs',
    '1',
    '--http-proxy=false',
    '-f',
    join(root, 'images/web.Dockerfile'),
  ]))
  expect(JSON.stringify(builds)).not.toContain('HAI_CORE_ENV')
  const parent = join(root, '.hai/build/docker')
  const latest = readFileSync(join(parent, 'latest'), 'utf8').trim()
  const manifest = JSON.parse(readFileSync(join(parent, latest, 'manifest.json'), 'utf8'))
  expect(manifest.appVersion).toBe('1.2.3')
  expect(latest).toMatch(/^build-sample-app-image-\d{8}-\d{6}-[a-f0-9]{6}-1\.2\.3$/)
  expect(manifest.images).toHaveLength(2)
  expect(manifest.images[0].sha256).toMatch(/^[a-f0-9]{64}$/)
  expect(manifest.images[0].imageRef.split(':').at(-1)).toBe(manifest.images[1].imageRef.split(':').at(-1))
  expect(manifest.images[0].imageRef).toMatch(/:\d{8}-\d{6}-[a-f0-9]{6}-1\.2\.3$/)
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
  expect(manifest).toMatchObject({
    version: 5,
    webBasePath: '',
    primaryService: 'serv',
    partial: true,
    hasWeb: true,
    images: [
      { name: 'web' },
    ],
  })
  expect(manifest.servContainerPort).toBeUndefined()
  expect(manifest.webContainerPort).toBe(8080)
  state.calls = []
  await expect(buildCommand({ cwd: root, target: 'image', images: 'unknown' })).rejects.toThrow()
  expect(state.calls).toEqual([])
})

it.each(['serv', 'web'])('部分构建保留未选镜像的显式容器端口：%s', async (selected) => {
  writeFileSync(join(root, 'hai.json'), JSON.stringify({
    build: {
      images: [
        { name: 'serv', dockerfile: 'images/serv.Dockerfile', containerPort: 4100 },
        { name: 'web', dockerfile: 'images/web.Dockerfile', containerPort: 8181 },
      ],
    },
  }))
  await buildCommand({ cwd: root, target: 'image', images: selected })
  const parent = join(root, '.hai/build/docker')
  const manifest = JSON.parse(readFileSync(join(parent, readFileSync(join(parent, 'latest'), 'utf8').trim(), 'manifest.json'), 'utf8'))
  expect(manifest).toMatchObject({
    partial: true,
    hasWeb: true,
    servContainerPort: 4100,
    webContainerPort: 8181,
    images: [
      { name: selected },
    ],
  })
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

/** 另建真实 context，外部状态仍留在本轮拥有的根目录中供 finally 回收。 */
function dependencyContext(contextRoot = root): { context: string, destination: string } {
  const requestedContext = join(contextRoot, 'context')
  mkdirSync(requestedContext)
  const context = realpathSync.native(requestedContext)
  writeFileSync(join(context, 'package.json'), '{"name":"trusted-context"}')
  writeFileSync(join(root, 'hai.json'), JSON.stringify({
    build: {
      images: [
        { name: 'serv', context: 'context', dockerfile: 'images/serv.Dockerfile' },
      ],
    },
  }))
  return {
    context,
    destination: join(context, 'images/dependencies'),
  }
}

it('依赖缓存安全：不把context外硬链接源文件复制进镜像输入', async () => {
  const { context, destination } = dependencyContext()
  const outside = join(root, 'outside-archive')
  writeFileSync(outside, 'private-outside-context')
  linkSync(outside, join(context, 'linked.tgz'))
  await expect(buildCommand({ cwd: root, target: 'image', images: 'serv' })).rejects.toThrow()
  expect(existsSync(join(destination, 'linked.tgz'))).toBe(false)
  expect(state.calls.some(call => call.args[0] === 'build')).toBe(false)
})

it.each(['tracking', 'copy-target'] as const)('依赖缓存安全：拒绝%s硬链接，外部JSON保持原样', async (kind) => {
  const { destination } = dependencyContext()
  mkdirSync(destination, { recursive: true })
  const outside = join(root, 'host-state.json')
  const original = '{"keep":"outside-context"}'
  writeFileSync(outside, original)
  linkSync(outside, join(destination, kind === 'tracking'
    ? '.managed.json'
    : 'package.json'))
  await expect(buildCommand({ cwd: root, target: 'image', images: 'serv' })).rejects.toThrow()
  expect(readFileSync(outside, 'utf8')).toBe(original)
  expect(state.calls.some(call => call.args[0] === 'build')).toBe(false)
})

it.skipIf(process.platform === 'win32').each(['tracking', 'copy-target'] as const)('依赖缓存安全：拒绝%s文件符号链接', async (kind) => {
  const { destination } = dependencyContext()
  mkdirSync(destination, { recursive: true })
  const outside = join(root, 'host-state.json')
  writeFileSync(outside, '{"keep":true}')
  symlinkSync(outside, join(destination, kind === 'tracking'
    ? '.managed.json'
    : 'package.json'), 'file')
  await expect(buildCommand({ cwd: root, target: 'image', images: 'serv' })).rejects.toThrow()
  expect(readFileSync(outside, 'utf8')).toBe('{"keep":true}')
  expect(state.calls.some(call => call.args[0] === 'build')).toBe(false)
})

it.each(['images', 'images/dependencies', 'images/dependencies/packages'] as const)('依赖缓存安全：拒绝生成目录祖先%s链接', async (ancestor) => {
  const { context } = dependencyContext()
  const outside = join(root, 'host-directory')
  mkdirSync(outside)
  writeFileSync(join(outside, 'sentinel.txt'), 'owned-outside-state')
  if (ancestor.endsWith('packages')) {
    mkdirSync(join(context, 'packages/shared'), { recursive: true })
    writeFileSync(join(context, 'packages/shared/package.json'), '{"name":"shared"}')
  }
  const linked = join(context, ancestor)
  mkdirSync(join(linked, '..'), { recursive: true })
  symlinkSync(outside, linked, process.platform === 'win32'
    ? 'junction'
    : 'dir')
  await expect(buildCommand({ cwd: root, target: 'image', images: 'serv' })).rejects.toThrow()
  expect(readdirSync(outside)).toEqual(['sentinel.txt'])
  expect(state.calls.some(call => call.args[0] === 'build')).toBe(false)
})

it('依赖缓存安全：旧清单清理不穿过目录链接删除外部文件', async () => {
  const { destination } = dependencyContext()
  mkdirSync(destination, { recursive: true })
  const outside = join(root, 'host-directory')
  mkdirSync(outside)
  writeFileSync(join(outside, 'item.json'), '{"keep":true}')
  writeFileSync(join(destination, '.managed.json'), JSON.stringify(['stale/item.json']))
  symlinkSync(outside, join(destination, 'stale'), process.platform === 'win32'
    ? 'junction'
    : 'dir')
  await expect(buildCommand({ cwd: root, target: 'image', images: 'serv' })).rejects.toThrow()
  expect(readFileSync(join(outside, 'item.json'), 'utf8')).toBe('{"keep":true}')
})

it('依赖缓存安全：tracking在检查后被硬链接替换时读取同一句柄并拒绝发布', async () => {
  // Windows大小写别名可受控复现canonical路径与调用拼写不同，不依赖8.3配置。
  const { destination } = dependencyContext(process.platform === 'win32'
    ? root.toUpperCase()
    : root)
  mkdirSync(destination, { recursive: true })
  const tracking = join(destination, '.managed.json')
  const outside = join(root, 'host-state.json')
  writeFileSync(tracking, '[]')
  writeFileSync(outside, '{"keep":true}')
  state.afterDependencyLstat = (file) => {
    if (file !== tracking)
      return
    state.afterDependencyLstat = undefined
    state.dependencyLstatReplacements++
    unlinkSync(tracking)
    linkSync(outside, tracking)
  }
  await expect(buildCommand({ cwd: root, target: 'image', images: 'serv' })).rejects.toThrow()
  expect(state.dependencyLstatReplacements).toBe(1)
  expect(readFileSync(outside, 'utf8')).toBe('{"keep":true}')
})

it('依赖缓存安全：发布失败保留原文件并清理自有临时文件，之后可恢复构建', async () => {
  const { context, destination } = dependencyContext(process.platform === 'win32'
    ? root.toUpperCase()
    : root)
  await buildCommand({ cwd: root, target: 'image', images: 'serv' })
  const cached = join(destination, 'package.json')
  const oldContent = readFileSync(cached, 'utf8')
  writeFileSync(join(context, 'package.json'), '{"name":"changed-context"}')
  state.failDependencyPublish = cached
  await expect(buildCommand({ cwd: root, target: 'image', images: 'serv' })).rejects.toThrow(/EACCES/)
  expect(state.dependencyPublishFailures).toBe(1)
  expect(readFileSync(cached, 'utf8')).toBe(oldContent)
  expect(readdirSync(destination).sort()).toEqual(['.managed.json', 'package.json'])
  state.failDependencyPublish = ''
  await buildCommand({ cwd: root, target: 'image', images: 'serv' })
  expect(readFileSync(cached, 'utf8')).toBe('{"name":"changed-context"}')
})

it.each(['./package.json', 'unused/../package.json'])('依赖缓存安全：旧清单别名%s不能删除本次有效文件', async (alias) => {
  const { destination } = dependencyContext()
  mkdirSync(destination, { recursive: true })
  writeFileSync(join(destination, '.managed.json'), JSON.stringify([alias]))
  await buildCommand({ cwd: root, target: 'image', images: 'serv' })
  expect(readFileSync(join(destination, 'package.json'), 'utf8')).toBe('{"name":"trusted-context"}')
  expect(JSON.parse(readFileSync(join(destination, '.managed.json'), 'utf8'))).toEqual(['package.json'])
})

it.skipIf(process.platform !== 'win32')('依赖缓存安全：Windows旧清单大小写别名不能删除本次有效文件', async () => {
  const { destination } = dependencyContext()
  mkdirSync(destination, { recursive: true })
  writeFileSync(join(destination, '.managed.json'), JSON.stringify(['PACKAGE.JSON']))
  await buildCommand({ cwd: root, target: 'image', images: 'serv' })
  expect(readFileSync(join(destination, 'package.json'), 'utf8')).toBe('{"name":"trusted-context"}')
})

it('依赖缓存安全：跟踪清单超过16MiB时在解析和分配前明确拒绝', async () => {
  const { destination } = dependencyContext()
  mkdirSync(destination, { recursive: true })
  const tracking = join(destination, '.managed.json')
  writeFileSync(tracking, '[]')
  truncateSync(tracking, 16 * 1024 * 1024 + 1)
  await expect(buildCommand({ cwd: root, target: 'image', images: 'serv' })).rejects.toThrow(/CACHE_INVALID/)
  expect(statSync(tracking).size).toBe(16 * 1024 * 1024 + 1)
})

it('依赖缓存安全：损坏JSON的诊断不回显原始文件内容', async () => {
  const { destination } = dependencyContext()
  mkdirSync(destination, { recursive: true })
  writeFileSync(join(destination, '.managed.json'), 'private-fixture-content-not-json')
  const failure = buildCommand({ cwd: root, target: 'image', images: 'serv' })
  await expect(failure).rejects.toThrow(/CACHE_TRACKING/)
  await expect(failure).rejects.not.toThrow(/private-fixture-content-not-json/)
})

it('依赖缓存安全：跨块归档首建、未变时间戳、内容变化与尺寸变化均正确', async () => {
  const { context, destination } = dependencyContext()
  const source = join(context, 'large-local.tgz')
  const expected = Buffer.alloc(3 * 64 * 1024 + 13, 0x41)
  writeFileSync(source, expected)
  await buildCommand({ cwd: root, target: 'image', images: 'serv' })
  const cached = join(destination, 'large-local.tgz')
  expect(readFileSync(cached)).toEqual(expected)
  const date = new Date('2020-01-01T00:00:00Z')
  utimesSync(cached, date, date)
  await buildCommand({ cwd: root, target: 'image', images: 'serv' })
  expect(statSync(cached).mtimeMs).toBe(date.getTime())
  expected[64 * 1024 + 7] = 0x42
  writeFileSync(source, expected)
  await buildCommand({ cwd: root, target: 'image', images: 'serv' })
  expect(readFileSync(cached)).toEqual(expected)
  truncateSync(cached, expected.length + 128)
  await buildCommand({ cwd: root, target: 'image', images: 'serv' })
  expect(readFileSync(cached)).toEqual(expected)
})

it('依赖缓存安全：旧文件删除失败有安全诊断，保留清单并允许下次恢复', async () => {
  const { context, destination } = dependencyContext(process.platform === 'win32'
    ? root.toUpperCase()
    : root)
  const source = join(context, 'stale.tgz')
  writeFileSync(source, 'owned-cache-data')
  await buildCommand({ cwd: root, target: 'image', images: 'serv' })
  unlinkSync(source)
  const cached = join(destination, 'stale.tgz')
  state.failDependencyCleanup = cached
  await expect(buildCommand({ cwd: root, target: 'image', images: 'serv' })).rejects.toThrow(/EACCES/)
  expect(state.dependencyCleanupFailures).toBe(1)
  expect(readFileSync(cached, 'utf8')).toBe('owned-cache-data')
  expect(JSON.parse(readFileSync(join(destination, '.managed.json'), 'utf8'))).toContain('stale.tgz')
  state.failDependencyCleanup = ''
  await buildCommand({ cwd: root, target: 'image', images: 'serv' })
  expect(existsSync(cached)).toBe(false)
  expect(JSON.parse(readFileSync(join(destination, '.managed.json'), 'utf8'))).not.toContain('stale.tgz')
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
  await buildCommand({
    cwd: root,
    target: 'image',
    runtime: 'podman',
    network: 'pasta',
  })
  expect(state.calls.find(call => call.args[0] === 'build')?.args).toEqual(expect.arrayContaining(['--network', 'pasta']))
  expect(state.calls.find(call => call.args[0] === 'build')?.args).toContain('HTTPS_PROXY=http://host.containers.internal:10808')
  state.calls = []
  await buildCommand({
    cwd: root,
    target: 'image',
    runtime: 'podman',
    httpProxy: false,
  })
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
  for (const entry of [
    '/tools/pnpm.exe',
    '/tools/pnpm',
    '/tools/pnpm-native.exe',
    '/tools/pnpm-native',
    '/tools/pnpm.mjs',
  ]) {
    state.calls = []
    vi.stubEnv('npm_execpath', entry)
    await buildCommand({ cwd: root })
    expect(state.calls[0]).toMatchObject(entry.endsWith('.mjs')
      ? {
          command: process.execPath,
          args: [entry, 'run', 'compile'],
        }
      : {
          command: entry,
          args: ['run', 'compile'],
        })
  }
})

it.skipIf(process.platform !== 'win32')('直接调用 CLI 时支持 PATH 中的独立 pnpm.exe', async () => {
  vi.stubEnv('npm_execpath', undefined)
  vi.stubEnv('PATH', root)
  const executable = join(root, 'pnpm.exe')
  writeFileSync(executable, '')
  await buildCommand({ cwd: root })
  expect(state.calls[0]).toMatchObject({
    command: executable,
    args: ['run', 'compile'],
  })
})

it('tauri 构建按目标平台和类型归档，并拒绝其他系统的伪跨编译', async () => {
  vi.stubEnv('CI', '1')
  await buildCommand({
    cwd: root,
    target: 'desktop',
    arch: 'x64',
    debug: true,
  })
  expect(state.calls[0].env.CI).toBe('true')
  expect(state.calls[0].args).toEqual(expect.arrayContaining([
    'exec',
    'tauri',
    'build',
    '--target',
    process.platform === 'win32'
      ? 'x86_64-pc-windows-msvc'
      : process.platform === 'darwin'
        ? 'x86_64-apple-darwin'
        : 'x86_64-unknown-linux-gnu',
  ]))
  expect(state.calls[0].args).toContain('--debug')
  expect(JSON.parse(state.calls[0].args[state.calls[0].args.indexOf('--config') + 1])).toMatchObject({ version: '1.2.3' })
  const platform = process.platform === 'win32'
    ? 'windows'
    : process.platform === 'darwin'
      ? 'macos'
      : 'linux'
  const parent = join(root, '.hai/build/desktop', platform, 'debug')
  const batch = join(parent, readFileSync(join(parent, 'latest'), 'utf8').trim())
  const manifest = JSON.parse(readFileSync(join(batch, 'manifest.json'), 'utf8'))
  expect(manifest).toMatchObject({
    kind: 'desktop',
    platform,
    variant: 'debug',
    appVersion: '1.2.3',
    files: [
      {
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    ],
  })
  expect(manifest.arch).toBe('x64')
  expect(manifest.files[0].file).toBe(`apps/desktop/sample-app-${platform}-x64-debug-1.2.3${platform === 'windows'
    ? '-setup.exe'
    : platform === 'macos'
      ? '.dmg'
      : '.deb'}`)
  expect(readFileSync(join(batch, manifest.files[0].file), 'utf8')).toBe('installer')
  state.calls = []
  await expect(buildCommand({
    cwd: root,
    target: 'desktop',
    platform: process.platform === 'win32'
      ? 'linux'
      : 'windows',
  })).rejects.toThrow()
  expect(state.calls).toHaveLength(0)
})

it('desktop uses its configured Tauri script and forwards only the Core name and mode', async () => {
  writeFileSync(join(root, 'apps/desktop/package.json'), JSON.stringify({
    scripts: { tauri: 'node ../../scripts/run-tauri.mjs ../.. config/_core.yml' },
  }))
  vi.stubEnv('HAI_CORE', JSON.stringify({
    name: 'Configured Desktop',
    env: 'test',
    logging: {
      context: { secret: 'private-context' },
    },
  }))
  vi.stubEnv('HAI_DB_PASSWORD', 'private-password')
  await buildCommand({ cwd: root, target: 'desktop', arch: 'x64' })
  expect(state.calls[0].args).toEqual(expect.arrayContaining(['run', 'tauri', 'build']))
  expect(state.calls[0].env).toMatchObject({ HAI_CORE_NAME: 'Configured Desktop', HAI_CORE_ENV: 'test' })
  expect(state.calls[0].env.HAI_CORE).toBeUndefined()
  expect(state.calls[0].env.HAI_DB_PASSWORD).toBeUndefined()
})

it('iOS 和源码构建拒绝不适用的容器与调试参数', async () => {
  await expect(buildCommand({
    cwd: root,
    target: 'app',
    platform: 'ios',
    runtime: 'docker',
  })).rejects.toThrow(/Xcode/)
  await expect(buildCommand({ cwd: root, target: 'compile', debug: true })).rejects.toThrow()
  expect(state.calls).toHaveLength(0)
})

it('容器 Android 从锁文件所在 workspace 构建，只有独立签名步骤获得密钥', async () => {
  const app = join(root, 'apps/mobile')
  const definition = join(root, 'node_modules/@h-ai/capacitor/images')
  mkdirSync(join(app, 'android'), { recursive: true })
  mkdirSync(join(app, 'src/data'), { recursive: true })
  mkdirSync(definition, { recursive: true })
  writeFileSync(join(app, 'capacitor.config.ts'), 'export default {}')
  writeFileSync(join(app, 'src/data/example.json'), '{}')
  writeFileSync(join(app, 'package.json'), JSON.stringify({ name: 'sample-mobile', version: '1.2.3' }))
  writeFileSync(join(app, 'hai.json'), JSON.stringify({
    build: {
      app: ['.'],
    },
  }))
  writeFileSync(join(app, '.env.prod'), 'HAI_CORE_NAME=Container Native\nHAI_DB_PASSWORD=private-env-password\n')
  writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0')
  writeFileSync(join(definition, 'android.Dockerfile'), 'ARG HAI_ANDROID_IMAGE=ghcr.io/example/sdk:36\nFROM $' + '{HAI_ANDROID_IMAGE}')
  const keystore = join(root, 'fixture-key.p12')
  writeFileSync(keystore, 'test fixture')
  vi.stubEnv('HAI_ANDROID_KEYSTORE', keystore)
  vi.stubEnv('HAI_ANDROID_STORE_PASSWORD', 'fixture-store-password')
  vi.stubEnv('HAI_ANDROID_KEY_ALIAS', 'fixture-alias')
  vi.stubEnv('HAI_ANDROID_KEY_PASSWORD', 'fixture-key-password')
  await buildCommand({
    cwd: app,
    target: 'app',
    platform: 'android',
    runtime: 'docker',
    yes: true,
  })
  const [build, sign] = state.calls.filter(call => call.args[0] === 'run')
  expect(state.copiedAppData).toBe(true)
  expect(build.args.at(-1)).toBe('apps/mobile')
  expect(build.env.HAI_ANDROID_KEY_PASSWORD).toBeUndefined()
  expect(build.env.HAI_CORE_NAME).toBe('Container Native')
  expect(build.env.HAI_DB_PASSWORD).toBeUndefined()
  expect(build.args).toEqual(expect.arrayContaining(['--env', 'HAI_CORE_NAME']))
  expect(build.args).not.toContain('Container Native')
  // 构建脚本在 Linux 运行；用假 Wrapper 捕获真实参数，验证代理能传入后台构建。
  if (process.platform !== 'win32') {
    const workspace = join(root, 'proxy-script')
    const appDirectory = join(workspace, 'apps/mobile/android')
    const bin = join(workspace, 'bin')
    const cache = join(workspace, 'cache')
    const capture = join(workspace, 'gradle-args.json')
    mkdirSync(join(appDirectory, 'app/src/main/assets'), { recursive: true })
    mkdirSync(bin)
    mkdirSync(cache)
    writeFileSync(join(appDirectory, 'app/src/main/assets/capacitor.config.json'), '{}')
    for (const command of ['pnpm', 'flock'])
      writeFileSync(join(bin, command), '#!/bin/bash\nexit 0\n', { mode: 0o755 })
    writeFileSync(join(appDirectory, 'gradlew'), '#!/bin/bash\nnode -e \'require("node:fs").writeFileSync(process.env.GRADLE_CAPTURE, JSON.stringify(process.argv.slice(1)))\' -- "$@"\n')
    const script = build.args[build.args.indexOf('-c') + 1].replaceAll('/workspace', workspace).replaceAll('/cache', cache)
    execFileSync('bash', [
      '-c',
      script,
      'hai-android',
      'Debug',
      'apps/mobile',
    ], {
      timeout: 10_000,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        GRADLE_CAPTURE: capture,
        HTTP_PROXY: 'http://proxy.example.test:8080',
        HTTPS_PROXY: 'http://proxy.example.test:8080',
        NO_PROXY: 'localhost,.example.test:3000',
      },
    })
    const args = JSON.parse(readFileSync(capture, 'utf8'))
    expect(args).toEqual(expect.arrayContaining([
      '--no-daemon',
      'assembleDebug',
      '-Dhttp.proxyHost=proxy.example.test',
      '-Dhttp.proxyPort=8080',
      '-Dhttps.proxyHost=proxy.example.test',
      '-Dhttps.proxyPort=8080',
      '-Dhttp.nonProxyHosts=localhost|*.example.test',
    ]))
  }
  expect(build.args.join(' ')).not.toContain(keystore)
  expect(sign.args).toEqual(expect.arrayContaining(['--network', 'none', 'HAI_ANDROID_KEY_PASSWORD']))
  expect(sign.args.join(' ')).not.toContain('fixture-key-password')
  expect(sign.env.HAI_ANDROID_KEY_PASSWORD).toBe('fixture-key-password')
  const parent = join(app, '.hai/build/app/android/release')
  const batch = join(parent, readFileSync(join(parent, 'latest'), 'utf8').trim())
  expect(readFileSync(join(batch, 'release/sample-mobile-android-release-1.2.3.apk'), 'utf8')).toBe('PK-container-apk')
})

it('错误版本、容器端口或不适用的构建参数在启动工具前失败', async () => {
  for (const version of ['../escape', '', '1.2']) {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ version }))
    await expect(buildCommand({ cwd: root, target: 'image' })).rejects.toThrow()
  }
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '1.2.3' }))
  writeFileSync(join(root, 'hai.json'), JSON.stringify({
    build: {
      images: [
        { name: 'serv', containerPort: 70000 },
      ],
    },
  }))
  await expect(buildCommand({ cwd: root, target: 'image' })).rejects.toThrow()
  await expect(buildCommand({ cwd: root, target: 'compile', runtime: 'docker' })).rejects.toThrow()
  await expect(buildCommand({ cwd: root, target: 'compile', network: 'pasta' })).rejects.toThrow()
  await expect(buildCommand({ cwd: root, target: 'image', arch: 'arm64' })).rejects.toThrow()
  await expect(buildCommand({ cwd: root, target: 'desktop', runtime: 'docker' })).rejects.toThrow()
  expect(state.calls).toHaveLength(0)
})

it('每个镜像使用自己的 Dockerfile，新 SQLite 不再传递独立下载地址', async () => {
  await buildCommand({
    cwd: root,
    target: 'image',
    runtime: 'docker',
  })
  expect(state.calls.filter(call => call.args[0] === 'build').map(call => call.args)).toEqual([
    expect.arrayContaining([
      '-f',
      join(root, 'images/serv.Dockerfile'),
    ]),
    expect.arrayContaining([
      '-f',
      join(root, 'images/web.Dockerfile'),
    ]),
  ])
  expect(state.calls.filter(call => call.args[0] === 'build').flatMap(call => call.args).join(' ')).not.toContain('SQLITE_PREBUILD_MIRROR')
})
