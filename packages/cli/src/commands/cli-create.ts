/**
 * @h-ai/cli — 项目创建命令
 *
 * 基于模板的交互式项目创建：
 * 1. 交互式收集选项（appType / features / moduleConfigs）
 * 2. 拷贝 base 骨架 + appType 路由 + feature 路由
 * 3. 渲染动态模板（init.ts / hooks.server.ts / package.json）
 * 4. 生成配置文件、.env、Skill 文件
 *
 * @module cli-create
 */

import type { AppType, CreateProjectOptions, FeatureDefinition, FeatureId, FrontendTarget, ModuleConfigs, ProjectInfo } from '../cli-types.js'
import { execFileSync, execSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { core } from '@h-ai/core'
import chalk from 'chalk'
import fse from 'fs-extra'
import ora from 'ora'
import prompts from 'prompts'
import { detectPackageManager, fileExists, writeFile } from '../cli-utils.js'
import { buildTemplateContext, generateFromTemplates } from './cli-template-engine.js'

// =============================================================================
// 应用类型定义
// =============================================================================

/** Git 远程地址校验 */
const RE_HTTPS_URL = /^https:\/\/.+/
const RE_GIT_SSH_URL = /^git@.+:.+/

/**
 * 应用类型定义
 */
const APP_TYPES: Record<AppType, { name: string, description: string, defaultFeatures: FeatureId[] }> = {
  'admin': {
    name: '管理后台',
    description: '企业级管理系统，含 IAM、数据库、完整 UI',
    defaultFeatures: ['iam', 'db', 'cache', 'crypto'],
  },
  'website': {
    name: '企业官网',
    description: 'SSR/SSG 企业官网，SEO 友好、响应式布局',
    defaultFeatures: ['db', 'cache'],
  },
  'h5': {
    name: 'H5 应用',
    description: '移动端 H5 应用，触摸优化、PWA 支持',
    defaultFeatures: ['db', 'cache'],
  },
  'api': {
    name: 'API 服务',
    description: '纯 API 后端服务，RESTful 路由、无 UI',
    defaultFeatures: ['db', 'cache'],
  },
  'android-app': {
    name: 'Android 应用',
    description: 'Android 原生应用（Capacitor + SvelteKit SPA），可打包为 APK',
    defaultFeatures: ['iam', 'db', 'cache', 'crypto', 'api-client', 'capacitor'],
  },
  'fullstack': {
    name: '前后端分离工程',
    description: '多包工作区，包含 contract、serv、Web/App/Desktop 前端',
    defaultFeatures: [],
  },
}

const FRONTEND_TARGETS: Record<FrontendTarget, { name: string, description: string, implemented: boolean }> = {
  web: { name: 'Web', description: '浏览器 Web 应用', implemented: true },
  app: { name: 'App', description: '移动端 Capacitor App / H5 前端', implemented: true },
  miniapp: { name: '小程序', description: '预留目标，当前只生成说明占位', implemented: false },
  desktop: { name: '桌面端', description: 'Tauri 桌面端前端工程', implemented: true },
}

const DEFAULT_FULLSTACK_FRONTENDS: FrontendTarget[] = ['web', 'app', 'desktop']

// =============================================================================
// 功能定义
// =============================================================================

/**
 * 功能定义
 */
const FEATURES: Record<string, FeatureDefinition> = {
  'iam': {
    id: 'iam',
    name: '身份与访问管理',
    description: 'Session/JWT 会话管理、RBAC 权限控制',
    packages: ['@h-ai/iam'],
    dependencies: ['crypto', 'db', 'cache'],
  },
  'db': {
    id: 'db',
    name: '数据库',
    description: '多数据库支持 (SQLite/PostgreSQL/MySQL)',
    packages: ['@h-ai/reldb'],
  },
  'cache': {
    id: 'cache',
    name: '缓存',
    description: 'Redis / 内存缓存',
    packages: ['@h-ai/cache'],
  },
  'ai': {
    id: 'ai',
    name: 'AI 集成',
    description: 'LLM 适配器、MCP 协议、技能系统、流式响应',
    packages: ['@h-ai/ai'],
  },
  'storage': {
    id: 'storage',
    name: '文件存储',
    description: '本地存储、S3/OSS/COS 云存储',
    packages: ['@h-ai/storage'],
  },
  'crypto': {
    id: 'crypto',
    name: '加密模块',
    description: '国密 SM2/SM3/SM4、Argon2 密码哈希',
    packages: ['@h-ai/crypto'],
  },
  'audit': {
    id: 'audit',
    name: '审计日志',
    description: '操作审计、安全追踪',
    packages: ['@h-ai/audit'],
    dependencies: ['db'],
  },
  'reach': {
    id: 'reach',
    name: '触达服务',
    description: '邮件、短信、微信等消息触达',
    packages: ['@h-ai/reach'],
  },
  'payment': {
    id: 'payment',
    name: '统一支付',
    description: '微信支付、支付宝、Stripe 统一接入',
    packages: ['@h-ai/payment'],
    dependencies: ['db'],
  },
  'vecdb': {
    id: 'vecdb',
    name: '向量数据库',
    description: '向量检索与相似度搜索（LanceDB / pgvector / Qdrant）',
    packages: ['@h-ai/vecdb'],
  },
  'datapipe': {
    id: 'datapipe',
    name: '数据处理管道',
    description: '文本清洗、分块与可组合处理流水线',
    packages: ['@h-ai/datapipe'],
  },
  'scheduler': {
    id: 'scheduler',
    name: '任务调度',
    description: 'Cron 任务注册、执行与日志追踪',
    packages: ['@h-ai/scheduler'],
    dependencies: ['db'],
  },
  'deploy': {
    id: 'deploy',
    name: '自动化部署',
    description: '统一部署编排与多平台发布支持',
    packages: ['@h-ai/deploy'],
  },
  'api-client': {
    id: 'api-client',
    name: 'HTTP 客户端',
    description: '统一 API 调用、错误处理与流式请求支持',
    packages: ['@h-ai/api-client'],
  },
  'capacitor': {
    id: 'capacitor',
    name: '移动端能力',
    description: 'Capacitor 原生桥接能力（偏移动应用）',
    packages: ['@h-ai/capacitor'],
  },
}

/**
 * 可选择的功能列表
 */
const SELECTABLE_FEATURES: FeatureId[] = [
  'iam',
  'db',
  'cache',
  'ai',
  'storage',
  'crypto',
  'audit',
  'reach',
  'payment',
  'vecdb',
  'datapipe',
  'scheduler',
  'deploy',
  'api-client',
  'capacitor',
]

const PROJECT_NAME_REGEX = /^[a-z0-9-]+$/

// =============================================================================
// 项目模板定义
// =============================================================================

const PROJECT_TEMPLATES = {
  minimal: {
    name: 'minimal',
    description: '最小模板 — 仅核心功能',
    features: [] as FeatureId[],
  },
  default: {
    name: 'default',
    description: '标准模板 — IAM + 数据库 + 缓存',
    features: ['iam', 'db', 'cache', 'crypto'] as FeatureId[],
  },
  full: {
    name: 'full',
    description: '完整模板 — 所有功能',
    features: [
      'iam',
      'db',
      'cache',
      'crypto',
      'ai',
      'storage',
      'audit',
      'reach',
      'payment',
      'vecdb',
      'datapipe',
      'scheduler',
      'deploy',
      'api-client',
      'capacitor',
    ] as FeatureId[],
  },
  custom: {
    name: 'custom',
    description: '自定义 — 选择需要的功能',
    features: [] as FeatureId[],
  },
}

// =============================================================================
// 创建项目（主入口）
// =============================================================================

/**
 * 创建项目
 */
export async function createProject(options: CreateProjectOptions): Promise<void> {
  const spinner = ora()

  try {
    // 交互式获取选项
    const resolvedOptions = await resolveOptions(options)

    // 安全校验：项目名必须仅含小写字母、数字和连字符，防止路径遍历
    if (!PROJECT_NAME_REGEX.test(resolvedOptions.name)) {
      core.logger.error(chalk.red(`项目名称不合法: "${resolvedOptions.name}"，只能包含小写字母、数字和连字符`))
      return
    }

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

    // ─── 基于模板生成项目文件 ───
    spinner.start('生成项目文件...')

    const context = buildTemplateContext({
      name: resolvedOptions.name,
      appType: resolvedOptions.appType,
      features: resolvedOptions.features,
      frontends: resolvedOptions.frontends,
      moduleConfigs: resolvedOptions.moduleConfigs,
      packageManager: resolvedOptions.packageManager!,
    })

    // 拷贝模板 + 渲染动态文件
    await generateFromTemplates(projectPath, context)

    if (resolvedOptions.appType !== 'fullstack') {
      // 生成配置文件（config/*.yml）
      const { generateConfigFile } = await import('./cli-config-templates.js')
      const configs = resolvedOptions.moduleConfigs
      for (const featureId of resolvedOptions.features) {
        const configKey = getFeatureConfigKey(featureId)
        if (configKey) {
          const content = generateConfigFile(configKey, configs)
          await writeFile(path.join(projectPath, 'config', `_${configKey}.yml`), content)
        }
      }
      // 始终生成 core 配置
      await writeFile(
        path.join(projectPath, 'config', '_core.yml'),
        generateConfigFile('core', configs),
      )

      // 生成 .env.example
      const { generateEnvExample } = await import('./cli-config-templates.js')
      await writeFile(
        path.join(projectPath, '.env.example'),
        generateEnvExample(resolvedOptions.features, configs),
      )
    }

    // 生成 Skill 文件
    const { generateSkillFiles } = await import('./cli-skill-templates.js')
    await generateSkillFiles(projectPath, resolvedOptions.features, resolvedOptions.appType)

    // 生成 README
    const appTypeLabel = APP_TYPES[resolvedOptions.appType].name
    const readmeContent = resolvedOptions.appType === 'fullstack'
      ? generateFullstackReadme(resolvedOptions.name, resolvedOptions.packageManager!, resolvedOptions.frontends)
      : generateReadme(resolvedOptions.name, appTypeLabel, resolvedOptions.packageManager!)
    await writeFile(
      path.join(projectPath, 'README.md'),
      readmeContent,
    )

    spinner.succeed()

    // 初始化 Git
    if (resolvedOptions.git) {
      spinner.start('初始化 Git 仓库...')
      execSync('git init', { cwd: projectPath, stdio: 'ignore' })
      if (resolvedOptions.gitRemote) {
        // 使用 execFileSync + 数组参数，避免 shell 注入
        // 同时在非交互模式下补充校验（交互模式在 prompts.validate 中已校验）
        const gitRemote = resolvedOptions.gitRemote
        if (!RE_HTTPS_URL.test(gitRemote) && !RE_GIT_SSH_URL.test(gitRemote)) {
          spinner.fail()
          throw new Error(`Invalid gitRemote URL: ${gitRemote}`)
        }
        execFileSync('git', ['remote', 'add', 'origin', gitRemote], { cwd: projectPath, stdio: 'ignore' })
      }
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
    printCompletionMessage(resolvedOptions)
  }
  catch (error) {
    spinner.fail()
    core.logger.error(chalk.red('创建项目失败:'), { error })
    throw error
  }
}

// =============================================================================
// 交互式选项解析
// =============================================================================

/**
 * 解析选项（交互式）
 */
async function resolveOptions(options: CreateProjectOptions): Promise<Required<CreateProjectOptions>> {
  const useDefaults = options.yes ?? false

  core.logger.info('', {})
  core.logger.info(chalk.bold.cyan('  🚀 hai Agent Framework'))
  core.logger.info(chalk.gray('     AI-Native · Configuration-Driven · Security-First'))
  core.logger.info('', {})

  const onCancel = () => {
    core.logger.info(chalk.red('\n已取消'))
    process.exit(1)
  }

  // 项目名称（逐条询问，避免 prompts 数组模式在 Windows 终端重复渲染）
  let projectName = options.name
  if (!projectName && useDefaults) {
    projectName = 'my-app'
  }
  else if (!projectName) {
    const { name } = await prompts({
      type: 'text',
      name: 'name',
      message: '项目名称:',
      initial: 'my-app',
      validate: (value: string) => {
        if (!value.trim())
          return '项目名称不能为空'
        if (!PROJECT_NAME_REGEX.test(value))
          return '项目名称只能包含小写字母、数字和连字符'
        return true
      },
    }, { onCancel })
    projectName = name
  }

  // 应用类型
  let resolvedAppType = options.appType
  if (!resolvedAppType && useDefaults) {
    resolvedAppType = 'admin'
  }
  else if (!resolvedAppType) {
    const { appType } = await prompts({
      type: 'select',
      name: 'appType',
      message: '应用类型:',
      choices: Object.entries(APP_TYPES).map(([key, t]) => ({
        title: `${chalk.bold(t.name.padEnd(10))} ${chalk.gray(t.description)}`,
        value: key,
      })),
      initial: 0,
    }, { onCancel })
    resolvedAppType = appType
  }

  const selectedAppType = (resolvedAppType || 'admin') as AppType

  const selectedFrontends = selectedAppType === 'fullstack'
    ? await resolveFrontendTargets(options.frontends, useDefaults, onCancel)
    : []

  // 模板选择
  let selectedTemplate = options.template
  if (selectedAppType === 'fullstack') {
    selectedTemplate = selectedTemplate ?? 'custom'
  }
  else if (!selectedTemplate) {
    if (useDefaults) {
      selectedTemplate = 'default'
    }
    else {
      const { template } = await prompts({
        type: 'select',
        name: 'template',
        message: '选择模板:',
        choices: Object.values(PROJECT_TEMPLATES).map(t => ({
          title: `${chalk.bold(t.name.padEnd(10))} ${chalk.gray(t.description)}`,
          value: t.name,
        })),
        initial: 1,
      }, { onCancel })
      selectedTemplate = template
    }
  }

  // 功能选择
  let selectedFeatures: FeatureId[] = []
  const appTypeDefaults = APP_TYPES[selectedAppType].defaultFeatures

  if (selectedAppType === 'fullstack') {
    selectedFeatures = []
  }
  else if (selectedTemplate === 'custom' && !options.features && useDefaults) {
    selectedFeatures = resolveFeatureDependencies(appTypeDefaults)
  }
  else if (selectedTemplate === 'custom' && !options.features) {
    const featureChoices = SELECTABLE_FEATURES.map(id => ({
      title: `${chalk.bold(FEATURES[id].name.padEnd(10))} ${chalk.gray(FEATURES[id].description)}`,
      value: id,
      selected: appTypeDefaults.includes(id),
    }))

    const { features } = await prompts({
      type: 'multiselect',
      name: 'features',
      message: '选择功能 (空格选择，回车确认):',
      choices: featureChoices,
      hint: '- 空格选择，回车确认',
      instructions: false,
    }, { onCancel })

    selectedFeatures = features || []
    selectedFeatures = resolveFeatureDependencies(selectedFeatures)
  }
  else if (selectedTemplate === 'custom' && options.features) {
    selectedFeatures = resolveFeatureDependencies(options.features)
  }
  else {
    const templateFeatures = PROJECT_TEMPLATES[selectedTemplate as keyof typeof PROJECT_TEMPLATES]?.features || []
    const merged = new Set([...templateFeatures, ...appTypeDefaults])
    selectedFeatures = resolveFeatureDependencies(Array.from(merged))
  }

  // 模块配置
  const moduleConfigs = selectedAppType === 'fullstack'
    ? options.moduleConfigs ?? {}
    : options.moduleConfigs ?? (useDefaults
      ? buildDefaultModuleConfigs(selectedFeatures, projectName!)
      : await promptModuleConfigs(selectedFeatures, projectName!))

  // 示例代码
  let addExamples = options.examples
  if (addExamples === undefined && useDefaults) {
    addExamples = true
  }
  else if (addExamples === undefined) {
    const { examples } = await prompts({
      type: 'confirm',
      name: 'examples',
      message: '是否添加示例代码?',
      initial: true,
    }, { onCancel })
    addExamples = examples
  }

  // 包管理器
  const detected = await detectPackageManager(options.cwd ?? '.')
  let packageManager = selectedAppType === 'fullstack' ? 'pnpm' : options.packageManager
  if (!packageManager && useDefaults) {
    packageManager = detected
  }
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
    }, { onCancel })
    packageManager = pm
  }

  // 安装依赖
  let install = options.install
  if (install === undefined && useDefaults) {
    install = true
  }
  else if (install === undefined) {
    const { doInstall } = await prompts({
      type: 'confirm',
      name: 'doInstall',
      message: '是否安装依赖?',
      initial: true,
    }, { onCancel })
    install = doInstall
  }

  // Git
  let git = options.git
  if (git === undefined && useDefaults) {
    git = true
  }
  else if (git === undefined) {
    const { initGit } = await prompts({
      type: 'confirm',
      name: 'initGit',
      message: '是否初始化 Git?',
      initial: true,
    }, { onCancel })
    git = initGit
  }

  // Git 远程仓库地址
  let gitRemote = options.gitRemote
  if (git && gitRemote === undefined && useDefaults) {
    gitRemote = ''
  }
  else if (git && gitRemote === undefined) {
    const { remote } = await prompts({
      type: 'text',
      name: 'remote',
      message: 'Git 仓库地址 (可选，回车跳过):',
      initial: '',
      validate: (value: string) => {
        if (!value.trim())
          return true
        if (RE_HTTPS_URL.test(value) || RE_GIT_SSH_URL.test(value))
          return true
        return '请输入合法的 Git 仓库地址 (https://... 或 git@...:...)'
      },
    }, { onCancel })
    gitRemote = remote?.trim() || ''
  }

  return {
    name: projectName!,
    appType: selectedAppType,
    frontends: selectedFrontends,
    template: (selectedTemplate ?? 'default') as 'default' | 'minimal' | 'full' | 'custom',
    features: selectedFeatures,
    moduleConfigs,
    examples: addExamples ?? true,
    install: install ?? true,
    packageManager: packageManager || 'pnpm',
    git: git ?? true,
    gitRemote: gitRemote ?? '',
    yes: useDefaults,
    verbose: options.verbose ?? false,
    cwd: options.cwd ?? '.',
  }
}

