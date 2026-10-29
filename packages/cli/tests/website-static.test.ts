import { existsSync, lstatSync, readdirSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { core } from '@h-ai/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProject, parseCreateFeatures } from '../src/commands/cli-create.js'
import { buildTemplateContext, generateFromTemplates } from '../src/commands/cli-template-engine.js'

let root: string
beforeEach(async () => {
  root = await mkdtemp(path.join(fileURLToPath(new URL('../../../tmp/', import.meta.url)), 'hai-static-template-'))
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
})
afterEach(async () => {
  vi.restoreAllMocks()
  await rm(root, { recursive: true, force: true })
})

describe('显式空模块选择', () => {
  it('none是空选择，正常模块去重且保留依赖解析入口', () => {
    expect(parseCreateFeatures('none')).toEqual([])
    expect(parseCreateFeatures(' db,cache,db ')).toEqual(['db', 'cache'])
  })

  it.each(['none,db', 'db,none', 'none,', '', ',', 'db,,cache', 'missing', '../db'])('在创建文件前拒绝互斥或无效列表：%s', (value) => {
    expect(() => parseCreateFeatures(value)).toThrow()
  })

  it('website明确不选模块保留core/UI及默认部署开发工具，省略参数仍保留原默认', async () => {
    const options = { appType: 'website' as const, yes: true, examples: false, install: false, git: false, packageManager: 'pnpm' as const, cwd: root }
    await createProject({ ...options, name: 'plain-site', features: parseCreateFeatures('none') })
    await createProject({ ...options, name: 'default-site' })
    const plain = JSON.parse(await readFile(path.join(root, 'plain-site/package.json'), 'utf8'))
    const standard = JSON.parse(await readFile(path.join(root, 'default-site/package.json'), 'utf8'))
    expect(plain.dependencies).toMatchObject({ '@h-ai/core': 'catalog:', '@h-ai/ui': 'catalog:' })
    expect(plain.dependencies['@h-ai/reldb']).toBeUndefined()
    expect(plain.dependencies['@h-ai/cache']).toBeUndefined()
    expect(plain.dependencies['@h-ai/iam']).toBeUndefined()
    expect(plain.devDependencies).toMatchObject({ '@h-ai/deploy': 'catalog:', '@sveltejs/adapter-static': '^3.0.10' })
    expect(standard.dependencies['@h-ai/reldb']).toBe('catalog:')
    expect(standard.dependencies['@h-ai/cache']).toBe('catalog:')
  })
})

async function staticScript(features: Parameters<typeof buildTemplateContext>[0]['features'] = []) {
  const project = path.join(root, 'site')
  await generateFromTemplates(project, buildTemplateContext({ name: 'site', appType: 'website', features, packageManager: 'pnpm' }))
  const helper = await readFile(path.join(project, 'scripts/public-base-path.mjs'), 'utf8')
  const website = await readFile(path.join(project, 'scripts/static-website.mjs'), 'utf8')
  return `${helper}\n${website}`.replace(/^import .+\n/gm, '').replace(/^export /gm, '')
}

function scriptContext(env: Record<string, string> = {}) {
  return { core, path, existsSync, lstatSync, readdirSync, process: { env, cwd: () => path.join(root, 'site') } }
}

describe('website静态构建边界', () => {
  it('默认SSR，显式静态按公开路径构建，非法路径与动态模块分别拒绝', async () => {
    const source = await staticScript()
    expect(runInNewContext(`${source}\nresolveStaticWebsite()`, scriptContext())).toMatchObject({ enabled: false, base: '' })
    expect(runInNewContext(`${source}\nresolveStaticWebsite()`, scriptContext({ HAI_BUILD_STATIC: '1', PUBLIC_BASE_PATH: '/hai-framework' }))).toMatchObject({ enabled: true, base: '/hai-framework' })
    for (const base of ['//host', '/a/../b', '/a/', '/a?b=1', '/a%2fb'])
      expect(() => runInNewContext(`${source}\nresolveStaticWebsite()`, scriptContext({ HAI_BUILD_STATIC: '1', PUBLIC_BASE_PATH: base }))).toThrow('PUBLIC_BASE_PATH')
    const dynamic = await staticScript(['db'])
    expect(() => runInNewContext(`${dynamic}\nresolveStaticWebsite()`, scriptContext({ HAI_BUILD_STATIC: '1' }))).toThrow('--features none')
  })

  it('只省略模板健康端点，拒绝自定义API、actions与未预渲染页面', async () => {
    const source = await staticScript()
    const evaluate = (routes: unknown[]) => runInNewContext(`${source}\nvalidateStaticRoutes(routes)`, { core, routes, process: { env: {} } })
    // 保留当前SvelteKit RouteDefinition的真实必填形状；普通页面也有api/page对象。
    const page = { id: '/', api: { methods: [] }, page: { methods: ['GET'] }, pattern: /^\/$/, prerender: true, segments: [], methods: ['GET'], config: {} }
    const health = { ...page, id: '/api/health', api: { methods: ['GET', 'HEAD'] }, page: { methods: [] }, prerender: false, methods: ['GET', 'HEAD'] }
    expect(() => evaluate([page, health])).not.toThrow()
    for (const route of [
      { ...page, id: '/api/orders', api: { methods: ['GET'] }, page: { methods: [] } },
      { ...page, id: '/dashboard', prerender: false },
      { ...page, id: '/partial', prerender: 'auto' },
      { ...page, id: '/contact', page: { methods: ['GET', 'POST'] } },
      { ...health, api: { methods: ['GET', 'POST'] }, methods: ['GET', 'POST'] },
      { ...health, page: { methods: ['GET', 'POST'] } },
      { ...health, api: { methods: ['*'] }, methods: ['*'] },
    ])
      expect(() => evaluate([route])).toThrow()
  })

  it('生成配置连接静态适配器和无回退路由预检，保留公开资产契约', async () => {
    await staticScript()
    const project = path.join(root, 'site')
    const svelte = await readFile(path.join(project, 'svelte.config.js'), 'utf8')
    const vite = await readFile(path.join(project, 'vite.config.ts'), 'utf8')
    expect(svelte).toContain('validateStaticRoutes(builder.routes)')
    expect(svelte).not.toContain('fallback: \'index.html\'')
    expect(vite).toContain('envDir: false')
    expect(vite).not.toContain('publicDir:')
    expect(vite).toContain('fileName: \'.nojekyll\'')
    expect(await readFile(path.join(project, 'src/routes/+layout.ts'), 'utf8')).toContain('prerender = __HAI_BUILD_STATIC__')
    expect(await readFile(path.join(project, 'src/routes/api/health/+server.ts'), 'utf8')).toContain('prerender = false')
    const layout = await readFile(path.join(project, 'src/routes/+layout.svelte'), 'utf8')
    expect(layout).toMatch(/import \{[^}]*ToastContainer[^}]*\} from '@h-ai\/ui'/)
    const contact = await readFile(path.join(project, 'src/routes/contact/+page.svelte'), 'utf8')
    expect(contact).toContain('notifyWarning(')
    expect(contact).not.toContain('notifySuccess(')
  })

  it('保留标准static公开图片与.well-known，误放私有环境文件时明确拒绝', async () => {
    const source = await staticScript()
    const assets = path.join(root, 'site/static')
    await mkdir(path.join(assets, '.well-known'), { recursive: true })
    await writeFile(path.join(assets, 'logo.svg'), '<svg></svg>')
    await writeFile(path.join(assets, '.well-known/security.txt'), 'public contact')
    expect(() => runInNewContext(`${source}\nresolveStaticWebsite()`, scriptContext({ HAI_BUILD_STATIC: '1' }))).not.toThrow()
    await writeFile(path.join(assets, '.env.local'), 'PRIVATE_SENTINEL=never-publish')
    expect(() => runInNewContext(`${source}\nresolveStaticWebsite()`, scriptContext({ HAI_BUILD_STATIC: '1' }))).toThrow('static')
  })
})
