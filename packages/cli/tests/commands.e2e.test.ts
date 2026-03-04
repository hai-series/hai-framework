/**
 * =============================================================================
 * @h-ai/cli - CLI 命令 E2E 测试
 * =============================================================================
 *
 * 端到端测试：使用临时目录，非交互模式（所有选项预先提供，不触发 prompts），
 * 验证各命令的文件生成、配置写入、模块添加等核心行为。
 *
 * 覆盖命令：
 *   - createProject — 项目创建（api / admin 类型）
 *   - detectProject — 项目检测
 *   - addModule     — 模块增量添加
 *   - initProject   — 配置校验与补全
 *   - generate      — 代码生成（page / component / api / model / migration）
 */

import path from 'node:path'
import fse from 'fs-extra'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addModule } from '../src/commands/add.js'
import { createProject, detectProject } from '../src/commands/create.js'
import { generate } from '../src/commands/generate.js'
import { initProject } from '../src/commands/init.js'

// =============================================================================
// 测试工具
// =============================================================================

const tmpRoot = path.join(process.cwd(), '.tmp-commands-e2e')

async function readJson(dir: string, rel: string) {
  return fse.readJson(path.join(dir, rel))
}

async function readText(dir: string, rel: string) {
  return fse.readFile(path.join(dir, rel), 'utf-8')
}

