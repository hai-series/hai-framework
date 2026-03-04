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

import type { AppType, FeatureId } from '../src/types.js'
import path from 'node:path'
import fse from 'fs-extra'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTemplateContext, generateFromTemplates } from '../src/commands/template-engine.js'

// =============================================================================
// 测试工具
// =============================================================================

/** 临时目录根路径 */
const tmpRoot = path.join(process.cwd(), '.tmp-e2e-test')

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
  await fse.remove(tmpRoot)
  await fse.ensureDir(tmpRoot)
})

afterAll(async () => {
  await fse.remove(tmpRoot)
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

    it('应生成 static 目录', async () => {
      expect(await fileExists(projectPath, 'static')).toBe(true)
    })
  })

  describe('i18n 支持', () => {
    it('应包含 paraglide devDependencies', async () => {
      const content = await readGenerated(projectPath, 'package.json')
      const pkg = JSON.parse(content)
      expect(pkg.devDependencies['@inlang/paraglide-js']).toBeDefined()
      expect(pkg.devDependencies['@inlang/plugin-message-format']).toBeDefined()
    })

    it('应生成 project.inlang/settings.json', async () => {
      const content = await readGenerated(projectPath, 'project.inlang/settings.json')
      const settings = JSON.parse(content)
      expect(settings.baseLocale).toBe('zh-CN')
      expect(settings.locales).toContain('en-US')
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

    it('hooks.server.ts 应包含 i18nHandle', async () => {
      const content = await readGenerated(projectPath, 'src/hooks.server.ts')
      expect(content).toContain('i18nHandle')
      expect(content).toContain('paraglideMiddleware')
      expect(content).toContain('import { paraglideMiddleware } from \'$lib/paraglide/server.js\'')
    })

    it('hooks.server.ts 的 handle 序列应包含 i18nHandle', async () => {
      const content = await readGenerated(projectPath, 'src/hooks.server.ts')
      expect(content).toContain('i18nHandle,')
      // i18nHandle 应在 authHandle 之前
      const i18nPos = content.indexOf('i18nHandle,')
      const authPos = content.indexOf('authHandle,')
      expect(i18nPos).toBeLessThan(authPos)
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
      expect(content).toContain('{m.app_title()}')
      // i18n 模式下不应有硬编码中文文案（注释除外）
      const scriptEnd = content.indexOf('</script>')
      const htmlPart = content.slice(scriptEnd)
      expect(htmlPart).not.toContain('管理后台')
    })

    it('应生成 admin 布局', async () => {
      const content = await readGenerated(projectPath, 'src/routes/admin/+layout.svelte')
      expect(content).toContain('{m.app_title()}')
      expect(content).toContain('{m.nav_dashboard()}')
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

    it('iam 登录页应使用 i18n', async () => {
      const content = await readGenerated(projectPath, 'src/routes/(auth)/auth/login/+page.svelte')
      expect(content).toContain('import * as m from \'$lib/paraglide/messages\'')
      expect(content).toContain('{m.auth_login_title()}')
      expect(content).toContain('m.auth_login_submit()')
      expect(content).toContain('m.auth_login_failed()')
      expect(content).not.toContain('>登录<')
    })

    it('iam 注册页应使用 i18n', async () => {
      const content = await readGenerated(projectPath, 'src/routes/(auth)/auth/register/+page.svelte')
      expect(content).toContain('import * as m from \'$lib/paraglide/messages\'')
      expect(content).toContain('{m.auth_register_title()}')
      expect(content).toContain('{m.auth_label_email()}')
      expect(content).toContain('m.auth_error_password_mismatch()')
      expect(content).not.toContain('注册失败')
    })

    it('应生成 init.ts 并引入 iam / db / cache', async () => {
      const content = await readGenerated(projectPath, 'src/lib/server/init.ts')
      expect(content).toContain('from \'@h-ai/iam\'')
      expect(content).toContain('from \'@h-ai/reldb\'')
      expect(content).toContain('from \'@h-ai/cache\'')
    })

    it('hooks.server.ts 应包含 authHandle', async () => {
      const content = await readGenerated(projectPath, 'src/hooks.server.ts')
      expect(content).toContain('authHandle')
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
      expect(content).toContain('{m.nav_home()}')
      expect(content).toContain('{m.nav_about()}')
      expect(content).toContain('{m.footer_copyright()}')
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
      expect(content).toContain('btm-nav')
      expect(content).toContain('{m.nav_home()}')
      expect(content).toContain('{m.nav_discover()}')
      expect(content).toContain('{m.nav_profile()}')
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

    it('h5 登录页应使用 i18n', async () => {
      const content = await readGenerated(projectPath, 'src/routes/auth/login/+page.svelte')
      expect(content).toContain('import * as m from \'$lib/paraglide/messages\'')
      expect(content).toContain('{m.auth_login_title()}')
      expect(content).not.toContain('>登录<')
    })

    it('h5 注册页应使用 i18n', async () => {
      const content = await readGenerated(projectPath, 'src/routes/auth/register/+page.svelte')
      expect(content).toContain('import * as m from \'$lib/paraglide/messages\'')
      expect(content).toContain('{m.auth_register_title()}')
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
    it('不应有 paraglide devDependencies', async () => {
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

    it('app.html 应使用静态 locale', async () => {
      const content = await readGenerated(projectPath, 'src/app.html')
      expect(content).toContain('lang="zh-CN"')
      expect(content).not.toContain('%lang%')
    })

    it('vite.config.ts 不应包含 paraglide', async () => {
      const content = await readGenerated(projectPath, 'vite.config.ts')
      expect(content).not.toContain('paraglideVitePlugin')
      expect(content).not.toContain('@inlang/paraglide-js')
    })

    it('vite.config.ts 不应包含 tailwindcss', async () => {
      const content = await readGenerated(projectPath, 'vite.config.ts')
      expect(content).not.toContain('tailwindcss')
    })

    it('hooks.server.ts 不应包含 i18nHandle', async () => {
      const content = await readGenerated(projectPath, 'src/hooks.server.ts')
      expect(content).not.toContain('i18nHandle')
      expect(content).not.toContain('paraglideMiddleware')
    })
  })

  describe('不包含 UI', () => {
    it('不应有 @h-ai/ui 依赖', async () => {
      const content = await readGenerated(projectPath, 'package.json')
      const pkg = JSON.parse(content)
      expect(pkg.dependencies['@h-ai/ui']).toBeUndefined()
      expect(pkg.devDependencies.tailwindcss).toBeUndefined()
      expect(pkg.devDependencies.daisyui).toBeUndefined()
    })
  })

  describe('api 路由', () => {
    it('应生成 health 端点', async () => {
      // API 健康检查在 api/v1/health/ 下
      expect(await fileExists(projectPath, 'src/routes/api/v1/health/+server.ts')).toBe(true)
    })

    it('应生成 init.ts 并引入 db / cache', async () => {
      const content = await readGenerated(projectPath, 'src/lib/server/init.ts')
      expect(content).toContain('from \'@h-ai/reldb\'')
      expect(content).toContain('from \'@h-ai/cache\'')
      expect(content).not.toContain('from \'@h-ai/iam\'')
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
    expect(content).toContain('authHandle,')
    expect(content).toContain('haiHandle,')
  })

  it('iam 认证页面的 .hbs 应正确渲染为 i18n 版本', async () => {
    const login = await readGenerated(projectPath, 'src/routes/(auth)/auth/login/+page.svelte')
    expect(login).toContain('import * as m from \'$lib/paraglide/messages\'')
    expect(login).toContain('{m.auth_login_title()}')

    const register = await readGenerated(projectPath, 'src/routes/(auth)/auth/register/+page.svelte')
    expect(register).toContain('{m.auth_register_title()}')
    expect(register).toContain('{m.auth_label_email()}')
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
    'src/app.html',
    'src/app.d.ts',
    'src/hooks.server.ts',
    'src/lib/server/init.ts',
  ]

  for (const appType of ['admin', 'website', 'h5', 'api'] as AppType[]) {
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

  it('admin/website/h5 应有 app.css', async () => {
    for (const appType of ['admin', 'website', 'h5'] as AppType[]) {
      const projectPath = path.join(tmpRoot, `smoke-${appType}`)
      expect(
        await fileExists(projectPath, 'src/app.css'),
        `缺少 app.css (${appType})`,
      ).toBe(true)
    }
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