function buildDefaultModuleConfigs(features: FeatureId[], projectName: string): ModuleConfigs {
  const configs: ModuleConfigs = {
    core: { name: projectName, defaultLocale: 'zh-CN' },
  }

  if (features.includes('db')) {
    configs.db = { type: 'sqlite', database: './data/app.db' }
  }
  if (features.includes('cache')) {
    configs.cache = { type: 'memory' }
  }
  if (features.includes('iam')) {
    configs.iam = { loginPassword: true, loginOtp: false }
  }
  if (features.includes('storage')) {
    configs.storage = { type: 'local', localPath: './data/uploads' }
  }
  if (features.includes('ai')) {
    configs.ai = { defaultProvider: 'openai', model: 'gpt-4o-mini' }
  }

  return configs
}

async function resolveFrontendTargets(
  frontends: FrontendTarget[] | undefined,
  useDefaults: boolean,
  onCancel: () => void,
): Promise<FrontendTarget[]> {
  if (frontends && frontends.length > 0) {
    return normalizeFrontendTargets(frontends)
  }
  if (useDefaults) {
    return DEFAULT_FULLSTACK_FRONTENDS
  }

  const { selectedFrontends } = await prompts({
    type: 'multiselect',
    name: 'selectedFrontends',
    message: '选择前端目标 (空格选择，回车确认):',
    choices: Object.entries(FRONTEND_TARGETS).map(([id, target]) => ({
      title: `${chalk.bold(target.name.padEnd(8))} ${chalk.gray(target.description)}`,
      value: id,
      selected: DEFAULT_FULLSTACK_FRONTENDS.includes(id as FrontendTarget),
    })),
    hint: '- 小程序当前为预留占位，不生成可运行工程',
    instructions: false,
  }, { onCancel })

  return normalizeFrontendTargets(selectedFrontends ?? DEFAULT_FULLSTACK_FRONTENDS)
}

