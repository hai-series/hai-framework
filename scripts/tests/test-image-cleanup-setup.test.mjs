import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import setup from '../test-image-cleanup-setup.mjs'

const state = vi.hoisted(() => ({ clean: vi.fn() }))
vi.mock('../cleanup-test-images.mjs', () => ({ cleanupTestImages: state.clean }))
const directories = []
let originalExitCode
beforeEach(() => {
  originalExitCode = process.exitCode
})
afterEach(() => {
  process.exitCode = originalExitCode
  vi.clearAllMocks()
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true })
})

function project() {
  const root = mkdtempSync(join(tmpdir(), 'hai-test-image-setup-check-'))
  directories.push(root)
  return { config: { root } }
}

it('未构建镜像的测试不依赖 Podman 或 Docker，临时目录自动删除', () => {
  const target = project()
  const teardown = setup(target)
  expect(target.config.env.HAI_TEST_IMAGE_RUN).toMatch(/^[a-f0-9-]{36}$/)
  const ledger = target.config.env.HAI_TEST_IMAGE_LEDGER
  teardown()
  expect(existsSync(ledger)).toBe(false)
  expect(state.clean).not.toHaveBeenCalled()
})

it.each([false, true])('回收失败=%s 时也按引擎汇总本轮账本并保留报告', (failed) => {
  const target = project()
  const teardown = setup(target)
  const env = target.config.env
  writeFileSync(env.HAI_TEST_IMAGE_LEDGER, `${JSON.stringify({ runtime: 'podman', imageRef: 'localhost/hai-test:1' })}\n`)
  state.clean.mockReturnValue({ failures: failed ? [{ error: 'injected cleanup failure' }] : [] })
  if (failed)
    expect(teardown).toThrow('Test image cleanup failed')
  else
    teardown()
  expect(state.clean).toHaveBeenCalledWith({ runtime: 'podman', owner: env.HAI_TEST_IMAGE_RUN, imageRefs: ['localhost/hai-test:1'], apply: true })
  const report = JSON.parse(readFileSync(join(target.config.root, 'test-results', `image-cleanup-${env.HAI_TEST_IMAGE_RUN}.json`), 'utf8'))
  expect(report.builds).toEqual([{ runtime: 'podman', imageRef: 'localhost/hai-test:1' }])
  expect(report.reports[0].failures.length).toBe(Number(failed))
  expect(existsSync(env.HAI_TEST_IMAGE_LEDGER)).toBe(false)
  if (failed)
    expect(process.exitCode).toBe(1)
})

it('引擎失联保留资源身份与错误，不阻止另一引擎回收，也不假报成功', () => {
  const target = project()
  const teardown = setup(target)
  const env = target.config.env
  writeFileSync(env.HAI_TEST_IMAGE_LEDGER, ['podman', 'docker'].map(runtime => JSON.stringify({ runtime, imageRef: `localhost/hai-test:${runtime}` })).join('\n'))
  state.clean.mockImplementation(({ runtime }) => {
    if (runtime === 'podman')
      throw new Error('Engine disconnected')
    return { failures: [] }
  })
  expect(teardown).toThrow('Test image cleanup failed')
  expect(state.clean).toHaveBeenCalledTimes(2)
  const report = readFileSync(join(target.config.root, 'test-results', `image-cleanup-${env.HAI_TEST_IMAGE_RUN}.json`), 'utf8')
  expect(report).toContain('Engine disconnected')
  expect(report).toContain('localhost/hai-test:docker')
})

it('回收失败时保留测试原有的非零退出码', () => {
  const target = project()
  const teardown = setup(target)
  writeFileSync(target.config.env.HAI_TEST_IMAGE_LEDGER, JSON.stringify({ runtime: 'podman', imageRef: 'localhost/hai-test:1' }))
  state.clean.mockReturnValue({ failures: [{ error: 'cleanup failure' }] })
  process.exitCode = 7
  expect(teardown).toThrow('Test image cleanup failed')
  expect(process.exitCode).toBe(7)
})
