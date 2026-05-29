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

import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fse from 'fs-extra'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addModule } from '../src/commands/cli-add.js'
import { createProject, detectProject } from '../src/commands/cli-create.js'
import { generate } from '../src/commands/cli-generate.js'
import { initProject } from '../src/commands/cli-init.js'

// =============================================================================
// 测试工具
// =============================================================================

const tmpRoot = path.join(process.cwd(), '.tmp-commands-e2e')
const HAI_DEP_VERSION = `^${fse.readJsonSync(fileURLToPath(new URL('../package.json', import.meta.url))).version}`

async function readJson(dir: string, rel: string) {
  return fse.readJson(path.join(dir, rel))
}

async function readText(dir: string, rel: string) {
  return fse.readFile(path.join(dir, rel), 'utf-8')
}

async function exists(dir: string, rel: string) {
  return fse.pathExists(path.join(dir, rel))
}

function expectQualityGateScripts(pkg: { scripts?: Record<string, string> }) {
  expect(pkg.scripts?.build).toBeDefined()
  expect(pkg.scripts?.typecheck).toBeDefined()
  expect(pkg.scripts?.lint).toBeDefined()
  expect(pkg.scripts?.test).toBeDefined()
  expect(pkg.scripts?.['test:e2e']).toBeDefined()
}

function expectHaiDepsUseCurrentVersion(pkg: { dependencies?: Record<string, string> }) {
  for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
    if (name.startsWith('@h-ai/')) {
      expect(version).toBe(HAI_DEP_VERSION)
    }
  }
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
    expect(pkg.dependencies['@h-ai/reldb']).toBe(HAI_DEP_VERSION)
    expect(pkg.dependencies['@h-ai/cache']).toBe(HAI_DEP_VERSION)
    expectHaiDepsUseCurrentVersion(pkg)
  })

  it('应生成可执行质量门禁脚本', async () => {
    const pkg = await readJson(projectPath, 'package.json')
    expectQualityGateScripts(pkg)
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

  it('应生成从页面发起的 E2E 测试', async () => {
    const spec = await readText(projectPath, 'e2e/app.spec.ts')
    expect(spec).toContain('page.goto')
    expect(spec).toContain('home page renders from browser')

    const config = await readText(projectPath, 'playwright.config.ts')
    expect(config).toMatch(/channel:\s+'chrome'/)
  })

  it('应生成已引用模块对应的 skills', async () => {
    expect(await exists(projectPath, '.agents/skills/hai-core/SKILL.md')).toBe(true)
    expect(await exists(projectPath, '.agents/skills/hai-reldb/SKILL.md')).toBe(true)
    expect(await exists(projectPath, '.agents/skills/hai-cache/SKILL.md')).toBe(true)
  })
})