function normalizeFrontendTargets(frontends: FrontendTarget[]): FrontendTarget[] {
  const validTargets = new Set(Object.keys(FRONTEND_TARGETS))
  const result = frontends.filter(target => validTargets.has(target))
  return [...new Set(result.length > 0 ? result : DEFAULT_FULLSTACK_FRONTENDS)]
}

// =============================================================================
// 功能依赖解析
// =============================================================================

/**
 * 解析功能依赖（自动补全传递依赖，循环直至收敛）
 */
function resolveFeatureDependencies(features: FeatureId[]): FeatureId[] {
  const result = new Set(features)

  let changed = true
  while (changed) {
    changed = false
    for (const featureId of result) {
      const feature = FEATURES[featureId]
      if (feature?.dependencies) {
        for (const dep of feature.dependencies) {
          if (!result.has(dep)) {
            result.add(dep)
            changed = true
          }
        }
      }
    }
  }

  return Array.from(result)
}

// =============================================================================
// 模块配置交互
// =============================================================================

/**
 * 交互式收集模块配置
 */
async function promptModuleConfigs(features: FeatureId[], projectName: string): Promise<ModuleConfigs> {
  const configs: ModuleConfigs = {}
  const onCancel = () => {
    core.logger.info(chalk.red('\n已取消'))
    process.exit(1)
  }

  core.logger.info('')
  core.logger.info(chalk.bold('  ⚙ 模块配置'))
  core.logger.info(chalk.gray('     设置关键配置项（回车使用默认值）'))
  core.logger.info('')

  // core 配置（始终收集）
  configs.core = await promptCoreConfig(projectName, onCancel)

  if (features.includes('db')) {
    configs.db = await promptDbConfig(projectName, onCancel)
  }
  if (features.includes('cache')) {
    configs.cache = await promptCacheConfig(onCancel)
  }
  if (features.includes('iam')) {
    configs.iam = await promptIamConfig(onCancel)
  }
  if (features.includes('storage')) {
    configs.storage = await promptStorageConfig(onCancel)
  }
  if (features.includes('ai')) {
    configs.ai = await promptAiConfig(onCancel)
  }

  return configs
}

