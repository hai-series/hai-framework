import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { buildProxyArguments, resolveBuildDownloads, validateDownloadDockerfile } from '../src/commands/cli-build-downloads.js'

const answers = vi.hoisted(() => [] as Array<{ value?: string }>)
vi.mock('prompts', () => ({ default: vi.fn(async () => answers.shift() ?? {}) }))
vi.mock('node:child_process', async importOriginal => ({ ...await importOriginal<typeof import('node:child_process')>(), execFileSync: vi.fn() }))
let root: string
const tty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY')

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'hai-build-downloads-'))
  writeFileSync(join(root, 'hai.json'), JSON.stringify({ build: { images: [{ name: 'serv', dockerfile: 'images/serv.Dockerfile' }] }, custom: { keep: true } }))
  answers.length = 0
})
afterEach(() => {
  if (tty)
    Object.defineProperty(process.stdin, 'isTTY', tty)
  else Reflect.deleteProperty(process.stdin, 'isTTY')
  vi.unstubAllEnvs()
  rmSync(root, { recursive: true, force: true })
})

it('非交互未配置时沿用官方源，不写入项目', async () => {
  const before = readFileSync(join(root, 'hai.json'), 'utf8')
  const result = await resolveBuildDownloads(root, { yes: true })
  expect(result.imageSource).toEqual({ type: 'official' })
  expect(result.npmRegistry).toBe('https://registry.npmjs.org')
  expect(readFileSync(join(root, 'hai.json'), 'utf8')).toBe(before)
})

it('首次交互保存选源，后续复用并保留其他项目字段', async () => {
  Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
  answers.push({ value: 'cn' }, { value: 'cn' }, { value: 'inherit' })
  const first = await resolveBuildDownloads(root, {})
  expect(first.npmRegistry).toBe('https://registry.npmmirror.com')
  expect(JSON.parse(readFileSync(join(root, 'hai.json'), 'utf8'))).toMatchObject({ custom: { keep: true }, build: { sources: { image: { type: 'cn' }, npm: { type: 'cn' } }, proxy: { mode: 'inherit' } } })
  expect(await resolveBuildDownloads(root, {})).toEqual(first)
  expect(answers).toHaveLength(0)
})

it('显式参数覆盖已保存配置但不回写默认', async () => {
  writeFileSync(join(root, 'hai.json'), JSON.stringify({ build: { sources: { image: { type: 'cn' }, npm: { type: 'cn' } }, proxy: { mode: 'none' } } }))
  const before = readFileSync(join(root, 'hai.json'), 'utf8')
  const result = await resolveBuildDownloads(root, { imageSource: 'custom', imageMirrors: 'docker.io=mirror.example.com/docker.io,ghcr.io=mirror.example.com/ghcr.io', npmRegistry: 'https://npm.example.com/registry/', proxyUrl: 'http://127.0.0.1:10808', yes: true })
  expect(result.imageSource.registries?.['ghcr.io']).toBe('mirror.example.com/ghcr.io')
  expect(result.npmRegistry).toBe('https://npm.example.com/registry')
  expect(result.proxy).toEqual({ mode: 'custom', url: 'http://127.0.0.1:10808' })
  expect(readFileSync(join(root, 'hai.json'), 'utf8')).toBe(before)
})

it.each([
  { imageSource: 'custom' as const },
  { imageMirrors: 'docker.io=mirror.example.com,docker.io=other.example.com' },
  { npmRegistry: 'https://user:private-value@npm.example.com' },
  { npmSource: 'official' as const, npmRegistry: 'https://npm.example.com' },
  { proxyMode: 'none' as const, proxyUrl: 'http://127.0.0.1:10808' },
])('非法参数在构建前失败：%j', async (options) => {
  await expect(resolveBuildDownloads(root, { ...options, yes: true })).rejects.toThrow()
})

it('取消交互不保存半份选择', async () => {
  Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
  const before = readFileSync(join(root, 'hai.json'), 'utf8')
  answers.push({ value: 'cn' }, {})
  await expect(resolveBuildDownloads(root, {})).rejects.toThrow()
  expect(readFileSync(join(root, 'hai.json'), 'utf8')).toBe(before)
})

it.each(['podman', 'docker'])('构建容器代理将宿主回环替换为 %s 的可达入口', (runtime) => {
  const args = buildProxyArguments({ mode: 'custom', url: 'http://127.0.0.1:10808', bypass: 'localhost' }, runtime, runtime === 'podman' ? 'pasta' : undefined)
  expect(args).toContain(`HTTPS_PROXY=http://${runtime === 'podman' ? 'host.containers.internal' : 'host.docker.internal'}:10808`)
  expect(args).not.toContain('HTTPS_PROXY=http://127.0.0.1:10808')
  expect(buildProxyArguments({ mode: 'none' }, runtime)).toContain('HTTPS_PROXY=')
  expect(execFileSync).not.toHaveBeenCalled()
})

it('podman 默认网络与显式 host 网络保留调用者代理地址', () => {
  for (const [runtime, network] of [['podman', undefined], ['podman', 'host'], ['docker', 'host']])
    expect(buildProxyArguments({ mode: 'custom', url: 'http://127.0.0.1:10808' }, runtime!, network)).toContain('HTTPS_PROXY=http://127.0.0.1:10808')
})

it('旧 Dockerfile 明确报告选源不受支持', async () => {
  const file = join(root, 'serv.Dockerfile')
  writeFileSync(file, 'FROM node:24.22.1-bookworm-slim\n')
  const downloads = await resolveBuildDownloads(root, { imageSource: 'cn', npmSource: 'cn', yes: true })
  expect(() => validateDownloadDockerfile(file, downloads)).toThrow('HAI_NODE_IMAGE')
  writeFileSync(file, ['ARG HAI_NODE_IMAGE=node:24.22.1-bookworm-slim', 'FROM $' + '{HAI_NODE_IMAGE}', 'ARG HAI_NPM_REGISTRY=https://registry.npmjs.org'].join('\n'))
  expect(() => validateDownloadDockerfile(file, downloads)).not.toThrow()
})
