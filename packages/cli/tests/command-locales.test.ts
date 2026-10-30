/** create/add/init 的终端语言、交互渲染及真实可执行入口回归。 */
import type { PromptObject } from 'prompts'
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
import { addModule } from '../src/commands/cli-add.js'
import { createProject } from '../src/commands/cli-create.js'
import { initProject } from '../src/commands/cli-init.js'

const roots: string[] = []
const frames: string[] = []
const spinner = vi.hoisted(() => ({ start: vi.fn(), succeed: vi.fn(), fail: vi.fn() }))
vi.mock('ora', () => ({ default: () => spinner }))

beforeEach(() => {
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    frames.push(String(chunk))
    return true
  })
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    frames.push(String(chunk))
    return true
  })
})
afterEach(async () => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  frames.length = 0
  core.i18n.setGlobalLocale('zh-CN')
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== tmpdir() || !path.basename(root).startsWith('hai-cli-locale-'))
      throw new Error('Unexpected CLI locale fixture cleanup path')
    await rm(root, { recursive: true, force: true })
  }
})

/** 仅创建本测试拥有的目录；不安装依赖、不初始化 Git。 */
async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'hai-cli-locale-'))
  roots.push(root)
  return root
}

/** 收集当前终端与 spinner 的用户消息。 */
function output(): string {
  return stripVTControlCharacters([...frames, ...spinner.start.mock.calls.flat(), ...spinner.succeed.mock.calls.flat(), ...spinner.fail.mock.calls.flat()].join('\n'))
}

/** 使用 prompts 真实终端渲染器，不替换选择项或校验逻辑。 */
async function render(question: PromptObject): Promise<string> {
  const stdin = new PassThrough()
  const stdout = Object.assign(new PassThrough(), { columns: 100 })
  const chunks: string[] = []
  stdout.on('data', chunk => chunks.push(String(chunk)))
  try {
    const pending = prompts({ ...question, stdin, stdout })
    stdin.emit('keypress', '', { name: 'return' })
    await pending
    return stripVTControlCharacters(chunks.join(''))
  }
  finally {
    stdin.destroy()
    stdout.destroy()
  }
}

