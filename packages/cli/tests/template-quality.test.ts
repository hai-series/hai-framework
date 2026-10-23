import type { Linter } from 'eslint'
import type { AppType } from '../src/cli-types.js'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { ESLint } from 'eslint'
import ts from 'typescript'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { createProject } from '../src/commands/cli-create.js'
import { buildTemplateContext, generateFromTemplates } from '../src/commands/cli-template-engine.js'

/** 每次运行独有的目录，避免进程 ID 复用导致误删其他运行中的工程。 */
let tmpRoot = ''
const linters = new Map<string, ESLint>()
const mobileProjects = new Map<boolean, string>()

const projectTypes: AppType[] = ['admin', 'website', 'h5', 'api', 'mobile-app', 'fullstack']
const linterNames = ['admin', 'website', 'h5', 'api', 'mobile-app', 'fullstack', 'web', 'app', 'desktop'] as const
const svelteAppNames = ['admin', 'website', 'h5', 'mobile-app', 'web', 'app', 'desktop'] as const

beforeAll(async () => {
  tmpRoot = await mkdtemp(path.join(process.cwd(), '.tmp-template-quality-'))
  for (const appType of projectTypes) {
    const name = `quality-${appType}`
    const projectPath = path.join(tmpRoot, name)
    const context = buildTemplateContext({ name, appType, features: [], packageManager: 'pnpm' })
    await generateFromTemplates(projectPath, context)
    linters.set(appType, new ESLint({ cwd: projectPath, overrideConfigFile: path.join(projectPath, 'eslint.config.js') }))
    if (appType === 'fullstack') {
      for (const target of ['web', 'app', 'desktop']) {
        const frontendPath = path.join(projectPath, 'apps', `${name}-${target}`)
        linters.set(target, new ESLint({ cwd: frontendPath, overrideConfigFile: path.join(frontendPath, 'eslint.config.js') }))
      }
    }
  }
  // 两个真实创建分支共享同一套 lint 配置；只初始化已有 mobile linter，不重复加载插件。
  for (const encrypted of [true, false]) {
    const cwd = path.join(tmpRoot, `mobile-transport-${encrypted}`)
    await createProject({ name: 'mobile-test', appType: 'mobile-app', template: 'custom', features: encrypted ? ['iam'] : ['api-client', 'capacitor'], yes: true, install: false, git: false, deploy: false, packageManager: 'pnpm', cwd, examples: false })
    mobileProjects.set(encrypted, path.join(cwd, 'mobile-test'))
  }
  // 首次初始化会加载全部 lint 插件，放在有明确超时的准备阶段。
  for (const eslint of linters.values()) {
    await eslint.lintText('export const value = 1\n', { filePath: 'src/quality.ts' })
  }
}, 120_000)

afterAll(async () => {
  if (!tmpRoot)
    return
  const target = path.resolve(tmpRoot)
  if (path.dirname(target) !== process.cwd() || !path.basename(target).startsWith('.tmp-template-quality-'))
    throw new Error('Unexpected template quality cleanup directory')
  // Windows 扫描器可能短暂持有刚生成的文件；只在已确认归属的目录内重试。
  await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
})

async function lint(name: string, code: string, filePath = 'src/quality.ts'): Promise<Linter.LintMessage[]> {
  const eslint = linters.get(name)
  if (!eslint)
    throw new Error(`Missing generated linter: ${name}`)
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages
}

async function lintFiles(name: string, patterns: string[]): Promise<Linter.LintMessage[]> {
  const eslint = linters.get(name)
  if (!eslint)
    throw new Error(`Missing generated linter: ${name}`)
  const results = await eslint.lintFiles(patterns)
  return results.flatMap(result => result.messages.filter(message => message.severity === 2))
}

