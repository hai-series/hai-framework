/**
 * =============================================================================
 * @h-ai/cli - 模板引擎 E2E 测试
 * =============================================================================
 *
 * 端到端测试：实际调用 generateFromTemplates + buildTemplateContext，
 * 将项目生成到临时目录，验证文件结构、内容、i18n 条件、feature 条件。
 *
 * 覆盖场景：
 *   1. 四种应用类型（admin / website / h5 / api）
 *   2. i18n 条件输出（非 api 类型包含 i18n，api 类型不包含）
 *   3. feature 路由叠加（iam / storage / ai）
 *   4. UI 依赖条件（非 api 类型包含 tailwind / daisyui）
 *   5. 生成产物的结构完整性
 */

import type { AppType, FeatureId } from '../src/cli-types.js'
import { execFileSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { runInNewContext } from 'node:vm'
import { core } from '@h-ai/core'
import { loadDeploymentConfig } from '@h-ai/deploy'
import fse from 'fs-extra'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { buildTemplateContext, generateFromTemplates } from '../src/commands/cli-template-engine.js'
import { loadConfigText } from './helpers/config.js'

// =============================================================================
// 测试工具
// =============================================================================

/** 每次运行使用独立临时目录，避免并发测试互删生成项目。 */
let tmpRoot = ''

it.each(['api', 'admin', 'website', 'h5', 'mobile-app'] as const)('单独 %s 工程按职责命名镜像，手机原生目标独立配置', async (appType) => {
  const project = path.join(tmpRoot, `role-${appType}`)
  await generateFromTemplates(project, buildTemplateContext({ name: `role-${appType}`, appType, features: [], packageManager: 'pnpm' }))
  const { build } = JSON.parse(await readGenerated(project, 'hai.json'))
  const role = appType === 'api' ? 'serv' : 'web'
  expect(build.images).toEqual([{ name: role, dockerfile: `images/${role}.Dockerfile`, containerPort: appType === 'mobile-app' ? 8080 : 3000 }])
  expect(await fileExists(project, `images/${role}.Dockerfile`)).toBe(true)
  expect(build.app).toEqual(appType === 'mobile-app' ? ['.'] : undefined)
})

it.each([['web'], ['app']] as const)('fullstack 部署显式描述所选 Web，原生端不生成 Web 服务（%s）', async (target) => {
  const project = path.join(tmpRoot, `deploy-${target}`)
  await generateFromTemplates(project, buildTemplateContext({ name: `deploy-${target}`, appType: 'fullstack', frontends: [target], features: [], packageManager: 'pnpm' }))
  const loaded = loadDeploymentConfig('deploy', path.join(project, 'hai.json'), {})
  expect(loaded.success).toBe(true)
  if (!loaded.success)
    throw new Error(loaded.error.message)
  expect(loaded.data.container).toEqual({ s3Engine: 'rustfs' })
  const build = (JSON.parse(await readGenerated(project, 'hai.json')) as { build: { images: Array<{ name: string, dockerfile: string }> } }).build
  expect(await fileExists(project, 'scripts/run-e2e.mjs')).toBe(true)
  expect(build.images.map(image => image.name)).toEqual(target === 'web' ? ['serv', 'web'] : ['serv'])
})

it.each(['api', 'fullstack'] as const)('正式容量配置在 %s 生成项目中由同一环境值解析', async (appType) => {
  const name = `capacity-${appType}`
  const project = path.join(tmpRoot, name)
  await generateFromTemplates(project, buildTemplateContext({ name, appType, frontends: ['web'], features: ['crypto', 'db'], packageManager: 'pnpm' }))
  const service = appType === 'api' ? `apps/${name}-serv` : `packages/${name}-serv`
  const loaded = loadDeploymentConfig('serv', path.join(project, service, 'config/_serv.yml'), { HAI_SERV_TRANSPORT_MAXPLAINTEXTBYTES: '8388608' })
  expect(loaded).toMatchObject({ success: true, data: { transport: { maxPlaintextBytes: 8388608 } } })
})

/**
 * 生成一个测试项目并返回其路径
 */
async function generateProject(options: {
  name: string
  appType: AppType
  features?: FeatureId[]
}): Promise<string> {
  const projectPath = path.join(tmpRoot, options.name)
  await fse.ensureDir(projectPath)

  const context = buildTemplateContext({
    name: options.name,
    appType: options.appType,
    features: options.features ?? [],
    packageManager: 'pnpm',
  })

  await generateFromTemplates(projectPath, context)
  return projectPath
}

/**
 * 读取生成的文件内容
 */
async function readGenerated(projectPath: string, relativePath: string): Promise<string> {
  const fullPath = path.join(projectPath, relativePath)
  return fse.readFile(fullPath, 'utf-8')
}

/**
 * 检查文件是否存在
 */
async function fileExists(projectPath: string, relativePath: string): Promise<boolean> {
  return fse.pathExists(path.join(projectPath, relativePath))
}

// =============================================================================
// 生命周期
// =============================================================================

beforeAll(async () => {
  tmpRoot = await mkdtemp(path.join(process.cwd(), '.tmp-e2e-test-'))
})

it.each([true, false])('部署工具选项 %s 保持依赖、入口和镜像忽略规则一致', async (enabled) => {
  const project = path.join(tmpRoot, `deployment-${enabled}`)
  await generateFromTemplates(project, buildTemplateContext({ name: `deployment-${enabled}`, appType: 'fullstack', features: [], deploy: enabled, packageManager: 'pnpm' }))
  const manifest = JSON.parse(await readGenerated(project, 'package.json'))
  expect(manifest.dependencies['@h-ai/deploy']).toBeUndefined()
  expect(manifest.devDependencies['@h-ai/deploy']).toBe(enabled ? 'catalog:' : undefined)
  expect(manifest.scripts.deploy).toBe(enabled ? `hai deploy packages/deployment-${enabled}-serv` : undefined)
  const projectConfig = JSON.parse(await readGenerated(project, 'hai.json'))
  expect(projectConfig.build.images).toHaveLength(2)
  expect(projectConfig.deploy !== undefined).toBe(enabled)
  expect(await fileExists(project, `packages/deployment-${enabled}-serv/config/_deploy.yml`)).toBe(false)
  expect(await readGenerated(project, '.gitignore')).toContain('**/images/dependencies/')
})

afterAll(async () => {
  if (tmpRoot)
    await rm(tmpRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
})

it.each<AppType>(['admin', 'website', 'h5', 'api', 'mobile-app', 'fullstack'])('%s 忽略所有层级的数据目录，容器文件使用 LF 并由 Git 保留', async (appType) => {
  const projectPath = await generateProject({ name: `ignore-data-${appType}`, appType })
  const dataPaths = ['data/app.db', 'data/.gitkeep', 'packages/service/data/uploads/avatar.png', 'apps/web/data/.gitkeep']
  for (const dataPath of dataPaths)
    await fse.outputFile(path.join(projectPath, dataPath), '')
  execFileSync('git', ['init', '--quiet', projectPath])
  const ignored = execFileSync('git', ['-C', projectPath, 'check-ignore', '--stdin'], {
    input: [...dataPaths, 'src/main.ts', 'config/_iam.yml'].join('\n'),
    encoding: 'utf-8',
  }).trim().split(/\r?\n/)
  expect(ignored).toEqual(dataPaths)
  const containerFiles = ['.dockerignore', 'images/serv.Dockerfile', 'images/web.Dockerfile', 'images/web/19-runtime-config.envsh', 'images/web/19-runtime-config.sh']
  for (const file of containerFiles) {
    if (!await fileExists(projectPath, file))
      continue
    expect(await readGenerated(projectPath, file), file).not.toContain('\r')
    const attribute = execFileSync('git', ['-C', projectPath, 'check-attr', 'eol', '--', file], { encoding: 'utf8' }).trim()
    expect(attribute, file).toBe(`${file}: eol: lf`)
  }
})

it('fullstack 应保留完整配置文件、用户选择和未启用模块的注释示例', async () => {
  const projectName = 'complete-fullstack'
  const projectPath = path.join(tmpRoot, projectName)
  await generateFromTemplates(projectPath, buildTemplateContext({
    name: projectName,
    appType: 'fullstack',
    features: [],
    frontends: ['web'],
    moduleConfigs: {
      db: { type: 'postgresql', host: 'db.internal', port: 5433, database: 'app: primary' },
      cache: { type: 'redis', host: 'cache.internal', port: 6380 },
      iam: { loginPassword: true, loginOtp: true },
    },
    packageManager: 'pnpm',
  }))
  const configDir = `packages/${projectName}-serv/config`
  const db = loadConfigText('db', await readGenerated(projectPath, `${configDir}/_db.yml`))
  const cache = loadConfigText('cache', await readGenerated(projectPath, `${configDir}/_cache.yml`))
  const iam = loadConfigText('iam', await readGenerated(projectPath, `${configDir}/_iam.yml`))
  expect(db).toMatchObject({ type: 'postgresql', host: 'db.internal', port: 5433, database: 'app: primary' })
  expect(cache).toMatchObject({ type: 'redis', host: 'cache.internal', port: 6380 })
  expect(iam).toMatchObject({ login: { otp: true }, seedDefaultData: false })
  for (const moduleKey of ['ai', 'vecdb', 'payment', 'scheduler']) {
    const content = await readGenerated(projectPath, `${configDir}/_${moduleKey}.yml`)
    // 注释文件解析为空，不会触发可选模块，也不会读取其凭据占位符。
    expect(parse(content)).toBeNull()
    expect(content.trim().split('\n').every(line => !line.trim() || line.startsWith('#'))).toBe(true)
    const loaded = core.config.load(`cli-template-${moduleKey}`, path.join(projectPath, configDir, `_${moduleKey}.yml`))
    expect(loaded.success).toBe(true)
    if (loaded.success)
      expect(loaded.data).toBeNull()
  }
  const iamContent = await readGenerated(projectPath, `${configDir}/_iam.yml`)
  expect(iamContent).toContain('searchFilter:')
  expect(iamContent).toContain('expirationDays:')
  expect(iamContent).toContain('superAdminRole:')
  // 用户整文件去掉一层注释后，应直接得到合法配置，而非残留说明文字导致 YAML 解析失败。
  const aiExample = await readGenerated(projectPath, `${configDir}/_ai.yml`)
  expect(loadConfigText('ai', aiExample.replace(/^# /gm, ''))).toMatchObject({ llm: { model: 'gpt-4o-mini' } })
})

it('fullstack 选择可选模块时应保留其可用配置及创建参数', async () => {
  const projectName = 'ai-fullstack'
  const projectPath = path.join(tmpRoot, projectName)
  await generateFromTemplates(projectPath, buildTemplateContext({
    name: projectName,
    appType: 'fullstack',
    features: ['ai'],
    frontends: ['web'],
    moduleConfigs: { ai: { defaultProvider: 'anthropic', model: 'claude-sonnet-4-5' } },
    packageManager: 'pnpm',
  }))
  const config = loadConfigText('ai', await readGenerated(projectPath, `packages/${projectName}-serv/config/_ai.yml`))
  expect(config).toMatchObject({ llm: { api: 'anthropic', model: 'claude-sonnet-4-5' } })
})

it('fullstack 的原生应用名称应读取 core 配置并正确转义', async () => {
  const projectPath = path.join(tmpRoot, 'configured-fullstack')
  const name = 'Operations: "管理台"\n<Workspace>\'s'
  const context = buildTemplateContext({
    name: 'configured-fullstack',
    appType: 'fullstack',
    frontends: ['web', 'app', 'desktop'],
    features: [],
    moduleConfigs: { core: { name } },
    packageManager: 'pnpm',
  })
  await generateFromTemplates(projectPath, context)
  const coreConfig: { name: string } = parse(await readGenerated(projectPath, 'packages/configured-fullstack-serv/config/_core.yml'))
  const tauriConfig = JSON.parse(await readGenerated(projectPath, 'apps/configured-fullstack-desktop/src-tauri/tauri.conf.json'))
  const capacitorConfig = await readGenerated(projectPath, 'apps/configured-fullstack-app/capacitor.config.ts')
  const capacitorName = capacitorConfig.match(/appName: ('(?:\\.|[^'])*'),/)?.[1]
  expect(coreConfig.name).toBe(name)
  expect(await readGenerated(projectPath, 'apps/configured-fullstack-web/index.html')).toContain('&lt;Workspace&gt;&#x27;s')
  expect(tauriConfig.productName).toBe(name)
  expect(tauriConfig.app.windows[0].title).toBe(name)
  expect(capacitorName).toBeDefined()
  expect(runInNewContext(capacitorName!)).toBe(name)
})

it.each([
  ['web', 'app', 'desktop'],
  ['app', 'desktop'],
  ['desktop', 'web'],
] as const)('fullstack E2E 应使用大写环境变量覆盖预览地址（%s）', async (...frontends) => {
  const projectPath = path.join(tmpRoot, `preview-${frontends.join('-')}`)
  await generateFromTemplates(projectPath, buildTemplateContext({
    name: `preview-${frontends.join('-')}`,
    appType: 'fullstack',
    frontends,
    features: [],
    packageManager: 'pnpm',
  }))
  const spec = await readGenerated(projectPath, 'e2e/fullstack.spec.ts')
  const expression = spec.match(/const additionalFrontends = ([\s\S]*?)\n\nfor \(const frontend/)?.[1]
  expect(expression).toBeDefined()
  const ports = { web: 4173, app: 5175, desktop: 5176 }
  const env: Record<string, string> = {
    HAI_E2E_WEB_URL: 'http://127.0.0.1:45173',
    HAI_E2E_APP_URL: 'http://127.0.0.1:45175',
    HAI_E2E_DESKTOP_URL: 'http://127.0.0.1:45176',
  }
  // 使用区分大小写的独立环境，在 Windows 上也能复现 Linux CI 的变量解析。
  for (const overrides of [env, {}]) {
    expect(runInNewContext(expression!, { process: { env: overrides } })).toEqual(
      frontends.slice(1).map(target => ({
        target,
        url: overrides === env ? env[`HAI_E2E_${target.toUpperCase()}_URL`] : `http://127.0.0.1:${ports[target]}`,
      })),
    )
  }
})

// =============================================================================
// 1. Admin 应用类型
// =============================================================================

describe('admin 应用类型生成', () => {
  let projectPath: string

  beforeAll(async () => {
    projectPath = await generateProject({
      name: 'test-admin',
      appType: 'admin',
      features: ['iam', 'db', 'cache', 'crypto'],
    })
  })

  describe('基础骨架', () => {
    it('应生成 package.json', async () => {
      const content = await readGenerated(projectPath, 'package.json')
      const pkg = JSON.parse(content)
      expect(pkg.name).toBe('test-admin')
      expect(pkg.dependencies['@h-ai/core']).toBeDefined()
      expect(pkg.dependencies['@h-ai/kit']).toBeDefined()
    })

    it('应包含 UI 依赖（hasUi = true）', async () => {
      const content = await readGenerated(projectPath, 'package.json')
      const pkg = JSON.parse(content)
      expect(pkg.dependencies['@h-ai/ui']).toBeDefined()
      expect(pkg.devDependencies.tailwindcss).toBeDefined()
      expect(pkg.devDependencies.daisyui).toBeDefined()
    })

    it('应包含 feature 依赖', async () => {
      const content = await readGenerated(projectPath, 'package.json')
      const pkg = JSON.parse(content)
      expect(pkg.dependencies['@h-ai/iam']).toBeDefined()
      expect(pkg.dependencies['@h-ai/reldb']).toBeDefined()
      expect(pkg.dependencies['@h-ai/cache']).toBeDefined()
      expect(pkg.dependencies['@h-ai/crypto']).toBeDefined()
    })

    it('应生成 tsconfig.json', async () => {
      expect(await fileExists(projectPath, 'tsconfig.json')).toBe(true)
    })

    it('应生成 svelte.config.js', async () => {
      expect(await fileExists(projectPath, 'svelte.config.js')).toBe(true)
    })

    it('应生成 eslint.config.js 并含 @antfu/eslint-config', async () => {
      const content = await readGenerated(projectPath, 'eslint.config.js')
      expect(content).toContain('@antfu/eslint-config')
      expect(content).toContain('svelte: true')
    })

    it('应生成 vitest.config.ts', async () => {
      const content = await readGenerated(projectPath, 'vitest.config.ts')
      expect(content).toContain('defineConfig')
      expect(content).toContain('tests/**/*.test.ts')
    })

    it('package.json 应包含 description 和 keywords', async () => {
      const content = await readGenerated(projectPath, 'package.json')
      const pkg = JSON.parse(content)
      expect(pkg.description).toBeDefined()
      expect(pkg.description.length).toBeGreaterThan(0)
      expect(pkg.keywords).toContain('hai')
      expect(pkg.keywords).toContain('sveltekit')
    })

    it('package.json scripts 应包含 test:watch 和 clean', async () => {
      const content = await readGenerated(projectPath, 'package.json')
      const pkg = JSON.parse(content)
      expect(pkg.scripts['test:watch']).toBeDefined()
      expect(pkg.scripts.clean).toBeDefined()
    })

    it('应生成 static 目录', async () => {
      expect(await fileExists(projectPath, 'static')).toBe(true)
    })

    it('pnpm 专属设置应位于 workspace，.npmrc 仅用于注册表与认证', async () => {
      const content = await readGenerated(projectPath, '.npmrc')
      const workspace: Record<string, unknown> = parse(await readGenerated(projectPath, 'pnpm-workspace.yaml'))
      expect(workspace.nodeLinker).toBe('hoisted')
      expect(workspace.shamefullyHoist).toBeUndefined()
      expect(content).not.toMatch(/^\s*(?:node-linker|shamefully-hoist)\s*=/m)
    })
  })

  describe('i18n 支持', () => {
    it('应包含 paraglide 工具和运行时 pretty 日志依赖', async () => {
      const content = await readGenerated(projectPath, 'package.json')
      const pkg = JSON.parse(content)
      expect(pkg.devDependencies['@inlang/paraglide-js']).toBeDefined()
      expect(pkg.devDependencies['@inlang/plugin-message-format']).toBeDefined()
      expect(pkg.dependencies['pino-pretty']).toBeDefined()
    })

    it('应生成 project.inlang/settings.json', async () => {
      const content = await readGenerated(projectPath, 'project.inlang/settings.json')
      const settings = JSON.parse(content)
      expect(settings.baseLocale).toBe('zh-CN')
      expect(settings.locales).toContain('en-US')
      expect(settings.modules).toEqual(['./node_modules/@inlang/plugin-message-format/dist/index.js'])
    })

    it('应生成 messages 文件', async () => {
      expect(await fileExists(projectPath, 'messages/zh-CN.json')).toBe(true)
      expect(await fileExists(projectPath, 'messages/en-US.json')).toBe(true)
    })

    it('messages 应包含 admin 专用 key', async () => {
      const content = await readGenerated(projectPath, 'messages/zh-CN.json')
      const messages = JSON.parse(content)
      expect(messages.app_title).toBeDefined()
      expect(messages.nav_dashboard).toBeDefined()
      expect(messages.page_settings_title).toBeDefined()
    })

    it('app.html 应使用 %lang% 占位符', async () => {
      const content = await readGenerated(projectPath, 'src/app.html')
      expect(content).toContain('lang="%lang%"')
      expect(content).not.toContain('lang="zh-CN"')
    })

    it('vite.config.ts 应包含 paraglideVitePlugin', async () => {
      const content = await readGenerated(projectPath, 'vite.config.ts')
      expect(content).toContain('paraglideVitePlugin')
      expect(content).toContain('project: \'./project.inlang\'')
      expect(content).toContain('strategy: [\'cookie\', \'baseLocale\']')
    })

    it('vite.config.ts 应包含 tailwindcss', async () => {
      const content = await readGenerated(projectPath, 'vite.config.ts')
      expect(content).toContain('tailwindcss()')
      expect(content).toContain('import tailwindcss from \'@tailwindcss/vite\'')
    })

    it('vite.config.ts 应包含 SSR noExternal 和 loadEnv', async () => {
      const content = await readGenerated(projectPath, 'vite.config.ts')
      expect(content).toContain('noExternal')
      expect(content).toContain('@h-ai')
      expect(content).toContain('loadEnv')
      expect(content).toContain('optimizeDeps')
      expect(content).toContain('bits-ui')
    })

    it('svelte.config.js 应包含 autoImportHaiUi 和 runes', async () => {
      const content = await readGenerated(projectPath, 'svelte.config.js')
      expect(content).toContain('autoImportHaiUi')
      expect(content).toContain('runes: true')
      expect(content).toContain('trustedOrigins')
      expect(content).toContain('$components')
    })

    it('app.css 应包含 DaisyUI 主题配置和 iconify', async () => {
      const content = await readGenerated(projectPath, 'src/app.css')
      expect(content).toContain('@import \'tailwindcss\'')
      expect(content).toContain('@plugin "daisyui"')
      expect(content).toContain('light --default')
      expect(content).toContain('dark --prefersdark')
      expect(content).toContain('@plugin "@iconify/tailwind4"')
      expect(content).toContain('prefixes: tabler')
    })

    it('hooks.server.ts 应包含 i18nHandle', async () => {
      const content = await readGenerated(projectPath, 'src/hooks.server.ts')
      expect(content).toContain('i18nHandle')
      expect(content).toContain('kit.i18n.runWithLocale(locale, () => resolve(event')
      expect(content).not.toContain('kit.i18n.setLocale(')
      expect(content).toContain('paraglideMiddleware')
      expect(content).toContain('import { paraglideMiddleware } from \'$lib/paraglide/server.js\'')
    })

    it('hooks.server.ts 的 handle 序列应包含 i18nHandle', async () => {
      const content = await readGenerated(projectPath, 'src/hooks.server.ts')
      expect(content).toContain('i18nHandle,')
      // i18nHandle 应在 haiHandle 之前
      const i18nPos = content.indexOf('i18nHandle,')
      const haiPos = content.indexOf('haiHandle,')
      expect(i18nPos).not.toBe(-1)
      expect(haiPos).not.toBe(-1)
      expect(i18nPos).toBeLessThan(haiPos)
    })
  })

  describe('路由结构', () => {
    it('应生成根 +layout.svelte', async () => {
      const content = await readGenerated(projectPath, 'src/routes/+layout.svelte')
      expect(content).toContain('import \'../app.css\'')
      expect(content).toContain('setGlobalLocale')
      expect(content).toContain('getLocale')
    })

    it('应生成根 +page.svelte（带 i18n）', async () => {
      const content = await readGenerated(projectPath, 'src/routes/+page.svelte')
      expect(content).toContain('import * as m from \'$lib/paraglide/messages\'')
      expect(content).toContain('{page.data.appConfig.name}')
      // i18n 模式下不应有硬编码中文文案（注释除外）
      const scriptEnd = content.indexOf('</script>')
      const htmlPart = content.slice(scriptEnd)
      expect(htmlPart).not.toContain('管理后台')
    })

    it('应生成 admin 布局', async () => {
      const content = await readGenerated(projectPath, 'src/routes/admin/+layout.svelte')
      expect(content).toContain('{page.data.appConfig.name}')
      expect(content).toContain('m.nav_dashboard()')
    })

    it('应生成 admin 仪表盘', async () => {
      const content = await readGenerated(projectPath, 'src/routes/admin/+page.svelte')
      expect(content).toContain('{m.page_dashboard_title()}')
    })

    it('应生成 admin 设置页', async () => {
      const content = await readGenerated(projectPath, 'src/routes/admin/settings/+page.svelte')
      expect(content).toContain('{m.page_settings_title()}')
    })
  })

  describe('feature 路由', () => {
    it('应包含 iam 的 API 路由', async () => {
      expect(await fileExists(projectPath, 'src/routes/api/auth/login/+server.ts')).toBe(true)
    })

    it('应包含 iam 的 admin 专用页面路由', async () => {
      // iam admin 路由在 (auth)/auth/login/ 下
      expect(await fileExists(projectPath, 'src/routes/(auth)/auth/login/+page.svelte')).toBe(true)
    })

    it('iam 登录页复用带 i18n 的配置认证场景', async () => {
      const content = await readGenerated(projectPath, 'src/routes/(auth)/auth/login/+page.svelte')
      expect(content).toContain('AuthPanel')
      expect(content).toContain('page.data.iamPublicConfig')
      expect(content).toContain('kit.client.createAuthActions()')
      expect(content).not.toContain('>登录<')
    })

    it('iam 注册页复用带 i18n 的配置认证场景', async () => {
      const content = await readGenerated(projectPath, 'src/routes/(auth)/auth/register/+page.svelte')
      expect(content).toContain('AuthPanel')
      expect(content).toContain('page.data.iamPublicConfig')
      expect(content).toContain('initialMode=\'register\'')
      expect(content).not.toContain('注册失败')
    })

    it('应生成 init.ts 并引入 iam / db / cache', async () => {
      const content = await readGenerated(projectPath, 'src/lib/server/init.ts')
      expect(content).toContain('from \'@h-ai/iam\'')
      expect(content).toContain('from \'@h-ai/reldb\'')
      expect(content).toContain('from \'@h-ai/cache\'')
    })

    it('hooks.server.ts 应包含 auth.verifyToken 配置', async () => {
      const content = await readGenerated(projectPath, 'src/hooks.server.ts')
      expect(content).toContain('auth:')
      expect(content).toContain('verifyToken:')
      expect(content).toContain('iam.auth.verifyToken')
      expect(content).toContain('import { iam } from \'@h-ai/iam\'')
    })
  })
})

// =============================================================================
// 2. Website 应用类型
// =============================================================================

describe('website 应用类型生成', () => {
  let projectPath: string

  beforeAll(async () => {
    projectPath = await generateProject({
      name: 'test-website',
      appType: 'website',
      features: [],
    })
  })

  describe('基础结构', () => {
    it('应生成 package.json（无额外 feature 依赖）', async () => {
      const content = await readGenerated(projectPath, 'package.json')
      const pkg = JSON.parse(content)
      expect(pkg.name).toBe('test-website')
      expect(pkg.dependencies['@h-ai/iam']).toBeUndefined()
      expect(pkg.dependencies['@h-ai/reldb']).toBeUndefined()
    })

    it('应包含 UI 依赖', async () => {
      const content = await readGenerated(projectPath, 'package.json')
      const pkg = JSON.parse(content)
      expect(pkg.dependencies['@h-ai/ui']).toBeDefined()
    })
  })

  describe('i18n 支持', () => {
    it('应生成 i18n 文件', async () => {
      expect(await fileExists(projectPath, 'project.inlang/settings.json')).toBe(true)
      expect(await fileExists(projectPath, 'messages/zh-CN.json')).toBe(true)
      expect(await fileExists(projectPath, 'messages/en-US.json')).toBe(true)
    })

    it('messages 应包含 website 专用 key', async () => {
      const content = await readGenerated(projectPath, 'messages/zh-CN.json')
      const messages = JSON.parse(content)
      expect(messages.nav_home).toBeDefined()
      expect(messages.nav_about).toBeDefined()
      expect(messages.nav_services).toBeDefined()
      expect(messages.nav_contact).toBeDefined()
      expect(messages.page_home_title).toBeDefined()
      expect(messages.footer_copyright).toBeDefined()
    })
  })

  describe('路由结构', () => {
    it('应生成带导航的布局', async () => {
      const content = await readGenerated(projectPath, 'src/routes/+layout.svelte')
      expect(content).toContain('m.nav_home()')
      expect(content).toContain('m.nav_about()')
      expect(content).toContain('m.footer_copyright(')
    })

    it('应生成首页 hero', async () => {
      const content = await readGenerated(projectPath, 'src/routes/+page.svelte')
      expect(content).toContain('{m.page_home_title()}')
    })

    it('应生成关于页', async () => {
      const content = await readGenerated(projectPath, 'src/routes/about/+page.svelte')
      expect(content).toContain('{m.page_about_title()}')
    })

    it('应生成服务页', async () => {
      const content = await readGenerated(projectPath, 'src/routes/services/+page.svelte')
      expect(content).toContain('{m.page_services_title()}')
    })

    it('应生成联系页', async () => {
      const content = await readGenerated(projectPath, 'src/routes/contact/+page.svelte')
      expect(content).toContain('{m.page_contact_title()}')
      expect(content).toContain('{m.page_contact_submit()}')
    })
  })

  describe('无 iam 时不应有 authHandle', () => {
    it('hooks.server.ts 不包含 authHandle', async () => {
      const content = await readGenerated(projectPath, 'src/hooks.server.ts')
      expect(content).not.toContain('authHandle')
      expect(content).not.toContain('import { iam }')
    })

    it('hooks.server.ts 仍包含 i18nHandle', async () => {
      const content = await readGenerated(projectPath, 'src/hooks.server.ts')
      expect(content).toContain('i18nHandle')
    })
  })
})

// =============================================================================
// 3. H5 应用类型
// =============================================================================

describe('h5 应用类型生成', () => {
  let projectPath: string

  beforeAll(async () => {
    projectPath = await generateProject({
      name: 'test-h5',
      appType: 'h5',
      features: ['iam', 'crypto'],
    })
  })

  describe('i18n 支持', () => {
    it('messages 应包含 h5 专用 key', async () => {
      const content = await readGenerated(projectPath, 'messages/zh-CN.json')
      const messages = JSON.parse(content)
      expect(messages.nav_home).toBeDefined()
      expect(messages.nav_discover).toBeDefined()
      expect(messages.nav_profile).toBeDefined()
      expect(messages.page_discover_title).toBeDefined()
    })
  })

  describe('路由结构', () => {
    it('应生成底部导航布局', async () => {
      const content = await readGenerated(projectPath, 'src/routes/+layout.svelte')
      expect(content).toContain('<BottomNav')
      expect(content).toContain('m.nav_home()')
      expect(content).toContain('m.nav_discover()')
      expect(content).toContain('m.nav_profile()')
    })

    it('应生成发现页', async () => {
      const content = await readGenerated(projectPath, 'src/routes/discover/+page.svelte')
      expect(content).toContain('{m.page_discover_title()}')
    })

    it('应生成个人中心页', async () => {
      const content = await readGenerated(projectPath, 'src/routes/profile/+page.svelte')
      expect(content).toContain('{m.page_profile_title()}')
    })
  })

  describe('iam feature 路由', () => {
    it('应包含 iam 的 h5 专用路由', async () => {
      expect(await fileExists(projectPath, 'src/routes/auth/login/+page.svelte')).toBe(true)
    })

    it('h5 登录页复用带 i18n 的配置认证场景', async () => {
      const content = await readGenerated(projectPath, 'src/routes/auth/login/+page.svelte')
      expect(content).toContain('AuthPanel')
      expect(content).toContain('page.data.iamPublicConfig')
      expect(content).not.toContain('>登录<')
    })

    it('h5 注册页复用带 i18n 的配置认证场景', async () => {
      const content = await readGenerated(projectPath, 'src/routes/auth/register/+page.svelte')
      expect(content).toContain('AuthPanel')
      expect(content).toContain('initialMode=\'register\'')
      expect(content).not.toContain('>注册<')
    })

    it('应包含 iam 的共享 API 路由', async () => {
      expect(await fileExists(projectPath, 'src/routes/api/auth/login/+server.ts')).toBe(true)
    })
  })
})

// =============================================================================
// 4. API 应用类型（无 i18n）
// =============================================================================

describe('api 应用类型生成', () => {
  let projectPath: string

  beforeAll(async () => {
    projectPath = await generateProject({
      name: 'test-api',
      appType: 'api',
      features: ['db', 'cache'],
    })
  })

  describe('不包含 i18n', () => {
    it('根 package 不应有 paraglide devDependencies', async () => {
      const content = await readGenerated(projectPath, 'package.json')
      const pkg = JSON.parse(content)
      expect(pkg.devDependencies['@inlang/paraglide-js']).toBeUndefined()
      expect(pkg.devDependencies['@inlang/plugin-message-format']).toBeUndefined()
    })

    it('不应生成 project.inlang', async () => {
      expect(await fileExists(projectPath, 'project.inlang')).toBe(false)
    })

    it('不应生成 messages 目录', async () => {
      expect(await fileExists(projectPath, 'messages')).toBe(false)
    })

    it('不应生成页面级 app.html', async () => {
      expect(await fileExists(projectPath, 'src/app.html')).toBe(false)
    })

    it('根 playwright 配置不应包含前端 Vite/i18n 逻辑', async () => {
      const content = await readGenerated(projectPath, 'playwright.config.ts')
      expect(content).not.toContain('paraglideVitePlugin')
      expect(content).not.toContain('vite preview')
    })

    it('根 eslint 配置不应启用 Svelte 专项 lint', async () => {
      const content = await readGenerated(projectPath, 'eslint.config.js')
      expect(content).not.toContain('svelte: true')
    })

    it('应生成 API workspace 根文件', async () => {
      expect(await fileExists(projectPath, 'pnpm-workspace.yaml')).toBe(true)
      expect(await fileExists(projectPath, 'tsconfig.base.json')).toBe(true)
      expect(await fileExists(projectPath, 'e2e/api-serv.spec.ts')).toBe(true)
    })
  })

  describe('不包含 UI', () => {
    it('根 package 不应有 @h-ai/ui 依赖', async () => {
      const content = await readGenerated(projectPath, 'package.json')
      const pkg = JSON.parse(content)
      expect(pkg.dependencies?.['@h-ai/ui']).toBeUndefined()
      expect(pkg.devDependencies.tailwindcss).toBeUndefined()
      expect(pkg.devDependencies.daisyui).toBeUndefined()
    })

    it('不应生成前端样式与 hooks 文件', async () => {
      expect(await fileExists(projectPath, 'src/app.css')).toBe(false)
      expect(await fileExists(projectPath, 'src/hooks.server.ts')).toBe(false)
    })
  })

  describe('workspace 结构', () => {
    it('应生成 contract 与 service 子工程', async () => {
      expect(await fileExists(projectPath, 'apps/test-api-contract/package.json')).toBe(true)
      expect(await fileExists(projectPath, 'apps/test-api-serv/package.json')).toBe(true)
    })

    it('contract 包应组合 app contract', async () => {
      const content = await readGenerated(projectPath, 'apps/test-api-contract/src/test-api-contract.ts')
      expect(content).toContain('apiContract.create')
      expect(content).toContain('app: appContract')
    })

    it('service 包应包含 db / cache 初始化与 procedure 装配', async () => {
      const content = await readGenerated(projectPath, 'apps/test-api-serv/src/lib/server/init.ts')
      expect(content).toContain('from \'@h-ai/reldb\'')
      expect(content).toContain('from \'@h-ai/cache\'')
      expect(content).not.toContain('from \'@h-ai/iam\'')

      const procedures = await readGenerated(projectPath, 'apps/test-api-serv/src/server/procedures/index.ts')
      expect(procedures).toContain('createAppProcedures')
    })

    it('service 配置模板应包含 _core.yml 与 _serv.yml', async () => {
      expect(await fileExists(projectPath, 'apps/test-api-serv/config/_core.yml')).toBe(true)
      expect(await fileExists(projectPath, 'apps/test-api-serv/config/_serv.yml')).toBe(true)
    })
  })
})

// =============================================================================
// 5. Feature 叠加验证
// =============================================================================

describe('feature 叠加', () => {
  let projectPath: string

  beforeAll(async () => {
    projectPath = await generateProject({
      name: 'test-full',
      appType: 'admin',
      features: ['iam', 'db', 'cache', 'crypto', 'storage', 'ai'],
    })
  })

  it('应包含所有 feature 依赖', async () => {
    const content = await readGenerated(projectPath, 'package.json')
    const pkg = JSON.parse(content)
    expect(pkg.dependencies['@h-ai/iam']).toBeDefined()
    expect(pkg.dependencies['@h-ai/reldb']).toBeDefined()
    expect(pkg.dependencies['@h-ai/cache']).toBeDefined()
    expect(pkg.dependencies['@h-ai/crypto']).toBeDefined()
    expect(pkg.dependencies['@h-ai/storage']).toBeDefined()
    expect(pkg.dependencies['@h-ai/ai']).toBeDefined()
  })

  it('应包含 storage 上传路由', async () => {
    expect(await fileExists(projectPath, 'src/routes/api/upload/+server.ts')).toBe(true)
  })

  it('应包含 ai 聊天路由', async () => {
    expect(await fileExists(projectPath, 'src/routes/api/chat/+server.ts')).toBe(true)
  })

  it('init.ts 应引入所有模块', async () => {
    const content = await readGenerated(projectPath, 'src/lib/server/init.ts')
    expect(content).toContain('from \'@h-ai/iam\'')
    expect(content).toContain('from \'@h-ai/reldb\'')
    expect(content).toContain('from \'@h-ai/cache\'')
    expect(content).toContain('from \'@h-ai/storage\'')
    expect(content).toContain('from \'@h-ai/ai\'')
  })

  it('hooks.server.ts handle 序列完整', async () => {
    const content = await readGenerated(projectPath, 'src/hooks.server.ts')
    expect(content).toContain('initHandle,')
    expect(content).toContain('i18nHandle,')
    expect(content).toContain('haiHandle,')
  })

  it('iam 认证模板应装配统一场景、配置与客户端动作', async () => {
    const login = await readGenerated(projectPath, 'src/routes/(auth)/auth/login/+page.svelte')
    expect(login).toContain('AuthPanel')
    expect(login).toContain('kit.client.createAuthActions()')

    const register = await readGenerated(projectPath, 'src/routes/(auth)/auth/register/+page.svelte')
    expect(register).toContain('AuthPanel')
    expect(register).toContain('page.data.iamPublicConfig')
  })
})

// =============================================================================
// 6. buildTemplateContext 单元验证
// =============================================================================

describe('buildTemplateContext', () => {
  it('admin 类型应设置 hasUi 和 hasI18n 为 true', () => {
    const ctx = buildTemplateContext({
      name: 'test',
      appType: 'admin',
      features: [],
      packageManager: 'pnpm',
    })
    expect(ctx.hasUi).toBe(true)
    expect(ctx.hasI18n).toBe(true)
    expect(ctx.defaultLocale).toBe('zh-CN')
  })

  it('api 类型应设置 hasUi 和 hasI18n 为 false', () => {
    const ctx = buildTemplateContext({
      name: 'test',
      appType: 'api',
      features: [],
      packageManager: 'pnpm',
    })
    expect(ctx.hasUi).toBe(false)
    expect(ctx.hasI18n).toBe(false)
    expect(ctx.isApiWorkspace).toBe(true)
    expect(ctx.api?.contractPackageName).toBe('test-contract')
    expect(ctx.api?.servPackageName).toBe('test-serv')
  })

  it('应正确映射 features', () => {
    const ctx = buildTemplateContext({
      name: 'test',
      appType: 'admin',
      features: ['iam', 'db', 'cache'],
      packageManager: 'pnpm',
    })
    expect(ctx.features.iam).toBe(true)
    expect(ctx.features.db).toBe(true)
    expect(ctx.features.cache).toBe(true)
    expect(ctx.features.storage).toBeUndefined()
  })

  it('应使用自定义 defaultLocale', () => {
    const ctx = buildTemplateContext({
      name: 'test',
      appType: 'website',
      features: [],
      moduleConfigs: { core: { defaultLocale: 'en-US' } },
      packageManager: 'npm',
    })
    expect(ctx.defaultLocale).toBe('en-US')
    expect(ctx.packageManager).toBe('npm')
  })
})

// =============================================================================
// 7. 生成产物结构完整性（冒烟测试）
// =============================================================================

describe('生成产物结构完整性', () => {
  /** 所有应用类型都应有的基础文件 */
  const BASE_FILES = [
    'package.json',
    'tsconfig.json',
    'svelte.config.js',
    'vite.config.ts',
    'vitest.config.ts',
    'eslint.config.js',
    'src/app.html',
    'src/app.d.ts',
    'src/hooks.server.ts',
    'src/lib/server/init.ts',
  ]

  const API_WORKSPACE_FILES = [
    'package.json',
    'pnpm-workspace.yaml',
    'tsconfig.base.json',
    'eslint.config.js',
    'playwright.config.ts',
    'e2e/api-serv.spec.ts',
    'apps/smoke-api-contract/package.json',
    'apps/smoke-api-contract/src/smoke-api-contract.ts',
    'apps/smoke-api-serv/package.json',
    'apps/smoke-api-serv/src/app.ts',
    'apps/smoke-api-serv/src/lib/server/init.ts',
  ]

  for (const appType of ['admin', 'website', 'h5'] as AppType[]) {
    it(`${appType} 应包含所有基础文件`, async () => {
      const projectPath = await generateProject({
        name: `smoke-${appType}`,
        appType,
        features: [],
      })

      for (const file of BASE_FILES) {
        expect(
          await fileExists(projectPath, file),
          `缺少文件: ${file} (appType=${appType})`,
        ).toBe(true)
      }
    })
  }

  it('api 应包含 workspace 基础文件', async () => {
    const projectPath = await generateProject({
      name: 'smoke-api',
      appType: 'api',
      features: [],
    })

    for (const file of API_WORKSPACE_FILES) {
      expect(
        await fileExists(projectPath, file),
        `缺少文件: ${file} (appType=api)`,
      ).toBe(true)
    }
  })

  it('admin/website/h5 应有 app.css', async () => {
    for (const appType of ['admin', 'website', 'h5'] as AppType[]) {
      const projectPath = path.join(tmpRoot, `smoke-${appType}`)
      expect(
        await fileExists(projectPath, 'src/app.css'),
        `缺少 app.css (${appType})`,
      ).toBe(true)
    }
  })

  it('api 不应生成空 app.css', async () => {
    const projectPath = path.join(tmpRoot, 'smoke-api')
    expect(await fileExists(projectPath, 'src/app.css')).toBe(false)
  })

  it('非 api 应有 i18n 脚手架', async () => {
    for (const appType of ['admin', 'website', 'h5'] as AppType[]) {
      const projectPath = path.join(tmpRoot, `smoke-${appType}`)
      expect(
        await fileExists(projectPath, 'project.inlang/settings.json'),
        `缺少 project.inlang (${appType})`,
      ).toBe(true)
      expect(
        await fileExists(projectPath, 'messages/zh-CN.json'),
        `缺少 messages/zh-CN.json (${appType})`,
      ).toBe(true)
    }
  })

  it('api 不应有 i18n 脚手架', async () => {
    const projectPath = path.join(tmpRoot, 'smoke-api')
    expect(await fileExists(projectPath, 'project.inlang')).toBe(false)
    expect(await fileExists(projectPath, 'messages')).toBe(false)
  })
})

describe('japanese scaffolds', () => {
  it.each(['admin', 'website', 'h5', 'mobile-app'] as const)('%s supports Japanese as the default language', async (appType) => {
    const project = path.join(tmpRoot, `japanese-${appType}`)
    await generateFromTemplates(project, buildTemplateContext({
      name: `japanese-${appType}`,
      appType,
      features: [],
      packageManager: 'pnpm',
      moduleConfigs: { core: { defaultLocale: 'ja-JP' } },
    }))
    const settings = JSON.parse(await readGenerated(project, 'project.inlang/settings.json'))
    expect(settings.baseLocale).toBe('ja-JP')
    expect(settings.locales).toContain('ja-JP')
    const ja = JSON.parse(await readGenerated(project, 'messages/ja-JP.json'))
    const en = JSON.parse(await readGenerated(project, 'messages/en-US.json'))
    expect(Object.keys(ja).sort()).toEqual(Object.keys(en).sort())
    expect(ja.app_title).toBeTruthy()
  })

  it('aPI scaffolds use Japanese with the current strict core configuration', async () => {
    const project = path.join(tmpRoot, 'japanese-api')
    await generateFromTemplates(project, buildTemplateContext({
      name: 'japanese-api',
      appType: 'api',
      features: [],
      packageManager: 'pnpm',
      moduleConfigs: { core: { defaultLocale: 'ja-JP' } },
    }))
    const config = loadConfigText<{ defaultLocale: string }>('core', await readGenerated(project, 'apps/japanese-api-serv/config/_core.yml'))
    expect(config.defaultLocale).toBe('ja-JP')
    expect(config).not.toHaveProperty('supportedLocales')
  })

  it('fullstack shares Japanese across all targets and preference validation', async () => {
    const project = path.join(tmpRoot, 'japanese-fullstack')
    await generateFromTemplates(project, buildTemplateContext({
      name: 'japanese-fullstack',
      appType: 'fullstack',
      frontends: ['web', 'app', 'desktop', 'miniapp'],
      features: [],
      packageManager: 'pnpm',
      moduleConfigs: { core: { defaultLocale: 'ja-JP' } },
    }))
    for (const directory of ['packages/japanese-fullstack-shared', ...['web', 'app', 'desktop', 'miniapp'].map(target => `apps/japanese-fullstack-${target}`)]) {
      const settings = JSON.parse(await readGenerated(project, `${directory}/project.inlang/settings.json`))
      expect(settings.baseLocale).toBe('ja-JP')
      expect(settings.locales).toEqual(['ja-JP', 'zh-CN', 'en-US'])
      const ja = JSON.parse(await readGenerated(project, `${directory}/messages/ja-JP.json`))
      const en = JSON.parse(await readGenerated(project, `${directory}/messages/en-US.json`))
      expect(Object.keys(ja).sort()).toEqual(Object.keys(en).sort())
    }
    const schemaSource = await readGenerated(project, 'packages/japanese-fullstack-contract/src/admin-schemas.ts')
    expect(schemaSource).toContain('locale: z.enum([\'ja-JP\', \'zh-CN\', \'en-US\']).optional()')
    expect(await readGenerated(project, 'packages/japanese-fullstack-serv/src/server/messages.ts')).toContain('\'ja-JP\':')
  })

  it('fullstack preference validation follows an explicitly restricted locale list', async () => {
    const project = path.join(tmpRoot, 'restricted-locales')
    await generateFromTemplates(project, buildTemplateContext({
      name: 'restricted-locales',
      appType: 'fullstack',
      frontends: ['web'],
      features: [],
      packageManager: 'pnpm',
      moduleConfigs: { fullstack: { i18n: { baseLocale: 'ja-JP', locales: ['ja-JP'] } } },
    }))
    const source = await readGenerated(project, 'packages/restricted-locales-contract/src/admin-schemas.ts')
    expect(source).toContain('locale: z.enum([\'ja-JP\']).optional()')
  })
})