/**
 * 收集 core 模块配置
 */
async function promptCoreConfig(projectName: string, onCancel: () => void): Promise<ModuleConfigs['core']> {
  core.logger.info(chalk.cyan('  [core] 应用基础配置'))
  const { defaultLocale } = await prompts({
    type: 'select',
    name: 'defaultLocale',
    message: '默认语言:',
    choices: [
      { title: '中文 (zh-CN)', value: 'zh-CN' },
      { title: 'English (en-US)', value: 'en-US' },
    ],
    initial: 0,
  }, { onCancel })
  return { name: projectName, defaultLocale }
}

/**
 * 收集 db 模块配置
 */
async function promptDbConfig(projectName: string, onCancel: () => void): Promise<ModuleConfigs['db']> {
  core.logger.info(chalk.cyan('  [db] 数据库配置'))
  const { type } = await prompts({
    type: 'select',
    name: 'type',
    message: '数据库类型:',
    choices: [
      { title: 'SQLite (零配置，适合开发)', value: 'sqlite' },
      { title: 'PostgreSQL', value: 'postgresql' },
      { title: 'MySQL', value: 'mysql' },
    ],
    initial: 0,
  }, { onCancel })

  if (type === 'sqlite') {
    const { database } = await prompts({
      type: 'text',
      name: 'database',
      message: 'SQLite 数据库路径:',
      initial: './data/app.db',
    }, { onCancel })
    return { type, database }
  }

  const answers = await prompts([
    { type: 'text', name: 'host', message: `${type === 'postgresql' ? 'PostgreSQL' : 'MySQL'} 主机:`, initial: 'localhost' },
    { type: 'number', name: 'port', message: '端口:', initial: type === 'postgresql' ? 5432 : 3306 },
    { type: 'text', name: 'database', message: '数据库名称:', initial: projectName },
  ], { onCancel })

  return { type, host: answers.host, port: answers.port, database: answers.database }
}

