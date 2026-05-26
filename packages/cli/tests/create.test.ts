/**
 * =============================================================================
 * @h-ai/cli - create 命令测试
 * =============================================================================
 * 测试项目创建命令的核心逻辑（不执行实际文件 I/O）
 */

import type { AppType, FeatureId } from '../src/cli-types.js'
import { describe, expect, it } from 'vitest'
import { buildTemplateContext } from '../src/commands/cli-template-engine.js'

/* ---------- detectProject 导入验证 ---------- */

describe('detectProject', () => {
  it('应能正常导入 detectProject 函数', async () => {
    const { detectProject } = await import('../src/commands/cli-create.js')
    expect(typeof detectProject).toBe('function')
  })

  it('在不含 package.json 的目录中应返回 null', async () => {
    const { detectProject } = await import('../src/commands/cli-create.js')
    // /tmp 或系统临时目录不含 package.json
    const result = await detectProject('/nonexistent-directory-12345')
    expect(result).toBeNull()
  })
})

/* ---------- buildTemplateContext 验证 ---------- */

describe('buildTemplateContext', () => {
  it('api 类型应关闭 hasUi 和 hasI18n', () => {
    const ctx = buildTemplateContext({
      name: 'my-api',
      appType: 'api' as AppType,
      features: [],
      packageManager: 'pnpm',
    })
    expect(ctx.hasUi).toBe(false)
    expect(ctx.hasI18n).toBe(false)
    expect(ctx.isCapacitorApp).toBe(false)
  })

  it('admin 类型应开启 hasUi 和 hasI18n', () => {
    const ctx = buildTemplateContext({
      name: 'my-admin',
      appType: 'admin' as AppType,
      features: [],
      packageManager: 'pnpm',
    })
    expect(ctx.hasUi).toBe(true)
    expect(ctx.hasI18n).toBe(true)
    expect(ctx.isCapacitorApp).toBe(false)
  })

  it('android-app 类型应开启 isCapacitorApp', () => {
    const ctx = buildTemplateContext({
      name: 'my-app',
      appType: 'android-app' as AppType,
      features: [],
      packageManager: 'pnpm',
    })
    expect(ctx.isCapacitorApp).toBe(true)
  })

  it('fullstack 类型应作为独立应用类型可识别', () => {
    const ctx = buildTemplateContext({
      name: 'my-fullstack',
      appType: 'fullstack' as AppType,
      features: [],
      packageManager: 'pnpm',
    })
    expect(ctx.appType).toBe('fullstack')
    expect(ctx.isCapacitorApp).toBe(false)
  })

  it('features 数组应转换为 Record<string, boolean>', () => {
    const ctx = buildTemplateContext({
      name: 'my-app',
      appType: 'admin' as AppType,
      features: ['iam', 'db', 'cache'] as FeatureId[],
      packageManager: 'pnpm',
    })
    expect(ctx.features.iam).toBe(true)
    expect(ctx.features.db).toBe(true)
    expect(ctx.features.cache).toBe(true)
    expect(ctx.features.ai).toBeUndefined()
  })

  it('defaultLocale 应默认为 zh-CN', () => {
    const ctx = buildTemplateContext({
      name: 'test',
      appType: 'admin' as AppType,
      features: [],
      packageManager: 'pnpm',
    })
    expect(ctx.defaultLocale).toBe('zh-CN')
  })

  it('应使用 moduleConfigs.core.defaultLocale', () => {
    const ctx = buildTemplateContext({
      name: 'test',
      appType: 'admin' as AppType,
      features: [],
      moduleConfigs: { core: { defaultLocale: 'en-US' } },
      packageManager: 'pnpm',
    })
    expect(ctx.defaultLocale).toBe('en-US')
  })
})

/* ---------- buildFullstackProjectContext 验证 ---------- */

describe('fullstack TemplateContext', () => {
  it('应生成 contract / serv 包名和 E2E 默认前端', () => {
    const ctx = buildTemplateContext({
      name: 'demo',
      appType: 'fullstack' as AppType,
      features: [],
      frontends: ['web', 'app', 'desktop'],
      packageManager: 'pnpm',
    })

    expect(ctx.fullstack?.contractPackageName).toBe('demo-contract')
    expect(ctx.fullstack?.servPackageName).toBe('demo-serv')
    expect(ctx.fullstack?.frontendApps.map(app => app.target)).toEqual(['web', 'app', 'desktop'])
    expect(ctx.fullstack?.e2eFrontend?.target).toBe('web')
  })

  it('miniapp 只作为预留目标，不进入可构建前端列表', () => {
    const ctx = buildTemplateContext({
      name: 'demo',
      appType: 'fullstack' as AppType,
      features: [],
      frontends: ['miniapp'],
      packageManager: 'pnpm',
    })

    expect(ctx.fullstack?.hasMiniapp).toBe(true)
    expect(ctx.fullstack?.frontendApps).toEqual([])
    expect(ctx.fullstack?.e2eFrontend).toBeUndefined()
  })
})

/* ---------- 安全：项目名校验 ---------- */

describe('create command - 项目名校验', () => {
  const validNames = ['my-app', 'test123', 'a', 'hello-world-2']
  const invalidNames = ['../evil', 'my app', 'MY_APP', 'my.app', '../../etc']

  it.each(validNames)('合法项目名 "%s" 应通过正则', (name) => {
    expect(/^[a-z0-9-]+$/.test(name)).toBe(true)
  })

  it.each(invalidNames)('非法项目名 "%s" 应被正则拒绝', (name) => {
    expect(/^[a-z0-9-]+$/.test(name)).toBe(false)
  })
})
