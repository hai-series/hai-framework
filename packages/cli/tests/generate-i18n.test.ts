/** 生成器用户文本的交互、非交互、取消和真实进程语言选择。 */
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { PassThrough } from 'node:stream'
import { stripVTControlCharacters } from 'node:util'
import { core } from '@h-ai/core'
import fse from 'fs-extra'
import prompts from 'prompts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cliM } from '../src/cli-i18n.js'
import { generate } from '../src/commands/cli-generate.js'

const roots: string[] = []
const spinner = vi.hoisted(() => ({ start: vi.fn(), succeed: vi.fn(), fail: vi.fn() }))
vi.mock('ora', () => ({ default: () => spinner }))

beforeEach(() => {
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
})
afterEach(async () => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  core.i18n.setGlobalLocale('zh-CN')
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== tmpdir() || !path.basename(root).startsWith('hai-generate-i18n-'))
      throw new Error('Unexpected locale fixture cleanup path')
    await rm(root, { recursive: true, force: true })
  }
})

/** 建立可真实消费组件/文件路由的项目清单，不加载外部服务。 */
async function project(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'hai-generate-i18n-'))
  roots.push(root)
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'locale-fixture', type: 'module', dependencies: { '@h-ai/core': '*', '@h-ai/kit': '*', '@h-ai/reldb': '*', '@sveltejs/kit': '*', 'svelte': '*', 'zod': '*' } }))
  return root
}

/** 真实渲染 select/text，用内存终端输入验证翻译和校验状态。 */
async function renderPrompt(question: prompts.PromptObject, text = ''): Promise<string> {
  const stdin = new PassThrough()
  const stdout = Object.assign(new PassThrough(), { columns: 100 })
  const frames: string[] = []
  stdout.on('data', data => frames.push(String(data)))
  try {
    const pending = prompts({ ...question, stdin, stdout })
    if (text) {
      stdin.emit('keypress', '', { name: 'return' })
      await new Promise(resolve => setImmediate(resolve))
      stdin.emit('keypress', text, { name: 'i' })
    }
    stdin.emit('keypress', '', { name: 'return' })
    await pending
    return stripVTControlCharacters(frames.join(''))
  }
  finally {
    stdin.destroy()
    stdout.destroy()
  }
}

describe.each(['zh-CN', 'en-US'])('generate locale %s', (locale) => {
  beforeEach(() => {
    core.i18n.setGlobalLocale(locale)
  })

  it('交互描述、选择、名称、空值校验与终端重绘均使用当前语言', async () => {
    const root = await project()
    const select = vi.spyOn(prompts.prompts, 'select').mockImplementation(() => 'component')
    const text = vi.spyOn(prompts.prompts, 'text').mockImplementation(() => 'InfoCard')
    await generate({ cwd: root })
    const selectQuestion = select.mock.calls[0]![0]
    const textQuestion = text.mock.calls[0]![0]
    expect(selectQuestion.message).toBe(cliM('cli_generateTypePrompt'))
    expect(textQuestion.message).toBe(cliM('cli_generateNamePrompt'))
    const descriptions = [cliM('cli_generatePageDescription'), cliM('cli_generateComponentDescription'), cliM('cli_generateApiDescription'), cliM('cli_generateModelDescription'), cliM('cli_generateMigrationDescription')]
    const choices = selectQuestion.choices
    if (!Array.isArray(choices))
      throw new Error('Expected concrete generator choices')
    expect(choices.map(choice => choice.title)).toEqual(descriptions.map((description, i) => `${['page', 'component', 'api', 'model', 'migration'][i]} - ${description}`))
    select.mockRestore()
    text.mockRestore()
    const rendered = await renderPrompt(selectQuestion) + await renderPrompt(textQuestion, 'InfoCard')
    expect(rendered).toContain(cliM('cli_generateTypePrompt'))
    expect(rendered).toContain(cliM('cli_generateNameRequired'))
    if (locale === 'en-US')
      expect(rendered).not.toMatch(/\p{Script=Han}/u)
    expect(spinner.start).toHaveBeenCalledWith(cliM('cli_generateProgress', { params: { description: cliM('cli_generateComponentDescription') } }))
    expect(spinner.succeed).toHaveBeenCalledWith(cliM('cli_generateComplete'))
    expect(await readFile(path.join(root, 'src/lib/components/InfoCard.svelte'), 'utf8')).toContain('interface Props')
  })

  it('非交互五种生成类型描述、成功与文件列表无遗漏', async () => {
    const root = await project()
    for (const type of ['page', 'component', 'api', 'model', 'migration'] as const)
      await generate({ type, name: 'localized', cwd: root })
    expect(spinner.start).toHaveBeenCalledTimes(5)
    expect(spinner.succeed).toHaveBeenCalledTimes(5)
    for (const [message] of spinner.start.mock.calls) {
      if (locale === 'en-US')
        expect(message).not.toMatch(/\p{Script=Han}/u)
    }
    expect(vi.mocked(process.stdout.write).mock.calls.map(([message]) => String(message)).join('')).toContain(cliM('cli_generateFiles'))
  })

  it('取消交互有明确翻译，未进入生成或落盘', async () => {
    const root = await project()
    vi.spyOn(prompts.prompts, 'select').mockImplementation(() => {
      throw new Error('Terminal cancelled')
    })
    await expect(generate({ cwd: root })).rejects.toThrow(cliM('cli_generateCancelled'))
    expect(spinner.start).not.toHaveBeenCalled()
    expect(spinner.fail).toHaveBeenCalledWith(cliM('cli_generateFailed'))
    expect(await fse.pathExists(path.join(root, 'src'))).toBe(false)
  })

  it('未知类型、非法名称和文件冲突均输出当前语言的失败原因', async () => {
    const root = await project()
    await expect(generate({ type: 'toString' as never, name: 'unknown', cwd: root })).rejects.toThrow(cliM('cli_generateUnknownType', { params: { type: 'toString' } }))
    await expect(generate({ type: 'page', name: '../escape', cwd: root })).rejects.toThrow(cliM('cli_invalidGenerateName'))
    await generate({ type: 'component', name: 'existing', cwd: root })
    await expect(generate({ type: 'component', name: 'existing', cwd: root })).rejects.toThrow(cliM('cli_generateExists', { params: { path: path.join(root, 'src/lib/components/Existing.svelte') } }))
    const output = vi.mocked(process.stderr.write).mock.calls.map(([message]) => String(message)).join('')
    expect(output).toContain(cliM('cli_generateFailureDetail'))
    if (locale === 'en-US')
      expect(output).not.toMatch(/\p{Script=Han}/u)
  })

  it('提交与多个临时清理错误在用户终端中均保留', async () => {
    const root = await project()
    vi.spyOn(fse, 'rename').mockRejectedValue(new Error('Original write failure'))
    vi.spyOn(fse, 'unlink').mockRejectedValue(new Error('Temporary cleanup failure'))
    await expect(generate({ type: 'page', name: 'partial', cwd: root })).rejects.toThrow(AggregateError)
    const output = vi.mocked(process.stderr.write).mock.calls.map(([message]) => String(message)).join('')
    expect(output).toContain('Original write failure')
    expect(output).toContain('Temporary cleanup failure')
    expect(output).toContain(cliM('cli_generateRollbackFailed'))
  })
})