/**
 * 收集 cache 模块配置
 */
async function promptCacheConfig(onCancel: () => void): Promise<ModuleConfigs['cache']> {
  core.logger.info(chalk.cyan('  [cache] 缓存配置'))
  const { type } = await prompts({
    type: 'select',
    name: 'type',
    message: '缓存类型:',
    choices: [
      { title: '内存缓存 (零配置，适合开发)', value: 'memory' },
      { title: 'Redis', value: 'redis' },
    ],
    initial: 0,
  }, { onCancel })

  if (type === 'memory')
    return { type }

  const answers = await prompts([
    { type: 'text', name: 'host', message: 'Redis 主机:', initial: 'localhost' },
    { type: 'number', name: 'port', message: 'Redis 端口:', initial: 6379 },
  ], { onCancel })

  return { type, host: answers.host, port: answers.port }
}

/**
 * 收集 iam 模块配置
 */
async function promptIamConfig(onCancel: () => void): Promise<ModuleConfigs['iam']> {
  core.logger.info(chalk.cyan('  [iam] 认证授权配置'))
  const answers = await prompts([
    { type: 'confirm', name: 'loginPassword', message: '启用密码登录?', initial: true },
    { type: 'confirm', name: 'loginOtp', message: '启用 OTP 验证码登录?', initial: false },
  ], { onCancel })
  return { loginPassword: answers.loginPassword, loginOtp: answers.loginOtp }
}

