import process from 'node:process'
import { afterEach, expect, it, vi } from 'vitest'

const observed = vi.hoisted(() => ({ deploy: vi.fn() }))
vi.mock('cac', async (importOriginal) => {
  const original = await importOriginal<typeof import('cac')>()
  return { ...original, cac: (...args: Parameters<typeof original.cac>) => {
    const cli = original.cac(...args)
    const parse = cli.parse.bind(cli)
    // CAC 在模块载入时捕获默认 argv；同一测试进程显式传入本用例参数，仍使用真实解析器。
    cli.parse = (argv = process.argv, options) => parse(argv, options)
    return cli
  } }
})
vi.mock('../src/commands/cli-commands.js', () => ({
  addModule: vi.fn(),
  buildCommand: vi.fn(),
  createProject: vi.fn(),
  deployCommand: observed.deploy,
  feedbackCommand: vi.fn(),
  generate: vi.fn(),
  initProject: vi.fn(),
  upgradeCommand: vi.fn(),
}))
const originalArgs = [...process.argv]
afterEach(() => {
  process.argv = [...originalArgs]
  observed.deploy.mockClear()
})

it.each([
  { flags: ['--plan', '--yes'], plan: true, inspectRemote: undefined },
  { flags: ['--plan', '--inspect-remote', '--yes'], plan: true, inspectRemote: true },
  { flags: ['--inspect-remote', '--yes'], plan: undefined, inspectRemote: true },
])('真实 CLI 参数解析保留只读选项 $flags', async ({ flags, plan, inspectRemote }) => {
  vi.resetModules()
  process.argv = ['node', 'hai', 'deploy', 'isolated-fixture', ...flags]
  await import('../src/cli-main.js')
  expect(observed.deploy).toHaveBeenCalledOnce()
  expect(observed.deploy.mock.calls[0]![0], JSON.stringify(observed.deploy.mock.calls[0]![0])).toMatchObject({ plan, inspectRemote, yes: true })
})