describe.skipIf(process.env.HAI_CLI_RUN_I18N_GATES !== '1')('built CLI locale environment gates', () => {
  it.each([
    { environment: { HAI_CORE_DEFAULTLOCALE: 'en-US', LANG: 'zh_CN.UTF-8' }, english: true },
    { environment: { HAI_CORE_DEFAULTLOCALE: 'zh-CN', LANG: 'en_US.UTF-8' }, english: false },
    { environment: { LC_ALL: 'en_GB.UTF-8', LC_MESSAGES: 'zh_CN', LANG: 'zh_CN' }, english: true },
    { environment: { LC_MESSAGES: 'en_US.UTF-8', LANG: 'zh_CN' }, english: true },
    { environment: { LANG: 'en_US.UTF-8' }, english: true },
    { environment: { HAI_CORE_DEFAULTLOCALE: ' ', LC_ALL: ' C.UTF-8 ' }, english: true },
    { environment: { LANG: 'POSIX' }, english: true },
    { environment: { LC_MESSAGES: 'zh_TW.UTF-8', LANG: 'en_US.UTF-8' }, english: false },
    { environment: { HAI_CORE_DEFAULTLOCALE: 'ja-JP', LANG: 'en_US.UTF-8' }, english: false },
  ])('真实进程的help/成功/失败按环境选择语言 $environment', async ({ environment, english }) => {
    const root = await project()
    const env = { ...process.env }
    for (const key of ['HAI_CORE_DEFAULTLOCALE', 'LC_ALL', 'LC_MESSAGES', 'LANG'])
      delete env[key]
    Object.assign(env, environment)
    const binary = path.resolve('dist/index.js')
    const run = (args: string[]) => spawnSync(process.execPath, [binary, '--cwd', root, ...args], { env, encoding: 'utf8', windowsHide: true, timeout: 30_000 })
    const help = run(['generate', '--help'])
    expect(help.status).toBe(0)
    const success = run(['generate', 'component', 'NativeCard'])
    expect(success.status).toBe(0)
    const failure = run(['generate', 'toString', 'Unknown'])
    expect(failure.status).toBe(1)
    const output = help.stdout + help.stderr + success.stdout + success.stderr + failure.stdout + failure.stderr
    if (english) {
      expect(output).not.toMatch(/\p{Script=Han}/u)
      expect(output).toContain('Generation complete')
      expect(output).toContain('Unknown generator type: toString')
    }
    else {
      expect(output).toContain('生成完成')
      expect(output).toContain('未知的生成器类型：toString')
    }
    expect(await fse.pathExists(path.join(root, 'src/lib/components/NativeCard.svelte'))).toBe(true)
  })
})
