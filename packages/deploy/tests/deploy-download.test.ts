import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { afterEach, expect, it, vi } from 'vitest'
import { resolveDownloadProxy, resolveImageReference } from '../src/index.js'

vi.mock('node:child_process', async importOriginal => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  execFileSync: vi.fn(),
}))

afterEach(() => vi.unstubAllEnvs())

it.each([
  ['node:24.22.1-bookworm-slim', 'docker.1ms.run/library/node:24.22.1-bookworm-slim'],
  ['docker.io/nginxinc/nginx-unprivileged:1.29.8-alpine', 'docker.1ms.run/nginxinc/nginx-unprivileged:1.29.8-alpine'],
  ['ghcr.io/rustfs/rustfs:1.0.1', 'ghcr.1ms.run/rustfs/rustfs:1.0.1'],
  ['ghcr.io/coollabsio/minio:RELEASE.2025-10-15T17-29-55Z', 'ghcr.1ms.run/coollabsio/minio:RELEASE.2025-10-15T17-29-55Z'],
])('大陆源保留版本及命名空间：%s', (reference, expected) => {
  expect(resolveImageReference(reference, { type: 'cn' })).toBe(expected)
  expect(resolveImageReference(reference, { type: 'official' })).toBe(reference)
})

it('自定义源保留原始仓库对应关系和摘要', () => {
  const digest = `sha256:${'a'.repeat(64)}`
  expect(resolveImageReference(`ghcr.io/rustfs/rustfs@${digest}`, { type: 'custom', registries: { 'ghcr.io': 'mirror.example.com/cache/ghcr.io' } })).toBe(`mirror.example.com/cache/ghcr.io/rustfs/rustfs@${digest}`)
  expect(() => resolveImageReference('ghcr.io/rustfs/rustfs:1.0.1', { type: 'custom', registries: { 'docker.io': 'mirror.example.com' } })).toThrow('ghcr.io')
})

it.each(['https://user:private-value@mirror.example.com', 'http://mirror.example.com', 'mirror.example.com/a/../b', 'mirror.example.com?token=private-value', 'mirror.example.com/a%2fb'])('拒绝非法镜像映射且不回显私密值：%s', (replacement) => {
  const resolve = (): string => resolveImageReference('node:24.22.1-bookworm-slim', { type: 'custom', registries: { 'docker.io': replacement } })
  expect(resolve).toThrow()
  expect(resolve).not.toThrow('private-value')
})

it('继承与禁用代理不会改写调用者环境', () => {
  vi.stubEnv('HTTP_PROXY', 'http://127.0.0.1:10808')
  vi.stubEnv('HTTPS_PROXY', 'http://127.0.0.1:10809')
  vi.stubEnv('ALL_PROXY', 'http://127.0.0.1:10810')
  const before = { ...process.env }
  expect(resolveDownloadProxy().HTTPS_PROXY).toBe('http://127.0.0.1:10809')
  expect(Object.values(resolveDownloadProxy({ mode: 'none' })).every(value => value === '')).toBe(true)
  expect(process.env).toEqual(before)
})

it('自定义代理覆盖继承值并保留绕过列表', () => {
  vi.stubEnv('HTTPS_PROXY', 'http://127.0.0.1:10808')
  expect(resolveDownloadProxy({ mode: 'custom', url: 'http://proxy.example.com:3128', bypass: 'localhost,.example.com' })).toMatchObject({ HTTP_PROXY: 'http://proxy.example.com:3128', HTTPS_PROXY: 'http://proxy.example.com:3128', NO_PROXY: 'localhost,.example.com', ALL_PROXY: '' })
  expect(() => resolveDownloadProxy({ mode: 'custom', url: 'http://user:private-value@proxy.example.com' })).toThrow()
})

it('windows 系统代理按 HTTP/HTTPS 分别解析，PAC 明确拒绝', () => {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')!
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
  try {
    vi.mocked(execFileSync).mockReturnValue(JSON.stringify({ enabled: true, server: 'http=127.0.0.1:10808;https=127.0.0.1:10809', bypass: '<local>;localhost;*.example.com' }))
    expect(resolveDownloadProxy({ mode: 'system' })).toMatchObject({ HTTP_PROXY: 'http://127.0.0.1:10808', HTTPS_PROXY: 'http://127.0.0.1:10809', NO_PROXY: 'localhost,*.example.com' })
    vi.mocked(execFileSync).mockReturnValue(JSON.stringify({ pac: 'https://proxy.example.com/config.pac' }))
    expect(() => resolveDownloadProxy({ mode: 'system' })).toThrow()
  }
  finally { Object.defineProperty(process, 'platform', descriptor) }
})
