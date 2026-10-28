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
import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { createInMemoryKeyStore, crypto, parseTransportServerKeyRing } from '@h-ai/crypto'
import fse from 'fs-extra'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { cliM } from '../src/cli-i18n.js'
import { addModule } from '../src/commands/cli-add.js'
import { createProject, detectProject } from '../src/commands/cli-create.js'
import { generate } from '../src/commands/cli-generate.js'
import { initProject } from '../src/commands/cli-init.js'
import { generateModuleSkillFile, generateProjectAiSupport } from '../src/commands/cli-skill-templates.js'

// =============================================================================
// 测试工具
// =============================================================================

const tmpRoot = mkdtempSync(path.join(tmpdir(), 'hai-cli-commands-e2e-'))
const HAI_DEP_VERSION = fse.readJsonSync(fileURLToPath(new URL('../package.json', import.meta.url))).version
const CATALOG_DEP_SPECIFIER = 'catalog:'
const HAI_DEP_SPECIFIER = CATALOG_DEP_SPECIFIER
const skillTemplatesDir = fileURLToPath(new URL('../templates/skills', import.meta.url))

const SKILL_EXCLUSIONS_BY_APP_TYPE: Record<AppType, string[]> = {
  'admin': ['hai-serv', 'hai-api-contract', 'hai-api-client', 'hai-capacitor'],
  'website': ['hai-serv', 'hai-api-contract', 'hai-api-client', 'hai-capacitor'],
  'h5': ['hai-serv', 'hai-api-contract', 'hai-api-client', 'hai-capacitor'],
  'api': ['hai-ui', 'hai-ui-design', 'hai-ui-review', 'hai-kit', 'hai-capacitor'],
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

function expectQualityGateScripts(pkg: { scripts?: Record<string, string>, engines?: { node?: string } }) {
  expect(pkg.engines?.node).toBe('^22.23.4 || ^24.22.1 || ^26.12.1')
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
  const agents = await readText(projectPath, 'AGENTS.md')
  expect(agents).toContain('.agents/skills/hai-app-create/SKILL.md')
  expect(agents).toContain('.agents/skills/hai-app-create/development.md')
  expect(agents).toContain('.agents/skills/hai-spec-review/SKILL.md')
  expect(agents).toContain('.agents/skills/hai-spec-implement/SKILL.md')
  expect((await readText(projectPath, 'CLAUDE.md')).trim()).toBe('@AGENTS.md')
  expect(await exists(projectPath, '.claude')).toBe(false)
  // 解析工具入口到实际共享规则，确认各模板不会加载另一份项目规范。
  const copilot = await readText(projectPath, '.github/copilot-instructions.md')
  const rulesTarget = copilot.match(/\[AGENTS\.md\]\(([^)]+)\)/)?.[1]
  const rulesPath = path.resolve(projectPath, '.github', rulesTarget ?? '')
  expect(rulesPath).toBe(path.join(projectPath, 'AGENTS.md'))
  expect(await fse.readFile(rulesPath, 'utf8')).toBe(agents)
  const opencode = await readJson(projectPath, 'opencode.json')
  expect(opencode.instructions).toEqual(['AGENTS.md'])
  const skillNames = await listTemplateSkillNames()
  const excludedSkills = new Set(SKILL_EXCLUSIONS_BY_APP_TYPE[appType])

  for (const skillName of skillNames) {
    const expected = !excludedSkills.has(skillName)
    expect(
      await exists(projectPath, `.agents/skills/${skillName}/SKILL.md`),
      `${appType} should ${expected ? '' : 'not '}include ${skillName}`,
    ).toBe(expected)
    if (expected) {
      // 校验完整目录交付，避免入口可发现但按需引用的范本遗漏。
      const source = path.join(skillTemplatesDir, skillName)
      const resources = await fse.readdir(source, { recursive: true, withFileTypes: true })
      for (const resource of resources) {
        if (!resource.isFile())
          continue
        const sourcePath = path.join(resource.parentPath, resource.name)
        const relativePath = path.relative(source, sourcePath)
        expect(await fse.readFile(path.join(projectPath, '.agents/skills', skillName, relativePath), 'utf8'))
          .toBe(await fse.readFile(sourcePath, 'utf8'))
      }
    }
  }
}

// =============================================================================
// 生命周期
// =============================================================================

