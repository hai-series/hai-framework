import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { buildCommand } from '../src/commands/cli-build.js'

const state = vi.hoisted(() => ({ calls: [] as Array<{ command: string, args: string[], env: NodeJS.ProcessEnv }>, failPodman: false, failWeb: false }))
vi.mock('node:child_process', () => ({
  spawn: (command: string, args: string[], options: { env: NodeJS.ProcessEnv }) => {
    const child = new EventEmitter()
    state.calls.push({ command, args, env: options.env })
    queueMicrotask(() => {
      if (args[0] === 'save')
        writeFileSync(args[args.indexOf('-o') + 1], 'image archive')
      const failed = (state.failPodman && command === 'podman' && args[0] === 'version') || (state.failWeb && args.includes('web'))
      child.emit('exit', failed ? 1 : 0)
    })
    return child
  },
}))
let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'hai-build-command-'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'sample-app', version: '1.2.3' }))
  writeFileSync(join(root, 'hai.build.json'), JSON.stringify({ images: [{ name: 'app', target: 'runtime' }, { name: 'web', target: 'web', containerPort: 8080 }], desktop: ['apps/desktop'] }))
  state.calls = []
  state.failPodman = false
  state.failWeb = false
  vi.stubEnv('npm_execpath', '/tools/pnpm.cjs')
})
afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(root, { recursive: true, force: true })
})

it('pnpm build 默认编译源码，不选择环境、不调用容器工具', async () => {
  vi.stubEnv('HAI_DEPLOY_ENVIRONMENT', 'prod')
  vi.stubEnv('PUBLIC_API_BASE', 'https://private-env.example')
  vi.stubEnv('NODE_ENV', 'test')
  await buildCommand({ cwd: root })
  expect(state.calls).toHaveLength(1)
  expect(state.calls[0]).toMatchObject({ command: process.execPath, args: ['/tools/pnpm.cjs', 'run', 'compile'] })
  expect(state.calls[0].env.HAI_DEPLOY_ENVIRONMENT).toBeUndefined()
  expect(state.calls[0].env.PUBLIC_API_BASE).toBeUndefined()
  expect(state.calls[0].env.NODE_ENV).toBe('production')
})
it('优先 Podman，全部镜像构建成功才发布清单，清单不含环境', async () => {
  await buildCommand({ cwd: root, target: 'docker', httpProxy: false })
  const builds = state.calls.filter(call => call.args[0] === 'build')
  expect(builds).toHaveLength(2)
  expect(builds.every(call => call.command === 'podman')).toBe(true)
  expect(builds[1].args).toEqual(expect.arrayContaining(['--format', 'docker', '--jobs', '1', '--http-proxy=false', '--target', 'web']))
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
  expect(existsSync(join(parent, latest, 'app-1.2.3.tar'))).toBe(true)
  expect(existsSync(join(parent, latest, 'web-1.2.3.tar'))).toBe(true)
  expect(readdirSync(parent).some(name => name.startsWith('.building-'))).toBe(false)
})
it('podman 不可达则用 Docker；显式 Docker 不探测 Podman', async () => {
  state.failPodman = true
  await buildCommand({ cwd: root, target: 'docker' })
  expect(state.calls.some(call => call.command === 'docker' && call.args[0] === 'build')).toBe(true)
  state.calls = []
  await buildCommand({ cwd: root, target: 'docker', runtime: 'docker' })
  expect(state.calls.some(call => call.command === 'podman')).toBe(false)
  expect(state.calls.filter(call => call.args[0] === 'save').every(call => !call.args.includes('--format'))).toBe(true)
})
it('构建时显式向 Podman 传递主机代理，关闭时不传递', async () => {
  vi.stubEnv('HTTPS_PROXY', 'http://host.containers.internal:10808')
  await buildCommand({ cwd: root, target: 'docker', runtime: 'podman', network: 'pasta' })
  expect(state.calls.find(call => call.args[0] === 'build')?.args).toEqual(expect.arrayContaining(['--network', 'pasta']))
  expect(state.calls.find(call => call.args[0] === 'build')?.args).toContain('HTTPS_PROXY=http://host.containers.internal:10808')
  state.calls = []
  await buildCommand({ cwd: root, target: 'docker', runtime: 'podman', httpProxy: false })
  expect(state.calls.find(call => call.args[0] === 'build')?.args).not.toContain('HTTPS_PROXY=http://host.containers.internal:10808')
})

it('web 构建失败清理半成品和镜像，不覆盖已有成功构建', async () => {
  const parent = join(root, '.hai/build/docker')
  mkdirSync(parent, { recursive: true })
  writeFileSync(join(parent, 'latest'), 'previous-build')
  state.failWeb = true
  await expect(buildCommand({ cwd: root, target: 'docker' })).rejects.toThrow()
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
    await expect(buildCommand({ cwd: root, target: 'docker' })).rejects.toThrow()
  }
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '1.2.3' }))
  writeFileSync(join(root, 'hai.build.json'), JSON.stringify({ images: [{ name: 'app', containerPort: 70000 }] }))
  await expect(buildCommand({ cwd: root, target: 'docker' })).rejects.toThrow()
  await expect(buildCommand({ cwd: root, target: 'compile', runtime: 'docker' })).rejects.toThrow()
  await expect(buildCommand({ cwd: root, target: 'compile', network: 'pasta' })).rejects.toThrow()
  await expect(buildCommand({ cwd: root, target: 'docker', arch: 'arm64' })).rejects.toThrow()
  await expect(buildCommand({ cwd: root, target: 'desktop', runtime: 'docker' })).rejects.toThrow()
  expect(state.calls).toHaveLength(0)
})

it('dockerfile 阶段与 SQLite 镜像参数传给所选引擎，非法镜像地址不会启动构建', async () => {
  await buildCommand({ cwd: root, target: 'docker', runtime: 'docker', sqlitePrebuildMirror: 'http://mirror.internal/better-sqlite3' })
  expect(state.calls.filter(call => call.args[0] === 'build').map(call => call.args)).toEqual([
    expect.arrayContaining(['--target', 'runtime', '--build-arg', 'SQLITE_PREBUILD_MIRROR=http://mirror.internal/better-sqlite3']),
    expect.arrayContaining(['--target', 'web']),
  ])
  state.calls = []
  for (const url of ['file:///binary', 'https://user:password@mirror.internal', 'https://mirror.internal?token=private'])
    await expect(buildCommand({ cwd: root, target: 'docker', sqlitePrebuildMirror: url })).rejects.toThrow()
  expect(state.calls.filter(call => call.args[0] === 'build')).toHaveLength(0)
})
