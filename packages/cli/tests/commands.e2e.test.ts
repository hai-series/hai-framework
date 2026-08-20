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

import type { AppType } from '../src/cli-types.js'
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
const CATALOG_DEP_SPECIFIER = 'catalog:'
const HAI_DEP_SPECIFIER = CATALOG_DEP_SPECIFIER
const skillTemplatesDir = fileURLToPath(new URL('../templates/skills', import.meta.url))

const SKILL_EXCLUSIONS_BY_APP_TYPE: Record<AppType, string[]> = {
  'admin': ['hai-serv', 'hai-api-contract', 'hai-api-client', 'hai-capacitor'],
  'website': ['hai-serv', 'hai-api-contract', 'hai-api-client', 'hai-capacitor'],
  'h5': ['hai-serv', 'hai-api-contract', 'hai-api-client', 'hai-capacitor'],
  'api': ['hai-ui', 'hai-kit', 'hai-capacitor'],
  'mobile-app': ['hai-core', 'hai-kit', 'hai-serv', 'hai-api-contract'],
  'fullstack': ['hai-kit'],
}

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

function expectHaiDepsUseCatalog(pkg: { dependencies?: Record<string, string> }) {
  for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
    if (name.startsWith('@h-ai/')) {
      expect(version).toBe(HAI_DEP_SPECIFIER)
    }
  }
}

function expectNonWorkspaceDepsUseCatalog(pkg: {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}) {
  for (const dependencyGroup of [pkg.dependencies ?? {}, pkg.devDependencies ?? {}]) {
    for (const [name, version] of Object.entries(dependencyGroup)) {
      if (version === 'workspace:*')
        continue
      expect(version, `expected ${name} to use catalog:`).toBe(CATALOG_DEP_SPECIFIER)
    }
  }
}

function expectHaiCatalogEntries(workspaceYaml: string, packageNames: readonly string[]) {
  expect(workspaceYaml).toContain('catalog:')
  for (const packageName of packageNames) {
    expect(workspaceYaml).toContain(`'${packageName}': ${HAI_DEP_VERSION}`)
  }
}

function expectCatalogPackageNames(workspaceYaml: string, packageNames: readonly string[]) {
  expect(workspaceYaml).toContain('catalog:')
  for (const packageName of packageNames) {
    expect(workspaceYaml).toContain(`'${packageName}':`)
  }
}

async function listTemplateSkillNames() {
  const entries = await fse.readdir(skillTemplatesDir, { withFileTypes: true })
  const skillNames: string[] = []

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('hai-')) {
      continue
    }

    if (await fse.pathExists(path.join(skillTemplatesDir, entry.name, 'SKILL.md'))) {
      skillNames.push(entry.name)
    }
  }

  return skillNames.sort((a, b) => a.localeCompare(b))
}