describe.each(['zh-CN', 'en-US', 'ja-JP'])('create/add/init locale %s', (locale) => {
  beforeEach(() => core.i18n.setGlobalLocale(locale))

  it('真实创建 API 工程并本地化完成提示，目标语言配置独立保留', async () => {
    const root = await fixture()
    await createProject({ cwd: root, name: 'shop', appType: 'api', defaults: true, install: false, git: false, deploy: false, moduleConfigs: { core: { defaultLocale: 'zh-CN' } } })
    expect(await fse.pathExists(path.join(root, 'shop/apps/shop-serv/src/index.ts'))).toBe(true)
    expect(await readFile(path.join(root, 'shop/apps/shop-serv/config/_core.yml'), 'utf8')).toContain('zh-CN')
    if (locale === 'en-US') {
      expect(output()).not.toMatch(/\p{Script=Han}/u)
      expect(output()).toContain('Project created')
      expect(output()).toContain('Database')
    }
    else if (locale === 'ja-JP') {
      expect(output()).toContain('プロジェクトを作成しました')
      expect(output()).toContain('データベース')
    }
    else {
      expect(output()).toContain('项目创建成功')
      expect(output()).toContain('数据库')
    }
  })

  it('添加模块、补配置、force 覆盖及缺少项目均使用同一语言', async () => {
    const root = await fixture()
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'locale-app', version: '1.0.0', type: 'module', dependencies: { '@h-ai/core': '*' } }))
    await addModule({ cwd: root, module: 'cache', install: false })
    await rm(path.join(root, 'config/_cache.yml'))
    await initProject({ cwd: root, force: true })
    await initProject({ cwd: path.join(root, 'missing') })
    expect(await fse.pathExists(path.join(root, 'config/_cache.yml'))).toBe(true)
    expect(await fse.readJson(path.join(root, 'package.json'))).toHaveProperty('dependencies.@h-ai/cache')
    if (locale === 'en-US') {
      expect(output()).not.toMatch(/\p{Script=Han}/u)
      expect(output()).toContain('Module cache added')
      expect(output()).toContain('Project configuration initialized')
      expect(output()).toContain('No project found')
    }
    else if (locale === 'ja-JP') {
      expect(output()).toContain('モジュール cache を追加しました')
      expect(output()).toContain('プロジェクト設定を初期化しました')
      expect(output()).toContain('プロジェクトが見つかりません')
    }
    else {
      expect(output()).toContain('模块 cache 添加成功')
      expect(output()).toContain('项目配置初始化完成')
    }
  })

  it('交互应用/模板/功能/模块目录与名称校验通过真实终端渲染', async () => {
    const root = await fixture()
    const selected = vi.spyOn(prompts.prompts, 'select').mockImplementation(() => 'admin')
    const typed = vi.spyOn(prompts.prompts, 'text').mockImplementation(() => 'bad/name')
    await expect(createProject({ cwd: root, name: '', moduleConfigs: {}, install: false, git: false, packageManager: 'pnpm', deploy: false })).rejects.toThrow('bad/name')
    const appQuestion = selected.mock.calls[0]![0]
    const nameQuestion = typed.mock.calls[0]![0]
    selected.mockRestore()
    typed.mockRestore()
    expect(await render(appQuestion)).toContain(locale === 'en-US' ? 'Application type' : locale === 'ja-JP' ? 'アプリケーション種別' : '应用类型')
    const validate = nameQuestion.validate
    expect(typeof validate).toBe('function')
    if (typeof validate === 'function') {
      const invalid = await validate('../escape', {}, nameQuestion)
      expect(invalid).toBe(locale === 'en-US' ? 'Project names may contain only lowercase letters, digits and hyphens' : locale === 'ja-JP' ? 'プロジェクト名には小文字の英字、数字、ハイフンのみ使用できます' : '项目名称只能包含小写字母、数字和连字符')
    }
    expect(await fse.pathExists(path.join(root, 'bad'))).toBe(false)
    if (locale === 'en-US')
      expect(output()).not.toMatch(/\p{Script=Han}/u)
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'locale-app', version: '1.0.0', dependencies: { '@h-ai/core': '*' } }))
    const addChoice = vi.spyOn(prompts.prompts, 'select').mockImplementation(() => undefined)
    await addModule({ cwd: root, install: false })
    const addQuestion = addChoice.mock.calls[0]![0]
    addChoice.mockRestore()
    const rendered = await render(addQuestion)
    expect(rendered).toContain(locale === 'en-US' ? 'Select a module' : locale === 'ja-JP' ? 'モジュールを選択してください' : '选择要添加的模块')
    if (locale === 'en-US')
      expect(rendered).not.toMatch(/\p{Script=Han}/u)
  })

  it('完整预设的模块配置动态读取当前语言，并移除功能多选', async () => {
    const root = await fixture()
    const selected = vi.spyOn(prompts.prompts, 'select').mockImplementation(question => Array.isArray(question.choices) ? question.choices[0]?.value : undefined)
    const features = vi.spyOn(prompts.prompts, 'multiselect').mockImplementation(() => ['iam', 'ai', 'storage'])
    const typed = vi.spyOn(prompts.prompts, 'text').mockImplementation(question => question.initial)
    vi.spyOn(prompts.prompts, 'confirm').mockImplementation(() => false)
    // 非法名称在选项收集后拒绝，仍完整走过所有配置提示，且不会创建目录。
    await expect(createProject({ cwd: root, name: 'bad/name', appType: 'admin', install: false, git: false, deploy: false, packageManager: 'pnpm' })).rejects.toThrow('bad/name')
    const questions = selected.mock.calls.map(([question]) => question)
    expect(features).not.toHaveBeenCalled()
    expect(questions.length).toBeGreaterThan(0)
    selected.mockRestore()
    features.mockRestore()
    typed.mockRestore()
    const descriptions = questions.map(question => JSON.stringify({ message: question.message, choices: question.choices })).join('\n')
    if (locale === 'en-US') {
      expect(descriptions).not.toMatch(/\p{Script=Han}/u)
      expect(output()).not.toMatch(/\p{Script=Han}/u)
      expect(descriptions).toContain('Database type')
      expect(descriptions).toContain('Storage type')
    }
    else if (locale === 'ja-JP') {
      expect(descriptions).toContain('データベース種別')
      expect(descriptions).toContain('ストレージ種別')
      expect(descriptions).toContain('日本語（ja-JP）')
    }
    else {
      expect(descriptions).toContain('数据库类型')
    }
    expect(await fse.pathExists(path.join(root, 'bad'))).toBe(false)
  })

  it('取消与文件写入异常保留本地化前缀及原始诊断', async () => {
    const root = await fixture()
    vi.spyOn(prompts.prompts, 'text').mockImplementation(() => {
      throw new Error('Terminal cancelled')
    })
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('Cancelled test process')
    })
    await expect(createProject({ cwd: root, name: '' })).rejects.toThrow('Cancelled test process')
    expect(output()).toContain(locale === 'en-US' ? 'Cancelled' : locale === 'ja-JP' ? 'キャンセルしました' : '已取消')
    exit.mockRestore()
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'locale-app', version: '1.0.0', dependencies: { '@h-ai/core': '*' } }))
    vi.spyOn(fse, 'writeJson').mockRejectedValue(new Error('Filesystem unavailable'))
    await expect(addModule({ cwd: root, module: 'cache', install: false })).rejects.toThrow('Filesystem unavailable')
    expect(output()).toContain(locale === 'en-US' ? 'Adding module failed' : locale === 'ja-JP' ? 'モジュールの追加に失敗しました' : '添加模块失败')
    if (locale === 'en-US')
      expect(output()).not.toMatch(/\p{Script=Han}/u)
  })
})