describe('实际移动工程的静态消费契约', () => {
  it.each([true, false])('crypto=%s 的依赖、catalog 和公开配置与实际消费者一致', async (encrypted) => {
    const project = mobileProjects.get(encrypted)
    if (!project)
      throw new Error('Missing generated mobile project')
    const manifest = JSON.parse(await readFile(path.join(project, 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
    const workspace = parse(await readFile(path.join(project, 'pnpm-workspace.yaml'), 'utf8')) as { catalog: Record<string, string> }
    const consumer = await readFile(path.join(project, 'src/lib/api.ts'), 'utf8')
    const vite = await readFile(path.join(project, 'vite.config.ts'), 'utf8')
    const environment = await readFile(path.join(project, '.env.example'), 'utf8')
    expect(Boolean(manifest.dependencies['@h-ai/crypto'])).toBe(encrypted)
    expect(Boolean(workspace.catalog['@h-ai/crypto'])).toBe(encrypted)
    expect(consumer.includes('from \'@h-ai/crypto\'')).toBe(encrypted)
    expect(vite.includes('apiTransport: process.env.PUBLIC_API_TRANSPORT')).toBe(encrypted)
    if (encrypted) {
      expect(environment).toContain('PUBLIC_API_TRANSPORT=')
      expect(environment).toContain('PUBLIC_API_KEY_EXCHANGE_PATH=')
    }
    expect(manifest.dependencies['@h-ai/reldb']).toBeUndefined()
    expect(manifest.dependencies['@h-ai/iam']).toBeUndefined()
    expect(manifest.dependencies['@h-ai/cache']).toBeUndefined()
    expect(await lint('mobile-app', consumer, 'src/lib/api.ts')).toEqual([])
    expect(await lint('mobile-app', vite, 'vite.config.ts')).toEqual([])
  }, 30_000)

  it('crypto 开关的实际消费者一次解析公共类型声明并保持严格检查', () => {
    const consumers = [...mobileProjects.values()].map(project => path.join(project, 'src/lib/api.ts'))
    expect(consumers).toHaveLength(2)
    // 复用仓库已安装的真实声明，不把静态消费检查当作独立安装验收。
    const program = ts.createProgram(consumers, { noEmit: true, strict: true, skipLibCheck: true, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, moduleResolution: ts.ModuleResolutionKind.Bundler, types: ['node', 'vite/client'] })
    const diagnostics = ts.getPreEmitDiagnostics(program)
    expect(diagnostics.map(item => ts.flattenDiagnosticMessageText(item.messageText, '\n'))).toEqual([])
  }, 30_000)
})

// 共享规则的语法边界只跑一套；各生成配置仍用真实 ESLint 验证接线和覆盖规则。
describe('共享质量规则', () => {
  const name = 'admin'
  it.each([
    ['显式 any', 'export const value: any = 1\n', 'ts/no-explicit-any'],
    ['console.log', 'console.log(\'value\')\n', 'no-console'],
    ['ts-ignore', '// @ts-ignore\nexport const value: string = 1\n', 'ts/ban-ts-comment'],
    ['ts-nocheck', '// @ts-nocheck\nexport const value: string = 1\n', 'ts/ban-ts-comment'],
    ['无理由类型抑制', '// @ts-expect-error\nexport const value: string = 1\n', 'ts/ban-ts-comment'],
    ['无理由 lint 豁免', '// eslint-disable-next-line no-console\nconsole.log(\'value\')\n', 'eslint-comments/require-description'],
    ['整文件清空 lint', '/* eslint-disable -- 这里希望忽略整份文件的全部规则 */\nconsole.log(\'value\')\n', 'eslint-comments/no-unlimited-disable'],
    ['双重断言', 'export const value = {} as unknown as { value: string }\n', 'no-restricted-syntax'],
    ['包内部源码', 'export { core } from \'@h-ai/core/src/index.js\'\n', 'no-restricted-imports'],
    ['动态包内部源码', 'export const value = import(\'@h-ai/core/dist/index.js\')\n', 'no-restricted-syntax'],
    ['敏感 token 持久化', 'localStorage.setItem(\'accessToken\', \'value\')\n', 'no-restricted-syntax'],
    ['window token 持久化', 'window.localStorage.setItem(\'refresh_token\', \'value\')\n', 'no-restricted-syntax'],
  ])('阻止%s', async (_label, code, ruleId) => {
    expect(await lint(name, code)).toEqual(expect.arrayContaining([expect.objectContaining({ ruleId, severity: 2 })]))
  })

  it('js 同样强制禁止 console', async () => {
    expect(await lint(name, 'console.warn(\'value\')\n', 'src/quality.js')).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'no-console', severity: 2 }),
    ]))
  })

  it('js 变量用于实际表达式时不会被误判为类型引用', async () => {
    expect(await lint(name, 'const value = 1\nexport const result = value + 1\n', 'src/quality.js')).toEqual([])
  })

  it('js 未使用变量仍会失败', async () => {
    expect(await lint(name, 'const unused = 1\nexport const result = 2\n', 'src/quality.js')).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'unused-imports/no-unused-vars', severity: 2 }),
    ]))
  })

  it('js 未使用导入仍会失败', async () => {
    expect(await lint(name, 'import fs from \'node:fs\'\n\nexport const result = 2\n', 'src/quality.js')).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'unused-imports/no-unused-imports', severity: 2 }),
    ]))
  })

  it.each([
    ['公开入口', 'export { core } from \'@h-ai/core\'\nexport { createIamClient } from \'@h-ai/iam/client\'\n'],
    ['合理局部第三方断言', '// eslint-disable-next-line no-restricted-syntax -- 第三方库返回的对象缺少声明，已验证 value 的类型\nexport const value = {} as unknown as { value: string }\n'],
    ['说明类型抑制', '// @ts-expect-error: 第三方声明尚未支持当前浏览器 API，升级后删除\nexport const value: string = 1\n'],
    ['非敏感主题存储', 'localStorage.setItem(\'theme\', \'dark\')\n'],
    ['集成调用及显式异常', 'export async function fetchStatus(url: URL) {\n  const response = await fetch(url)\n  if (!response.ok)\n    throw new Error(\'Upstream unavailable\')\n  return response.status\n}\n'],
  ])('保留%s', async (_label, code) => {
    const messages = await lint(name, code)
    expect(messages).toEqual([])
  })
})

