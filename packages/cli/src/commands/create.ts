/**
 * =============================================================================
 * @hai/cli - 项目创建命令
 * =============================================================================
 * 类似 SvelteKit 的交互式项目创建
 *
 * 使用: pnpm hai create my-admin-system
 * =============================================================================
 */

import type { AppType, CreateProjectOptions, FeatureDefinition, FeatureId, ProjectInfo } from '../types.js'
import { execSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { core } from '@hai/core'
import chalk from 'chalk'
import fse from 'fs-extra'
import ora from 'ora'
import prompts from 'prompts'
import { detectPackageManager, fileExists, writeFile } from '../utils.js'

/**
 * 应用类型定义
 */
const APP_TYPES: Record<AppType, { name: string, description: string, defaultFeatures: FeatureId[] }> = {
  admin: {
    name: '管理后台',
    description: '企业级管理系统，含 IAM、数据库、完整 UI',
    defaultFeatures: ['iam', 'db', 'cache', 'crypto'],
  },
  website: {
    name: '企业官网',
    description: 'SSR/SSG 企业官网，SEO 友好、响应式布局',
    defaultFeatures: [],
  },
  h5: {
    name: 'H5 应用',
    description: '移动端 H5 应用，触摸优化、PWA 支持',
    defaultFeatures: [],
  },
  api: {
    name: 'API 服务',
    description: '纯 API 后端服务，RESTful 路由、无 UI',
    defaultFeatures: ['db'],
  },
}

/**
 * 功能定义
 */
const FEATURES: Record<string, FeatureDefinition> = {
  iam: {
    id: 'iam',
    name: '身份与访问管理',
    description: 'Session/JWT 会话管理、RBAC 权限控制',
    packages: ['@hai/iam'],
    dependencies: ['crypto'],
  },
  db: {
    id: 'db',
    name: '数据库',
    description: 'Drizzle ORM 多数据库支持 (SQLite/PostgreSQL/MySQL)',
    packages: ['@hai/db'],
  },
  cache: {
    id: 'cache',
    name: '缓存',
    description: 'Redis / 内存缓存',
    packages: ['@hai/cache'],
  },
  ai: {
    id: 'ai',
    name: 'AI 集成',
    description: 'LLM 适配器、MCP 协议、技能系统、流式响应',
    packages: ['@hai/ai'],
  },
  storage: {
    id: 'storage',
    name: '文件存储',
    description: '本地存储、S3/OSS/COS 云存储',
    packages: ['@hai/storage'],
  },
  crypto: {
    id: 'crypto',
    name: '加密模块',
    description: '国密 SM2/SM3/SM4、Argon2 密码哈希',
    packages: ['@hai/crypto'],
  },
  // 兼容性别名
  auth: {
    id: 'auth',
    name: '认证授权（别名）',
    description: '已合并到 iam 模块',
    packages: ['@hai/iam'],
    dependencies: ['crypto'],
  },
  mcp: {
    id: 'mcp',
    name: 'MCP 协议（别名）',
    description: '已合并到 ai 模块',
    packages: ['@hai/ai'],
  },
}

/**
 * 项目模板定义
 */
const PROJECT_TEMPLATES = {
  minimal: {
    name: 'minimal',
    description: '最小模板 - 仅核心功能',
    features: [] as FeatureId[],
  },
  default: {
    name: 'default',
    description: '标准模板 - IAM + 数据库',
    features: ['iam', 'db', 'crypto'] as FeatureId[],
  },
  full: {
    name: 'full',
    description: '完整模板 - 所有功能',
    features: ['iam', 'db', 'cache', 'crypto', 'ai', 'storage'] as FeatureId[],
  },
  custom: {
    name: 'custom',
    description: '自定义 - 选择需要的功能',
    features: [] as FeatureId[],
  },
}

/**
 * 创建项目
 */
export async function createProject(options: CreateProjectOptions): Promise<void> {
  const spinner = ora()

  try {
    // 交互式获取选项
    const resolvedOptions = await resolveOptions(options)
    const projectPath = path.resolve(resolvedOptions.cwd ?? '.', resolvedOptions.name)

    // 检查目录是否存在
    if (await fileExists(projectPath)) {
      const { overwrite } = await prompts({
        type: 'confirm',
        name: 'overwrite',
        message: `目录 ${resolvedOptions.name} 已存在，是否覆盖？`,
        initial: false,
      })

      if (!overwrite) {
        core.logger.info(chalk.yellow('已取消'))
        return
      }

      await fse.remove(projectPath)
    }

    spinner.start('创建项目目录...')
    await fse.ensureDir(projectPath)
    spinner.succeed()

    // 生成项目文件
    spinner.start('生成项目文件...')
    await generateProjectFiles(projectPath, resolvedOptions)
    spinner.succeed()

    // 初始化 Git
    if (resolvedOptions.git) {
      spinner.start('初始化 Git 仓库...')
      execSync('git init', { cwd: projectPath, stdio: 'ignore' })
      spinner.succeed()
    }

    // 安装依赖
    if (resolvedOptions.install) {
      spinner.start(`安装依赖 (${resolvedOptions.packageManager})...`)
      const installCmd = getInstallCommand(resolvedOptions.packageManager!)
      execSync(installCmd, { cwd: projectPath, stdio: 'ignore' })
      spinner.succeed()
    }

    // 完成提示
    core.logger.info('', {})
    core.logger.info(chalk.green('✔ 项目创建成功！'))
    core.logger.info('', {})
    core.logger.info('下一步：')
    core.logger.info(chalk.cyan(`  cd ${resolvedOptions.name}`))

    if (!resolvedOptions.install) {
      core.logger.info(chalk.cyan(`  ${resolvedOptions.packageManager} install`))
    }

    core.logger.info(chalk.cyan(`  ${resolvedOptions.packageManager} dev`))
    core.logger.info('', {})
  }
  catch (error) {
    spinner.fail()
    core.logger.error(chalk.red('创建项目失败:'), { error })
    throw error
  }
}

/**
 * 解析选项（交互式）
 */
async function resolveOptions(options: CreateProjectOptions): Promise<Required<CreateProjectOptions>> {
  core.logger.info('', {})
  core.logger.info(chalk.bold.cyan('  🚀 hai Admin Framework'))
  core.logger.info(chalk.gray('     AI-Native · Configuration-Driven · Security-First'))
  core.logger.info('', {})

  const questions: prompts.PromptObject[] = []

  // 项目名称
  if (!options.name) {
    questions.push({
      type: 'text',
      name: 'name',
      message: '项目名称:',
      initial: 'my-app',
      validate: (value: string) => {
        if (!value.trim())
          return '项目名称不能为空'
        if (!/^[a-z0-9-]+$/.test(value))
          return '项目名称只能包含小写字母、数字和连字符'
        return true
      },
    })
  }

  // 应用类型选择
  if (!options.appType) {
    questions.push({
      type: 'select',
      name: 'appType',
      message: '应用类型:',
      choices: Object.entries(APP_TYPES).map(([key, t]) => ({
        title: `${chalk.bold(t.name.padEnd(10))} ${chalk.gray(t.description)}`,
        value: key,
      })),
      initial: 0,
    })
  }

  // 先获取基础选项
  const baseAnswers = questions.length > 0
    ? await prompts(questions, {
        onCancel: () => {
          core.logger.info(chalk.red('\n已取消'))
          process.exit(1)
        },
      })
    : {}

  const selectedAppType = (options.appType || baseAnswers.appType || 'admin') as AppType

  // 模板选择
  let selectedTemplate = options.template
  if (!selectedTemplate) {
    const { template } = await prompts({
      type: 'select',
      name: 'template',
      message: '选择模板:',
      choices: Object.values(PROJECT_TEMPLATES).map(t => ({
        title: `${chalk.bold(t.name.padEnd(10))} ${chalk.gray(t.description)}`,
        value: t.name,
      })),
      initial: 1,
    }, {
      onCancel: () => {
        core.logger.info(chalk.red('\n已取消'))
        process.exit(1)
      },
    })
    selectedTemplate = template
  }

  // 功能选择
  let selectedFeatures: FeatureId[] = []
  const appTypeDefaults = APP_TYPES[selectedAppType].defaultFeatures

  if (selectedTemplate === 'custom' && !options.features) {
    // 过滤掉别名，只显示正式功能
    const selectableFeatures = ['iam', 'db', 'cache', 'ai', 'storage', 'crypto']
    const featureChoices = selectableFeatures.map(id => ({
      title: `${chalk.bold(FEATURES[id].name.padEnd(10))} ${chalk.gray(FEATURES[id].description)}`,
      value: id,
      selected: appTypeDefaults.includes(id as FeatureId),
    }))

    const { features } = await prompts({
      type: 'multiselect',
      name: 'features',
      message: '选择功能 (空格选择，回车确认):',
      choices: featureChoices,
      hint: '- 空格选择，回车确认',
      instructions: false,
    }, {
      onCancel: () => {
        core.logger.info(chalk.red('\n已取消'))
        process.exit(1)
      },
    })

    selectedFeatures = features || []
    selectedFeatures = resolveFeatureDependencies(selectedFeatures)
  }
  else if (selectedTemplate === 'custom' && options.features) {
    selectedFeatures = resolveFeatureDependencies(options.features)
  }
  else {
    // 合并模板功能与应用类型默认功能
    const templateFeatures = PROJECT_TEMPLATES[selectedTemplate as keyof typeof PROJECT_TEMPLATES]?.features || []
    const merged = new Set([...templateFeatures, ...appTypeDefaults])
    selectedFeatures = resolveFeatureDependencies(Array.from(merged))
  }

  // 示例代码选项
  let addExamples = options.examples
  if (addExamples === undefined) {
    const { examples } = await prompts({
      type: 'confirm',
      name: 'examples',
      message: '是否添加示例代码?',
      initial: true,
    }, {
      onCancel: () => {
        core.logger.info(chalk.red('\n已取消'))
        process.exit(1)
      },
    })
    addExamples = examples
  }

  // 包管理器
  const detected = await detectPackageManager(options.cwd ?? '.')
  let packageManager = options.packageManager
  if (!packageManager) {
    const { pm } = await prompts({
      type: 'select',
      name: 'pm',
      message: '包管理器:',
      choices: [
        { title: 'pnpm (推荐)', value: 'pnpm' },
        { title: 'npm', value: 'npm' },
        { title: 'yarn', value: 'yarn' },
      ],
      initial: detected === 'pnpm' ? 0 : detected === 'npm' ? 1 : 2,
    }, {
      onCancel: () => {
        core.logger.info(chalk.red('\n已取消'))
        process.exit(1)
      },
    })
    packageManager = pm
  }

  // 安装依赖
  let install = options.install
  if (install === undefined) {
    const { doInstall } = await prompts({
      type: 'confirm',
      name: 'doInstall',
      message: '是否安装依赖?',
      initial: true,
    }, {
      onCancel: () => {
        core.logger.info(chalk.red('\n已取消'))
        process.exit(1)
      },
    })
    install = doInstall
  }

  // Git 初始化
  let git = options.git
  if (git === undefined) {
    const { initGit } = await prompts({
      type: 'confirm',
      name: 'initGit',
      message: '是否初始化 Git?',
      initial: true,
    }, {
      onCancel: () => {
        core.logger.info(chalk.red('\n已取消'))
        process.exit(1)
      },
    })
    git = initGit
  }

  return {
    name: options.name || baseAnswers.name,
    appType: selectedAppType,
    template: (selectedTemplate ?? 'default') as 'default' | 'minimal' | 'full' | 'custom',
    features: selectedFeatures,
    examples: addExamples ?? true,
    install: install ?? true,
    packageManager: packageManager || 'pnpm',
    git: git ?? true,
    verbose: options.verbose ?? false,
    cwd: options.cwd ?? '.',
  }
}

/**
 * 解析功能依赖
 */
function resolveFeatureDependencies(features: FeatureId[]): FeatureId[] {
  const result = new Set(features)

  for (const featureId of features) {
    const feature = FEATURES[featureId]
    if (feature.dependencies) {
      for (const dep of feature.dependencies) {
        result.add(dep)
      }
    }
  }

  return Array.from(result)
}

/**
 * 生成项目文件
 */
async function generateProjectFiles(
  projectPath: string,
  options: Required<CreateProjectOptions>,
): Promise<void> {
  const appType = options.appType || 'admin'

  // 收集需要的包
  const featurePackages: Record<string, string> = {}
  for (const featureId of options.features || []) {
    const feature = FEATURES[featureId]
    if (feature) {
      for (const pkg of feature.packages) {
        featurePackages[pkg] = 'workspace:*'
      }
    }
  }

  // 基础依赖（所有应用类型都需要 core + kit）
  const baseDeps: Record<string, string> = {
    '@hai/core': 'workspace:*',
    '@hai/kit': 'workspace:*',
  }

  // API 类型不需要 UI
  if (appType !== 'api') {
    baseDeps['@hai/ui'] = 'workspace:*'
  }

  // package.json
  const packageJson = {
    name: options.name,
    version: '0.0.1',
    private: true,
    license: 'Apache-2.0',
    type: 'module',
    scripts: {
      dev: 'vite dev',
      build: 'vite build',
      preview: 'vite preview',
      check: 'svelte-kit sync && svelte-check --tsconfig ./tsconfig.json',
      lint: 'eslint .',
      test: 'vitest run',
    },
    dependencies: {
      ...baseDeps,
      ...featurePackages,
    },
    devDependencies: {
      '@sveltejs/adapter-auto': '^3.0.0',
      '@sveltejs/kit': '^2.0.0',
      '@sveltejs/vite-plugin-svelte': '^4.0.0',
      'svelte': '^5.0.0',
      'svelte-check': '^4.0.0',
      'typescript': '^5.7.0',
      'vite': '^6.0.0',
      'vitest': '^2.0.0',
      ...(appType !== 'api' ? { tailwindcss: '^4.0.0', daisyui: '^5.0.0' } : {}),
    },
  }

  await writeFile(
    path.join(projectPath, 'package.json'),
    JSON.stringify(packageJson, null, 2),
  )

  // tsconfig.json
  const tsconfig = {
    extends: './.svelte-kit/tsconfig.json',
    compilerOptions: {
      strict: true,
      moduleResolution: 'bundler',
      verbatimModuleSyntax: true,
    },
  }

  await writeFile(
    path.join(projectPath, 'tsconfig.json'),
    JSON.stringify(tsconfig, null, 2),
  )

  // svelte.config.js
  await writeFile(path.join(projectPath, 'svelte.config.js'), generateSvelteConfig())

  // vite.config.ts
  await writeFile(path.join(projectPath, 'vite.config.ts'), generateViteConfig(options.name))

  // src/app.html
  await writeFile(path.join(projectPath, 'src/app.html'), generateAppHtml())

  // src/app.d.ts
  await writeFile(path.join(projectPath, 'src/app.d.ts'), generateAppDts())

  // src/hooks.server.ts
  await writeFile(path.join(projectPath, 'src/hooks.server.ts'), generateHooksServer())

  // .gitignore
  await writeFile(path.join(projectPath, '.gitignore'), generateGitignore())

  // 按应用类型生成路由和页面
  switch (appType) {
    case 'admin':
      await generateAdminRoutes(projectPath, options)
      break
    case 'website':
      await generateWebsiteRoutes(projectPath, options)
      break
    case 'h5':
      await generateH5Routes(projectPath, options)
      break
    case 'api':
      await generateApiRoutes(projectPath, options)
      break
  }

  // README.md
  const appTypeLabel = APP_TYPES[appType].name
  await writeFile(path.join(projectPath, 'README.md'), generateReadme(options.name, appTypeLabel, options.packageManager!))

  // static/favicon.png（空占位）
  await fse.ensureDir(path.join(projectPath, 'static'))

  // 生成配置文件
  for (const featureId of options.features || []) {
    const configKey = getFeatureConfigKey(featureId)
    if (configKey) {
      const { generateConfigFile } = await import('./config-templates.js')
      const content = generateConfigFile(configKey)
      await writeFile(path.join(projectPath, 'config', `_${configKey}.yml`), content)
    }
  }
  // 始终生成 core 配置
  const { generateConfigFile } = await import('./config-templates.js')
  await writeFile(path.join(projectPath, 'config', '_core.yml'), generateConfigFile('core'))
}

/**
 * 获取功能模块对应的配置 key
 */
function getFeatureConfigKey(featureId: FeatureId): string | null {
  const map: Record<string, string> = {
    db: 'db',
    cache: 'cache',
    iam: 'iam',
    storage: 'storage',
    ai: 'ai',
  }
  return map[featureId] ?? null
}

// ============================================================================
// 共用文件生成器
// ============================================================================

function generateSvelteConfig(): string {
  return `/**
 * Svelte 配置
 */
import adapter from '@sveltejs/adapter-auto'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  compilerOptions: {
    runes: true,
  },
  kit: {
    adapter: adapter(),
  },
}

export default config
`
}

function generateViteConfig(name: string): string {
  return `/**
 * ${name} - Vite 配置
 */
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [sveltekit()],
})
`
}

function generateAppHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" href="%sveltekit.assets%/favicon.png" />
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
`
}

function generateAppDts(): string {
  return `/// <reference types="@sveltejs/kit" />

declare global {
  namespace App {
    interface Locals {
      requestId: string
      session?: import('@hai/kit').SessionData
    }
  }
}

export {}
`
}

function generateHooksServer(): string {
  return `/**
 * SvelteKit Server Hooks
 */
import { createHandle } from '@hai/kit'

export const handle = createHandle({
  logging: true,
})
`
}

function generateGitignore(): string {
  return `node_modules
.svelte-kit
build
.env
.env.*
!.env.example
*.log
.DS_Store
`
}

function generateReadme(name: string, appTypeLabel: string, pm: string): string {
  return `# ${name}

基于 hai Admin Framework 构建的${appTypeLabel}应用。

## 开发

\`\`\`bash
${pm} install
${pm} dev
\`\`\`

## 构建

\`\`\`bash
${pm} build
${pm} preview
\`\`\`

## 文档

- [hai Admin Framework](https://github.com/200hub/hai-framework)
- [SvelteKit](https://kit.svelte.dev/)
- [Svelte 5](https://svelte.dev/)
`
}

