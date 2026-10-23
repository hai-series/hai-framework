import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { PassThrough } from 'node:stream'
import { stripVTControlCharacters } from 'node:util'
import { core } from '@h-ai/core'
import stringWidth from 'fast-string-width'
import prompts from 'prompts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createProject } from '../src/commands/cli-create.js'

const commandMocks = vi.hoisted(() => ({ execSync: vi.fn() }))
vi.mock('node:child_process', async importOriginal => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  execSync: commandMocks.execSync,
}))

const temporaryRoots: string[] = []
const originalColumns = Object.getOwnPropertyDescriptor(process.stdout, 'columns')
afterEach(async () => {
  vi.restoreAllMocks()
  core.i18n.setGlobalLocale('zh-CN')
  if (originalColumns)
    Object.defineProperty(process.stdout, 'columns', originalColumns)
  else
    Reflect.deleteProperty(process.stdout, 'columns')
  commandMocks.execSync.mockReset()
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('create 用户输出', () => {
  it.each([
    { locale: 'zh-CN', exitCode: '退出码: 1' },
    { locale: 'en-US', exitCode: 'Exit code: 1' },
    { locale: 'ja-JP', exitCode: '終了コード: 1' },
  ])('安装失败向 stderr 显示子进程原因与退出码 ($locale)', async ({ locale, exitCode }) => {
    core.i18n.setGlobalLocale(locale)
    const root = await mkdtemp(path.join(tmpdir(), 'hai-create-error-'))
    temporaryRoots.push(root)
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    commandMocks.execSync.mockImplementation(() => {
      throw Object.assign(new Error('Command failed'), { status: 1, stdout: 'Install progress', stderr: 'ERR_PNPM_TEST_FAILURE: registry unavailable' })
    })

    await expect(createProject({ name: 'install-error', appType: 'fullstack', frontends: ['web'], yes: true, install: true, git: false, packageManager: 'pnpm', cwd: root })).rejects.toThrow('registry unavailable')
    const errorOutput = stderr.mock.calls.map(([message]) => String(message)).join('')
    expect(errorOutput).toContain('ERR_PNPM_TEST_FAILURE: registry unavailable')
    expect(errorOutput).toContain(exitCode)
    expect(errorOutput).toContain('pnpm install')
    expect(stdout.mock.calls.map(([message]) => String(message)).join('')).not.toContain('"level":')
  })

  it.each([60, 80, 120].flatMap(columns => ['zh-CN', 'ja-JP'].map(locale => ({ columns, locale }))))('$locale select/multiselect 在 $columns 列终端重绘与确认时清除全部行', async ({ columns, locale }) => {
    core.i18n.setGlobalLocale(locale)
    Object.defineProperty(process.stdout, 'columns', { value: columns, configurable: true })
    const root = await mkdtemp(path.join(tmpdir(), 'hai-create-prompt-'))
    temporaryRoots.push(root)
    const select = vi.spyOn(prompts.prompts, 'select').mockImplementation(() => 'fullstack')
    const multiselect = vi.spyOn(prompts.prompts, 'multiselect').mockImplementation(() => ['web', 'app', 'desktop'])
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    await createProject({ name: 'prompt-test', examples: false, install: false, git: false, packageManager: 'pnpm', cwd: root })
    const questions = [select.mock.calls[0][0], multiselect.mock.calls[0][0]]
    select.mockRestore()
    multiselect.mockRestore()

    for (const question of questions) {
      const stdin = new PassThrough()
      const stdout = Object.assign(new PassThrough(), { columns })
      const frames: string[] = []
      stdout.on('data', chunk => frames.push(String(chunk)))
      const answer = prompts({ ...question, stdin, stdout })
      const message = String(question.message)
      let previous = frames.find(frame => frame.includes(message))!
      expect(previous).toBeDefined()
      for (const name of ['down', 'down', 'down', 'down', 'down', 'return']) {
        const start = frames.length
        stdin.emit('keypress', '', { name })
        const next = frames.slice(start).find(frame => frame.includes(message))!
        expect(next).toBeDefined()
        const physicalRows = stripVTControlCharacters(previous).split('\n').reduce((rows, line) => rows + Math.max(1, Math.ceil(stringWidth(line) / columns)), 0)
        expect(frames.slice(start).join('').split('\u001B[2K').length - 1).toBe(physicalRows)
        previous = next
      }
      await answer
      const finalText = stripVTControlCharacters(previous)
      expect(finalText).not.toContain('mini 管理系统')
      expect(finalText).not.toContain('浏览器 Web 应用')
      stdin.destroy()
      stdout.destroy()
    }
  })
})