/**
 * 收集 storage 模块配置
 */
async function promptStorageConfig(onCancel: () => void): Promise<ModuleConfigs['storage']> {
  core.logger.info(chalk.cyan('  [storage] 文件存储配置'))
  const { type } = await prompts({
    type: 'select',
    name: 'type',
    message: '存储类型:',
    choices: [
      { title: '本地存储 (零配置，适合开发)', value: 'local' },
      { title: 'S3 / MinIO / OSS', value: 's3' },
    ],
    initial: 0,
  }, { onCancel })

  if (type === 'local') {
    const { localPath } = await prompts({
      type: 'text',
      name: 'localPath',
      message: '存储路径:',
      initial: './data/uploads',
    }, { onCancel })
    return { type, localPath }
  }

  return { type }
}

/**
 * 收集 ai 模块配置
 */
async function promptAiConfig(onCancel: () => void): Promise<ModuleConfigs['ai']> {
  core.logger.info(chalk.cyan('  [ai] AI 集成配置'))
  const { defaultProvider } = await prompts({
    type: 'select',
    name: 'defaultProvider',
    message: 'AI Provider:',
    choices: [
      { title: 'OpenAI', value: 'openai' },
      { title: 'Anthropic (Claude)', value: 'anthropic' },
      { title: '其他 (OpenAI 兼容)', value: 'custom' },
    ],
    initial: 0,
  }, { onCancel })

  const defaultModel = defaultProvider === 'openai'
    ? 'gpt-4o-mini'
    : defaultProvider === 'anthropic'
      ? 'claude-3-sonnet'
      : ''

  const { model } = await prompts({
    type: 'text',
    name: 'model',
    message: '默认模型:',
    initial: defaultModel,
  }, { onCancel })

  return { defaultProvider, model }
}

