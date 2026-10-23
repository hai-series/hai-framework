import type { Linter } from 'eslint'
import type { AppType } from '../src/cli-types.js'
import path from 'node:path'
import { ESLint } from 'eslint'
import fse from 'fs-extra'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTemplateContext, generateFromTemplates } from '../src/commands/cli-template-engine.js'

const tmpRoot = path.join(process.cwd(), `.tmp-template-quality-${process.pid}`)
const linters = new Map<string, ESLint>()

const projectTypes: AppType[] = ['admin', 'website', 'h5', 'api', 'mobile-app', 'fullstack']
const linterNames = ['admin', 'website', 'h5', 'api', 'mobile-app', 'fullstack', 'web', 'app', 'desktop'] as const
const svelteAppNames = ['admin', 'website', 'h5', 'mobile-app', 'web', 'app', 'desktop'] as const

beforeAll(async () => {
  await fse.remove(tmpRoot)
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
  // 首次初始化会加载全部 lint 插件，放在有明确超时的准备阶段。
  for (const eslint of linters.values()) {
    await eslint.lintText('export const value = 1\n', { filePath: 'src/quality.ts' })
  }
}, 120_000)

afterAll(async () => {
  await fse.remove(tmpRoot)
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

describe.each(linterNames)('生成项目 %s 的质量门禁', (name) => {
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