function generateLayout(): string {
  return `<script lang="ts">
  /**
   * 根布局
   */
  import type { Snippet } from 'svelte'

  interface Props {
    children: Snippet
  }

  let { children }: Props = $props()
</script>

{@render children()}
`
}

// ============================================================================
// 管理后台路由生成
// ============================================================================

async function generateAdminRoutes(
  projectPath: string,
  options: Required<CreateProjectOptions>,
): Promise<void> {
  // 根布局
  await writeFile(path.join(projectPath, 'src/routes/+layout.svelte'), `<script lang="ts">
  /**
   * 管理后台根布局
   */
  import type { Snippet } from 'svelte'

  interface Props {
    children: Snippet
  }

  let { children }: Props = $props()
</script>

<div class="min-h-screen bg-base-200">
  {@render children()}
</div>
`)

  // 首页（仪表盘）
  await writeFile(path.join(projectPath, 'src/routes/+page.svelte'), `<script lang="ts">
  /**
   * 管理后台首页
   */
</script>

<svelte:head>
  <title>${options.name} - 管理后台</title>
</svelte:head>

<main class="min-h-screen flex items-center justify-center">
  <div class="text-center">
    <h1 class="text-4xl font-bold mb-4">${options.name}</h1>
    <p class="text-gray-600 mb-8">管理后台</p>
    <div class="flex gap-4 justify-center">
      <a href="/admin" class="btn btn-primary">进入后台</a>
    </div>
  </div>
</main>
`)

  // 后台布局
  await writeFile(path.join(projectPath, 'src/routes/admin/+layout.svelte'), `<script lang="ts">
  /**
   * 后台管理布局（侧边栏 + 内容区）
   */
  import type { Snippet } from 'svelte'

  interface Props {
    children: Snippet
  }

  let { children }: Props = $props()
</script>

<div class="drawer lg:drawer-open">
  <input id="admin-drawer" type="checkbox" class="drawer-toggle" />
  <div class="drawer-content p-6">
    <label for="admin-drawer" class="btn btn-ghost drawer-button lg:hidden mb-4">
      ☰
    </label>
    {@render children()}
  </div>
  <div class="drawer-side">
    <label for="admin-drawer" class="drawer-overlay"></label>
    <nav class="menu p-4 w-64 min-h-full bg-base-100 text-base-content">
      <div class="text-xl font-bold mb-6 px-2">${options.name}</div>
      <ul>
        <li><a href="/admin">仪表盘</a></li>
        <li><a href="/admin/settings">设置</a></li>
      </ul>
    </nav>
  </div>
</div>
`)

  // 后台仪表盘
  await writeFile(path.join(projectPath, 'src/routes/admin/+page.svelte'), `<script lang="ts">
  /**
   * 仪表盘页面
   */
</script>

<svelte:head>
  <title>仪表盘 - ${options.name}</title>
</svelte:head>

<h1 class="text-2xl font-bold mb-6">仪表盘</h1>

<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
  <div class="stat bg-base-100 rounded-box shadow">
    <div class="stat-title">总用户</div>
    <div class="stat-value">0</div>
  </div>
  <div class="stat bg-base-100 rounded-box shadow">
    <div class="stat-title">今日活跃</div>
    <div class="stat-value">0</div>
  </div>
</div>
`)

  // 设置页
  await writeFile(path.join(projectPath, 'src/routes/admin/settings/+page.svelte'), `<script lang="ts">
  /**
   * 设置页面
   */
</script>

<svelte:head>
  <title>设置 - ${options.name}</title>
</svelte:head>

<h1 class="text-2xl font-bold mb-6">系统设置</h1>

<div class="card bg-base-100 shadow">
  <div class="card-body">
    <h2 class="card-title">基本配置</h2>
    <p>在此管理系统设置。</p>
  </div>
</div>
`)

  // API 健康检查
  await writeFile(path.join(projectPath, 'src/routes/api/health/+server.ts'), `/**
 * 健康检查端点
 */
import type { RequestHandler } from './$types'
import { ok } from '@hai/kit'

export const GET: RequestHandler = async ({ locals }) => {
  return ok({ status: 'ok', timestamp: new Date().toISOString() }, locals.requestId)
}
`)
}