// =============================================================================
// 工具函数
// =============================================================================

/**
 * 获取功能对应的配置 key
 */
function getFeatureConfigKey(featureId: FeatureId): string | null {
  const map: Record<string, string> = {
    db: 'db',
    cache: 'cache',
    iam: 'iam',
    storage: 'storage',
    ai: 'ai',
    deploy: 'deploy',
    vecdb: 'vecdb',
    reach: 'reach',
    scheduler: 'scheduler',
    audit: 'audit',
    payment: 'payment',
  }
  return map[featureId] ?? null
}

/**
 * 获取安装命令
 */
function getInstallCommand(pm: 'pnpm' | 'npm' | 'yarn'): string {
  switch (pm) {
    case 'pnpm': return 'pnpm install'
    case 'yarn': return 'yarn'
    default: return 'npm install'
  }
}

/**
 * 生成运行 package.json 脚本的命令
 *
 * npm 需要 `npm run <script>`（lifecycle 脚本除外），pnpm / yarn 可直接 `<pm> <script>`。
 */
function getRunCommand(pm: 'pnpm' | 'npm' | 'yarn', script: string): string {
  return pm === 'npm' ? `npm run ${script}` : `${pm} ${script}`
}

/**
 * 生成 README
 */
function generateReadme(name: string, appTypeLabel: string, pm: 'pnpm' | 'npm' | 'yarn'): string {
  const install = getInstallCommand(pm)
  return `# ${name}

基于 hai Agent Framework 构建的${appTypeLabel}应用。

## 开发

\`\`\`bash
${install}
${getRunCommand(pm, 'dev')}
\`\`\`

## 构建

\`\`\`bash
${getRunCommand(pm, 'build')}
${getRunCommand(pm, 'i18n:compile')}
${getRunCommand(pm, 'preview')}
\`\`\`

## 文档

- [hai Agent Framework](https://github.com/hai-series/hai-framework)
- [SvelteKit](https://kit.svelte.dev/)
- [Svelte 5](https://svelte.dev/)
`
}