async function expectCompatibleSkills(projectPath: string, appType: AppType) {
  const skillNames = await listTemplateSkillNames()
  const excludedSkills = new Set(SKILL_EXCLUSIONS_BY_APP_TYPE[appType])

  for (const skillName of skillNames) {
    const expected = !excludedSkills.has(skillName)
    expect(
      await exists(projectPath, `.agents/skills/${skillName}/SKILL.md`),
      `${appType} should ${expected ? '' : 'not '}include ${skillName}`,
    ).toBe(expected)
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
    expectNonWorkspaceDepsUseCatalog(pkg)
  })

  it('应生成 contract 与 service 子工程并写入 catalog/workspace 依赖', async () => {
    const contractPkg = await readJson(projectPath, 'apps/proj-api-contract/package.json')
    const servicePkg = await readJson(projectPath, 'apps/proj-api-service/package.json')

    expect(contractPkg.name).toBe('proj-api-contract')
    expect(contractPkg.dependencies['@h-ai/api-contract']).toBe(HAI_DEP_SPECIFIER)
    expect(contractPkg.dependencies.zod).toBe(CATALOG_DEP_SPECIFIER)
    expectNonWorkspaceDepsUseCatalog(contractPkg)

    expect(servicePkg.name).toBe('proj-api-service')
    expect(servicePkg.dependencies['@h-ai/core']).toBe(HAI_DEP_SPECIFIER)
    expect(servicePkg.dependencies['@h-ai/serv']).toBe(HAI_DEP_SPECIFIER)
    expect(servicePkg.dependencies['@h-ai/reldb']).toBe(HAI_DEP_SPECIFIER)
    expect(servicePkg.dependencies['@h-ai/cache']).toBe(HAI_DEP_SPECIFIER)
    expect(servicePkg.dependencies['proj-api-contract']).toBe('workspace:*')
    expect(servicePkg.devDependencies['@h-ai/api-client']).toBe(HAI_DEP_SPECIFIER)
    expectNonWorkspaceDepsUseCatalog(servicePkg)

    const workspace = await readText(projectPath, 'pnpm-workspace.yaml')
    expect(workspace).toContain('apps/*')
    expectHaiCatalogEntries(workspace, ['@h-ai/api-client', '@h-ai/api-contract', '@h-ai/core', '@h-ai/serv', '@h-ai/reldb', '@h-ai/cache'])
  })

  it('应生成可执行质量门禁脚本', async () => {
    const pkg = await readJson(projectPath, 'package.json')
    expectQualityGateScripts(pkg)
  })

  it('应生成 config/_core.yml', async () => {
    const content = await readText(projectPath, 'apps/proj-api-service/config/_core.yml')
    expect(content).toContain('proj-api')
  })

  it('应生成 config/_serv.yml', async () => {
    const content = await readText(projectPath, 'apps/proj-api-service/config/_serv.yml')
    expect(content).toContain('transport: false')
    expect(content).toContain('apiPrefix: /api/v1')
    expect(content).toContain('origin: $' + '{HAI_CORS_ORIGIN:*}')
    expect(content).toContain('credentials: $' + '{HAI_CORS_CREDENTIALS:false}')
    expect(content).toContain(
      'nativeOrigins: $' + '{HAI_CORS_NATIVEORIGINS:http://localhost,https://tauri.localhost,tauri://localhost,capacitor://localhost}',
    )
    expect(content).toContain('allowedHeaders:')
    expect(content).toContain('X-Request-Id')
  })

  it('应生成 config/_db.yml', async () => {
    const content = await readText(projectPath, 'apps/proj-api-service/config/_db.yml')
    expect(content).toContain('sqlite')
  })

  it('应生成 config/_cache.yml', async () => {
    expect(await exists(projectPath, 'apps/proj-api-service/config/_cache.yml')).toBe(true)
  })

  it('应生成 .env.example', async () => {
    expect(await exists(projectPath, 'apps/proj-api-service/.env.example')).toBe(true)
  })

  it('应生成 README.md', async () => {
    const content = await readText(projectPath, 'README.md')
    expect(content).toContain('apps/proj-api-contract')
    expect(content).toContain('apps/proj-api-service')
    expect(content).toContain('pnpm docker:build:data')
    expect(content).toContain('/app/config')
  })

  it('应生成可传入配置与嵌入数据的 API 镜像入口', async () => {
    const pkg = await readJson(projectPath, 'package.json')
    const servicePkg = await readJson(projectPath, 'apps/proj-api-service/package.json')
    const dockerfile = await readText(projectPath, 'Dockerfile')

    expect(pkg.scripts['docker:build']).toContain('--target runtime')
    expect(pkg.scripts['docker:build:data']).toContain('--build-context embedded-data=')
    expect(pkg.scripts['podman:build']).toContain('--jobs=1')
    expect(pkg.scripts['podman:build']).toContain('--format docker')
    expect(pkg.scripts['podman:build:data']).toContain('--jobs=1')
    expect(servicePkg.files).toEqual(expect.arrayContaining(['config', 'data', 'dist']))
    expect(dockerfile).toContain('pnpm --filter proj-api-service --prod deploy')
    expect(dockerfile).toContain('COPY --from=embedded-data')
    expect(dockerfile).toContain('USER node')
    expect(await exists(projectPath, '.dockerignore')).toBe(true)
  })

  it('不应有 i18n 脚手架（api 类型）', async () => {
    expect(await exists(projectPath, 'project.inlang')).toBe(false)
  })

  it('不应有 messages 目录（api 类型）', async () => {
    expect(await exists(projectPath, 'messages')).toBe(false)
  })

  it('应生成 service init.ts 含 db/cache 初始化', async () => {
    const content = await readText(projectPath, 'apps/proj-api-service/src/lib/server/init.ts')
    expect(content).toContain('@h-ai/reldb')
    expect(content).toContain('@h-ai/cache')
  })

  it('应生成 contract 与 service 关键源文件', async () => {
    expect(await exists(projectPath, 'apps/proj-api-contract/src/proj-api-contract.ts')).toBe(true)
    expect(await exists(projectPath, 'apps/proj-api-contract/src/http-transport.ts')).toBe(false)
    expect(await exists(projectPath, 'apps/proj-api-service/src/app.ts')).toBe(true)
    expect(await exists(projectPath, 'apps/proj-api-service/src/server/procedures/app-procedures.ts')).toBe(true)

    const procedures = await readText(projectPath, 'apps/proj-api-service/src/server/procedures/app-procedures.ts')
    expect(procedures).toContain('.implement(appContract)')
    expect(procedures).toContain('.context<ServContext>()')
    expect(procedures).toContain('.route(\'info\'')
    expect(procedures).toContain('.route(\'echo\',')
    expect(procedures).not.toContain('.auth()')
    expect(procedures).toContain('.build()')
    expect(procedures).not.toContain('$context')
    expect(procedures).not.toContain('requireAuth')
    expect(procedures).toContain('from \'proj-api-contract\'')
  })

  it('启用 IAM 时应为 echo 声明 route guard', async () => {
    const iamProjectPath = path.join(tmpRoot, 'proj-api-iam')
    await createProject({
      name: 'proj-api-iam',
      appType: 'api',
      template: 'custom',
      features: ['iam', 'db', 'cache'],
      moduleConfigs: {
        core: { name: 'proj-api-iam', defaultLocale: 'zh-CN' },
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

    const procedures = await readText(
      iamProjectPath,
      'apps/proj-api-iam-service/src/server/procedures/app-procedures.ts',
    )
    expect(procedures).toContain('from \'proj-api-iam-contract\'')
    expect(procedures).toContain('.route(\'echo\')')
    expect(procedures).toContain('.auth()')
    expect(procedures).toContain('context.session.userId')
    expect(procedures).not.toContain('$context')
    expect(procedures).not.toContain('requireAuth')
  })

  it('应生成 service 级 E2E 测试', async () => {
    const spec = await readText(projectPath, 'e2e/api-service.spec.ts')
    expect(spec).toContain('service health endpoint returns ok')
    expect(spec).not.toContain('page.goto')

    const config = await readText(projectPath, 'playwright.config.ts')
    expect(config).toMatch(/channel:\s+'chrome'/)
    expect(config).toContain('proj-api-service')
  })

  it('应生成 api 兼容的全量 skills', async () => {
    await expectCompatibleSkills(projectPath, 'api')
  })

  it('应生成 API 类型专属 AI 指引', async () => {
    const agents = await readText(projectPath, 'AGENTS.md')
    const copilot = await readText(projectPath, '.github/copilot-instructions.md')

    expect(agents).toContain('API 服务')
    expect(agents).toContain('apps/<project>-service')
    expect(agents).toContain('不要退回到 SvelteKit API routes 架构')
    expect(agents).not.toContain('src/routes/api/v1')
    expect(copilot).toContain('API 服务工程指引')
    expect(copilot).toContain('@h-ai/serv')
    expect(copilot).toContain('不要退回到 SvelteKit API routes')
    expect(copilot).not.toContain('src/routes/api/v1')
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
    const coreConfig = await readText(projectPath, 'apps/proj-api-yes-service/config/_core.yml')
    const dbConfig = await readText(projectPath, 'apps/proj-api-yes-service/config/_db.yml')
    const cacheConfig = await readText(projectPath, 'apps/proj-api-yes-service/config/_cache.yml')
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
    expect(pkg.dependencies['@h-ai/iam']).toBe(HAI_DEP_SPECIFIER)
    expect(pkg.dependencies['@h-ai/crypto']).toBe(HAI_DEP_SPECIFIER)
    expectHaiDepsUseCatalog(pkg)
    expectQualityGateScripts(pkg)

    const workspace = await readText(projectPath, 'pnpm-workspace.yaml')
    expectHaiCatalogEntries(workspace, ['@h-ai/core', '@h-ai/kit', '@h-ai/ui', '@h-ai/iam', '@h-ai/reldb', '@h-ai/cache', '@h-ai/crypto'])
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

  it('应生成 admin 兼容的全量 skills', async () => {
    await expectCompatibleSkills(projectPath, 'admin')
  })

  it('应生成从页面发起的 E2E 测试', async () => {
    const spec = await readText(projectPath, 'e2e/app.spec.ts')
    expect(spec).toContain('page.goto')
    expect(spec).toContain('home page renders from browser')
  })

  it('不应再生成 .github/skills 目录', async () => {
    expect(await exists(projectPath, '.github/skills')).toBe(false)
  })

  it('应生成 opencode.json 并声明补充 instructions，Skill 由 .agents/skills 原生发现', async () => {
    const opencode = await readJson(projectPath, 'opencode.json')
    expect(opencode.instructions).toEqual(['.github/copilot-instructions.md'])
    expect(opencode.skills).toBeUndefined()
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
    expect(agents).toContain('管理后台')
    expect(agents).toContain('## 完成条件')
    expect(agents).toContain('pnpm typecheck')
    expect(agents).not.toContain('packages/<project>-serv')
    expect(claude).toContain('@AGENTS.md')
    expect(claude).toContain('管理后台')
    expect(copilot).toContain('.agents/skills/')
    expect(copilot).toContain('管理后台')
    expect(copilot).not.toContain('Fullstack 服务端')
    expect(copilot).toContain('## 质量门禁')
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

  it('api 项目应为 contract/service 生成 vitest.config.ts', async () => {
    const projectPath = path.join(tmpRoot, 'proj-api')
    expect(await exists(projectPath, 'apps/proj-api-contract/vitest.config.ts')).toBe(true)
    expect(await exists(projectPath, 'apps/proj-api-service/vitest.config.ts')).toBe(true)
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
    expectHaiDepsUseCatalog(pkg)

    const workspace = await readText(projectPath, 'pnpm-workspace.yaml')
    expectHaiCatalogEntries(workspace, ['@h-ai/core', '@h-ai/kit', '@h-ai/ui'])

    const spec = await readText(projectPath, 'e2e/app.spec.ts')
    expect(spec).toContain('page.goto')
  })

  it('应生成 SvelteKit Node 容器交付文件', async () => {
    const pkg = await readJson(projectPath, 'package.json')
    const svelteConfig = await readText(projectPath, 'svelte.config.js')
    const dockerfile = await readText(projectPath, 'Dockerfile')

    expect(pkg.devDependencies['@sveltejs/adapter-node']).toBe('^5.5.4')
    expect(pkg.devDependencies['@sveltejs/adapter-auto']).toBeUndefined()
    expect(pkg.scripts['docker:build:data']).toContain('--build-context embedded-data=./data')
    expect(pkg.scripts['podman:build']).toContain('--jobs=1')
    expect(pkg.scripts['podman:build']).toContain('--format docker')
    expect(svelteConfig).toContain('from \'@sveltejs/adapter-node\'')
    expect(dockerfile).toContain('CMD ["node", "build"]')
    expect(dockerfile).toContain('FROM runtime-base AS runtime-with-data')
  })

  it('应生成 website 兼容的全量 skills', async () => {
    await expectCompatibleSkills(projectPath, 'website')
  })
})

// =============================================================================
// 3.25. createProject — H5 应用
// =============================================================================

describe('createProject — h5 类型', () => {
  let projectPath: string

  beforeAll(async () => {
    projectPath = path.join(tmpRoot, 'proj-h5')
    await createProject({
      name: 'proj-h5',
      appType: 'h5',
      template: 'custom',
      features: [],
      moduleConfigs: {
        core: { name: 'proj-h5', defaultLocale: 'zh-CN' },
      },
      examples: false,
      install: false,
      git: false,
      packageManager: 'pnpm',
      verbose: false,
      cwd: tmpRoot,
    })
  })

  it('应生成 H5 触屏页面骨架', async () => {
    expect(await exists(projectPath, 'src/routes/discover/+page.svelte')).toBe(true)
    expect(await exists(projectPath, 'src/routes/profile/+page.svelte')).toBe(true)

    const layout = await readText(projectPath, 'src/routes/+layout.svelte')
    expect(layout).toContain('btm-nav')
  })

  it('应生成 H5 专属 AI 指引与兼容 skills', async () => {
    const agents = await readText(projectPath, 'AGENTS.md')
    const copilot = await readText(projectPath, '.github/copilot-instructions.md')

    expect(agents).toContain('H5')
    expect(copilot).toContain('H5')
    await expectCompatibleSkills(projectPath, 'h5')
  })
})

// =============================================================================
// 3.5. createProject — Mobile App 应用（Svelte 5 + Vite + Capacitor）
// =============================================================================

describe('createProject — mobile-app 类型', () => {
  let projectPath: string

  beforeAll(async () => {
    projectPath = path.join(tmpRoot, 'proj-mobile')
    await createProject({
      name: 'proj-mobile',
      appType: 'mobile-app',
      template: 'custom',
      features: ['api-client', 'capacitor'],
      moduleConfigs: {
        core: { name: 'proj-mobile', defaultLocale: 'zh-CN' },
      },
      examples: false,
      install: false,
      git: false,
      packageManager: 'pnpm',
      verbose: false,
      cwd: tmpRoot,
    })
  })

  it('应生成直接使用 Svelte 5 + Vite 的移动应用入口', async () => {
    expect(await exists(projectPath, 'index.html')).toBe(true)
    expect(await exists(projectPath, 'src/main.ts')).toBe(true)
    expect(await exists(projectPath, 'src/App.svelte')).toBe(true)
    expect(await exists(projectPath, 'src/routes/+page.svelte')).toBe(false)
    expect(await exists(projectPath, 'src/app.html')).toBe(false)
    expect(await exists(projectPath, 'src/app.d.ts')).toBe(false)

    const app = await readText(projectPath, 'src/App.svelte')
    expect(app).toContain('hai-mobile-shell')
    expect(app).toContain('BottomNav')
    expect(app).toContain('usesNativeTokenStorage')
  })

  it('package.json 不应包含 @h-ai/kit 或 SvelteKit 依赖', async () => {
    const pkg = await readJson(projectPath, 'package.json')
    expect(pkg.dependencies['@h-ai/api-client']).toBe(HAI_DEP_SPECIFIER)
    expect(pkg.dependencies['@h-ai/capacitor']).toBe(HAI_DEP_SPECIFIER)
    expect(pkg.dependencies['@h-ai/ui']).toBe(HAI_DEP_SPECIFIER)
    expect(pkg.dependencies['@h-ai/core']).toBeUndefined()
    expect(pkg.dependencies['@h-ai/kit']).toBeUndefined()
    expect(pkg.dependencies.zod).toBeUndefined()
    expect(pkg.devDependencies['@sveltejs/kit']).toBeUndefined()
    expect(pkg.devDependencies['@sveltejs/adapter-static']).toBeUndefined()
    expect(pkg.devDependencies['@capacitor/app']).toBe('^8.0.1')
    expect(pkg.devDependencies['@capacitor/camera']).toBe('^8.0.1')
    expect(pkg.devDependencies['@capacitor/device']).toBe('^8.0.1')
    expect(pkg.devDependencies['@capacitor/push-notifications']).toBe('^8.0.1')
    expect(pkg.scripts.typecheck).not.toContain('svelte-kit sync')
    expect(pkg.scripts.build).toContain('pnpm paraglide:compile')

    const workspace = await readText(projectPath, 'pnpm-workspace.yaml')
    expectHaiCatalogEntries(workspace, ['@h-ai/api-client', '@h-ai/capacitor', '@h-ai/ui'])
  })

  it('应生成带 SPA fallback 的静态镜像', async () => {
    const pkg = await readJson(projectPath, 'package.json')
    const dockerfile = await readText(projectPath, 'Dockerfile')
    const nginxConfig = await readText(projectPath, 'docker/nginx.conf')

    expect(pkg.scripts['docker:build']).toContain('--target runtime')
    expect(pkg.scripts['docker:build:data']).toBeUndefined()
    expect(pkg.scripts['podman:build']).toContain('--jobs=1')
    expect(pkg.scripts['podman:build']).toContain('--format docker')
    expect(dockerfile).toContain('nginxinc/nginx-unprivileged')
    expect(dockerfile).toContain('/workspace/dist')
    expect(nginxConfig).toContain('try_files $uri $uri/ /index.html')
  })

  it('应生成移动端专属 AI 指引与兼容 skills', async () => {
    const agents = await readText(projectPath, 'AGENTS.md')
    expect(agents).toContain('Mobile/Capacitor')
    expect(agents).toContain('Svelte 5 + Vite')
    expect(agents).not.toContain('adapter-static')
    await expectCompatibleSkills(projectPath, 'mobile-app')
  })
})

// =============================================================================
// 4. createProject — 前后端分离工程
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
    expectHaiCatalogEntries(workspace, ['@h-ai/api-contract', '@h-ai/api-client', '@h-ai/capacitor', '@h-ai/core', '@h-ai/serv', '@h-ai/ui'])
    expectCatalogPackageNames(workspace, ['@playwright/test', '@tauri-apps/cli', '@types/node', 'daisyui', 'tsup', 'zod'])

    const pkg = await readJson(projectPath, 'package.json')
    expectNonWorkspaceDepsUseCatalog(pkg)
    expect(pkg.scripts['i18n:compile']).toBe('pnpm --filter proj-fullstack-shared paraglide:compile && pnpm --filter proj-fullstack-web paraglide:compile && pnpm --filter proj-fullstack-app paraglide:compile && pnpm --filter proj-fullstack-desktop paraglide:compile')
    expect(pkg.scripts.compile).toBe('pnpm typecheck && pnpm build')
    expect(pkg.scripts.package).toContain('pnpm --filter proj-fullstack-app package')
    expect(pkg.scripts.package).toContain('pnpm --filter proj-fullstack-desktop package')
    expect(pkg.scripts.deploy).toBe('pnpm package')
    expect(pkg.scripts['docker:build']).toContain('--target runtime')
    expect(pkg.scripts['docker:build:data']).toContain('--build-context embedded-data=./packages/proj-fullstack-serv/data')
    expect(pkg.scripts['docker:build:service']).toContain('--target service')
    expect(pkg.scripts['docker:build:web']).toContain('--target web')
    expect(pkg.scripts['podman:build']).toContain('--jobs=1')
    expect(pkg.scripts['podman:build']).toContain('--format docker')
    expect(pkg.scripts['podman:build:data']).toContain('--jobs=1')
    expect(pkg.scripts.typecheck).toBe('pnpm --filter proj-fullstack-contract build && pnpm i18n:compile && pnpm -r --if-present typecheck')
    expect(pkg.scripts.test).toBe('pnpm --filter proj-fullstack-contract build && pnpm i18n:compile && pnpm -r --if-present test')
    expect(pkg.scripts.postinstall).toBe('pnpm i18n:compile')
    expect(pkg.scripts['test:e2e']).toContain('playwright test')
    expect(pkg.dependencies['proj-fullstack-contract']).toBe('workspace:*')
    expect(pkg.dependencies['proj-fullstack-shared']).toBe('workspace:*')
    expect(pkg.devDependencies['@playwright/test']).toBe(CATALOG_DEP_SPECIFIER)
    expect(pkg.devDependencies.typescript).toBe(CATALOG_DEP_SPECIFIER)

    const readme = await readText(projectPath, 'README.md')
    expect(readme).toContain('packages/proj-fullstack-shared')
    expect(readme).toContain('i18n 与 shared 协同')
    expect(readme).toContain('pnpm compile')
    expect(readme).toContain('pnpm package')
    expect(readme).toContain('/app/service/config')
    expect(readme).toContain('pnpm docker:build:data')

    const eslintConfig = await readText(projectPath, 'eslint.config.js')
    expect(eslintConfig).toContain('\'svelte/indent\': \'off\'')
  })

  it('不应生成未渲染的 Handlebars 字面量路径', async () => {
    expect(await exists(projectPath, 'packages/{{projectName}}-contract')).toBe(false)
    expect(await exists(projectPath, 'apps/{{projectName}}-web')).toBe(false)
  })

  it('应生成 contract 包并使用 catalog/workspace 契约依赖', async () => {
    const pkg = await readJson(projectPath, 'packages/proj-fullstack-contract/package.json')
    expectNonWorkspaceDepsUseCatalog(pkg)
    expect(pkg.name).toBe('proj-fullstack-contract')
    expect(pkg.dependencies['@h-ai/api-contract']).toBe(HAI_DEP_SPECIFIER)
    expect(pkg.dependencies['@h-ai/core']).toBe(HAI_DEP_SPECIFIER)
    expect(pkg.dependencies.zod).toBe(CATALOG_DEP_SPECIFIER)
    expect(await exists(projectPath, 'packages/proj-fullstack-contract/src/index.ts')).toBe(true)
    expect(await exists(projectPath, 'packages/proj-fullstack-contract/src/app-contract.ts')).toBe(true)
    expect(await exists(projectPath, 'packages/proj-fullstack-contract/src/app-schemas.ts')).toBe(true)
    expect(await exists(projectPath, 'packages/proj-fullstack-contract/src/http-transport.ts')).toBe(false)
    expect(await exists(projectPath, 'packages/proj-fullstack-contract/src/app-routes.ts')).toBe(false)
    expect(await exists(projectPath, 'packages/proj-fullstack-contract/src/proj-fullstack-contract.ts')).toBe(true)
    expect(await exists(projectPath, 'packages/proj-fullstack-contract/tests/contract.test.ts')).toBe(true)

    const appContract = await readText(projectPath, 'packages/proj-fullstack-contract/src/app-contract.ts')
    expect(appContract).toContain('apiContract.route')
    expect(appContract).toContain('path: \'/app/info\'')
    expect(appContract).not.toContain('OutputSchema')
  })

  it('应生成 serv 包、单元测试和可启动入口', async () => {
    const pkg = await readJson(projectPath, 'packages/proj-fullstack-serv/package.json')
    expectNonWorkspaceDepsUseCatalog(pkg)
    expect(pkg.name).toBe('proj-fullstack-serv')
    expect(pkg.dependencies['@h-ai/serv']).toBe(HAI_DEP_SPECIFIER)
    expect(pkg.dependencies['@h-ai/core']).toBe(HAI_DEP_SPECIFIER)
    expect(pkg.dependencies.hono).toBeUndefined()
    expect(pkg.dependencies['proj-fullstack-contract']).toBe('workspace:*')
    expect(pkg.scripts.start).toBe('node dist/index.js')
    expect(pkg.files).toEqual(expect.arrayContaining(['config', 'data', 'dist']))
    expect(await exists(projectPath, 'packages/proj-fullstack-serv/src/app-server.ts')).toBe(true)
    expect(await exists(projectPath, 'packages/proj-fullstack-serv/src/server/procedures/app-procedures.ts')).toBe(true)
    expect(await exists(projectPath, 'packages/proj-fullstack-serv/tests/app-server.test.ts')).toBe(true)

    const servConfig = await readText(projectPath, 'packages/proj-fullstack-serv/config/_serv.yml')
    expect(servConfig).toContain('origin: $' + '{HAI_CORS_ORIGIN:*}')
    expect(servConfig).toContain('credentials: $' + '{HAI_CORS_CREDENTIALS:false}')

    const appServer = await readText(projectPath, 'packages/proj-fullstack-serv/src/app-server.ts')
    expect(appServer).toContain('export interface ServerApp')
    expect(appServer).toContain('createServerApp(): ServerApp')
    expect(appServer).toContain('serv.createApp')
    expect(appServer).not.toContain('import type { ServHttpApp }')
    expect(appServer).not.toContain('from \'hono\'')
    expect(appServer).not.toContain(': Hono')

    const procedures = await readText(projectPath, 'packages/proj-fullstack-serv/src/server/procedures/app-procedures.ts')
    expect(procedures).toContain('.implement(appContract)')
    expect(procedures).toContain('.context<ServContext>()')
    expect(procedures).toContain('.route(\'info\'')
    expect(procedures).toContain('.route(\'echo\',')
    expect(procedures).not.toContain('.auth()')
    expect(procedures).toContain('.build()')
    expect(procedures).not.toContain('$context')
    expect(procedures).not.toContain('requireAuth')
    expect(procedures).toContain('from \'proj-fullstack-contract\'')
    expect(procedures).toContain('startedAt: options.startedAt')
    expect(procedures).toContain('frontends: [...options.frontends]')
    expect(procedures).toContain('echoedAt: new Date().toISOString()')
    expect(procedures).toContain('requestId: context.requestId')

    const testFile = await readText(projectPath, 'packages/proj-fullstack-serv/tests/app-server.test.ts')
    expect(testFile).toContain('returns echo result as HaiResult')
  })

  it('应生成真实 fullstack 单镜像与独立镜像目标', async () => {
    const dockerfile = await readText(projectPath, 'Dockerfile')
    const containerServer = await readText(projectPath, 'docker/fullstack-server.mjs')
    const nginxConfig = await readText(projectPath, 'docker/nginx.conf')

    expect(dockerfile).toContain('pnpm --filter proj-fullstack-serv --prod deploy')
    expect(dockerfile).toContain('FROM node:22-bookworm-slim AS runtime-base')
    expect(dockerfile).toContain('COPY --from=embedded-data')
    expect(dockerfile).toContain('USER node')
    expect(containerServer).toContain('spawn(process.execPath, [\'dist/index.js\']')
    expect(containerServer).toContain('p.set(\'apiBase\',location.origin)')
    expect(containerServer).toContain('pathname.startsWith(\'/api/\')')
    expect(nginxConfig).toContain('try_files $uri $uri/ /index.html')
    expect(await exists(projectPath, '.dockerignore')).toBe(true)
  })

  it('应按多选前端生成 web / app / desktop 工程', async () => {
    for (const target of ['web', 'app']) {
      const pkg = await readJson(projectPath, `apps/proj-fullstack-${target}/package.json`)
      expectNonWorkspaceDepsUseCatalog(pkg)
      expect(pkg.name).toBe(`proj-fullstack-${target}`)
      expect(pkg.dependencies['proj-fullstack-contract']).toBeUndefined()
      expect(pkg.dependencies['@h-ai/api-client']).toBeUndefined()
      expect(pkg.dependencies['@h-ai/ui']).toBe(HAI_DEP_SPECIFIER)
      expect(pkg.dependencies['@h-ai/kit']).toBeUndefined()
      expect(pkg.devDependencies['@tailwindcss/vite']).toBeDefined()
      expect(pkg.devDependencies.daisyui).toBeDefined()
      expect(pkg.devDependencies.tailwindcss).toBeDefined()
      expect(pkg.devDependencies.svelte).toBe(CATALOG_DEP_SPECIFIER)
      expect(pkg.devDependencies.vite).toBe(CATALOG_DEP_SPECIFIER)
      expect(pkg.devDependencies['@sveltejs/kit']).toBeUndefined()
      expect(pkg.dependencies['proj-fullstack-shared']).toBe('workspace:*')
      expect(pkg.scripts['paraglide:compile']).toContain('paraglide-js compile')
      expect(pkg.scripts.typecheck).toContain('pnpm paraglide:compile')
      expect(pkg.scripts.package).toBe(target === 'app' ? 'pnpm cap:sync' : 'pnpm build')
      expect(pkg.scripts.typecheck).not.toContain('svelte-kit sync')
      expect(await exists(projectPath, `apps/proj-fullstack-${target}/index.html`)).toBe(true)
      expect(await exists(projectPath, `apps/proj-fullstack-${target}/src/main.ts`)).toBe(true)
      expect(await exists(projectPath, `apps/proj-fullstack-${target}/src/App.svelte`)).toBe(true)
      expect(await exists(projectPath, `apps/proj-fullstack-${target}/src/routes/+page.svelte`)).toBe(false)
      expect(await exists(projectPath, `apps/proj-fullstack-${target}/project.inlang/settings.json`)).toBe(true)
      expect(await exists(projectPath, `apps/proj-fullstack-${target}/messages/zh-CN.json`)).toBe(true)
      expect(await exists(projectPath, `apps/proj-fullstack-${target}/messages/en-US.json`)).toBe(true)
      expect(await exists(projectPath, `apps/proj-fullstack-${target}/tests/api.test.ts`)).toBe(true)
      expect(await exists(projectPath, `apps/proj-fullstack-${target}/eslint.config.js`)).toBe(true)

      const eslintConfig = await readText(projectPath, `apps/proj-fullstack-${target}/eslint.config.js`)
      expect(eslintConfig).toContain('\'svelte/indent\': \'off\'')

      const app = await readText(projectPath, `apps/proj-fullstack-${target}/src/App.svelte`)
      expect(app).toContain('@h-ai/ui')
      expect(app).toContain('proj-fullstack-shared')
      expect(app).toContain('import * as appM')
      expect(app).toContain('messages as sharedM')
      expect(app).toContain('<Card')
      if (target === 'web') {
        expect(app).toContain('AppShell')
        expect(app).toContain('platform="web"')
      }
      else {
        expect(app).toContain('hai-mobile-shell')
        expect(app).toContain('BottomNav')
        expect(app).toContain('ThemeSwitcher')
        expect(app).toContain('LanguageSwitcher')
        expect(app).toContain('sharedM.settings_title()')
      }

      const css = await readText(projectPath, `apps/proj-fullstack-${target}/src/app.css`)
      expect(css).toContain('@import \'@h-ai/ui/styles/global.css\'')
      expect(css).toContain('--default')

      const indexHtml = await readText(projectPath, `apps/proj-fullstack-${target}/index.html`)
      expect(indexHtml).toContain('<script type="module" src="/src/main.ts"></script>')

      const tsconfig = await readText(projectPath, `apps/proj-fullstack-${target}/tsconfig.json`)
      expect(tsconfig).toContain('"moduleDetection": "force",')
      expect(tsconfig.indexOf('"moduleDetection": "force",')).toBeLessThan(tsconfig.indexOf('"module": "ESNext",'))

      const viteConfig = await readText(projectPath, `apps/proj-fullstack-${target}/vite.config.ts`)
      expect(viteConfig).toContain('tailwindcss()')
      expect(viteConfig).toContain('paraglideVitePlugin')
      expect(viteConfig).toContain('project: \'./project.inlang\'')
      expect(viteConfig).toContain('import tailwindcss from \'@tailwindcss/vite\'')
      expect(viteConfig).not.toContain('  import tailwindcss from \'@tailwindcss/vite\'')
      expect(viteConfig).toContain('envPrefix: [\'VITE_\', \'PUBLIC_\']')

      expect(await exists(projectPath, `apps/proj-fullstack-${target}/src/routes/+layout.svelte`)).toBe(false)

      const apiTest = await readText(projectPath, `apps/proj-fullstack-${target}/tests/api.test.ts`)
      expect(apiTest).toContain('proj-fullstack-shared')
    }

    const appPkg = await readJson(projectPath, 'apps/proj-fullstack-app/package.json')
    expectNonWorkspaceDepsUseCatalog(appPkg)
    expect(appPkg.dependencies['@h-ai/capacitor']).toBe(HAI_DEP_SPECIFIER)
    expect(appPkg.devDependencies['@aparajita/capacitor-secure-storage']).toBe(CATALOG_DEP_SPECIFIER)
    expect(appPkg.devDependencies['@capacitor/android']).toBe(CATALOG_DEP_SPECIFIER)
    expect(appPkg.devDependencies['@capacitor/app']).toBe(CATALOG_DEP_SPECIFIER)
    expect(appPkg.devDependencies['@capacitor/camera']).toBe(CATALOG_DEP_SPECIFIER)
    expect(appPkg.devDependencies['@capacitor/device']).toBe(CATALOG_DEP_SPECIFIER)
    expect(appPkg.devDependencies['@capacitor/ios']).toBe(CATALOG_DEP_SPECIFIER)
    expect(appPkg.devDependencies['@capacitor/push-notifications']).toBe(CATALOG_DEP_SPECIFIER)
    expect(appPkg.devDependencies['@sveltejs/adapter-static']).toBeUndefined()
    expect(appPkg.scripts['cap:build:android:release']).toContain('cap build android')
    expect(await exists(projectPath, 'apps/proj-fullstack-app/capacitor.config.ts')).toBe(true)
    expect(await exists(projectPath, 'apps/proj-fullstack-app/src/lib/capacitor.ts')).toBe(true)
    expect(await exists(projectPath, 'apps/proj-fullstack-app/src/routes/+layout.ts')).toBe(false)
    const appSvelteConfig = await readText(projectPath, 'apps/proj-fullstack-app/svelte.config.js')
    expect(appSvelteConfig).not.toContain('@sveltejs/adapter-static')
    expect(appSvelteConfig).not.toContain('fallback: \'index.html\'')
    const appReadme = await readText(projectPath, 'apps/proj-fullstack-app/README.md')
    expect(appReadme).toContain('Capacitor')
    expect(appReadme).toContain('cap:build:android:release')
    const appPackageText = await readText(projectPath, 'apps/proj-fullstack-app/package.json')
    expect(appPackageText).toContain('    "cap:build:android:debug":')

    const desktopPkg = await readJson(projectPath, 'apps/proj-fullstack-desktop/package.json')
    expectNonWorkspaceDepsUseCatalog(desktopPkg)
    expect(desktopPkg.name).toBe('proj-fullstack-desktop')
    expect(desktopPkg.dependencies['proj-fullstack-contract']).toBeUndefined()
    expect(desktopPkg.dependencies['proj-fullstack-shared']).toBe('workspace:*')
    expect(desktopPkg.dependencies['@h-ai/api-client']).toBeUndefined()
    expect(desktopPkg.dependencies['@h-ai/ui']).toBe(HAI_DEP_SPECIFIER)
    expect(desktopPkg.dependencies['@tauri-apps/api']).toBeUndefined()
    expect(desktopPkg.dependencies['@tauri-apps/plugin-shell']).toBeUndefined()
    expect(desktopPkg.devDependencies['@tauri-apps/cli']).toBe(CATALOG_DEP_SPECIFIER)
    expect(desktopPkg.devDependencies['@sveltejs/kit']).toBeUndefined()
    expect(desktopPkg.scripts.package).toBe('pnpm tauri:build')
    expect(desktopPkg.scripts['tauri:dev']).toBe('tauri dev')
    expect(await exists(projectPath, 'apps/proj-fullstack-desktop/index.html')).toBe(true)
    expect(await exists(projectPath, 'apps/proj-fullstack-desktop/src/main.ts')).toBe(true)
    expect(await exists(projectPath, 'apps/proj-fullstack-desktop/src/App.svelte')).toBe(true)
    expect(await exists(projectPath, 'apps/proj-fullstack-desktop/src/routes/+page.svelte')).toBe(false)
    expect(await exists(projectPath, 'apps/proj-fullstack-desktop/src-tauri/tauri.conf.json')).toBe(true)
    expect(await exists(projectPath, 'apps/proj-fullstack-desktop/src-tauri/Cargo.toml')).toBe(true)
    expect(await exists(projectPath, 'apps/proj-fullstack-desktop/src-tauri/icons/icon.ico')).toBe(true)
    expect(await exists(projectPath, 'apps/proj-fullstack-desktop/src-tauri/icons/icon.icns')).toBe(true)
    const tauriConfig = await readText(projectPath, 'apps/proj-fullstack-desktop/src-tauri/tauri.conf.json')
    expect(tauriConfig).toContain('"icons/icon.ico"')
    const desktopApp = await readText(projectPath, 'apps/proj-fullstack-desktop/src/App.svelte')
    expect(desktopApp).toContain('platform="desktop"')
    expect(desktopApp).toContain('fetchAppInfo')
    const desktopVite = await readText(projectPath, 'apps/proj-fullstack-desktop/vite.config.ts')
    expect(desktopVite).toContain('TAURI_DEV_HOST')
    expect(desktopVite).toContain('svelte()')
    const desktopReadme = await readText(projectPath, 'apps/proj-fullstack-desktop/README.md')
    expect(desktopReadme).toContain('Tauri v2')
    expect(desktopReadme).toContain('pnpm --filter proj-fullstack-desktop package')

    // shared 包断言
    const sharedPkg = await readJson(projectPath, 'packages/proj-fullstack-shared/package.json')
    expectNonWorkspaceDepsUseCatalog(sharedPkg)
    expect(sharedPkg.name).toBe('proj-fullstack-shared')
    expect(sharedPkg.dependencies['proj-fullstack-contract']).toBe('workspace:*')
    expect(sharedPkg.dependencies['@h-ai/api-client']).toBe(HAI_DEP_SPECIFIER)
    expect(sharedPkg.dependencies['@h-ai/ui']).toBe(HAI_DEP_SPECIFIER)
    expect(sharedPkg.devDependencies['@inlang/paraglide-js']).toBeDefined()
    expect(sharedPkg.devDependencies['@inlang/plugin-message-format']).toBeDefined()
    expect(sharedPkg.devDependencies.vite).toBe(CATALOG_DEP_SPECIFIER)
    expect(sharedPkg.scripts['paraglide:compile']).toContain('paraglide-js compile')
    expect(await exists(projectPath, 'packages/proj-fullstack-shared/project.inlang/settings.json')).toBe(true)
    expect(await exists(projectPath, 'packages/proj-fullstack-shared/messages/zh-CN.json')).toBe(true)
    expect(await exists(projectPath, 'packages/proj-fullstack-shared/messages/en-US.json')).toBe(true)
    expect(await exists(projectPath, 'packages/proj-fullstack-shared/src/lib/components/AppShell.svelte')).toBe(true)
    expect(await exists(projectPath, 'packages/proj-fullstack-shared/src/lib/components/ThemeSwitcher.svelte')).toBe(true)
    expect(await exists(projectPath, 'packages/proj-fullstack-shared/src/lib/components/LanguageSwitcher.svelte')).toBe(true)
    expect(await exists(projectPath, 'packages/proj-fullstack-shared/src/lib/stores/theme-store.svelte.ts')).toBe(true)
    expect(await exists(projectPath, 'packages/proj-fullstack-shared/src/lib/api/api-client.ts')).toBe(true)
    expect(await exists(projectPath, 'packages/proj-fullstack-shared/src/index.ts')).toBe(true)
    const sharedClient = await readText(projectPath, 'packages/proj-fullstack-shared/src/lib/api/api-client.ts')
    expect(sharedClient).toContain('import.meta.env.PUBLIC_API_BASE')

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

  it('应生成 fullstack 兼容的全量 skills', async () => {
    await expectCompatibleSkills(projectPath, 'fullstack')
  })

  it('应生成包含 fullstack 职责边界、质量门禁与完成条件的 AI 指引', async () => {
    const agents = await readText(projectPath, 'AGENTS.md')
    const claude = await readText(projectPath, 'CLAUDE.md')
    const copilot = await readText(projectPath, '.github/copilot-instructions.md')

    expect(agents).toContain('packages/proj-fullstack-serv')
    expect(agents).toContain('apps/proj-fullstack-app')
    expect(agents).not.toContain('<project>')
    expect(agents).toContain('Capacitor')
    expect(agents).toContain('Tauri')
    expect(agents).toContain('## 完成条件')
    expect(agents).toContain('pnpm typecheck')
    expect(claude).toContain('@AGENTS.md')
    expect(claude).toContain('fullstack')
    expect(claude).toContain('packages/proj-fullstack-serv')
    expect(claude).not.toContain('<project>')
    expect(copilot).toContain('Fullstack 服务端')
    expect(copilot).toContain('packages/proj-fullstack-contract')
    expect(copilot).toContain('packages/proj-fullstack-serv')
    expect(copilot).toContain('packages/proj-fullstack-shared')
    expect(copilot).not.toContain('<project>')
    expect(copilot).toContain('Desktop')
    expect(copilot).toContain('Tauri v2')
    expect(copilot).toContain('## 质量门禁')
    expect(copilot).toContain('## 完成条件')
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

    const workspace = await readText(projectPath, 'pnpm-workspace.yaml')
    expectCatalogPackageNames(workspace, ['@playwright/test', '@types/node', 'daisyui', 'zod'])
    expect(workspace).not.toContain('\'@capacitor/core\':')
    expect(workspace).not.toContain('\'@tauri-apps/cli\':')
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
  it('已有 catalog: 风格时新增模块应继续使用 catalog:', async () => {
    const dir = path.join(tmpRoot, 'add-ai-catalog')
    await fse.ensureDir(dir)
    await fse.writeJson(path.join(dir, 'package.json'), {
      name: 'add-catalog-test',
      version: '0.1.0',
      dependencies: { '@h-ai/core': 'catalog:' },
    }, { spaces: 2 })

    await addModule({ module: 'ai', install: false, cwd: dir, verbose: false })

    const pkg = await fse.readJson(path.join(dir, 'package.json'))
    expect(pkg.dependencies['@h-ai/ai']).toBe('catalog:')
  })

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
    expect(opencode.instructions).toEqual(['.github/copilot-instructions.md'])
    expect(opencode.skills).toBeUndefined()

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

    expect(await fse.readFile(path.join(dir, 'AGENTS.md'), 'utf8')).toContain('## 行为契约')
    expect(await fse.readFile(path.join(dir, '.github', 'copilot-instructions.md'), 'utf8')).toContain('规模: XS|S|M|L')

    const opencode = await fse.readJson(path.join(dir, 'opencode.json'))
    expect(opencode.instructions).toEqual(['.github/copilot-instructions.md'])
    expect(opencode.skills).toBeUndefined()
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