describe('createProject — --yes 非交互默认配置', () => {
  let projectPath: string

  beforeAll(async () => {
    projectPath = path.join(tmpRoot, 'proj-api-yes')
    await createProject({
      name: 'proj-api-yes',
      appType: 'api',
      template: 'minimal',
      examples: false,
      install: false,
      git: false,
      packageManager: 'pnpm',
      yes: true,
      verbose: false,
      cwd: tmpRoot,
    })
  })

  it('应使用默认模块配置生成可用 API 样板', async () => {
    const coreConfig = await readText(projectPath, 'config/_core.yml')
    const dbConfig = await readText(projectPath, 'config/_db.yml')
    const cacheConfig = await readText(projectPath, 'config/_cache.yml')
    const pkg = await readJson(projectPath, 'package.json')

    expect(coreConfig).toContain('proj-api-yes')
    expect(coreConfig).toContain('zh-CN')
    expect(dbConfig).toContain('sqlite')
    expect(dbConfig).toContain('./data/app.db')
    expect(cacheConfig).toContain('memory')
    expectQualityGateScripts(pkg)
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
    expect(pkg.dependencies['@h-ai/iam']).toBe(HAI_DEP_VERSION)
    expect(pkg.dependencies['@h-ai/crypto']).toBe(HAI_DEP_VERSION)
    expectHaiDepsUseCurrentVersion(pkg)
    expectQualityGateScripts(pkg)
  })

  it('package.json 包含 paraglide devDep（i18n）', async () => {
    const pkg = await readJson(projectPath, 'package.json')
    expect(pkg.devDependencies?.['@inlang/paraglide-js']).toBeDefined()
  })

  it('hooks.server.ts 包含 auth.verifyToken 配置', async () => {
    const content = await readText(projectPath, 'src/hooks.server.ts')
    expect(content).toContain('auth:')
    expect(content).toContain('verifyToken:')
    expect(content).toContain('iam.auth.verifyToken')
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

  it('应生成 .agents/skills 中的 skill 文件', async () => {
    expect(await exists(projectPath, '.agents/skills/hai-iam/SKILL.md')).toBe(true)
  })

  it('应生成从页面发起的 E2E 测试', async () => {
    const spec = await readText(projectPath, 'e2e/app.spec.ts')
    expect(spec).toContain('page.goto')
    expect(spec).toContain('home page renders from browser')
  })

  it('不应再生成 .github/skills 目录', async () => {
    expect(await exists(projectPath, '.github/skills')).toBe(false)
  })

  it('应生成 opencode.json 并声明 instructions 与 skills.paths', async () => {
    const opencode = await readJson(projectPath, 'opencode.json')
    expect(opencode.instructions).toEqual(['AGENTS.md'])
    expect(opencode.skills.paths).toEqual(['.agents/skills'])
  })

  it('不应生成额外的 .codex/.opencode skill 树', async () => {
    expect(await exists(projectPath, '.codex/skills')).toBe(false)
    expect(await exists(projectPath, '.opencode/skills')).toBe(false)
  })

  it('agents.md、claude.md 与 copilot 指引应保留共享技能入口说明', async () => {
    const agents = await readText(projectPath, 'AGENTS.md')
    const claude = await readText(projectPath, 'CLAUDE.md')
    const copilot = await readText(projectPath, '.github/copilot-instructions.md')

    expect(agents).toContain('.agents/skills/')
    expect(agents).toContain('packages/<project>-serv')
    expect(agents).toContain('## 完成条件')
    expect(agents).toContain('pnpm typecheck')
    expect(claude).toContain('@AGENTS.md')
    expect(claude).toContain('.agents/skills/')
    expect(claude).toContain('质量门禁与完成条件')
    expect(copilot).toContain('.agents/skills/')
    expect(copilot).toContain('Fullstack 服务端')
    expect(copilot).not.toContain('路由/SSR')
    expect(copilot).toContain('## 质量门禁')
    expect(copilot).toContain('## 完成条件')
  })
})

// =============================================================================
// 2.5. createProject — Git 远程仓库地址
// =============================================================================

describe('createProject — git remote', () => {
  let projectPath: string

  beforeAll(async () => {
    projectPath = path.join(tmpRoot, 'proj-git-remote')
    await createProject({
      name: 'proj-git-remote',
      appType: 'api',
      template: 'custom',
      features: [],
      moduleConfigs: {
        core: { name: 'proj-git-remote', defaultLocale: 'zh-CN' },
      },
      examples: false,
      install: false,
      git: true,
      gitRemote: 'https://github.com/test/test-repo.git',
      packageManager: 'pnpm',
      verbose: false,
      cwd: tmpRoot,
    })
  })

  it('应初始化 .git 目录', async () => {
    expect(await exists(projectPath, '.git')).toBe(true)
  })

  it('应设置 git remote origin', () => {
    const url = execSync('git remote get-url origin', { cwd: projectPath, encoding: 'utf-8' }).trim()
    expect(url).toBe('https://github.com/test/test-repo.git')
  })
})

// =============================================================================
// 2.6. createProject — eslint.config.js 与 vitest.config.ts
// =============================================================================

describe('createProject — 基础配置文件', () => {
  it('api 项目应包含 eslint.config.js', async () => {
    const projectPath = path.join(tmpRoot, 'proj-api')
    const content = await readText(projectPath, 'eslint.config.js')
    expect(content).toContain('@antfu/eslint-config')
  })

  it('api 项目应包含 vitest.config.ts', async () => {
    const projectPath = path.join(tmpRoot, 'proj-api')
    expect(await exists(projectPath, 'vitest.config.ts')).toBe(true)
  })

  it('admin 项目应包含 eslint.config.js', async () => {
    const projectPath = path.join(tmpRoot, 'proj-admin')
    expect(await exists(projectPath, 'eslint.config.js')).toBe(true)
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

  it('应生成质量门禁脚本与页面级 E2E', async () => {
    const pkg = await readJson(projectPath, 'package.json')
    expectQualityGateScripts(pkg)
    expectHaiDepsUseCurrentVersion(pkg)

    const spec = await readText(projectPath, 'e2e/app.spec.ts')
    expect(spec).toContain('page.goto')
  })
})

// =============================================================================
// 3.5. createProject — 前后端分离工程
// =============================================================================

describe('createProject — fullstack 类型', () => {
  let projectPath: string

  beforeAll(async () => {
    projectPath = path.join(tmpRoot, 'proj-fullstack')
    await createProject({
      name: 'proj-fullstack',
      appType: 'fullstack',
      frontends: ['web', 'app', 'miniapp', 'desktop'],
      template: 'custom',
      features: [],
      moduleConfigs: {
        core: { name: 'proj-fullstack', defaultLocale: 'zh-CN' },
      },
      examples: false,
      install: false,
      git: false,
      packageManager: 'pnpm',
      verbose: false,
      cwd: tmpRoot,
    })
  })

  it('应生成 pnpm workspace 多包工程', async () => {
    const workspace = await readText(projectPath, 'pnpm-workspace.yaml')
    expect(workspace).toContain('packages/*')
    expect(workspace).toContain('apps/*')

    const pkg = await readJson(projectPath, 'package.json')
    expect(pkg.scripts['i18n:compile']).toBe('pnpm --filter proj-fullstack-shared paraglide:compile && pnpm --filter proj-fullstack-web paraglide:compile && pnpm --filter proj-fullstack-app paraglide:compile && pnpm --filter proj-fullstack-desktop paraglide:compile')
    expect(pkg.scripts.typecheck).toBe('pnpm --filter proj-fullstack-contract build && pnpm i18n:compile && pnpm -r --if-present typecheck')
    expect(pkg.scripts.test).toBe('pnpm --filter proj-fullstack-contract build && pnpm i18n:compile && pnpm -r --if-present test')
    expect(pkg.scripts.postinstall).toBe('pnpm i18n:compile')
    expect(pkg.scripts['test:e2e']).toContain('playwright test')
    expect(pkg.dependencies['proj-fullstack-contract']).toBe('workspace:*')
    expect(pkg.dependencies['proj-fullstack-shared']).toBe('workspace:*')
    expect(pkg.devDependencies['@playwright/test']).toBe('^1.60.0')
    expect(pkg.devDependencies.typescript).toBe('^6.0.3')

    const readme = await readText(projectPath, 'README.md')
    expect(readme).toContain('packages/proj-fullstack-shared')
    expect(readme).toContain('i18n 与 shared 协同')

    const eslintConfig = await readText(projectPath, 'eslint.config.js')
    expect(eslintConfig).toContain('\'svelte/indent\': \'off\'')
  })

  it('不应生成未渲染的 Handlebars 字面量路径', async () => {
    expect(await exists(projectPath, 'packages/{{projectName}}-contract')).toBe(false)
    expect(await exists(projectPath, 'apps/{{projectName}}-web')).toBe(false)
  })

  it('应生成 contract 包并使用最新 hai 契约依赖', async () => {
    const pkg = await readJson(projectPath, 'packages/proj-fullstack-contract/package.json')
    expect(pkg.name).toBe('proj-fullstack-contract')
    expect(pkg.dependencies['@h-ai/api-contract']).toBe(HAI_DEP_VERSION)
    expectHaiDepsUseCurrentVersion(pkg)
    expect(await exists(projectPath, 'packages/proj-fullstack-contract/src/index.ts')).toBe(true)
    expect(await exists(projectPath, 'packages/proj-fullstack-contract/src/app-contract.ts')).toBe(true)
    expect(await exists(projectPath, 'packages/proj-fullstack-contract/src/app-schemas.ts')).toBe(true)
    expect(await exists(projectPath, 'packages/proj-fullstack-contract/src/proj-fullstack-contract.ts')).toBe(true)
    expect(await exists(projectPath, 'packages/proj-fullstack-contract/tests/contract.test.ts')).toBe(true)

    const appContract = await readText(projectPath, 'packages/proj-fullstack-contract/src/app-contract.ts')
    expect(appContract).toContain('apiContract.route')
    expect(appContract).toContain('APP_CONTRACT_ROUTES.info')
  })

  it('应生成 serv 包、单元测试和可启动入口', async () => {
    const pkg = await readJson(projectPath, 'packages/proj-fullstack-serv/package.json')
    expect(pkg.name).toBe('proj-fullstack-serv')
    expect(pkg.dependencies['@h-ai/serv']).toBe(HAI_DEP_VERSION)
    expect(pkg.dependencies.hono).toBeUndefined()
    expect(pkg.dependencies['proj-fullstack-contract']).toBe('workspace:*')
    expectHaiDepsUseCurrentVersion(pkg)
    expect(pkg.scripts.start).toBe('node dist/index.js')
    expect(await exists(projectPath, 'packages/proj-fullstack-serv/src/server-app.ts')).toBe(true)
    expect(await exists(projectPath, 'packages/proj-fullstack-serv/src/server/procedures/app-procedures.ts')).toBe(true)
    expect(await exists(projectPath, 'packages/proj-fullstack-serv/tests/server-app.test.ts')).toBe(true)

    const serverApp = await readText(projectPath, 'packages/proj-fullstack-serv/src/server-app.ts')
    expect(serverApp).toContain('export interface ServerApp')
    expect(serverApp).toContain('createServerApp(): ServerApp')
    expect(serverApp).toContain('serv.createApp')
    expect(serverApp).not.toContain('import type { ServHttpApp }')
    expect(serverApp).not.toContain('from \'hono\'')
    expect(serverApp).not.toContain(': Hono')

    const procedures = await readText(projectPath, 'packages/proj-fullstack-serv/src/server/procedures/app-procedures.ts')
    expect(procedures).toContain('serv.implement(appContract)')

    const testFile = await readText(projectPath, 'packages/proj-fullstack-serv/tests/server-app.test.ts')
    expect(testFile).toContain('returns echo result as HaiResult')
  })

  it('应按多选前端生成 web / app / desktop 工程', async () => {
    for (const target of ['web', 'app', 'desktop']) {
      const pkg = await readJson(projectPath, `apps/proj-fullstack-${target}/package.json`)
      expect(pkg.name).toBe(`proj-fullstack-${target}`)
      expect(pkg.dependencies['proj-fullstack-contract']).toBe('workspace:*')
      expect(pkg.dependencies['@h-ai/api-client']).toBe(HAI_DEP_VERSION)
      expect(pkg.dependencies['@h-ai/ui']).toBe(HAI_DEP_VERSION)
      expect(pkg.devDependencies['@tailwindcss/vite']).toBeDefined()
      expect(pkg.devDependencies.daisyui).toBeDefined()
      expect(pkg.devDependencies.tailwindcss).toBeDefined()
      expect(pkg.devDependencies.svelte).toBe('^5.55.9')
      expect(pkg.devDependencies.vite).toBe('^8.0.14')
      expect(pkg.dependencies['proj-fullstack-shared']).toBe('workspace:*')
      expect(pkg.scripts['paraglide:compile']).toContain('paraglide-js compile')
      expect(pkg.scripts.typecheck).toContain('pnpm paraglide:compile')
      expect(await exists(projectPath, `apps/proj-fullstack-${target}/src/routes/+page.svelte`)).toBe(true)
      expect(await exists(projectPath, `apps/proj-fullstack-${target}/project.inlang/settings.json`)).toBe(true)
      expect(await exists(projectPath, `apps/proj-fullstack-${target}/messages/zh-CN.json`)).toBe(true)
      expect(await exists(projectPath, `apps/proj-fullstack-${target}/messages/en-US.json`)).toBe(true)
      expect(await exists(projectPath, `apps/proj-fullstack-${target}/tests/api.test.ts`)).toBe(true)
      expect(await exists(projectPath, `apps/proj-fullstack-${target}/eslint.config.js`)).toBe(true)

      const eslintConfig = await readText(projectPath, `apps/proj-fullstack-${target}/eslint.config.js`)
      expect(eslintConfig).toContain('\'svelte/indent\': \'off\'')

      const page = await readText(projectPath, `apps/proj-fullstack-${target}/src/routes/+page.svelte`)
      expect(page).toContain('@h-ai/ui')
      expect(page).toContain('proj-fullstack-shared')
      expect(page).toContain('import * as appM')
      expect(page).toContain('messages as sharedM')
      expect(page).toContain('<Card')

      const css = await readText(projectPath, `apps/proj-fullstack-${target}/src/app.css`)
      expect(css).toContain('@import \'@h-ai/ui/styles/global.css\'')
      expect(css).toContain('--default')

      const viteConfig = await readText(projectPath, `apps/proj-fullstack-${target}/vite.config.ts`)
      expect(viteConfig).toContain('tailwindcss()')
      expect(viteConfig).toContain('paraglideVitePlugin')
      expect(viteConfig).toContain('project: \'./project.inlang\'')

      const layout = await readText(projectPath, `apps/proj-fullstack-${target}/src/routes/+layout.svelte`)
      expect(layout).toContain('AppShell')
      expect(layout).toContain(`platform="${target}"`)
      expect(layout).toContain('syncLocale')

      const apiTest = await readText(projectPath, `apps/proj-fullstack-${target}/tests/api.test.ts`)
      expect(apiTest).toContain('proj-fullstack-shared')
    }

    // shared 包断言
    const sharedPkg = await readJson(projectPath, 'packages/proj-fullstack-shared/package.json')
    expect(sharedPkg.name).toBe('proj-fullstack-shared')
    expect(sharedPkg.dependencies['proj-fullstack-contract']).toBe('workspace:*')
    expect(sharedPkg.devDependencies['@inlang/paraglide-js']).toBeDefined()
    expect(sharedPkg.devDependencies['@inlang/plugin-message-format']).toBeDefined()
    expect(sharedPkg.scripts['paraglide:compile']).toContain('paraglide-js compile')
    expect(await exists(projectPath, 'packages/proj-fullstack-shared/project.inlang/settings.json')).toBe(true)
    expect(await exists(projectPath, 'packages/proj-fullstack-shared/messages/zh-CN.json')).toBe(true)
    expect(await exists(projectPath, 'packages/proj-fullstack-shared/messages/en-US.json')).toBe(true)
    expect(await exists(projectPath, 'packages/proj-fullstack-shared/src/lib/components/AppShell.svelte')).toBe(true)
    expect(await exists(projectPath, 'packages/proj-fullstack-shared/src/lib/components/ThemeSwitcher.svelte')).toBe(true)
    expect(await exists(projectPath, 'packages/proj-fullstack-shared/src/lib/components/LanguageSwitcher.svelte')).toBe(true)
    expect(await exists(projectPath, 'packages/proj-fullstack-shared/src/lib/api/api-client.ts')).toBe(true)
    expect(await exists(projectPath, 'packages/proj-fullstack-shared/src/index.ts')).toBe(true)

    const inlangSettings = await readJson(projectPath, 'packages/proj-fullstack-shared/project.inlang/settings.json')
    expect(inlangSettings.baseLocale).toBe('zh-CN')
    expect(inlangSettings.locales).toContain('zh-CN')
    expect(inlangSettings.locales).toContain('en-US')
  })

  it('miniapp 仅生成预留说明，不生成不可运行 package', async () => {
    const content = await readText(projectPath, 'apps/proj-fullstack-miniapp/README.md')
    expect(content).toContain('预留占位')
    expect(await exists(projectPath, 'apps/proj-fullstack-miniapp/project.inlang/settings.json')).toBe(true)
    expect(await exists(projectPath, 'apps/proj-fullstack-miniapp/messages/zh-CN.json')).toBe(true)
    expect(await exists(projectPath, 'apps/proj-fullstack-miniapp/messages/en-US.json')).toBe(true)
    expect(await exists(projectPath, 'apps/proj-fullstack-miniapp/package.json')).toBe(false)
  })

  it('应生成根 E2E 测试和 Playwright 多服务配置', async () => {
    const config = await readText(projectPath, 'playwright.config.ts')
    expect(config).toContain('webServer: [')
    expect(config).toContain('proj-fullstack-serv')
    expect(config).toContain('proj-fullstack-web')
    expect(config).toMatch(/channel:\s+'chrome'/)
    expect(config).toContain('reuseExistingServer: false')

    const spec = await readText(projectPath, 'e2e/fullstack.spec.ts')
    expect(spec).toContain('service echo endpoint returns HaiResult')
    expect(spec).toContain('frontend loads service status from page')
    expect(spec).toContain('page.goto')
  })

  it('应生成 serv / api-contract / api-client 对应 Skill', async () => {
    expect(await exists(projectPath, '.agents/skills/hai-fullstack/SKILL.md')).toBe(false)
    expect(await exists(projectPath, '.agents/skills/hai-serv/SKILL.md')).toBe(true)
    expect(await exists(projectPath, '.agents/skills/hai-api-contract/SKILL.md')).toBe(true)
    expect(await exists(projectPath, '.agents/skills/hai-api-client/SKILL.md')).toBe(true)
    expect(await exists(projectPath, '.agents/skills/hai-ui/SKILL.md')).toBe(true)
  })

  it('应生成包含 fullstack 职责边界、质量门禁与完成条件的 AI 指引', async () => {
    const agents = await readText(projectPath, 'AGENTS.md')
    const claude = await readText(projectPath, 'CLAUDE.md')
    const copilot = await readText(projectPath, '.github/copilot-instructions.md')

    expect(agents).toContain('packages/<project>-serv')
    expect(agents).toContain('## 完成条件')
    expect(agents).toContain('pnpm typecheck')
    expect(claude).toContain('@AGENTS.md')
    expect(claude).toContain('质量门禁与完成条件')
    expect(copilot).toContain('Fullstack 服务端')
    expect(copilot).toContain('## 质量门禁')
    expect(copilot).toContain('## 完成条件')
    expect(copilot).not.toContain('路由/SSR')
  })
})

describe('createProject — fullstack 前端条件生成', () => {
  let projectPath: string

  beforeAll(async () => {
    projectPath = path.join(tmpRoot, 'proj-fullstack-web-only')
    await createProject({
      name: 'proj-fullstack-web-only',
      appType: 'fullstack',
      frontends: ['web'],
      template: 'custom',
      features: [],
      moduleConfigs: {
        core: { name: 'proj-fullstack-web-only', defaultLocale: 'zh-CN' },
      },
      examples: false,
      install: false,
      git: false,
      packageManager: 'pnpm',
      verbose: false,
      cwd: tmpRoot,
    })
  })

  it('只生成被选择的可运行前端', async () => {
    expect(await exists(projectPath, 'apps/proj-fullstack-web-only-web/package.json')).toBe(true)
    expect(await exists(projectPath, 'apps/proj-fullstack-web-only-app/package.json')).toBe(false)
    expect(await exists(projectPath, 'apps/proj-fullstack-web-only-desktop/package.json')).toBe(false)
    expect(await exists(projectPath, 'apps/proj-fullstack-web-only-miniapp/README.md')).toBe(false)
  })
})

describe('createProject — fullstack --yes 默认前端', () => {
  let projectPath: string

  beforeAll(async () => {
    projectPath = path.join(tmpRoot, 'proj-fullstack-yes')
    await createProject({
      name: 'proj-fullstack-yes',
      appType: 'fullstack',
      template: 'custom',
      features: [],
      examples: false,
      install: false,
      git: false,
      packageManager: 'pnpm',
      yes: true,
      verbose: false,
      cwd: tmpRoot,
    })
  })

  it('应使用 web / app / desktop 默认前端且不生成 miniapp 占位', async () => {
    expect(await exists(projectPath, 'apps/proj-fullstack-yes-web/package.json')).toBe(true)
    expect(await exists(projectPath, 'apps/proj-fullstack-yes-app/package.json')).toBe(true)
    expect(await exists(projectPath, 'apps/proj-fullstack-yes-desktop/package.json')).toBe(true)
    expect(await exists(projectPath, 'apps/proj-fullstack-yes-miniapp/README.md')).toBe(false)
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

  it('添加 ai 时应同步生成 GitHub/OpenCode Skill 文件与配置', async () => {
    const dir = path.join(tmpRoot, 'add-ai')
    expect(await fse.pathExists(path.join(dir, '.agents/skills/hai-ai/SKILL.md'))).toBe(true)
    expect(await fse.pathExists(path.join(dir, '.github/skills'))).toBe(false)

    const opencode = await fse.readJson(path.join(dir, 'opencode.json'))
    expect(opencode.instructions).toEqual(['AGENTS.md'])
    expect(opencode.skills.paths).toEqual(['.agents/skills'])

    expect(await fse.pathExists(path.join(dir, '.codex/skills'))).toBe(false)
    expect(await fse.pathExists(path.join(dir, '.opencode/skills'))).toBe(false)
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

  it('目标模块已安装但缺少 AI 支持文件时应回填兼容输出', async () => {
    const dir = path.join(tmpRoot, 'add-backfill-ai-support')
    await fse.ensureDir(dir)
    await fse.writeJson(path.join(dir, 'package.json'), {
      name: 'add-backfill-ai-support-test',
      version: '0.1.0',
      dependencies: {
        '@h-ai/core': 'workspace:*',
        '@h-ai/ai': 'workspace:*',
      },
    }, { spaces: 2 })

    await addModule({ module: 'ai', install: false, cwd: dir, verbose: false })

    expect(await fse.pathExists(path.join(dir, '.github/copilot-instructions.md'))).toBe(true)
    expect(await fse.pathExists(path.join(dir, 'AGENTS.md'))).toBe(true)
    expect(await fse.pathExists(path.join(dir, 'CLAUDE.md'))).toBe(true)
    expect(await fse.pathExists(path.join(dir, 'opencode.json'))).toBe(true)
    expect(await fse.pathExists(path.join(dir, '.agents/skills/hai-build/SKILL.md'))).toBe(true)
    expect(await fse.pathExists(path.join(dir, '.agents/skills/hai-core/SKILL.md'))).toBe(true)
    expect(await fse.pathExists(path.join(dir, '.agents/skills/hai-ai/SKILL.md'))).toBe(true)
    expect(await fse.pathExists(path.join(dir, '.github/skills'))).toBe(false)

    const opencode = await fse.readJson(path.join(dir, 'opencode.json'))
    expect(opencode.instructions).toEqual(['AGENTS.md'])
    expect(opencode.skills.paths).toEqual(['.agents/skills'])
  })

  it('回填 AI 支持时不应覆盖已有桥接文件，也不应删除遗留 .github/skills', async () => {
    const dir = path.join(tmpRoot, 'add-preserve-existing-ai-files')
    await fse.ensureDir(path.join(dir, '.github', 'skills', 'hai-ai'))
    await fse.writeJson(path.join(dir, 'package.json'), {
      name: 'add-preserve-existing-ai-files-test',
      version: '0.1.0',
      dependencies: {
        '@h-ai/core': 'workspace:*',
        '@h-ai/ai': 'workspace:*',
      },
    }, { spaces: 2 })

    await fse.writeFile(path.join(dir, 'AGENTS.md'), '# custom agents\n')
    await fse.writeFile(path.join(dir, 'CLAUDE.md'), '# custom claude\n')
    await fse.ensureDir(path.join(dir, '.github'))
    await fse.writeFile(path.join(dir, '.github', 'copilot-instructions.md'), '# custom copilot\n')
    await fse.writeJson(path.join(dir, 'opencode.json'), {
      instructions: ['CUSTOM.md'],
      skills: { paths: ['legacy-skills'] },
    }, { spaces: 2 })
    await fse.writeFile(path.join(dir, '.github', 'skills', 'hai-ai', 'SKILL.md'), 'legacy skill\n')

    await addModule({ module: 'ai', install: false, cwd: dir, verbose: false })

    expect(await fse.readFile(path.join(dir, 'AGENTS.md'), 'utf8')).toBe('# custom agents\n')
    expect(await fse.readFile(path.join(dir, 'CLAUDE.md'), 'utf8')).toBe('# custom claude\n')
    expect(await fse.readFile(path.join(dir, '.github', 'copilot-instructions.md'), 'utf8')).toBe('# custom copilot\n')

    const opencode = await fse.readJson(path.join(dir, 'opencode.json'))
    expect(opencode.instructions).toEqual(['CUSTOM.md'])
    expect(opencode.skills.paths).toEqual(['legacy-skills'])

    expect(await fse.pathExists(path.join(dir, '.agents/skills/hai-build/SKILL.md'))).toBe(true)
    expect(await fse.pathExists(path.join(dir, '.agents/skills/hai-core/SKILL.md'))).toBe(true)
    expect(await fse.pathExists(path.join(dir, '.agents/skills/hai-ai/SKILL.md'))).toBe(true)
    expect(await fse.readFile(path.join(dir, '.github', 'skills', 'hai-ai', 'SKILL.md'), 'utf8')).toBe('legacy skill\n')
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