// ============================================================================
// 企业官网路由生成
// ============================================================================

async function generateWebsiteRoutes(
  projectPath: string,
  options: Required<CreateProjectOptions>,
): Promise<void> {
  // 根布局
  await writeFile(path.join(projectPath, 'src/routes/+layout.svelte'), `<script lang="ts">
  /**
   * 官网根布局（导航 + 页脚）
   */
  import type { Snippet } from 'svelte'

  interface Props {
    children: Snippet
  }

  let { children }: Props = $props()
</script>

<div class="min-h-screen flex flex-col">
  <!-- 导航栏 -->
  <header class="navbar bg-base-100 shadow-sm px-4 lg:px-8">
    <div class="flex-1">
      <a href="/" class="text-xl font-bold">${options.name}</a>
    </div>
    <nav class="flex-none">
      <ul class="menu menu-horizontal px-1">
        <li><a href="/">首页</a></li>
        <li><a href="/about">关于我们</a></li>
        <li><a href="/services">服务</a></li>
        <li><a href="/contact">联系我们</a></li>
      </ul>
    </nav>
  </header>

  <!-- 主内容 -->
  <main class="flex-1">
    {@render children()}
  </main>

  <!-- 页脚 -->
  <footer class="footer footer-center p-6 bg-base-200 text-base-content">
    <p>Copyright © ${new Date().getFullYear()} ${options.name}. All rights reserved.</p>
  </footer>
</div>
`)

  // 首页
  await writeFile(path.join(projectPath, 'src/routes/+page.svelte'), `<script lang="ts">
  /**
   * 官网首页
   */
</script>

<svelte:head>
  <title>${options.name}</title>
  <meta name="description" content="${options.name} - 企业官方网站" />
</svelte:head>

<!-- Hero -->
<section class="hero min-h-[60vh] bg-base-200">
  <div class="hero-content text-center">
    <div class="max-w-2xl">
      <h1 class="text-5xl font-bold mb-6">${options.name}</h1>
      <p class="text-lg mb-8">专业、可靠的企业服务</p>
      <a href="/contact" class="btn btn-primary btn-lg">联系我们</a>
    </div>
  </div>
</section>

<!-- 特性 -->
<section class="py-16 px-4 lg:px-8">
  <div class="max-w-6xl mx-auto">
    <h2 class="text-3xl font-bold text-center mb-12">我们的优势</h2>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
      <div class="card bg-base-100 shadow">
        <div class="card-body items-center text-center">
          <h3 class="card-title">专业团队</h3>
          <p>拥有多年行业经验的专业团队。</p>
        </div>
      </div>
      <div class="card bg-base-100 shadow">
        <div class="card-body items-center text-center">
          <h3 class="card-title">优质服务</h3>
          <p>提供全方位的优质服务支持。</p>
        </div>
      </div>
      <div class="card bg-base-100 shadow">
        <div class="card-body items-center text-center">
          <h3 class="card-title">创新技术</h3>
          <p>引领行业的创新技术解决方案。</p>
        </div>
      </div>
    </div>
  </div>
</section>
`)

  // 关于页面
  await writeFile(path.join(projectPath, 'src/routes/about/+page.svelte'), `<script lang="ts">
  /**
   * 关于我们
   */
</script>

<svelte:head>
  <title>关于我们 - ${options.name}</title>
  <meta name="description" content="了解 ${options.name}" />
</svelte:head>

<section class="py-16 px-4 lg:px-8">
  <div class="max-w-4xl mx-auto">
    <h1 class="text-4xl font-bold mb-8">关于我们</h1>
    <div class="prose max-w-none">
      <p>在此介绍公司信息和发展历程。</p>
    </div>
  </div>
</section>
`)

  // 服务页面
  await writeFile(path.join(projectPath, 'src/routes/services/+page.svelte'), `<script lang="ts">
  /**
   * 服务页面
   */
</script>

<svelte:head>
  <title>服务 - ${options.name}</title>
  <meta name="description" content="${options.name} 提供的服务" />
</svelte:head>

<section class="py-16 px-4 lg:px-8">
  <div class="max-w-6xl mx-auto">
    <h1 class="text-4xl font-bold text-center mb-12">我们的服务</h1>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
      <div class="card bg-base-100 shadow">
        <div class="card-body">
          <h2 class="card-title">服务一</h2>
          <p>服务描述内容。</p>
        </div>
      </div>
      <div class="card bg-base-100 shadow">
        <div class="card-body">
          <h2 class="card-title">服务二</h2>
          <p>服务描述内容。</p>
        </div>
      </div>
    </div>
  </div>
</section>
`)

  // 联系页面
  await writeFile(path.join(projectPath, 'src/routes/contact/+page.svelte'), `<script lang="ts">
  /**
   * 联系我们
   */
</script>

<svelte:head>
  <title>联系我们 - ${options.name}</title>
  <meta name="description" content="联系 ${options.name}" />
</svelte:head>

<section class="py-16 px-4 lg:px-8">
  <div class="max-w-2xl mx-auto">
    <h1 class="text-4xl font-bold mb-8">联系我们</h1>
    <form class="space-y-4">
      <div class="form-control">
        <label class="label" for="name"><span class="label-text">姓名</span></label>
        <input id="name" type="text" class="input input-bordered w-full" />
      </div>
      <div class="form-control">
        <label class="label" for="email"><span class="label-text">邮箱</span></label>
        <input id="email" type="email" class="input input-bordered w-full" />
      </div>
      <div class="form-control">
        <label class="label" for="message"><span class="label-text">留言</span></label>
        <textarea id="message" class="textarea textarea-bordered w-full" rows="5"></textarea>
      </div>
      <button type="submit" class="btn btn-primary">发送</button>
    </form>
  </div>
</section>
`)
}