afterAll(async () => {
  // 每次运行独享目录；只清理本轮创建的根目录，并重试 Windows 短暂文件锁。
  if (path.dirname(tmpRoot) !== path.resolve(tmpdir()) || !path.basename(tmpRoot).startsWith('hai-cli-commands-e2e-'))
    throw new Error('Unexpected CLI command test cleanup directory')
  await rm(tmpRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
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

  it('aPI仅选crypto时生成私有密钥环并补充RelDB registry依赖', async () => {
    const name = 'proj-api-crypto-only'
    const directory = path.join(tmpRoot, name)
    await createProject({ name, appType: 'api', template: 'custom', features: ['crypto'], moduleConfigs: { core: { name, defaultLocale: 'zh-CN' } }, yes: true, examples: false, install: false, git: false, packageManager: 'pnpm', cwd: tmpRoot })
    const prefix = `apps/${name}-serv`
    const ring = parseTransportServerKeyRing(parseEnv(await readText(directory, `${prefix}/.env.dev`)).HAI_CRYPTO_TRANSPORT_SERVERKEYRING)
    expect(ring.success).toBe(true)
    if (!ring.success)
      throw new Error(ring.error.message)
    const source = await readText(directory, `${prefix}/src/app.ts`)
    expect(source).toContain('keyStore: createReldbTransportKeyStore({ reldb, ttlSeconds: 3600 })')
    expect(source).not.toContain('keyStore: createInMemoryKeyStore()')
    expect(source).toContain('from \'@h-ai/reldb\'')
    expect(await readText(directory, `${prefix}/.env.example`)).toContain('HAI_CRYPTO_TRANSPORT_SERVERKEYRING')
    expect(await readText(directory, `${prefix}/.env`)).not.toContain(ring.data.keys[ring.data.activeKeyId]!.privateKey)
  })

  it('package.json 名称正确', async () => {
    const pkg = await readJson(projectPath, 'package.json')
    expect(pkg.name).toBe('proj-api')
    expectNonWorkspaceDepsUseCatalog(pkg)
  })

  it('应生成 contract 与 service 子工程并写入 catalog/workspace 依赖', async () => {
    const contractPkg = await readJson(projectPath, 'apps/proj-api-contract/package.json')
    const servicePkg = await readJson(projectPath, 'apps/proj-api-serv/package.json')

    expect(contractPkg.name).toBe('proj-api-contract')
    expect(contractPkg.dependencies['@h-ai/api-contract']).toBe(HAI_DEP_SPECIFIER)
    expect(contractPkg.dependencies.zod).toBe(CATALOG_DEP_SPECIFIER)
    expectNonWorkspaceDepsUseCatalog(contractPkg)

    expect(servicePkg.name).toBe('proj-api-serv')
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
    const content = await readText(projectPath, 'apps/proj-api-serv/config/_core.yml')
    expect(content).toContain('proj-api')
  })

  it('应生成 config/_serv.yml', async () => {
    const content = await readText(projectPath, 'apps/proj-api-serv/config/_serv.yml')
    expect(content).toContain('transport: $' + '{HAI_SERV_TRANSPORT:false}')
    expect(content).toContain('apiPrefix: $' + '{HAI_SERV_HTTP_APIPREFIX:/api/v1}')
    expect(content).toContain('origin: $' + '{HAI_SERV_CORS_ORIGIN:*}')
    expect(content).toContain('credentials: $' + '{HAI_SERV_CORS_CREDENTIALS:false}')
    expect(content).toContain(
      'nativeOrigins: $' + '{HAI_SERV_CORS_NATIVEORIGINS:http://localhost,https://tauri.localhost,tauri://localhost,capacitor://localhost}',
    )
    expect(content).toContain('allowedHeaders:')
    expect(content).toContain('X-Request-Id')
  })

  it('应生成 config/_db.yml', async () => {
    const content = await readText(projectPath, 'apps/proj-api-serv/config/_db.yml')
    expect(content).toContain('sqlite')
  })

  it('应生成 config/_cache.yml', async () => {
    expect(await exists(projectPath, 'apps/proj-api-serv/config/_cache.yml')).toBe(true)
  })

  it('应生成 .env.example', async () => {
    expect(await exists(projectPath, 'apps/proj-api-serv/.env.example')).toBe(true)
  })

  it('应生成 README.md', async () => {
    const content = await readText(projectPath, 'README.md')
    expect(content).toContain('apps/proj-api-contract')
    expect(content).toContain('apps/proj-api-serv')
    expect(content).toContain('## 构建与部署')
    expect(content).toContain('pnpm build --target docker')
  })

  it('应生成可传入配置与嵌入数据的 API 镜像入口', async () => {
    const pkg = await readJson(projectPath, 'package.json')
    const servicePkg = await readJson(projectPath, 'apps/proj-api-serv/package.json')
    const dockerfile = await readText(projectPath, 'images/serv.Dockerfile')

    expect(pkg.scripts.build).toBe('hai build')
    expect(pkg.scripts.compile).toBe('pnpm -r --if-present build')
    expect(servicePkg.files).toEqual(expect.arrayContaining(['config', 'data', 'dist']))
    expect(await exists(projectPath, 'apps/proj-api-serv/data/.gitkeep')).toBe(true)
    expect(dockerfile).toContain('pnpm pm deploy --filter proj-api-serv --prod')
    expect(dockerfile).not.toContain('embedded-data')
    expect(dockerfile).not.toContain('pnpm fetch --frozen-lockfile')
    expect(dockerfile.indexOf('pnpm fetch')).toBeGreaterThanOrEqual(0)
    expect(dockerfile.indexOf('COPY images/dependencies/ ./')).toBeLessThan(dockerfile.indexOf('pnpm fetch'))
    expect(dockerfile.indexOf('COPY . .')).toBeLessThan(dockerfile.indexOf('pnpm install --offline --frozen-lockfile --ignore-scripts'))
    expect(dockerfile).toContain('USER node')
    expect(await exists(projectPath, '.dockerignore')).toBe(true)
    // Docker 与 Git 一致：排除本机私有文件，避免 .env.local 的密钥进入构建上下文。
    const dockerignoreLines = (await readText(projectPath, '.dockerignore')).split('\n').map(line => line.trim())
    expect(dockerignoreLines).toContain('**/.env.*')
    expect(dockerignoreLines).toContain('**/.hai')
    expect(dockerignoreLines).not.toContain('.env.*')
  })

  it('不应有 i18n 脚手架（api 类型）', async () => {
    expect(await exists(projectPath, 'project.inlang')).toBe(false)
  })

  it('不应有 messages 目录（api 类型）', async () => {
    expect(await exists(projectPath, 'messages')).toBe(false)
  })

  it('应生成 service init.ts 含 db/cache 初始化', async () => {
    const content = await readText(projectPath, 'apps/proj-api-serv/src/lib/server/init.ts')
    expect(content).toContain('@h-ai/reldb')
    expect(content).toContain('@h-ai/cache')
  })

  it('应生成 contract 与 service 关键源文件', async () => {
    expect(await exists(projectPath, 'apps/proj-api-contract/src/proj-api-contract.ts')).toBe(true)
    expect(await exists(projectPath, 'apps/proj-api-contract/src/http-transport.ts')).toBe(false)
    expect(await exists(projectPath, 'apps/proj-api-serv/src/app.ts')).toBe(true)
    expect(await exists(projectPath, 'apps/proj-api-serv/src/server/procedures/app-procedures.ts')).toBe(true)

    const procedures = await readText(projectPath, 'apps/proj-api-serv/src/server/procedures/app-procedures.ts')
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
      'apps/proj-api-iam-serv/src/server/procedures/app-procedures.ts',
    )
    expect(procedures).toContain('from \'proj-api-iam-contract\'')
    expect(procedures).toContain('.route(\'echo\')')
    expect(procedures).toContain('.auth()')
    expect(procedures).toContain('context.session.userId')
    expect(procedures).not.toContain('$context')
    expect(procedures).not.toContain('requireAuth')
  })

  it('应生成 service 级 E2E 测试', async () => {
    const spec = await readText(projectPath, 'e2e/api-serv.spec.ts')
    expect(spec).toContain('service health endpoint returns ok')
    expect(spec).not.toContain('page.goto')

    const config = await readText(projectPath, 'playwright.config.ts')
    expect(config).toMatch(/channel:\s+'chrome'/)
    expect(config).toContain('proj-api-serv')
  })

  it('应生成 api 兼容的全量 skills', async () => {
    await expectCompatibleSkills(projectPath, 'api')
  })

  it('应生成 API 类型专属 AI 指引', async () => {
    const agents = await readText(projectPath, 'AGENTS.md')

    expect(agents).toContain('API 服务')
    expect(agents).toContain('apps/<project>-serv')
    // 核对默认技术栈，不把模板架构锁成禁止迁移的措辞。
    expect(agents).toContain('@h-ai/serv')
    expect(agents).toContain('@h-ai/api-contract')
    expect(agents).not.toContain('src/routes/api/v1')
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
    const coreConfig = await readText(projectPath, 'apps/proj-api-yes-serv/config/_core.yml')
    const dbConfig = await readText(projectPath, 'apps/proj-api-yes-serv/config/_db.yml')
    const cacheConfig = await readText(projectPath, 'apps/proj-api-yes-serv/config/_cache.yml')
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

  it('iam 登录页复用带 i18n 的配置认证场景', async () => {
    const content = await readText(projectPath, 'src/routes/(auth)/auth/login/+page.svelte')
    expect(content).toContain('AuthPanel')
    expect(content).toContain('page.data.iamPublicConfig')
    expect(content).toContain('kit.client.createAuthActions()')
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

  it('应在根 README 说明分离的构建、部署及手工交付命令', async () => {
    const readme = await readText(projectPath, 'README.md')
    expect(readme).toContain('## 构建与部署')
    expect(readme).toContain('pnpm build --target docker')
  })

  it('应生成从页面发起的 E2E 测试', async () => {
    const spec = await readText(projectPath, 'e2e/app.spec.ts')
    expect(spec).toContain('page.goto')
    expect(spec).toContain('home page renders from browser')
  })

  it('不应再生成 .github/skills 目录', async () => {
    expect(await exists(projectPath, '.github/skills')).toBe(false)
  })

  it('应生成 opencode.json 并直接引用共享规则，Skill 由 .agents/skills 原生发现', async () => {
    const opencode = await readJson(projectPath, 'opencode.json')
    expect(opencode.instructions).toEqual(['AGENTS.md'])
    expect(opencode.skills).toBeUndefined()
  })

  it('不应生成额外的 .codex/.opencode skill 树', async () => {
    expect(await exists(projectPath, '.codex/skills')).toBe(false)
    expect(await exists(projectPath, '.opencode/skills')).toBe(false)
  })

  it('共享指引应保留管理后台架构与验收要求', async () => {
    const agents = await readText(projectPath, 'AGENTS.md')
    const claude = await readText(projectPath, 'CLAUDE.md')

    expect(agents).toContain('.agents/skills/')
    expect(agents).toContain('管理后台')
    expect(agents).toContain('## 完成条件')
    expect(agents).toContain('pnpm typecheck')
    expect(agents).not.toContain('packages/<project>-serv')
    expect(claude.trim()).toBe('@AGENTS.md')
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
    expect(await exists(projectPath, 'apps/proj-api-serv/vitest.config.ts')).toBe(true)
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
    const dockerfile = await readText(projectPath, 'images/web.Dockerfile')

    expect(pkg.devDependencies['@sveltejs/adapter-node']).toBe('5.5.7')
    expect(pkg.devDependencies['@sveltejs/adapter-auto']).toBeUndefined()
    expect(svelteConfig).toContain('from \'@sveltejs/adapter-node\'')
    expect(dockerfile).toContain('CMD ["node", "build"]')
    expect(dockerfile).not.toContain('pnpm fetch --frozen-lockfile')
    expect(dockerfile.indexOf('pnpm fetch')).toBeGreaterThanOrEqual(0)
    expect(dockerfile.indexOf('COPY images/dependencies/ ./')).toBeLessThan(dockerfile.indexOf('pnpm fetch'))
    expect(dockerfile.indexOf('COPY . .')).toBeLessThan(dockerfile.indexOf('pnpm install --offline --frozen-lockfile --ignore-scripts'))

    const readme = await readText(projectPath, 'README.md')
    expect(readme).toContain('## 构建与部署')
    expect(readme).toContain('pnpm build --target docker')
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
    expect(layout).toContain('<BottomNav')
  })

  it('应生成 H5 专属 AI 指引与兼容 skills', async () => {
    const agents = await readText(projectPath, 'AGENTS.md')

    expect(agents).toContain('H5')
    await expectCompatibleSkills(projectPath, 'h5')
  })

  it('应在根 README 说明分离的构建、部署及手工交付命令', async () => {
    const readme = await readText(projectPath, 'README.md')
    expect(readme).toContain('## 构建与部署')
    expect(readme).toContain('pnpm build --target docker')
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
    expect(pkg.devDependencies['@capacitor/app']).toBe('8.1.2')
    expect(pkg.devDependencies['@capacitor/camera']).toBe('8.2.5')
    expect(pkg.devDependencies['@capacitor/device']).toBe('8.0.3')
    expect(pkg.devDependencies['@capacitor/push-notifications']).toBe('8.1.3')
    expect(pkg.scripts.typecheck).not.toContain('svelte-kit sync')
    expect(pkg.scripts.compile).toContain('pnpm paraglide:compile')

    const workspace = await readText(projectPath, 'pnpm-workspace.yaml')
    expectHaiCatalogEntries(workspace, ['@h-ai/api-client', '@h-ai/capacitor', '@h-ai/ui'])
  })

  it('应生成带 SPA fallback 的静态镜像', async () => {
    const pkg = await readJson(projectPath, 'package.json')
    const dockerfile = await readText(projectPath, 'images/web.Dockerfile')
    const nginxConfig = await readText(projectPath, 'images/web/nginx.conf')

    expect(pkg.scripts.build).toBe('hai build')
    expect(dockerfile).toContain('nginxinc/nginx-unprivileged')
    expect(dockerfile).toContain('/workspace/dist')
    expect(nginxConfig).toContain('try_files $uri $uri/ /index.html')

    const readme = await readText(projectPath, 'README.md')
    expect(readme).toContain('## 构建与部署')
    expect(readme).not.toContain('pnpm docker:build:data')
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

  it('各环境生成独立随机密码和密钥环，克隆共享且保留本机覆盖', async () => {
    const env = await readText(projectPath, '.env.dev')
    const password = env.match(/^HAI_ADMIN_DEFAULT_PASSWORD=(.+)$/m)?.[1]?.trim()
    expect(password).toBeDefined()
    expect(password!.length).toBeGreaterThanOrEqual(24)
    expect(password).toMatch(/[A-Z]/)
    expect(password).toMatch(/[a-z]/)
    expect(password).toMatch(/\d/)
    expect(password).toMatch(/\W/)
    expect(await readText(projectPath, '.env')).toContain('PUBLIC_API_BASE=http://127.0.0.1:3000')
    expect(await readText(projectPath, '.env')).not.toContain(password)
    expect(await readText(projectPath, '.env.example')).not.toContain(password)
    const serializedRing = parseEnv(env).HAI_CRYPTO_TRANSPORT_SERVERKEYRING
    const ring = parseTransportServerKeyRing(serializedRing)
    expect(ring.success).toBe(true)
    if (!ring.success)
      throw new Error(ring.error.message)
    expect(await readText(projectPath, '.env')).not.toContain(ring.data.keys[ring.data.activeKeyId]!.privateKey)
    expect(await readText(projectPath, '.env.example')).not.toContain(ring.data.keys[ring.data.activeKeyId]!.privateKey)
    try {
      expect((await crypto.init()).success).toBe(true)
      expect(crypto.transport.createServer({ serverKeyRing: ring.data, keyStore: createInMemoryKeyStore() }).success).toBe(true)
    }
    finally {
      await crypto.close()
    }
    const passwords = new Set<string>()
    const bootstrapPasswords = new Set<string>()
    const privateKeys = new Set<string>()
    for (const mode of ['dev', 'test', 'prod']) {
      const values = parseEnv(await readText(projectPath, `.env.${mode}`))
      const parsed = parseTransportServerKeyRing(values.HAI_CRYPTO_TRANSPORT_SERVERKEYRING)
      expect(parsed.success).toBe(true)
      if (!parsed.success)
        throw new Error(parsed.error.message)
      expect(values.HAI_ADMIN_DEFAULT_PASSWORD).toMatch(/^Aa1!.{24,}$/)
      for (const name of ['HAI_ADMIN_DEFAULT_PASSWORD', 'HAI_AUDIT_ADMIN_PASSWORD', 'HAI_CONFIG_ADMIN_PASSWORD', 'HAI_BUSINESS_OPERATOR_PASSWORD']) {
        const credential = values[name]
        expect(credential).toMatch(/^Aa1!.{24,}$/)
        bootstrapPasswords.add(credential!)
        expect(await readText(projectPath, '.env')).not.toContain(credential)
        expect(await readText(projectPath, '.env.example')).not.toContain(credential)
      }
      passwords.add(values.HAI_ADMIN_DEFAULT_PASSWORD!)
      privateKeys.add(parsed.data.keys[parsed.data.activeKeyId]!.privateKey)
    }
    expect(passwords.size).toBe(3)
    expect(bootstrapPasswords.size).toBe(12)
    expect(privateKeys.size).toBe(3)
    expect(await readText(projectPath, '.env.local')).not.toContain('HAI_ADMIN_DEFAULT_PASSWORD=')
    expect(await readText(projectPath, '.env.local')).not.toContain('HAI_CRYPTO_TRANSPORT_SERVERKEYRING=')
    const gitignoreLines = (await readText(projectPath, '.gitignore')).split('\n').map(line => line.trim())
    expect(gitignoreLines).toContain('.env.local')
    expect(gitignoreLines).toContain('.env.*.local')
    expect(gitignoreLines).not.toContain('.env')
    expect(gitignoreLines).not.toContain('.env.*')
    // Docker 与 Git 一致：仅排除本机私有文件，公共 .env / dev / test / prod 进入构建上下文。
    const dockerignoreLines = (await readText(projectPath, '.dockerignore')).split('\n').map(line => line.trim())
    expect(dockerignoreLines).toContain('**/.env.*')
    expect(dockerignoreLines).toContain('**/.hai')
    expect(dockerignoreLines).not.toContain('.env')
    expect(dockerignoreLines).not.toContain('.env.*')
    await createProject({ name: 'proj-fullstack-env-other', appType: 'fullstack', frontends: ['web'], yes: true, install: false, git: false, cwd: tmpRoot, packageManager: 'pnpm' })
    expect(await readText(path.join(tmpRoot, 'proj-fullstack-env-other'), '.env.dev')).not.toContain(password)
    expect(await readText(path.join(tmpRoot, 'proj-fullstack-env-other'), '.env.dev')).not.toContain(ring.data.keys[ring.data.activeKeyId]!.privateKey)
  }, 30_000)

  it('应生成 pnpm workspace 多包工程', async () => {
    const workspace = await readText(projectPath, 'pnpm-workspace.yaml')
    expect(workspace).toContain('packages/*')
    expect(workspace).toContain('apps/*')
    expectHaiCatalogEntries(workspace, ['@h-ai/api-contract', '@h-ai/api-client', '@h-ai/capacitor', '@h-ai/core', '@h-ai/serv', '@h-ai/ui'])
    expectCatalogPackageNames(workspace, ['@playwright/test', '@tauri-apps/cli', '@types/node', 'daisyui', 'tsup', 'zod'])

    const pkg = await readJson(projectPath, 'package.json')
    expectNonWorkspaceDepsUseCatalog(pkg)
    expect(pkg.scripts['i18n:compile']).toBe('pnpm --filter proj-fullstack-shared paraglide:compile && pnpm --filter proj-fullstack-web paraglide:compile && pnpm --filter proj-fullstack-app paraglide:compile && pnpm --filter proj-fullstack-desktop paraglide:compile')
    expect(pkg.scripts.compile).toBe('pnpm i18n:compile && pnpm -r --if-present build')
    expect(pkg.scripts.build).toBe('hai build')
    expect(pkg.scripts.deploy).toBe('hai deploy packages/proj-fullstack-serv')
    expect(pkg.scripts.typecheck).toBe('pnpm --filter proj-fullstack-contract build && pnpm i18n:compile && pnpm -r --if-present typecheck')
    expect(pkg.scripts.test).toBe('pnpm --filter proj-fullstack-contract build && pnpm i18n:compile && pnpm -r --if-present test')
    expect(pkg.scripts.postinstall).toBe('pnpm i18n:compile')
    expect(pkg.scripts['test:e2e']).toContain('node scripts/run-e2e.mjs')
    expect(pkg.dependencies['proj-fullstack-contract']).toBe('workspace:*')
    expect(pkg.dependencies['proj-fullstack-shared']).toBe('workspace:*')
    expect(pkg.devDependencies['@playwright/test']).toBe(CATALOG_DEP_SPECIFIER)
    expect(pkg.devDependencies.typescript).toBe(CATALOG_DEP_SPECIFIER)

    const readme = await readText(projectPath, 'README.md')
    expect(readme).toContain('packages/proj-fullstack-shared')
    expect(readme).toContain('i18n 与 shared 协同')
    expect(readme).toContain('## 构建与部署')
    expect(readme).toContain('pnpm build --target docker')

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
    expect(pkg.scripts.start).toBe('node --env-file=../../.env --env-file=../../.env.prod --env-file-if-exists=../../.env.local dist/index.js')
    expect(pkg.files).toEqual(expect.arrayContaining(['config', 'data', 'dist']))
    expect(await exists(projectPath, 'packages/proj-fullstack-serv/data/.gitkeep')).toBe(true)
    expect(await exists(projectPath, 'packages/proj-fullstack-serv/src/app-server.ts')).toBe(true)
    expect(await exists(projectPath, 'packages/proj-fullstack-serv/src/server/procedures/app-procedures.ts')).toBe(true)
    expect(await exists(projectPath, 'packages/proj-fullstack-serv/tests/app-server.test.ts')).toBe(true)

    // 实际 create 命令不能覆盖模板生成的可选配置和 Reach 标准通知模板。
    for (const moduleKey of ['ai', 'vecdb', 'payment']) {
      const content = await readText(projectPath, `packages/proj-fullstack-serv/config/_${moduleKey}.yml`)
      expect(parse(content)).toBeNull()
    }
    const scheduler = parse(await readText(projectPath, 'packages/proj-fullstack-serv/config/_scheduler.yml'))
    expect(scheduler).toEqual({ enableDb: '$' + '{HAI_SCHEDULER_ENABLEDB:true}', tickInterval: '$' + '{HAI_SCHEDULER_TICKINTERVAL:1000}', leaseMs: '$' + '{HAI_SCHEDULER_LEASEMS:300000}' })
    const audit = parse(await readText(projectPath, 'packages/proj-fullstack-serv/config/_audit.yml'))
    expect(audit.backup.enabled).toBe('$' + '{HAI_AUDIT_BACKUP_ENABLED:false}')
    expect(audit.backup.schedule.enabled).toBe('$' + '{HAI_AUDIT_BACKUP_SCHEDULE_ENABLED:false}')
    expect(audit.alerts.enabled).toBe('$' + '{HAI_AUDIT_ALERTS_ENABLED:false}')
    expect(audit.alerts.schedule.enabled).toBe('$' + '{HAI_AUDIT_ALERTS_SCHEDULE_ENABLED:false}')
    const reach = parse(await readText(projectPath, 'packages/proj-fullstack-serv/config/_reach.yml'))
    expect(reach.templates.map((template: { name: string }) => template.name)).toEqual(['otp_email', 'otp_sms', 'password_reset', 'password_reset_sms'])
    expect(await readText(projectPath, '.env.example')).toContain('# HAI_AI_LLM_APIKEY=')
    // 公共 .env 提供基础参数，私有值仅放 .env.local。
    const envDefaults = (await readText(projectPath, '.env.example')).split('\n').filter(line => /^HAI_(?:CORE|DB|CACHE|STORAGE)_/.test(line))
    expect(envDefaults).toContain('HAI_DB_TYPE=\'sqlite\'')
    for (const file of ['.env', '.env.dev', '.env.test', '.env.prod'])
      expect(await exists(projectPath, file)).toBe(true)
    const activeEnvNames = (await readText(projectPath, '.env')).split('\n').filter(line => /^[A-Z_]+=/.test(line)).map(line => line.slice(0, line.indexOf('=')))
    expect(activeEnvNames).toEqual(expect.arrayContaining(['HAI_CORE_NAME', 'HAI_DB_TYPE', 'HAI_CACHE_TYPE', 'HAI_STORAGE_TYPE', 'HAI_ADMIN_DEFAULT_PASSWORD', 'PUBLIC_API_BASE']))

    const servConfig = await readText(projectPath, 'packages/proj-fullstack-serv/config/_serv.yml')
    expect(servConfig).toContain('origin: $' + '{HAI_SERV_CORS_ORIGIN:*}')
    expect(servConfig).toContain('credentials: $' + '{HAI_SERV_CORS_CREDENTIALS:true}')

    const appServer = await readText(projectPath, 'packages/proj-fullstack-serv/src/app-server.ts')
    expect(appServer).toContain('import type { ServHttpApp } from \'@h-ai/serv\'')
    expect(appServer).toContain('createServerApp(): ServHttpApp')
    expect(appServer).toContain('serv.createApp')
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
    expect(testFile).toContain('mini administration')
    expect(testFile).toContain('crypto.transport.createClient')
    for (const moduleName of ['iam', 'reldb', 'cache', 'crypto', 'storage', 'audit']) {
      expect(pkg.dependencies[`@h-ai/${moduleName}`]).toBe(HAI_DEP_SPECIFIER)
    }
    for (const configKey of ['core', 'db', 'cache', 'storage', 'iam', 'audit']) {
      expect(await exists(projectPath, `packages/proj-fullstack-serv/config/_${configKey}.yml`)).toBe(true)
    }
    const iamConfig = await readText(projectPath, 'packages/proj-fullstack-serv/config/_iam.yml')
    expect(iamConfig).toContain('seedDefaultData: $' + '{HAI_IAM_SEEDDEFAULTDATA:false}')
    expect(iamConfig).toContain('variant: split')
    const envExample = await readText(projectPath, '.env.example')
    for (const name of ['BASE_URL', 'HAI_E2E_WEB_URL', 'HAI_E2E_APP_URL', 'HAI_E2E_DESKTOP_URL', 'E2E_ADMIN_PASSWORD', 'E2E_AUDIT_ADMIN_PASSWORD', 'E2E_CONFIG_ADMIN_PASSWORD', 'E2E_BUSINESS_OPERATOR_PASSWORD'])
      expect(envExample).toContain(`# ${name}=`)
    expect(envExample).toContain('HAI_ADMIN_DEFAULT_PASSWORD=')
    expect(envExample).toContain('PUBLIC_API_BASE=http://127.0.0.1:3000')
    expect(await exists(projectPath, 'src/routes/api/auth/login/+server.ts')).toBe(false)
    expect(appServer).toContain('refreshCookie:')
    expect(appServer).toContain('createReldbTransportKeyStore')
    expect(appServer).toContain('X-HAI-Token-Transport')
  })

  it('应生成由 Service 直接监听的默认镜像与独立 Web 镜像', async () => {
    const dockerfile = await readText(projectPath, 'images/serv.Dockerfile')
    const nginxConfig = await readText(projectPath, 'images/web/nginx.conf')
    const runtimeConfig = await readText(projectPath, 'images/web/runtime-config.js.template')
    const runtimeConfigEnv = await readText(projectPath, 'images/web/19-runtime-config.envsh')
    const webIndex = await readText(projectPath, 'apps/proj-fullstack-web/index.html')

    expect(dockerfile).toContain('pnpm pm deploy --filter proj-fullstack-serv --prod')
    expect(dockerfile).not.toContain('embedded-data')
    expect(dockerfile).not.toContain('pnpm fetch --frozen-lockfile')
    expect(dockerfile.indexOf('pnpm fetch')).toBeGreaterThanOrEqual(0)
    // file: 包归档是离线交付材料，fetch 前必须已在构建上下文内。
    expect(dockerfile.indexOf('COPY images/dependencies/ ./')).toBeLessThan(dockerfile.indexOf('pnpm fetch'))
    expect(dockerfile.indexOf('COPY . .')).toBeLessThan(dockerfile.indexOf('pnpm install --offline --frozen-lockfile --ignore-scripts'))
    expect(dockerfile).not.toContain('ARG PUBLIC_API_BASE')
    const webDockerfile = await readText(projectPath, 'images/web.Dockerfile')
    expect(webDockerfile).toContain('NGINX_ENVSUBST_OUTPUT_DIR=/tmp/hai-runtime-config')
    expect(dockerfile).toContain('USER node')
    expect(dockerfile).not.toContain('fullstack-server.mjs')
    expect(webDockerfile).toContain('wget -Y off -q -O /dev/null http://127.0.0.1:8080/health')
    expect(await exists(projectPath, 'images/web/fullstack-server.mjs')).toBe(false)
    expect(nginxConfig).toContain('try_files $uri $uri/ /index.html')
    expect(nginxConfig).toContain('alias /tmp/hai-runtime-config/runtime-config.js')
    expect(runtimeConfig).toContain('$' + '{PUBLIC_API_BASE_BASE64}')
    expect(runtimeConfigEnv).toContain('$' + '{PUBLIC_API_BASE:-}')
    expect(webIndex).toContain('<script src="/runtime-config.js"></script>')
    expect(webIndex).not.toContain('<script type="module" src="/runtime-config.js"></script>')
    expect(webIndex.indexOf('/runtime-config.js')).toBeLessThan(webIndex.indexOf('</head>'))
    expect(await exists(projectPath, 'apps/proj-fullstack-web/public/runtime-config.js')).toBe(true)
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
      expect(pkg.scripts.package).toBe(target === 'app' ? 'pnpm package:android' : 'pnpm build')
      expect(pkg.scripts.typecheck).not.toContain('svelte-kit sync')
      expect(await exists(projectPath, `apps/proj-fullstack-${target}/index.html`)).toBe(true)
      expect(await exists(projectPath, `apps/proj-fullstack-${target}/src/main.ts`)).toBe(true)
      expect(await exists(projectPath, `apps/proj-fullstack-${target}/src/App.svelte`)).toBe(true)
      expect(await exists(projectPath, `apps/proj-fullstack-${target}/src/routes/+page.svelte`)).toBe(false)
      expect(await exists(projectPath, `apps/proj-fullstack-${target}/project.inlang/settings.json`)).toBe(true)
      expect(await exists(projectPath, `apps/proj-fullstack-${target}/messages/zh-CN.json`)).toBe(true)
      expect(await exists(projectPath, `apps/proj-fullstack-${target}/messages/en-US.json`)).toBe(true)
      expect(await exists(projectPath, `apps/proj-fullstack-${target}/tests/api.test.ts`)).toBe(false)
      expect(await exists(projectPath, `apps/proj-fullstack-${target}/eslint.config.js`)).toBe(true)

      const eslintConfig = await readText(projectPath, `apps/proj-fullstack-${target}/eslint.config.js`)
      expect(eslintConfig).toContain('\'svelte/indent\': \'off\'')

      const app = await readText(projectPath, `apps/proj-fullstack-${target}/src/App.svelte`)
      expect(app).toContain('proj-fullstack-shared')
      expect(app).toContain('AdminWorkspace')
      expect(app).toContain('reload: false')
      if (target === 'web') {
        expect(app).toContain('platform="web"')
      }
      else {
        expect(app).toContain('platform="app"')
        expect(app).toContain('createCapacitorTokenStorage')
        expect(app).toContain('capacitor.isNative()')
        expect(app).toContain('X-HAI-Token-Transport')
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
    expect(appPkg.scripts['cap:build:android:release']).toBe('pnpm package:android')
    expect(appPkg.scripts['package:android']).toContain('hai build --target app --platform android')
    expect(await exists(projectPath, 'apps/proj-fullstack-app/capacitor.config.ts')).toBe(true)
    expect(await exists(projectPath, 'apps/proj-fullstack-app/src/lib/capacitor.ts')).toBe(true)
    expect(await exists(projectPath, 'apps/proj-fullstack-app/public/runtime-config.js')).toBe(true)
    expect(await readText(projectPath, 'apps/proj-fullstack-app/index.html')).toContain('src="/runtime-config.js"')
    expect(await exists(projectPath, 'apps/proj-fullstack-app/src/routes/+layout.ts')).toBe(false)
    const appSvelteConfig = await readText(projectPath, 'apps/proj-fullstack-app/svelte.config.js')
    expect(appSvelteConfig).not.toContain('@sveltejs/adapter-static')
    expect(appSvelteConfig).not.toContain('fallback: \'index.html\'')
    const appReadme = await readText(projectPath, 'apps/proj-fullstack-app/README.md')
    expect(appReadme).toContain('Capacitor')
    expect(appReadme).toContain('package:android')
    const appPackageText = await readText(projectPath, 'apps/proj-fullstack-app/package.json')
    expect(appPackageText).toContain('    "cap:build:android:debug":')

    const desktopPkg = await readJson(projectPath, 'apps/proj-fullstack-desktop/package.json')
    expectNonWorkspaceDepsUseCatalog(desktopPkg)
    expect(desktopPkg.name).toBe('proj-fullstack-desktop')
    expect(desktopPkg.dependencies['proj-fullstack-contract']).toBeUndefined()
    expect(desktopPkg.dependencies['proj-fullstack-shared']).toBe('workspace:*')
    expect(desktopPkg.dependencies['@h-ai/api-client']).toBe(HAI_DEP_SPECIFIER)
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
    expect(desktopApp).toContain('AdminWorkspace')
    expect(desktopApp).toContain('tokenStorage.memory()')
    expect(desktopApp).toContain('__TAURI_INTERNALS__')
    const desktopVite = await readText(projectPath, 'apps/proj-fullstack-desktop/vite.config.ts')
    expect(desktopVite).toContain('TAURI_DEV_HOST')
    expect(desktopVite).toContain('svelte()')
    const desktopReadme = await readText(projectPath, 'apps/proj-fullstack-desktop/README.md')
    expect(desktopReadme).toContain('Tauri v2')
    expect(desktopReadme).toContain('pnpm build --target desktop --platform windows --arch x64')
    expect(desktopReadme).not.toContain('pnpm --filter proj-fullstack-desktop deploy')

    // shared 包断言
    const sharedPkg = await readJson(projectPath, 'packages/proj-fullstack-shared/package.json')
    expectNonWorkspaceDepsUseCatalog(sharedPkg)
    expect(sharedPkg.name).toBe('proj-fullstack-shared')
    expect(sharedPkg.dependencies['proj-fullstack-contract']).toBe('workspace:*')
    expect(sharedPkg.dependencies['@h-ai/api-client']).toBe(HAI_DEP_SPECIFIER)
    expect(sharedPkg.dependencies['@h-ai/core']).toBe(HAI_DEP_SPECIFIER)
    expect(sharedPkg.dependencies['@h-ai/crypto']).toBe(HAI_DEP_SPECIFIER)
    expect(sharedPkg.dependencies['@h-ai/ui']).toBe(HAI_DEP_SPECIFIER)
    expect(sharedPkg.devDependencies['@inlang/paraglide-js']).toBeDefined()
    expect(sharedPkg.devDependencies['@inlang/plugin-message-format']).toBeDefined()
    expect(sharedPkg.devDependencies.vite).toBe(CATALOG_DEP_SPECIFIER)
    expect(sharedPkg.scripts['paraglide:compile']).toContain('paraglide-js compile')
    expect(await exists(projectPath, 'packages/proj-fullstack-shared/project.inlang/settings.json')).toBe(true)
    expect(await exists(projectPath, 'packages/proj-fullstack-shared/messages/zh-CN.json')).toBe(true)
    expect(await exists(projectPath, 'packages/proj-fullstack-shared/messages/en-US.json')).toBe(true)
    expect(await exists(projectPath, 'packages/proj-fullstack-shared/src/lib/components/AppShell.svelte')).toBe(true)
    expect(await exists(projectPath, 'packages/proj-fullstack-shared/src/lib/components/AdminWorkspace.svelte')).toBe(true)
    expect(await exists(projectPath, 'packages/proj-fullstack-shared/src/lib/pages/users.svelte')).toBe(true)
    expect(await exists(projectPath, 'packages/proj-fullstack-shared/src/lib/pages/roles.svelte')).toBe(true)
    expect(await exists(projectPath, 'packages/proj-fullstack-shared/src/lib/pages/audit.svelte')).toBe(true)
    expect(await exists(projectPath, 'packages/proj-fullstack-shared/src/lib/pages/settings.svelte')).toBe(true)
    expect(await exists(projectPath, 'packages/proj-fullstack-shared/tests/api-client.test.ts')).toBe(true)
    expect(await exists(projectPath, 'packages/proj-fullstack-shared/src/lib/stores/theme-store.svelte.ts')).toBe(true)
    expect(await exists(projectPath, 'packages/proj-fullstack-shared/src/lib/api/api-client.ts')).toBe(true)
    expect(await exists(projectPath, 'packages/proj-fullstack-shared/src/index.ts')).toBe(true)
    const sharedClient = await readText(projectPath, 'packages/proj-fullstack-shared/src/lib/api/api-client.ts')
    expect(sharedClient).toContain('import.meta.env.PUBLIC_API_BASE')
    expect(sharedClient).toContain('transport: { crypto }')
    expect(sharedClient).toContain('credentials: \'include\'')

    const sharedStore = await readText(projectPath, 'packages/proj-fullstack-shared/src/lib/stores/management-store.svelte.ts')
    expect(sharedStore).toContain('admin.users.list')
    expect(sharedStore).toContain('admin.roles.list')
    expect(sharedStore).toContain('admin.audit.list')
    expect(sharedStore).toContain('profile.avatar')
    expect(sharedStore).toContain('iam.auth.changePassword')
    expect(sharedStore).toContain('info.data.defaultLocale')

    const inlangSettings = await readJson(projectPath, 'packages/proj-fullstack-shared/project.inlang/settings.json')
    expect(inlangSettings.baseLocale).toBe('zh-CN')
    expect(inlangSettings.locales).toContain('zh-CN')
    expect(inlangSettings.locales).toContain('en-US')
  })

  it('miniapp 仅生成预留说明，不生成不可运行 package', async () => {
    expect(await exists(projectPath, 'apps/proj-fullstack-miniapp/README.md')).toBe(true)
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
    expect(spec).toContain('service rejects plaintext business requests')
    expect(spec).toContain('frontend displays configured core metadata')
    expect(spec).toContain('administrator and user complete account')
    expect(spec).toContain('page.goto')
  })

  it('应生成 fullstack 兼容的全量 skills', async () => {
    await expectCompatibleSkills(projectPath, 'fullstack')
  })

  it('应生成包含 fullstack 职责边界、质量门禁与完成条件的 AI 指引', async () => {
    const agents = await readText(projectPath, 'AGENTS.md')
    const claude = await readText(projectPath, 'CLAUDE.md')

    expect(agents).toContain('packages/proj-fullstack-serv')
    expect(agents).toContain('apps/proj-fullstack-app')
    expect(agents).not.toContain('<project>')
    expect(agents).toContain('Capacitor')
    expect(agents).toContain('Tauri')
    expect(agents).toContain('## 完成条件')
    expect(agents).toContain('pnpm typecheck')
    expect(claude.trim()).toBe('@AGENTS.md')
    expect(agents).toContain('packages/proj-fullstack-contract')
    expect(agents).toContain('packages/proj-fullstack-shared')
    expect(agents).not.toContain('<project>')
    expect(agents).toContain('Desktop')
    expect(agents).toContain('Tauri v2')
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

describe('ai 支持交付与回填', () => {
  it.each(['init', 'add'] as const)('旧项目 %s 应补齐框架升级流程并保留自定义规则', async (command) => {
    const dir = path.join(tmpRoot, `framework-upgrade-backfill-${command}`)
    const customAgents = '# custom project rules\n'
    const customUpgradeSkill = command === 'add' ? '# custom framework upgrade rules\n' : undefined
    const originalPackage = {
      name: `legacy-framework-${command}`,
      version: '0.1.0',
      dependencies: { '@h-ai/core': HAI_DEP_VERSION, '@h-ai/ai': HAI_DEP_VERSION },
    }
    await fse.outputJson(path.join(dir, 'package.json'), originalPackage)
    await fse.outputFile(path.join(dir, 'AGENTS.md'), customAgents)
    if (customUpgradeSkill !== undefined) {
      await fse.outputFile(path.join(dir, '.agents/skills/hai-framework-sync/SKILL.md'), customUpgradeSkill)
    }

    if (command === 'init') {
      await initProject({ cwd: dir, force: true, verbose: false })
    }
    else {
      await addModule({ module: 'ai', install: false, cwd: dir, verbose: false })
    }

    for (const resource of ['hai-framework-sync/SKILL.md', 'hai-framework-sync/sync.md', 'hai-ci/SKILL.md', 'hai-pr-review/SKILL.md']) {
      expect(await exists(dir, `.agents/skills/${resource}`), resource).toBe(true)
      const expected = resource === 'hai-framework-sync/SKILL.md' && customUpgradeSkill !== undefined
        ? customUpgradeSkill
        : await readText(skillTemplatesDir, resource)
      expect(await readText(dir, `.agents/skills/${resource}`)).toBe(expected)
    }
    expect(await readText(dir, 'AGENTS.md')).toBe(customAgents)
    expect(await readJson(dir, 'package.json')).toEqual(originalPackage)
  })

  it('单模块回填应补全工作流资源并保留已有 Skill 内容', async () => {
    const dir = path.join(tmpRoot, 'skill-module-backfill')
    const customSkill = '# project-specific development instructions\n'
    await fse.outputFile(path.join(dir, '.agents/skills/hai-app-create/SKILL.md'), customSkill)

    const copied = await generateModuleSkillFile(dir, 'ai')

    expect(copied).toContain('.agents/skills/hai-app-create/development.md')
    expect(await readText(dir, '.agents/skills/hai-app-create/SKILL.md')).toBe(customSkill)
    expect(await readText(dir, '.agents/skills/hai-app-create/development.md'))
      .toBe(await fse.readFile(path.join(skillTemplatesDir, 'hai-app-create/development.md'), 'utf8'))
    expect(copied).toContain('.agents/skills/hai-app-create/collaboration.md')
    expect(await readText(dir, '.agents/skills/hai-app-create/collaboration.md'))
      .toBe(await fse.readFile(path.join(skillTemplatesDir, 'hai-app-create/collaboration.md'), 'utf8'))
    for (const skillName of ['hai-build', 'hai-spec-review', 'hai-spec-implement', 'hai-app-review', 'hai-app-tests', 'hai-ai']) {
      expect(await exists(dir, `.agents/skills/${skillName}/SKILL.md`)).toBe(true)
    }
    expect(await generateModuleSkillFile(dir, 'ai')).toBeNull()
  })

  it('文档实施工作流回填应保留自定义入口并完整补齐任务、执行与变更资源', async () => {
    const dir = path.join(tmpRoot, 'skill-spec-implement-backfill')
    const skillRoot = '.agents/skills/hai-spec-implement'
    const customSkill = '# project-specific implementation instructions\n'
    await fse.outputFile(path.join(dir, skillRoot, 'SKILL.md'), customSkill)

    const copied = await generateProjectAiSupport(dir, [], { overwriteSkills: false, overwriteBridgeFiles: false })

    expect(await readText(dir, `${skillRoot}/SKILL.md`)).toBe(customSkill)
    for (const resource of ['workflow.md', 'templates.md', 'changes.md', 'handoff.md', 'evaluation.md']) {
      expect(copied).toContain(`${skillRoot}/${resource}`)
      expect(await readText(dir, `${skillRoot}/${resource}`))
        .toBe(await fse.readFile(path.join(skillTemplatesDir, 'hai-spec-implement', resource), 'utf8'))
    }
    expect(await generateProjectAiSupport(dir, [], { overwriteSkills: false, overwriteBridgeFiles: false })).toEqual([])
  })

  it('前端技能回填保留私有设计入口并补齐设计和审查资源', async () => {
    const dir = path.join(tmpRoot, 'skill-ui-backfill')
    const custom = '# app-owned design decisions\n'
    await fse.outputFile(path.join(dir, '.agents/skills/hai-ui-design/SKILL.md'), custom)
    await generateModuleSkillFile(dir, 'ui')
    expect(await readText(dir, '.agents/skills/hai-ui-design/SKILL.md')).toBe(custom)
    for (const [skill, resource] of [['hai-ui-design', 'patterns.md'], ['hai-ui-review', 'checklist.md'], ['hai-ui-review', 'SKILL.md']]) {
      expect(await readText(dir, `.agents/skills/${skill}/${resource}`))
        .toBe(await fse.readFile(path.join(skillTemplatesDir, skill, resource), 'utf8'))
    }
    expect(await generateModuleSkillFile(dir, 'ui')).toBeNull()
  })

  it('fullstack 回填应从实际项目名称和包布局恢复专属桥接及兼容技能', async () => {
    const dir = path.join(tmpRoot, 'skill-fullstack-backfill')
    await fse.outputJson(path.join(dir, 'package.json'), { name: 'renamed-root', private: true })
    for (const suffix of ['contract', 'serv', 'shared']) {
      await fse.outputJson(path.join(dir, `packages/renamed-root-${suffix}/package.json`), { name: `renamed-root-${suffix}` })
    }

    await generateProjectAiSupport(dir, [])

    const agents = await readText(dir, 'AGENTS.md')
    expect(agents).toContain('packages/renamed-root-serv')
    expect(agents).not.toContain('{{projectName}}')
    await expectCompatibleSkills(dir, 'fullstack')
  })

  it('单应用回填应使用 package.json 中已有的模板标识', async () => {
    const dir = path.join(tmpRoot, 'skill-admin-backfill')
    await fse.outputJson(path.join(dir, 'package.json'), { name: 'actual-admin', keywords: ['hai', 'sveltekit', 'admin'] })

    await generateProjectAiSupport(dir, [])

    expect(await readText(dir, 'AGENTS.md')).toContain('管理后台')
    await expectCompatibleSkills(dir, 'admin')
  })

  it('无法确认实际布局时应保留通用入口且仍交付普通开发工作流', async () => {
    const dir = path.join(tmpRoot, 'skill-unknown-project')
    await fse.outputJson(path.join(dir, 'package.json'), { name: 'unknown-project', keywords: ['fullstack'] })

    await generateProjectAiSupport(dir, [])

    expect(await readText(dir, 'AGENTS.md')).toContain('通用 AI 编程助手入口')
    expect(await exists(dir, '.agents/skills/hai-app-create/development.md')).toBe(true)
  })
})

describe('addModule', () => {
  it('adds and repairs root deployment configuration while preserving build and custom fields', async () => {
    const dir = path.join(tmpRoot, 'add-deploy-config')
    await fse.ensureDir(dir)
    await fse.writeJson(path.join(dir, 'package.json'), { name: 'add-deploy-config', version: '0.1.0', dependencies: { '@h-ai/core': 'workspace:*' } })
    const build = { images: [{ name: 'serv', dockerfile: 'images/serv.Dockerfile' }] }
    await fse.writeJson(path.join(dir, 'hai.json'), { build, custom: { enabled: true } })
    await addModule({ module: 'deploy', install: false, cwd: dir, verbose: false })
    const project = await fse.readJson(path.join(dir, 'hai.json'))
    expect(project).toMatchObject({ build, custom: { enabled: true }, deploy: { provider: { type: expect.stringContaining('docker-ssh') } } })
    expect(await fse.pathExists(path.join(dir, 'config/_deploy.yml'))).toBe(false)
    project.deploy.container = { s3Engine: 'minio' }
    await fse.writeJson(path.join(dir, 'hai.json'), project)
    await addModule({ module: 'deploy', install: false, cwd: dir, verbose: false })
    expect(await fse.readJson(path.join(dir, 'hai.json'))).toEqual(project)
  })
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
    expect(await exists(dir, '.agents/skills/hai-spec-implement/workflow.md')).toBe(true)
    expect(await fse.pathExists(path.join(dir, '.github/skills'))).toBe(false)

    const opencode = await fse.readJson(path.join(dir, 'opencode.json'))
    expect(opencode.instructions).toEqual(['AGENTS.md'])
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
    expect(await fse.readFile(path.join(dir, '.github', 'copilot-instructions.md'), 'utf8')).toContain('[AGENTS.md](../AGENTS.md)')

    const opencode = await fse.readJson(path.join(dir, 'opencode.json'))
    expect(opencode.instructions).toEqual(['AGENTS.md'])
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
  it('共享技能目录链接到项目外时不补写外部资源', async () => {
    const dir = path.join(tmpRoot, 'shared-outside-directory-link')
    const outside = path.join(tmpRoot, 'shared-outside-target')
    await fse.ensureDir(outside)
    await fse.ensureSymlink(outside, path.join(dir, '.agents/skills'), 'junction')

    await expect(generateProjectAiSupport(dir, ['hai-app-create'], { overwriteSkills: false }))
      .rejects
      .toThrow(cliM('cli_generateOutsideWorkspace'))
    expect(await fse.readdir(outside)).toEqual([])
  })

  it('已有 Claude 技能目录链接到共享目录时不把正文改写成自引用', async () => {
    const dir = path.join(tmpRoot, 'claude-shared-directory-link')
    const sharedDirectory = path.join(dir, '.agents/skills')
    await fse.ensureDir(sharedDirectory)
    await fse.ensureSymlink(sharedDirectory, path.join(dir, '.claude/skills'), 'junction')

    await generateProjectAiSupport(dir, ['hai-app-create'])

    expect(await readText(dir, '.agents/skills/hai-app-create/SKILL.md'))
      .toBe(await fse.readFile(path.join(skillTemplatesDir, 'hai-app-create/SKILL.md'), 'utf8'))
    expect(await readText(dir, '.claude/skills/hai-app-create/SKILL.md'))
      .toBe(await readText(dir, '.agents/skills/hai-app-create/SKILL.md'))
  })

  it('已有 Claude 技能目录链接到项目外时不触碰其内容', async () => {
    const dir = path.join(tmpRoot, 'claude-outside-directory-link')
    const outside = path.join(tmpRoot, 'claude-outside-target')
    await fse.ensureDir(outside)
    await fse.ensureSymlink(outside, path.join(dir, '.claude/skills'), 'junction')

    await generateProjectAiSupport(dir, ['hai-app-create'])
    expect(await fse.readdir(outside)).toEqual([])
    expect((await readText(dir, 'CLAUDE.md')).trim()).toBe('@AGENTS.md')
  })

  it('copilot 规则目录链接到项目外时不写入外部入口', async () => {
    const dir = path.join(tmpRoot, 'copilot-outside-directory-link')
    const outside = path.join(tmpRoot, 'copilot-outside-target')
    await fse.ensureDir(outside)
    await fse.ensureSymlink(outside, path.join(dir, '.github'), 'junction')

    await expect(generateProjectAiSupport(dir, ['hai-app-create']))
      .rejects
      .toThrow(cliM('cli_generateOutsideWorkspace'))
    expect(await fse.readdir(outside)).toEqual([])
  })

  it('回填共享技能时保留已有 Claude 规则与设置，不新增 Claude 技能', async () => {
    const dir = path.join(tmpRoot, 'init-claude-aliases')
    await fse.outputJson(path.join(dir, 'package.json'), {
      name: 'existing-claude-project',
      version: '0.1.0',
      dependencies: { '@h-ai/core': 'workspace:*' },
    })
    await fse.outputFile(path.join(dir, 'config/_core.yml'), 'name: existing-claude-project\n')
    await fse.outputFile(path.join(dir, '.claude/skills/hai-core/SKILL.md'), '# custom Claude skill\n')
    await fse.outputFile(path.join(dir, '.claude/settings.json'), '{"permissions":{"deny":["Bash(rm *)"]}}\n')

    await initProject({ cwd: dir, verbose: false })

    expect(await readText(dir, '.claude/skills/hai-core/SKILL.md')).toBe('# custom Claude skill\n')
    expect(await readText(dir, '.claude/settings.json')).toBe('{"permissions":{"deny":["Bash(rm *)"]}}\n')
    expect(await fse.readdir(path.join(dir, '.claude/skills'))).toEqual(['hai-core'])
    expect(await exists(dir, '.claude/skills/hai-app-create/SKILL.md')).toBe(false)
    expect(await exists(dir, '.agents/skills/hai-app-create/development.md')).toBe(true)
  })

  it('仅生成 CLAUDE 共享规则引用，不创建重复技能目录，并保留共享技能', async () => {
    const dir = path.join(tmpRoot, 'init-shared-claude-description')
    const sharedContent = '---\nname: hai-app-create\ndescription: 本项目的功能开发规则\n---\n\n# custom workflow\n'
    await fse.outputFile(path.join(dir, '.agents/skills/hai-app-create/SKILL.md'), sharedContent)

    await generateProjectAiSupport(dir, ['hai-app-create'], { overwriteSkills: false, overwriteBridgeFiles: false })

    expect((await readText(dir, 'CLAUDE.md')).trim()).toBe('@AGENTS.md')
    expect(await exists(dir, '.claude')).toBe(false)
    expect(await readText(dir, '.agents/skills/hai-app-create/SKILL.md')).toBe(sharedContent)
    expect(await exists(dir, '.agents/skills/hai-app-create/development.md')).toBe(true)
  })

  it('配置齐备时也应补全缺失 AI 资源并保留已有入口与 Skill', async () => {
    const dir = path.join(tmpRoot, 'init-ai-resources')
    await fse.outputJson(path.join(dir, 'package.json'), {
      name: 'existing-hai-project',
      version: '0.1.0',
      dependencies: { '@h-ai/core': 'workspace:*' },
    })
    await fse.outputFile(path.join(dir, 'config/_core.yml'), 'name: existing-hai-project\n')
    await fse.outputFile(path.join(dir, 'AGENTS.md'), '# custom project rules\n')
    await fse.outputFile(path.join(dir, '.agents/skills/hai-app-create/SKILL.md'), '# custom workflow\n')

    await initProject({ cwd: dir, verbose: false })

    expect(await readText(dir, 'AGENTS.md')).toBe('# custom project rules\n')
    expect(await readText(dir, '.agents/skills/hai-app-create/SKILL.md')).toBe('# custom workflow\n')
    expect(await exists(dir, '.agents/skills/hai-app-create/development.md')).toBe(true)
    expect(await exists(dir, '.agents/skills/hai-core/SKILL.md')).toBe(true)
    expect(await exists(dir, '.agents/skills/hai-spec-implement/SKILL.md')).toBe(true)
    expect(await exists(dir, '.agents/skills/hai-spec-implement/templates.md')).toBe(true)
  })

  it('非 hai 项目不应创建 AI 支持文件', async () => {
    const dir = path.join(tmpRoot, 'init-plain-no-ai')
    await fse.outputJson(path.join(dir, 'package.json'), { name: 'plain-project', version: '0.1.0' })

    await initProject({ cwd: dir, verbose: false })

    expect(await exists(dir, 'AGENTS.md')).toBe(false)
    expect(await exists(dir, '.agents/skills')).toBe(false)
  })

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
      dependencies: { '@h-ai/core': 'workspace:*', '@h-ai/kit': 'workspace:*', '@sveltejs/kit': '^2', 'svelte': '^5', 'zod': '*' },
    })
  })

  describe('generate page', () => {
    it('默认拒绝覆盖并预检全部页面文件，force 才允许替换', async () => {
      const output = path.join(projectDir, 'src/routes/safe-pages')
      const serverPath = path.join(output, 'kept', '+page.server.ts')
      await fse.outputFile(serverPath, '// user implementation')
      await expect(generate({ type: 'page', name: 'kept', output, cwd: projectDir })).rejects.toThrow()
      expect(await fse.readFile(serverPath, 'utf8')).toBe('// user implementation')
      expect(await fse.pathExists(path.join(output, 'kept', '+page.svelte'))).toBe(false)
      await generate({ type: 'page', name: 'kept', output, cwd: projectDir, force: true })
      expect(await fse.readFile(serverPath, 'utf8')).toContain('PageServerLoad')
    })

    it.each(['../escape', 'nested/name', 'nested\\name', 'bad\';code', '123name'])('拒绝不安全生成名称 %s', async (name) => {
      await expect(generate({ type: 'page', name, cwd: projectDir })).rejects.toThrow()
    })

    it('输出路径越界时抛错，使 CLI 返回非零退出码', async () => {
      await expect(generate({ type: 'model', name: 'escape', output: '../outside', cwd: projectDir })).rejects.toThrow()
    })
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
      expect(content).toContain('children?: Snippet')
      expect(content).toContain('{@render children?.()}')
      expect(content).not.toContain('<slot')
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
      expect(content).toContain('kit.handler')
      expect(content).toContain('kit.validate.body(request, InputSchema)')
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
      expect(content).toContain('export function up')
      expect(content).toContain('export function down')
      expect(content).toContain('reldb.ddl.createTable')
      expect(content).toContain('reldb.ddl.dropTable')
      expect(content).not.toContain('MigrationFn')
    })
  })
})
