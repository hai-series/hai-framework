import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const commands = vi.hoisted(() => ({
  addModule: vi.fn(),
  buildCommand: vi.fn(),
  createProject: vi.fn(),
  deployCommand: vi.fn(),
  feedbackCommand: vi.fn(),
  generate: vi.fn(),
  initProject: vi.fn(),
  upgradeCommand: vi.fn(),
}))

vi.mock('../src/commands/cli-commands.js', () => commands)

const originalArgv = process.argv
let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'hai-create-options-'))
  vi.resetModules()
})

afterEach(async () => {
  process.argv = originalArgv
  vi.clearAllMocks()
  await rm(root, { recursive: true, force: true })
})

describe.each(['website', 'fullstack'])('%s 创建命令参数边界', (appType) => {
  it.each([
    '--features',
    '--features=',
    '--features=ai',
    '--template=admin',
    '--examples',
    '--yes',
  ])(
    '真实参数解析器在生成工程前拒绝未声明选项 %s',
    async (option) => {
      // 旧选项由 CLI 参数解析器统一拒绝，不给内部创建函数恢复兼容参数。
      process.argv = [
        process.execPath,
        'hai',
        'create',
        'rejected-project',
        '--type',
        appType,
        '--cwd',
        root,
        '--defaults',
        '--no-install',
        '--no-git',
        option,
      ]
      await expect(import('../src/cli-main.js')).rejects.toThrow(/Unknown option/)
      expect(commands.createProject).not.toHaveBeenCalled()
      expect(await readdir(root)).toEqual([])
    },
  )
})