async function exists(dir: string, rel: string) {
  return fse.pathExists(path.join(dir, rel))
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
// 1. createProject — API 应用（最轻量，无 UI/i18n）
// =============================================================================

describe('createProject — api 类型', () => {
  let projectPath: string

  beforeAll(async () => {
    projectPath = path.join(tmpRoot, 'proj-api')
    await createProject({
      name: 'proj-api',
      appType: 'api',
      template: 'custom',
      features: ['db', 'cache'],
      moduleConfigs: {
        core: { name: 'proj-api', defaultLocale: 'zh-CN' },
        db: { type: 'sqlite', database: './data/app.db' },
        cache: { type: 'memory' },
      },
      examples: false,
      install: false,
      git: false,
      packageManager: 'pnpm',
      verbose: false,
      cwd: tmpRoot,
    })
  })

  it('应创建项目目录', async () => {
    expect(await exists(projectPath, '.')).toBe(true)
  })

  it('package.json 名称正确', async () => {
    const pkg = await readJson(projectPath, 'package.json')
    expect(pkg.name).toBe('proj-api')
  })

  it('package.json 包含 @h-ai/reldb 和 @h-ai/cache', async () => {
    const pkg = await readJson(projectPath, 'package.json')
    expect(pkg.dependencies['@h-ai/reldb']).toBeDefined()
    expect(pkg.dependencies['@h-ai/cache']).toBeDefined()
  })

  it('应生成 config/_core.yml', async () => {
    const content = await readText(projectPath, 'config/_core.yml')
    expect(content).toContain('proj-api')
  })

  it('应生成 config/_db.yml', async () => {
    const content = await readText(projectPath, 'config/_db.yml')
    expect(content).toContain('sqlite')
  })

  it('应生成 config/_cache.yml', async () => {
    expect(await exists(projectPath, 'config/_cache.yml')).toBe(true)
  })

  it('应生成 .env.example', async () => {
    expect(await exists(projectPath, '.env.example')).toBe(true)
  })

  it('应生成 README.md', async () => {
    const content = await readText(projectPath, 'README.md')
    expect(content).toContain('proj-api')
  })

  it('不应有 i18n 脚手架（api 类型）', async () => {
    expect(await exists(projectPath, 'project.inlang')).toBe(false)
  })

  it('不应有 messages 目录（api 类型）', async () => {
    expect(await exists(projectPath, 'messages')).toBe(false)
  })

  it('应生成 src/lib/server/init.ts 含 db/cache 初始化', async () => {
    const content = await readText(projectPath, 'src/lib/server/init.ts')
    expect(content).toContain('@h-ai/reldb')
    expect(content).toContain('@h-ai/cache')
  })

  it('health 端点存在', async () => {
    expect(await exists(projectPath, 'src/routes/api/v1/health/+server.ts')).toBe(true)
  })
})

// =============================================================================
// 2. createProject — Admin 应用（含 iam / i18n）
// =============================================================================

describe('createProject — admin 类型 + iam', () => {
  let projectPath: string

  beforeAll(async () => {
    projectPath = path.join(tmpRoot, 'proj-admin')
    await createProject({
      name: 'proj-admin',
      appType: 'admin',
      template: 'custom',
      features: ['iam', 'db', 'cache', 'crypto'],
      moduleConfigs: {
        core: { name: 'proj-admin', defaultLocale: 'zh-CN' },
        db: { type: 'sqlite', database: './data/app.db' },
        cache: { type: 'memory' },
        iam: { loginPassword: true, loginOtp: false },
      },
      examples: false,
      install: false,
      git: false,
      packageManager: 'pnpm',
      verbose: false,
      cwd: tmpRoot,
    })
  })

  it('package.json 包含 @h-ai/iam', async () => {
    const pkg = await readJson(projectPath, 'package.json')
    expect(pkg.dependencies['@h-ai/iam']).toBeDefined()
    expect(pkg.dependencies['@h-ai/crypto']).toBeDefined()
  })

  it('package.json 包含 paraglide devDep（i18n）', async () => {
    const pkg = await readJson(projectPath, 'package.json')
    expect(pkg.devDependencies?.['@inlang/paraglide-js']).toBeDefined()
  })

  it('hooks.server.ts 包含 authHandle', async () => {
    const content = await readText(projectPath, 'src/hooks.server.ts')
    expect(content).toContain('authHandle')
  })

  it('hooks.server.ts 包含 i18nHandle', async () => {
    const content = await readText(projectPath, 'src/hooks.server.ts')
    expect(content).toContain('i18nHandle')
  })

  it('app.html 使用 %lang% 占位符', async () => {
    const content = await readText(projectPath, 'src/app.html')
    expect(content).toContain('%lang%')
  })

  it('应有 i18n 脚手架', async () => {
    expect(await exists(projectPath, 'project.inlang/settings.json')).toBe(true)
    expect(await exists(projectPath, 'messages/zh-CN.json')).toBe(true)
    expect(await exists(projectPath, 'messages/en-US.json')).toBe(true)
  })

  it('iam 登录页存在且含 i18n', async () => {
    const content = await readText(projectPath, 'src/routes/(auth)/auth/login/+page.svelte')
    expect(content).toContain('m.auth_login_title()')
  })

  it('iam API 路由存在', async () => {
    expect(await exists(projectPath, 'src/routes/api/auth/login/+server.ts')).toBe(true)
  })

  it('config/_iam.yml 存在', async () => {
    expect(await exists(projectPath, 'config/_iam.yml')).toBe(true)
  })

  it('vite.config.ts 包含 paraglideVitePlugin', async () => {
    const content = await readText(projectPath, 'vite.config.ts')
    expect(content).toContain('paraglideVitePlugin')
  })

  it('应生成 SKILL.md', async () => {
    expect(await exists(projectPath, '.github/skills/hai-iam/SKILL.md')).toBe(true)
  })
})

// =============================================================================
// 3. createProject — Website 应用（无 iam，有 i18n）
// =============================================================================

describe('createProject — website 类型', () => {
  let projectPath: string

  beforeAll(async () => {
    projectPath = path.join(tmpRoot, 'proj-website')
    await createProject({
      name: 'proj-website',
      appType: 'website',
      template: 'custom',
      features: [],
      moduleConfigs: {
        core: { name: 'proj-website', defaultLocale: 'zh-CN' },
      },
      examples: false,
      install: false,
      git: false,
      packageManager: 'pnpm',
      verbose: false,
      cwd: tmpRoot,
    })
  })

  it('hooks.server.ts 不含 authHandle', async () => {
    const content = await readText(projectPath, 'src/hooks.server.ts')
    expect(content).not.toContain('authHandle')
  })

  it('hooks.server.ts 含 i18nHandle', async () => {
    const content = await readText(projectPath, 'src/hooks.server.ts')
    expect(content).toContain('i18nHandle')
  })

  it('首页含导航', async () => {
    const content = await readText(projectPath, 'src/routes/+layout.svelte')
    expect(content).toContain('nav')
  })

  it('i18n messages 含 website 专用 key', async () => {
    const messages = await readJson(projectPath, 'messages/zh-CN.json')
    expect(messages.nav_home).toBeDefined()
  })
})

// =============================================================================
// 4. detectProject
// =============================================================================

describe('detectProject', () => {
  it('检测到 hai 项目时返回 ProjectInfo', async () => {
    const dir = path.join(tmpRoot, 'detect-hai')
    await fse.ensureDir(dir)
    await fse.writeJson(path.join(dir, 'package.json'), {
      name: 'my-hai-app',
      version: '0.1.0',
      dependencies: {
        '@h-ai/core': 'workspace:*',
        '@h-ai/reldb': 'workspace:*',
      },
    })

    const info = await detectProject(dir)
    expect(info).not.toBeNull()
    expect(info!.name).toBe('my-hai-app')
    expect(info!.isHaiProject).toBe(true)
    expect(info!.haiPackages).toContain('@h-ai/core')
    expect(info!.haiPackages).toContain('@h-ai/reldb')
  })

  it('有 package.json 但无 @h-ai 依赖时 isHaiProject 为 false', async () => {
    const dir = path.join(tmpRoot, 'detect-plain')
    await fse.ensureDir(dir)
    await fse.writeJson(path.join(dir, 'package.json'), {
      name: 'plain-app',
      version: '1.0.0',
      dependencies: { svelte: '^5.0.0' },
    })

    const info = await detectProject(dir)
    expect(info).not.toBeNull()
    expect(info!.isHaiProject).toBe(false)
    expect(info!.haiPackages).toHaveLength(0)
  })

  it('没有 package.json 时返回 null', async () => {
    const dir = path.join(tmpRoot, 'detect-empty')
    await fse.ensureDir(dir)

    const info = await detectProject(dir)
    expect(info).toBeNull()
  })
})

// =============================================================================
// 5. addModule
// =============================================================================

describe('addModule', () => {
  it('向已有项目添加 ai 模块', async () => {
    const dir = path.join(tmpRoot, 'add-ai')
    await fse.ensureDir(dir)
    await fse.writeJson(path.join(dir, 'package.json'), {
      name: 'add-test',
      version: '0.1.0',
      dependencies: { '@h-ai/core': 'workspace:*' },
    }, { spaces: 2 })

    await addModule({ module: 'ai', install: false, cwd: dir, verbose: false })

    const pkg = await fse.readJson(path.join(dir, 'package.json'))
    expect(pkg.dependencies['@h-ai/ai']).toBeDefined()
  })

  it('应生成对应的 config/ai.yml', async () => {
    const dir = path.join(tmpRoot, 'add-ai')
    expect(await fse.pathExists(path.join(dir, 'config', '_ai.yml'))).toBe(true)
  })

  it('向项目添加 storage 模块', async () => {
    const dir = path.join(tmpRoot, 'add-storage')
    await fse.ensureDir(dir)
    await fse.writeJson(path.join(dir, 'package.json'), {
      name: 'add-storage-test',
      version: '0.1.0',
      dependencies: { '@h-ai/core': 'workspace:*' },
    }, { spaces: 2 })

    await addModule({ module: 'storage', install: false, cwd: dir, verbose: false })

    const pkg = await fse.readJson(path.join(dir, 'package.json'))
    expect(pkg.dependencies['@h-ai/storage']).toBeDefined()
    expect(await fse.pathExists(path.join(dir, 'config', '_storage.yml'))).toBe(true)
  })

  it('添加 iam 时自动引入依赖 @h-ai/crypto', async () => {
    const dir = path.join(tmpRoot, 'add-iam')
    await fse.ensureDir(dir)
    await fse.writeJson(path.join(dir, 'package.json'), {
      name: 'add-iam-test',
      version: '0.1.0',
      dependencies: {
        '@h-ai/core': 'workspace:*',
        '@h-ai/reldb': 'workspace:*',
        '@h-ai/cache': 'workspace:*',
      },
    }, { spaces: 2 })

    await addModule({ module: 'iam', install: false, cwd: dir, verbose: false })

    const pkg = await fse.readJson(path.join(dir, 'package.json'))
    expect(pkg.dependencies['@h-ai/iam']).toBeDefined()
    expect(pkg.dependencies['@h-ai/crypto']).toBeDefined()
  })

  it('目标模块已安装时不重复更新', async () => {
    const dir = path.join(tmpRoot, 'add-existing')
    await fse.ensureDir(dir)
    const originalPkg = {
      name: 'add-existing-test',
      version: '0.1.0',
      dependencies: {
        '@h-ai/core': 'workspace:*',
        '@h-ai/reldb': 'workspace:*',
      },
    }
    await fse.writeJson(path.join(dir, 'package.json'), originalPkg, { spaces: 2 })

    // db 已安装，addModule 应静默退出
    await addModule({ module: 'db', install: false, cwd: dir, verbose: false })

    const pkg = await fse.readJson(path.join(dir, 'package.json'))
    // 版本号不应被更改
    expect(pkg.dependencies['@h-ai/reldb']).toBe('workspace:*')
    // 不应多出无关依赖
    expect(Object.keys(pkg.dependencies)).toHaveLength(2)
  })
})

// =============================================================================
// 6. initProject
// =============================================================================

describe('initProject', () => {
  it('校验并补全缺失的 config 文件', async () => {
    const dir = path.join(tmpRoot, 'init-missing')
    await fse.ensureDir(path.join(dir, 'config'))
    await fse.writeJson(path.join(dir, 'package.json'), {
      name: 'init-test',
      version: '0.1.0',
      dependencies: {
        '@h-ai/core': 'workspace:*',
        '@h-ai/reldb': 'workspace:*',
        '@h-ai/cache': 'workspace:*',
      },
    }, { spaces: 2 })
    // 故意只写 core 配置，缺少 db / cache
    await fse.writeFile(path.join(dir, 'config', '_core.yml'), 'name: init-test\n')

    await initProject({ cwd: dir, force: false, verbose: false })

    expect(await fse.pathExists(path.join(dir, 'config', '_db.yml'))).toBe(true)
    expect(await fse.pathExists(path.join(dir, 'config', '_cache.yml'))).toBe(true)
  })

  it('--force 时覆盖已有配置', async () => {
    const dir = path.join(tmpRoot, 'init-force')
    await fse.ensureDir(path.join(dir, 'config'))
    await fse.writeJson(path.join(dir, 'package.json'), {
      name: 'init-force-test',
      version: '0.1.0',
      dependencies: {
        '@h-ai/core': 'workspace:*',
        '@h-ai/reldb': 'workspace:*',
      },
    }, { spaces: 2 })
    const original = '# old config\n'
    await fse.writeFile(path.join(dir, 'config', '_db.yml'), original)

    await initProject({ cwd: dir, force: true, verbose: false })

    const content = await fse.readFile(path.join(dir, 'config', '_db.yml'), 'utf-8')
    // 强制重写后内容不再是原始占位符
    expect(content).not.toBe(original)
  })

  it('无 package.json 时不崩溃', async () => {
    const dir = path.join(tmpRoot, 'init-no-pkg')
    await fse.ensureDir(dir)

    // 应静默返回（无异常）
    await expect(initProject({ cwd: dir, verbose: false })).resolves.toBeUndefined()
  })
})

// =============================================================================
// 7. generate — 各生成器
// =============================================================================

describe('generate', () => {
  let projectDir: string

  beforeAll(async () => {
    projectDir = path.join(tmpRoot, 'gen-project')
    await fse.ensureDir(projectDir)
    await fse.writeJson(path.join(projectDir, 'package.json'), {
      name: 'gen-test',
      version: '0.1.0',
      dependencies: { '@h-ai/core': 'workspace:*' },
    })
  })

  describe('generate page', () => {
    it('应生成 +page.svelte 和 +page.server.ts', async () => {
      await generate({
        type: 'page',
        name: 'dashboard',
        output: path.join(projectDir, 'src/routes'),
        force: false,
        verbose: false,
        cwd: projectDir,
      })

      expect(await fse.pathExists(path.join(projectDir, 'src/routes/dashboard/+page.svelte'))).toBe(true)
      expect(await fse.pathExists(path.join(projectDir, 'src/routes/dashboard/+page.server.ts'))).toBe(true)
    })

    it('+page.svelte 包含 PascalCase 名称', async () => {
      const content = await fse.readFile(
        path.join(projectDir, 'src/routes/dashboard/+page.svelte'),
        'utf-8',
      )
      expect(content).toContain('Dashboard')
    })
  })

  describe('generate component', () => {
    it('应生成 .svelte 组件文件', async () => {
      await generate({
        type: 'component',
        name: 'UserCard',
        output: path.join(projectDir, 'src/lib/components'),
        force: false,
        verbose: false,
        cwd: projectDir,
      })

      expect(await fse.pathExists(
        path.join(projectDir, 'src/lib/components/UserCard.svelte'),
      )).toBe(true)
    })

    it('组件包含 $props() 模式', async () => {
      const content = await fse.readFile(
        path.join(projectDir, 'src/lib/components/UserCard.svelte'),
        'utf-8',
      )
      expect(content).toContain('$props()')
    })
  })

  describe('generate api', () => {
    it('应生成 +server.ts', async () => {
      await generate({
        type: 'api',
        name: 'products',
        output: path.join(projectDir, 'src/routes/api'),
        force: false,
        verbose: false,
        cwd: projectDir,
      })

      expect(await fse.pathExists(
        path.join(projectDir, 'src/routes/api/products/+server.ts'),
      )).toBe(true)
    })

    it('+server.ts 包含 GET 和 POST handler', async () => {
      const content = await fse.readFile(
        path.join(projectDir, 'src/routes/api/products/+server.ts'),
        'utf-8',
      )
      expect(content).toContain('GET')
      expect(content).toContain('POST')
    })
  })

  describe('generate model', () => {
    it('应生成模型文件', async () => {
      await generate({
        type: 'model',
        name: 'order',
        output: path.join(projectDir, 'src/lib/models'),
        force: false,
        verbose: false,
        cwd: projectDir,
      })

      expect(await fse.pathExists(
        path.join(projectDir, 'src/lib/models/order.ts'),
      )).toBe(true)
    })

    it('模型包含 Schema 和类型导出', async () => {
      const content = await fse.readFile(
        path.join(projectDir, 'src/lib/models/order.ts'),
        'utf-8',
      )
      expect(content).toContain('orderSchema')
      expect(content).toContain('export type Order')
    })
  })

  describe('generate migration', () => {
    it('应生成带时间戳的迁移文件', async () => {
      await generate({
        type: 'migration',
        name: 'add-orders',
        output: path.join(projectDir, 'migrations'),
        force: false,
        verbose: false,
        cwd: projectDir,
      })

      const files = await fse.readdir(path.join(projectDir, 'migrations'))
      expect(files.some(f => f.endsWith('_add_orders.ts'))).toBe(true)
    })

    it('迁移文件包含 up/down 函数', async () => {
      const files = await fse.readdir(path.join(projectDir, 'migrations'))
      const migrationFile = files.find(f => f.endsWith('_add_orders.ts'))!
      const content = await fse.readFile(
        path.join(projectDir, 'migrations', migrationFile),
        'utf-8',
      )
      expect(content).toContain('export const up')
      expect(content).toContain('export const down')
    })
  })
})