// ============================================================================
// H5 移动端路由生成
// ============================================================================

async function generateH5Routes(
  projectPath: string,
  options: Required<CreateProjectOptions>,
): Promise<void> {
  // 根布局（移动端优化）
  await writeFile(path.join(projectPath, 'src/routes/+layout.svelte'), `<script lang="ts">
  /**
   * H5 移动端根布局
   */
  import type { Snippet } from 'svelte'

  interface Props {
    children: Snippet
  }

  let { children }: Props = $props()
</script>

<div class="max-w-lg mx-auto min-h-screen flex flex-col bg-base-100">
  <!-- 顶部导航 -->
  <header class="navbar bg-primary text-primary-content sticky top-0 z-50">
    <div class="flex-1">
      <span class="text-lg font-bold">${options.name}</span>
    </div>
  </header>

  <!-- 主内容（可滚动） -->
  <main class="flex-1 overflow-y-auto">
    {@render children()}
  </main>

  <!-- 底部标签栏 -->
  <nav class="btm-nav btm-nav-sm">
    <a href="/" class="text-primary">
      <span class="btm-nav-label">首页</span>
    </a>
    <a href="/discover">
      <span class="btm-nav-label">发现</span>
    </a>
    <a href="/profile">
      <span class="btm-nav-label">我的</span>
    </a>
  </nav>
</div>
`)

  // 首页
  await writeFile(path.join(projectPath, 'src/routes/+page.svelte'), `<script lang="ts">
  /**
   * H5 首页
   */
</script>

<svelte:head>
  <title>${options.name}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
</svelte:head>

<div class="p-4 space-y-4">
  <!-- 搜索栏 -->
  <div class="form-control">
    <input type="text" placeholder="搜索..." class="input input-bordered w-full" />
  </div>

  <!-- 功能入口 -->
  <div class="grid grid-cols-4 gap-4 py-4">
    <a href="/discover" class="flex flex-col items-center gap-1">
      <div class="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">📱</div>
      <span class="text-xs">功能一</span>
    </a>
    <a href="/discover" class="flex flex-col items-center gap-1">
      <div class="w-12 h-12 bg-secondary/10 rounded-full flex items-center justify-center">🎯</div>
      <span class="text-xs">功能二</span>
    </a>
    <a href="/discover" class="flex flex-col items-center gap-1">
      <div class="w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center">📊</div>
      <span class="text-xs">功能三</span>
    </a>
    <a href="/discover" class="flex flex-col items-center gap-1">
      <div class="w-12 h-12 bg-info/10 rounded-full flex items-center justify-center">⚙️</div>
      <span class="text-xs">功能四</span>
    </a>
  </div>

  <!-- 内容列表 -->
  <div class="space-y-3">
    <h2 class="text-lg font-bold">最新内容</h2>
    <div class="card bg-base-200">
      <div class="card-body p-4">
        <p class="text-sm">欢迎使用 ${options.name}</p>
      </div>
    </div>
  </div>
</div>
`)

  // 发现页
  await writeFile(path.join(projectPath, 'src/routes/discover/+page.svelte'), `<script lang="ts">
  /**
   * 发现页
   */
</script>

<svelte:head>
  <title>发现 - ${options.name}</title>
</svelte:head>

<div class="p-4">
  <h1 class="text-xl font-bold mb-4">发现</h1>
  <p class="text-gray-600">探索更多精彩内容。</p>
</div>
`)

  // 个人中心
  await writeFile(path.join(projectPath, 'src/routes/profile/+page.svelte'), `<script lang="ts">
  /**
   * 个人中心
   */
</script>

<svelte:head>
  <title>我的 - ${options.name}</title>
</svelte:head>

<div class="p-4 space-y-4">
  <!-- 用户头像区 -->
  <div class="flex items-center gap-4 p-4 bg-base-200 rounded-box">
    <div class="avatar placeholder">
      <div class="bg-primary text-primary-content rounded-full w-16">
        <span class="text-xl">U</span>
      </div>
    </div>
    <div>
      <div class="font-bold">用户名</div>
      <div class="text-sm text-gray-500">点击登录</div>
    </div>
  </div>

  <!-- 设置列表 -->
  <ul class="menu bg-base-200 rounded-box w-full">
    <li><a>个人信息</a></li>
    <li><a>设置</a></li>
    <li><a>关于</a></li>
  </ul>
</div>
`)
}