describe.skipIf(process.env.HAI_CLI_RUN_LOCALE_GATES !== '1')('built create/add/init locale gates', () => {
  it.each(['zh-CN', 'en-US', 'ja-JP'])('实际 Node 入口完成创建/添加/初始化/失败并保存可消费产物 %s', async (locale) => {
    const root = await fixture()
    const env = { ...process.env, HAI_CORE_DEFAULTLOCALE: locale }
    const binary = path.resolve('dist/index.js')
    const run = (cwd: string, args: string[]) => spawnSync(process.execPath, [binary, '--cwd', cwd, ...args], { env, encoding: 'utf8', windowsHide: true, timeout: 30_000 })
    const created = run(root, ['create', 'shop', '--type', 'api', '--defaults', '--no-install', '--no-git', '--no-deploy'])
    expect(created.status).toBe(0)
    const target = path.join(root, 'shop')
    const service = path.join(target, 'apps/shop-serv')
    const added = run(service, ['add', 'cache', '--no-install'])
    expect(added.status).toBe(0)
    const initialized = run(service, ['init', '--force'])
    expect(initialized.status).toBe(0)
    const failed = run(service, ['add', 'unknown-module', '--no-install'])
    const invalidName = run(root, ['create', 'BAD_NAME', '--type', 'api', '--defaults', '--no-install', '--no-git', '--no-deploy'])
    expect(invalidName.status).toBe(1)
    expect(await fse.pathExists(path.join(root, 'BAD_NAME'))).toBe(false)
    const diagnostics = [created, added, initialized, failed].map(r => r.stdout + r.stderr).join('\n')
    expect(await fse.pathExists(path.join(target, 'apps/shop-serv/src/index.ts'))).toBe(true)
    expect(await fse.pathExists(path.join(service, 'config/_cache.yml'))).toBe(true)
    if (locale === 'en-US') {
      expect(diagnostics).not.toMatch(/\p{Script=Han}/u)
      expect(diagnostics).toContain('Unknown module: unknown-module')
    }
    else if (locale === 'ja-JP') {
      expect(diagnostics).toContain('プロジェクトを作成しました')
      expect(diagnostics).toContain('不明なモジュール：unknown-module')
    }
    else {
      expect(diagnostics).toContain('项目创建成功')
    }
  })
})