describe.each(linterNames.filter(name => name !== 'admin'))('生成项目 %s 的质量规则接线', (name) => {
  it('实际配置保留全部禁止规则及 JS 作用域检查', async () => {
    const code = `/* eslint-disable */
// @ts-ignore
// @ts-nocheck
// @ts-expect-error
export const value: any = {} as unknown as { value: string }
console.log(value)
export { core } from '@h-ai/core/src/index.js'
export const internal = import('@h-ai/core/dist/index.js')
localStorage.setItem('accessToken', 'value')
window.localStorage.setItem('refresh_token', 'value')
`
    // 无限禁用本身应失败；其余规则另用未禁用代码验证，避免豁免掩盖接线缺失。
    expect(await lint(name, code)).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'eslint-comments/no-unlimited-disable', severity: 2 }),
      expect.objectContaining({ ruleId: 'eslint-comments/require-description', severity: 2 }),
    ]))
    const messages = await lint(name, code.replace('/* eslint-disable */\n', ''))
    for (const ruleId of ['ts/no-explicit-any', 'ts/ban-ts-comment', 'no-console', 'no-restricted-syntax', 'no-restricted-imports'])
      expect(messages).toEqual(expect.arrayContaining([expect.objectContaining({ ruleId, severity: 2 })]))
    const javascript = await lint(name, 'import fs from \'node:fs\'\n\nconst unused = 1\nconsole.warn(\'value\')\n', 'src/quality.js')
    for (const ruleId of ['no-console', 'unused-imports/no-unused-vars', 'unused-imports/no-unused-imports'])
      expect(javascript).toEqual(expect.arrayContaining([expect.objectContaining({ ruleId, severity: 2 })]))
  })

  it('公开入口、合理豁免和实际使用的 JS 表达式可通过', async () => {
    expect(await lint(name, `export { core } from '@h-ai/core'
export { createIamClient } from '@h-ai/iam/client'
// eslint-disable-next-line no-restricted-syntax -- 第三方声明缺少字段，已核对实际返回类型
export const value = {} as unknown as { value: string }
// @ts-expect-error: 第三方声明尚未支持当前浏览器 API，升级后删除
export const text: string = 1
localStorage.setItem('theme', 'dark')
`)).toEqual([])
    expect(await lint(name, 'const value = 1\nexport const result = value + 1\n', 'src/quality.js')).toEqual([])
  })
})

describe.each(['api', 'fullstack'])('生成 workspace %s 的根门禁', (name) => {
  it('根配置、构建和端到端入口也通过实际 eslint 检查', async () => {
    const eslint = linters.get(name)
    if (!eslint)
      throw new Error(`Missing generated linter: ${name}`)
    const results = await eslint.lintFiles(['*.js', '*.ts', 'e2e'])
    expect(results.flatMap(result => result.messages.filter(message => message.severity === 2).map(message => ({ filePath: result.filePath, ...message })))).toEqual([])
  })
})

describe.each(svelteAppNames)('生成项目 %s 的 Svelte 门禁', (name) => {
  it('svelte.config.js 通过实际 eslint 检查', async () => {
    expect(await lintFiles(name, ['svelte.config.js'])).toEqual([])
  })

  it('svelte 脚本的 any 和 console 进入同一门禁', async () => {
    const messages = await lint(name, '<script lang="ts">\n  let value: any = 1\n  console.log(value)\n</script>\n<p>{value}</p>\n', 'src/Quality.svelte')
    expect(messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'ts/no-explicit-any', severity: 2 }),
      expect.objectContaining({ ruleId: 'no-console', severity: 2 }),
    ]))
  })
})

describe('固定窗口限流模板', () => {
  it.each([false, true])('cache=%s 的实际hooks可通过生成项目lint', async (enabled) => {
    const projectPath = path.join(tmpRoot, `rate-limit-${enabled}`)
    await generateFromTemplates(projectPath, buildTemplateContext({ name: `rate-limit-${enabled}`, appType: 'website', features: enabled ? ['cache'] : [], packageManager: 'pnpm' }))
    const eslint = new ESLint({ cwd: projectPath, overrideConfigFile: path.join(projectPath, 'eslint.config.js') })
    const results = await eslint.lintFiles(['src/hooks.server.ts'])
    expect(results.flatMap(result => result.messages.filter(message => message.severity === 2))).toEqual([])
  })
})