// ============================================================================
// API 服务路由生成
// ============================================================================

async function generateApiRoutes(
  projectPath: string,
  options: Required<CreateProjectOptions>,
): Promise<void> {
  // API 不需要 UI 布局
  await writeFile(path.join(projectPath, 'src/routes/+layout.svelte'), generateLayout())

  // 根页面（API 文档入口）
  await writeFile(path.join(projectPath, 'src/routes/+page.svelte'), `<svelte:head>
  <title>${options.name} API</title>
</svelte:head>

<main class="min-h-screen flex items-center justify-center font-mono">
  <div class="text-center">
    <h1 class="text-3xl font-bold mb-4">${options.name} API</h1>
    <p class="text-gray-600 mb-4">RESTful API Service</p>
    <p class="text-sm text-gray-400">GET /api/health - 健康检查</p>
  </div>
</main>
`)

  // 健康检查
  await writeFile(path.join(projectPath, 'src/routes/api/health/+server.ts'), `/**
 * 健康检查端点
 */
import type { RequestHandler } from './$types'
import { ok } from '@hai/kit'

export const GET: RequestHandler = async ({ locals }) => {
  return ok({
    status: 'ok',
    service: '${options.name}',
    version: '0.0.1',
    timestamp: new Date().toISOString(),
  }, locals.requestId)
}
`)

  // 示例 CRUD API
  await writeFile(path.join(projectPath, 'src/routes/api/v1/items/+server.ts'), `/**
 * Items API - 列表与创建
 */
import type { RequestHandler } from './$types'
import { ok, badRequest, internalError } from '@hai/kit'

/**
 * GET /api/v1/items - 获取列表
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  try {
    const page = Number(url.searchParams.get('page') || '1')
    const pageSize = Number(url.searchParams.get('pageSize') || '20')

    return ok({
      items: [],
      total: 0,
      page,
      pageSize,
    }, locals.requestId)
  }
  catch (error) {
    return internalError()
  }
}

/**
 * POST /api/v1/items - 创建
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const body = await request.json()

    if (!body.name) {
      return badRequest('name is required')
    }

    return ok({ id: '1', ...body, createdAt: new Date().toISOString() }, locals.requestId)
  }
  catch (error) {
    return internalError()
  }
}
`)

  // 示例单项 API
  await writeFile(path.join(projectPath, 'src/routes/api/v1/items/[id]/+server.ts'), `/**
 * Items API - 单项操作
 */
import type { RequestHandler } from './$types'
import { ok, notFound, internalError } from '@hai/kit'

/**
 * GET /api/v1/items/:id - 获取详情
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  try {
    const { id } = params
    return ok({ id, name: 'Example Item' }, locals.requestId)
  }
  catch (error) {
    return internalError()
  }
}

/**
 * PUT /api/v1/items/:id - 更新
 */
export const PUT: RequestHandler = async ({ params, request, locals }) => {
  try {
    const { id } = params
    const body = await request.json()
    return ok({ id, ...body, updatedAt: new Date().toISOString() }, locals.requestId)
  }
  catch (error) {
    return internalError()
  }
}

/**
 * DELETE /api/v1/items/:id - 删除
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
  try {
    const { id } = params
    return ok({ id, deleted: true }, locals.requestId)
  }
  catch (error) {
    return internalError()
  }
}
`)
}

/**
 * 获取安装命令
 */
function getInstallCommand(pm: 'pnpm' | 'npm' | 'yarn'): string {
  switch (pm) {
    case 'pnpm':
      return 'pnpm install'
    case 'yarn':
      return 'yarn'
    default:
      return 'npm install'
  }
}

/**
 * 检测项目信息
 */
export async function detectProject(cwd: string): Promise<ProjectInfo | null> {
  const pkgPath = path.join(cwd, 'package.json')

  if (!(await fileExists(pkgPath))) {
    return null
  }

  try {
    const pkg = await fse.readJson(pkgPath)
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }

    const haiPackages = Object.keys(deps).filter(name => name.startsWith('@hai/'))

    return {
      name: pkg.name,
      version: pkg.version,
      description: pkg.description,
      isHaiProject: haiPackages.length > 0,
      haiPackages,
    }
  }
  catch {
    return null
  }
}