function generateFullstackReadme(name: string, pm: string, frontends: FrontendTarget[]): string {
  const enabledFrontends = frontends.map(target => FRONTEND_TARGETS[target].name).join(' / ')
  return `# ${name}

基于 hai Agent Framework 构建的前后端分离多包工程。

## 工程结构

- \`packages/${name}-contract\`：前后端共享 API 契约、Zod Schema 与类型
- \`packages/${name}-serv\`：后端 API Service（通过 \`@h-ai/serv\` 暴露最小 HTTP App 抽象，不直接暴露 Hono）
- \`packages/${name}-shared\`：跨端共享 Shell、主题、语言切换、API client 与共享 messages
- \`apps/${name}-web\`：Web 前端${frontends.includes('web') ? '' : '（未启用）'}
- \`apps/${name}-app\`：移动端 App/H5 前端${frontends.includes('app') ? '' : '（未启用）'}
- \`apps/${name}-desktop\`：桌面端前端${frontends.includes('desktop') ? '' : '（未启用）'}
- \`apps/${name}-miniapp\`：小程序预留说明与本端 inlang messages${frontends.includes('miniapp') ? '（占位，不参与构建）' : '（未启用）'}

已启用前端：${enabledFrontends || 'Web / App / Desktop'}

## 开发、编译与打包

\`\`\`bash
${pm} install
${pm} dev

# 一键编译：类型检查 + 全工作区构建
${pm} compile

# 一键打包：Web build、App Capacitor sync、Desktop Tauri build（按启用前端执行）
${pm} package

# 部署入口：默认执行 package，可替换为团队自己的 CI/CD 发布脚本
${pm} deploy
\`\`\`

前端单独交付命令：

- Web：\`${pm} --filter ${name}-web build\` / \`${pm} --filter ${name}-web package\`
- App：\`${pm} --filter ${name}-app package\`，Android/iOS 可用 \`cap:build:android:debug\` / \`cap:build:android:release\` / \`cap:build:ios\`
- Desktop：\`${pm} --filter ${name}-desktop tauri:dev\` / \`${pm} --filter ${name}-desktop package\`

## i18n 与 shared 协同

- shared：\`packages/${name}-shared/project.inlang\` + \`messages/\`，只放跨端共享组件文案。
- web/app/desktop：每个应用都有自己的 \`project.inlang\` + \`messages/\`，用于本端页面与产品文案。
- miniapp：当前是占位，但也有自己的 \`project.inlang\` + \`messages/\`，便于后续接入真实小程序框架。
- 新增 locale 时，shared 与所有启用前端的 \`locales\` 必须同步；语言切换器会同时更新 shared runtime 与宿主应用 runtime。
- \`${pm} i18n:compile\` 会统一编译 shared 与每个启用前端的 Paraglide 输出；各前端也可单独运行 \`${pm} --filter ${name}-web paraglide:compile\` 等命令。

## 自定义建议

- 改全局 Shell/主题/语言切换：编辑 \`packages/${name}-shared\`。
- 改某个前端页面和文案：编辑对应 \`apps/${name}-*/src/routes\` 与 \`apps/${name}-*/messages\`。
- 改主题列表：调整脚手架配置中的 \`fullstack.theme.themes\`，或直接编辑各端 \`src/app.css\` 的 daisyUI \`themes\`。

## 质量门禁

\`\`\`bash
${pm} typecheck
${pm} lint
${pm} test
${pm} test:e2e
\`\`\`

## 文档

- [hai Agent Framework](https://github.com/hai-series/hai-framework)
- [SvelteKit](https://kit.svelte.dev/)
- [@h-ai/serv](./.agents/skills/hai-serv/SKILL.md)
- [@h-ai/ui](./.agents/skills/hai-ui/SKILL.md)
`
}

/**
 * 打印完成提示
 */
function printCompletionMessage(options: Required<CreateProjectOptions>): void {
  core.logger.info('', {})
  core.logger.info(chalk.green('✔ 项目创建成功！'))
  core.logger.info('', {})

  // 功能摘要
  if (options.features.length > 0) {
    core.logger.info(chalk.bold('已启用功能:'))
    for (const featureId of options.features) {
      const feature = FEATURES[featureId]
      if (feature) {
        core.logger.info(chalk.gray(`  • ${feature.name} (${featureId})`))
      }
    }
    core.logger.info('', {})
  }

  core.logger.info('下一步：')
  core.logger.info(chalk.cyan(`  cd ${options.name}`))
  if (!options.install) {
    core.logger.info(chalk.cyan(`  ${getInstallCommand(options.packageManager)}`))
  }
  if (options.appType === 'fullstack') {
    core.logger.info(chalk.cyan(`  ${getRunCommand(options.packageManager, 'typecheck')}`))
    core.logger.info(chalk.cyan(`  ${getRunCommand(options.packageManager, 'test')}`))
    core.logger.info(chalk.cyan(`  ${getRunCommand(options.packageManager, 'test:e2e')}`))
  }
  else {
    core.logger.info(chalk.cyan(`  ${getRunCommand(options.packageManager, 'dev')}`))
  }
  core.logger.info('', {})
}

// =============================================================================
// 项目检测（供 init 命令使用）
// =============================================================================

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

    const haiPackages = Object.keys(deps).filter(name => name.startsWith('@h-ai/'))

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
