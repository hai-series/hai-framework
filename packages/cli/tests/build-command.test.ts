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
  expect(manifest.images).toHaveLength(2)
  expect(manifest.images[0].sha256).toMatch(/^[a-f0-9]{64}$/)
  expect(manifest.images[0].imageRef.split(':').at(-1)).toBe(manifest.images[1].imageRef.split(':').at(-1))
  expect(existsSync(join(parent, latest, 'app.tar'))).toBe(true)
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
it('tauri 构建传递真实 Rust target 和系统安装包类型，拒绝其他系统的伪跨编译', async () => {
  await buildCommand({ cwd: root, target: 'desktop', arch: 'x64' })
  expect(state.calls[0].args).toEqual(expect.arrayContaining(['exec', 'tauri', 'build', '--target', process.platform === 'win32' ? 'x86_64-pc-windows-msvc' : process.platform === 'darwin' ? 'x86_64-apple-darwin' : 'x86_64-unknown-linux-gnu']))
  state.calls = []
  await expect(buildCommand({ cwd: root, target: 'desktop', platform: process.platform === 'win32' ? 'linux' : 'windows' })).rejects.toThrow()
  expect(state.calls).toHaveLength(0)
})
