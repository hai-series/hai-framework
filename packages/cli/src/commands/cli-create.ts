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
import { Buffer } from 'node:buffer'
import { execFileSync, execSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import process from 'node:process'
import chalk from 'chalk'
import fse from 'fs-extra'
import ora from 'ora'
import prompts from 'prompts'
import { cliM } from '../cli-i18n.js'
import { detectPackageManager, fileExists, formatPromptDescription, writeCliError, writeCliMessage, writeFile } from '../cli-utils.js'
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
    description: 'typed API workspace，含 contract + service 双工程、无 UI',
    defaultFeatures: ['db', 'cache'],
  },
  'mobile-app': {
    name: '移动应用',
    description: '移动端应用（Capacitor + Svelte 5 + Vite），可打包为 Android/iOS',
    defaultFeatures: ['api-client', 'capacitor'],
  },
  'fullstack': {
    name: '前后端分离工程',
    description: '多端 mini 管理系统，包含用户、角色、审计、个人设置与双向传输加密',
    defaultFeatures: ['iam', 'db', 'cache', 'crypto', 'storage', 'audit'],
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
      writeCliError(chalk.red(`项目名称不合法: "${resolvedOptions.name}"，只能包含小写字母、数字和连字符`))
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
        writeCliMessage(chalk.yellow('已取消'))
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

    {
      // 生成配置文件（config/*.yml）
      const { generateConfigFile, generateEnvExample } = await import('./cli-config-templates.js')
      const configs = resolvedOptions.moduleConfigs
      const isApiWorkspace = resolvedOptions.appType === 'api'
      const isFullstack = resolvedOptions.appType === 'fullstack'
      const configDir = isApiWorkspace
        ? path.join(projectPath, 'apps', `${resolvedOptions.name}-service`, 'config')
        : isFullstack
          ? path.join(projectPath, 'packages', `${resolvedOptions.name}-serv`, 'config')
          : path.join(projectPath, 'config')
      const envExamplePath = isApiWorkspace
        ? path.join(projectPath, 'apps', `${resolvedOptions.name}-service`, '.env.example')
        : path.join(projectPath, '.env.example')

      for (const featureId of resolvedOptions.features) {
        const configKey = getFeatureConfigKey(featureId)
        if (configKey) {
          const content = isFullstack && configKey === 'iam'
            ? generateConfigFile(configKey, configs).replace('seedDefaultData: true', 'seedDefaultData: false')
            : generateConfigFile(configKey, configs)
          await writeFile(path.join(configDir, `_${configKey}.yml`), content)
        }
      }

      if (!isApiWorkspace && !isFullstack) {
        // 始终生成 core 配置
        await writeFile(
          path.join(configDir, '_core.yml'),
          generateConfigFile('core', configs),
        )
      }

      const envExample = isApiWorkspace
        ? `${generateEnvExample(resolvedOptions.features, configs)}\n# =============================================================================\n# Service Runtime\n# =============================================================================\nPORT=3000\n`
        : isFullstack
          ? `${generateEnvExample(resolvedOptions.features, configs)}\n# First-start administrator password. The CLI generates a random value in .env.\nHAI_ADMIN_DEFAULT_PASSWORD=\n\n# Local development API. Use your public API origin for deployment/native clients.\nPUBLIC_API_BASE=http://127.0.0.1:3000\n`
          : generateEnvExample(resolvedOptions.features, configs)

      await writeFile(envExamplePath, envExample)
      if (isFullstack) {
        // 每个项目使用独立随机密码，保证四类字符；真实凭据只写入被忽略的本地文件。
        const password = `Aa1!${randomBytes(24).toString('base64url')}`
        await fse.writeFile(path.join(projectPath, '.env'), envExample.replace('HAI_ADMIN_DEFAULT_PASSWORD=\n', `HAI_ADMIN_DEFAULT_PASSWORD=${password}\n`), { mode: 0o600 })
      }
    }

    // 生成 Skill 文件
    const { generateSkillFiles } = await import('./cli-skill-templates.js')
    await generateSkillFiles(
      projectPath,
      resolvedOptions.features,
      resolvedOptions.appType,
      resolvedOptions.name,
    )

    // 生成 README
    const appTypeLabel = APP_TYPES[resolvedOptions.appType].name
    const readmeContent = resolvedOptions.appType === 'fullstack'
      ? generateFullstackReadme(resolvedOptions.name, resolvedOptions.packageManager!, resolvedOptions.frontends)
      : resolvedOptions.appType === 'api'
        ? generateApiWorkspaceReadme(resolvedOptions.name, resolvedOptions.packageManager!)
        : generateReadme(resolvedOptions.name, appTypeLabel, resolvedOptions.packageManager!, resolvedOptions.appType)
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
      installDependencies(projectPath, resolvedOptions.packageManager!)
      spinner.succeed()
    }

    // 完成提示
    printCompletionMessage(resolvedOptions)
  }
  catch (error) {
    spinner.fail()
    writeCliError(chalk.red(cliM('cli_createFailed')), error)
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

  writeCliMessage('')
  writeCliMessage(chalk.bold.cyan('  🚀 hai Agent Framework'))
  writeCliMessage(chalk.gray('     AI-Native · Configuration-Driven · Security-First'))
  writeCliMessage('')

  const onCancel = () => {
    writeCliMessage(chalk.red('\n已取消'))
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
      hint: cliM('cli_selectHint'),
      choices: Object.entries(APP_TYPES).map(([key, t]) => ({
        title: t.name,
        description: formatPromptDescription(t.description),
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
        hint: cliM('cli_selectHint'),
        choices: Object.values(PROJECT_TEMPLATES).map(t => ({
          title: t.name,
          description: formatPromptDescription(t.description),
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
    selectedFeatures = resolveFeatureDependencies(appTypeDefaults)
  }
  else if (selectedTemplate === 'custom' && !options.features && useDefaults) {
    selectedFeatures = resolveFeatureDependencies(appTypeDefaults)
  }
  else if (selectedTemplate === 'custom' && !options.features) {
    const featureChoices = SELECTABLE_FEATURES.map(id => ({
      title: FEATURES[id].name,
      description: formatPromptDescription(FEATURES[id].description),
      value: id,
      selected: appTypeDefaults.includes(id),
    }))

    const { features } = await prompts({
      type: 'multiselect',
      name: 'features',
      message: cliM('cli_featuresPrompt'),
      choices: featureChoices,
      hint: cliM('cli_multiselectHint'),
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
    ? { ...buildDefaultModuleConfigs(selectedFeatures, projectName!), ...options.moduleConfigs }
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
  let packageManager = selectedAppType === 'fullstack' || selectedAppType === 'api'
    ? 'pnpm'
    : options.packageManager
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
    message: cliM('cli_frontendsPrompt'),
    choices: Object.entries(FRONTEND_TARGETS).map(([id, target]) => ({
      title: target.name,
      description: formatPromptDescription(target.description),
      value: id,
      selected: DEFAULT_FULLSTACK_FRONTENDS.includes(id as FrontendTarget),
    })),
    hint: cliM('cli_multiselectHint'),
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
    writeCliMessage(chalk.red('\n已取消'))
    process.exit(1)
  }

  writeCliMessage('')
  writeCliMessage(chalk.bold('  ⚙ 模块配置'))
  writeCliMessage(chalk.gray('     设置关键配置项（回车使用默认值）'))
  writeCliMessage('')

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
  writeCliMessage(chalk.cyan('  [core] 应用基础配置'))
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
  writeCliMessage(chalk.cyan('  [db] 数据库配置'))
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
  writeCliMessage(chalk.cyan('  [cache] 缓存配置'))
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
  writeCliMessage(chalk.cyan('  [iam] 认证授权配置'))
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
  writeCliMessage(chalk.cyan('  [storage] 文件存储配置'))
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
  writeCliMessage(chalk.cyan('  [ai] AI 集成配置'))
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

function installDependencies(projectPath: string, pm: 'pnpm' | 'npm' | 'yarn'): void {
  const installCmd = getInstallCommand(pm)
  try {
    execSync(installCmd, {
      cwd: projectPath,
      stdio: 'pipe',
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    })
  }
  catch (error) {
    const details = formatCommandFailure(installCmd, error)
    throw new Error(`${cliM('cli_installFailed', { params: { pm } })}\n${details}`)
  }
}

interface CommandFailureLike {
  stdout?: unknown
  stderr?: unknown
  status?: number | null
  signal?: string | null
}

function formatCommandFailure(command: string, error: unknown): string {
  if (!error || typeof error !== 'object') {
    return cliM('cli_commandLabel', { params: { command } })
  }

  const failure = error as CommandFailureLike
  const stdout = normalizeChildOutput(failure.stdout)
  const stderr = normalizeChildOutput(failure.stderr)
  const status = typeof failure.status === 'number' ? cliM('cli_exitCode', { params: { code: failure.status } }) : ''
  const signal = typeof failure.signal === 'string' ? cliM('cli_signal', { params: { signal: failure.signal } }) : ''
  const output = [
    cliM('cli_commandLabel', { params: { command } }),
    status,
    signal,
    stderr ? `stderr:\n${stderr}` : '',
    stdout ? `stdout:\n${stdout}` : '',
  ].filter(Boolean)

  return output.join('\n\n')
}

function normalizeChildOutput(output: unknown): string {
  if (typeof output === 'string') {
    return output.trim()
  }
  if (Buffer.isBuffer(output)) {
    return output.toString('utf-8').trim()
  }
  return ''
}

/**
 * 生成 README
 */
/** 生成各类项目共用的 AI 开发入口说明。 */
function generateAiDevelopmentReadme(): string {
  return `## AI 辅助开发

从本项目根目录打开所用编码工具，先读取 [AGENTS.md](./AGENTS.md)。Claude Code 通过 [CLAUDE.md](./CLAUDE.md) 加载项目规则；GitHub Copilot 使用 [.github/copilot-instructions.md](./.github/copilot-instructions.md)，OpenCode 使用 AGENTS.md 和 [opencode.json](./opencode.json)。

Codex、Cursor、Copilot、OpenCode 从 .agents/skills/ 发现共享技能；Claude Code 通过 CLAUDE.md 引用 AGENTS.md，并按项目指引读取 .agents/skills/ 的同一份正文。普通新增、修改、修复任务使用 [应用开发 Skill](./.agents/skills/hai-app-create/SKILL.md) 和 [开发规范与框架能力路由](./.agents/skills/hai-app-create/development.md)；具体模块再按需读取，不能把 Skill 已交付当成依赖已安装或配置已启用。

优先复用适用的 hai-framework 公开 API 与已有业务实现。完成时说明复用的能力、相关能力未采用的原因，以及安全边界和类型、配置、文案、调用方的同步情况。质量验证按当前 package.json 执行 typecheck → lint → build → test；UI、路由与端到端流程另运行 test:e2e，未运行项说明原因。安全与质量规则既要按规范审查，也要运行门禁验证。

已有 hai 项目可运行 hai init 补齐缺失的 AI 支持文件与参考资源；已有 AGENTS.md、Skill 和自定义规则会保留，升级时需将上述普通开发入口与规范显式合并到旧指引。

`
}

function generateReadme(name: string, appTypeLabel: string, pm: 'pnpm' | 'npm' | 'yarn', appType: AppType): string {
  const install = getInstallCommand(pm)
  const isStaticImage = appType === 'mobile-app'
  const containerPort = isStaticImage ? 8080 : 3000
  const runtimeOptions = isStaticImage
    ? ''
    : ` --env-file .env --mount type=bind,source=/absolute/path/to/config,target=/app/config,readonly --mount type=volume,source=${name}-data,target=/app/data`
  const embeddedDataBuild = isStaticImage
    ? ''
    : `
# 带 data/ 初始数据构建（二选一）
${getRunCommand(pm, 'docker:build:data')}
${getRunCommand(pm, 'podman:build:data')}`
  const runtimeNotes = isStaticImage
    ? '- 该模板生成静态 Web 镜像，不包含可写数据库目录。'
    : `以上三个运行时参数均可按需删除：

| 参数 | 用途 | 可选性 |
| --- | --- | --- |
| \`--env-file .env\` | 批量传入环境变量；也可改用多个 \`-e NAME=value\`。 | 可选；删除后使用镜像和 YAML 默认值。 |
| \`--mount type=bind,...target=/app/config,readonly\` | 用宿主机配置目录覆盖镜像内 \`/app/config\`；必须把 \`source\` 改成真实绝对路径，\`readonly\` 防止容器修改配置。 | 可选；删除后使用镜像自带配置。 |
| \`--mount type=volume,...target=/app/data\` | 创建或复用 named volume，持久化 SQLite 和本地存储。 | 可选但生产环境建议保留；删除后数据只写入容器层，使用 \`--rm\` 删除容器时会丢失。 |

- 带数据构建会把当前 \`data/\`（例如预置 SQLite 文件）固化为镜像初始快照；运行后产生的新数据仍应写入 \`/app/data\` volume。`
  const testPath = isStaticImage ? '/health' : '/'
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

## 容器运行

### 构建镜像

\`\`\`bash
# 普通构建（二选一）
${getRunCommand(pm, 'docker:build')}
${getRunCommand(pm, 'podman:build')}${embeddedDataBuild}
\`\`\`

### 运行镜像

\`\`\`bash
# Docker；使用 Podman 时将 docker 替换为 podman
docker run --rm -d --name ${name} -p ${containerPort}:${containerPort}${runtimeOptions} ${name}:latest
\`\`\`

### 测试镜像

\`\`\`bash
curl --fail http://127.0.0.1:${containerPort}${testPath}
docker stop ${name}
\`\`\`

${runtimeNotes}

${generateAiDevelopmentReadme()}## 文档

- [hai Agent Framework](https://github.com/hai-series/hai-framework)
- [Svelte 5](https://svelte.dev/)
`
}

function generateApiWorkspaceReadme(name: string, pm: 'pnpm' | 'npm' | 'yarn'): string {
  return `# ${name}

基于 hai Agent Framework 构建的 typed API workspace。

## 工程结构

- \`apps/${name}-contract\`：共享 API contract、Zod schema 与类型
- \`apps/${name}-service\`：后端 API service，基于 \`@h-ai/serv\` 暴露 HTTP 应用

## 开发

\`\`\`bash
${pm} install
${pm} dev
\`\`\`

## 质量门禁

\`\`\`bash
${pm} typecheck
${pm} lint
${pm} build
${pm} test
${pm} test:e2e
\`\`\`

## 容器运行

### 构建镜像

\`\`\`bash
# 普通构建（二选一）
${pm} docker:build
${pm} podman:build

# 将 apps/${name}-service/data 作为镜像初始数据构建（二选一）
${pm} docker:build:data
${pm} podman:build:data
\`\`\`

### 运行镜像

\`\`\`bash
# 使用 Podman 时将 docker 替换为 podman
docker run --rm -d --name ${name} -p 3000:3000 --env-file .env \\
  --mount type=bind,source=/absolute/path/to/config,target=/app/config,readonly \\
  --mount type=volume,source=${name}-data,target=/app/data \\
  ${name}:latest
\`\`\`

### 测试镜像

\`\`\`bash
curl --fail http://127.0.0.1:3000/health
curl --fail http://127.0.0.1:3000/ready
curl --fail --request POST http://127.0.0.1:3000/api/v1/app/info \\
  --header "Content-Type: application/json" --data '{}'
docker stop ${name}
\`\`\`

- 配置默认来自 \`apps/${name}-service/config\`；运行时可只读挂载到 \`/app/config\` 覆盖，并用 YAML 的 \`\${ENV_NAME:default}\` 占位符接收环境变量。
- 带数据构建会把 \`apps/${name}-service/data\` 固化为镜像初始数据；生产写入仍建议使用 \`/app/data\` volume。

以上三个运行时参数均可按需删除：

| 参数 | 用途 | 可选性 |
| --- | --- | --- |
| \`--env-file .env\` | 批量传入环境变量；也可改用多个 \`-e NAME=value\`。 | 可选；删除后使用镜像和 YAML 默认值。 |
| \`--mount type=bind,...target=/app/config,readonly\` | 用宿主机配置目录覆盖镜像内 \`/app/config\`；必须把 \`source\` 改成真实绝对路径，\`readonly\` 防止容器修改配置。 | 可选；删除后使用镜像自带配置。 |
| \`--mount type=volume,...target=/app/data\` | 创建或复用 named volume，持久化 SQLite 和本地存储。 | 可选但生产环境建议保留；删除后数据只写入容器层，使用 \`--rm\` 删除容器时会丢失。 |

## 扩展建议

- 在 \`${name}-contract\` 中维护应用级 contract，前后端共用同一份类型与路径定义。
- 在 \`${name}-service\` 中扩展 procedures、模块初始化与配置。
- 需要 IAM / storage / ai 时，优先复用 \`@h-ai/api-contract\` 与 \`@h-ai/serv/features/*\`。

${generateAiDevelopmentReadme()}## 文档

- [hai Agent Framework](https://github.com/hai-series/hai-framework)
- [@h-ai/serv](./.agents/skills/hai-serv/SKILL.md)
- [@h-ai/api-contract](./.agents/skills/hai-api-contract/SKILL.md)
- [@h-ai/api-client](./.agents/skills/hai-api-client/SKILL.md)
`
}

function generateFullstackReadme(name: string, pm: string, frontends: FrontendTarget[]): string {
  const enabledFrontends = frontends.map(target => FRONTEND_TARGETS[target].name).join(' / ')
  const webBuildCommands = frontends.includes('web')
    ? `
# Web 静态镜像（二选一）
${pm} docker:build:web
${pm} podman:build:web`
    : ''
  const webRunCommand = frontends.includes('web')
    ? `

# Web；PUBLIC_API_BASE 在容器启动时注入，不需要重新构建镜像
docker run --rm -d --name ${name}-web -p 8080:8080 \\
  -e PUBLIC_API_BASE=https://api.example.com \\
  ${name}-web:latest`
    : ''
  const webTestCommands = frontends.includes('web')
    ? `curl --fail http://127.0.0.1:8080/health
curl --fail http://127.0.0.1:8080/runtime-config.js
`
    : ''
  const containerNames = frontends.includes('web') ? `${name} ${name}-web` : name
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

## 默认管理功能

默认启用 IAM、reldb、cache、audit、storage 和 crypto。管理员可以管理用户（新增、编辑、禁用、删除、角色分配、头像上传）、查看两种固定角色及人数、维护角色说明、分页筛选审计日志；普通用户只能维护个人资料、头像、语言、主题和密码。密码修改后全部会话失效，需要重新登录。

CLI 已在根目录生成 \`.env\`，其中 \`HAI_ADMIN_DEFAULT_PASSWORD\` 是每个项目独立生成的随机强密码。直接运行 \`dev\` / \`start\` 即可，首次登录使用用户名 \`admin\` 和该密码；也可通过同名环境变量覆盖。密码须满足 \`_iam.yml\` 策略，启动失败会显示具体校验原因及错误码。\`.env\` 已被 Git 和容器构建忽略，\`.env.example\` 不含真实密码；部署时设置目标环境自己的密码。已有用户时不会重复创建管理员或重设密码。

本地开发默认 \`PUBLIC_API_BASE=http://127.0.0.1:3000\`，Vite 使用同源代理；部署时改为实际公网 API Origin，Android 模拟器访问宿主机时使用 \`http://10.0.2.2:3000\`。不要将密钥放入任何 \`PUBLIC_\` 或 \`VITE_\` 变量。

所有业务 JSON 请求和响应默认通过 \`@h-ai/crypto\` transport 双向加密（含登录、刷新、头像上传）；前端统一使用共享 typed API client。Web 访问令牌仅存内存、刷新令牌由 HttpOnly Cookie 保存；受信原生端使用平台安全存储或内存。头像为随机路径只读图片资源，支持 PNG/JPEG/WebP，最大 512 KiB。健康检查和只读头像图片可直接访问。

应用显示名称、版本、环境、默认语言和日志设置来自后端 \`config/_core.yml\`，前端通过 \`app.info\` 获取安全元信息。默认 SQLite、本地存储与内存缓存适合单实例，管理写入仅支持单写实例；多实例读取可使用共享数据库、Redis cache 和 S3 存储，但管理写请求须统一路由到同一写实例。另需会话粘性路由使请求命中同一进程内传输私钥，服务重启后客户端重新协商。生产需显式配置允许的 CORS Origin。业务提交后的审计写入采用最大努力，失败记录结构化错误日志，保留已完成业务的原始结果。

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

## 容器运行

默认镜像直接运行 API Service，外部端口为 3000。

### 构建镜像

\`\`\`bash
# Service 普通构建（二选一）
${pm} docker:build
${pm} podman:build

# 将 packages/${name}-serv/data 作为镜像初始数据构建（二选一）
${pm} docker:build:data
${pm} podman:build:data
${webBuildCommands}
\`\`\`

### 运行镜像

\`\`\`bash
# Service；使用 Podman 时将 docker 替换为 podman
docker run --rm -d --name ${name} -p 3000:3000 --env-file .env \\
  --mount type=bind,source=/absolute/path/to/config,target=/app/config,readonly \\
  --mount type=volume,source=${name}-data,target=/app/data \\
  ${name}:latest
${webRunCommand}
\`\`\`

### 测试镜像

\`\`\`bash
curl --fail http://127.0.0.1:3000/health
curl --fail http://127.0.0.1:3000/ready
${webTestCommands}docker stop ${containerNames}
\`\`\`

- 配置默认来自 \`packages/${name}-serv/config\`，也可挂载到 \`/app/config\`；YAML 中的 \`\${ENV_NAME:default}\` 可由 \`--env-file\` 或 \`-e\` 注入。
- 带数据构建会把 \`packages/${name}-serv/data\` 固化为镜像初始数据；持久化写入仍应使用 volume。
- Service 由 \`@h-ai/serv\` 直接对外监听，不额外启动 Web 转发层。
${frontends.includes('web') ? `- Web 使用独立静态镜像并支持一次构建、多环境部署；构建只需运行 \`${pm} docker:build:web\`，启动容器时通过 \`-e PUBLIC_API_BASE=https://api.example.com\` 指向 Service 对外地址。未设置时默认使用 Web 页面自身 origin。` : ''}

以上三个 Service 运行时参数均可按需删除：

| 参数 | 用途 | 可选性 |
| --- | --- | --- |
| \`--env-file .env\` | 批量传入环境变量；也可改用多个 \`-e NAME=value\`。 | 可选；删除后使用镜像和 YAML 默认值。 |
| \`--mount type=bind,...target=/app/config,readonly\` | 用宿主机配置目录覆盖镜像内 \`/app/config\`；必须把 \`source\` 改成真实绝对路径，\`readonly\` 防止容器修改配置。 | 可选；删除后使用镜像自带配置。 |
| \`--mount type=volume,...target=/app/data\` | 创建或复用 named volume，持久化 SQLite 和本地存储。 | 可选但生产环境建议保留；删除后数据只写入容器层，使用 \`--rm\` 删除容器时会丢失。 |

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
${pm} build
${pm} test
${pm} test:e2e
\`\`\`

${generateAiDevelopmentReadme()}## 文档

- [hai Agent Framework](https://github.com/hai-series/hai-framework)
- [@h-ai/serv](./.agents/skills/hai-serv/SKILL.md)
- [@h-ai/ui](./.agents/skills/hai-ui/SKILL.md)
`
}

/**
 * 打印完成提示
 */
function printCompletionMessage(options: Required<CreateProjectOptions>): void {
  writeCliMessage('')
  writeCliMessage(chalk.green('✔ 项目创建成功！'))
  writeCliMessage('')

  // 功能摘要
  if (options.features.length > 0) {
    writeCliMessage(chalk.bold('已启用功能:'))
    for (const featureId of options.features) {
      const feature = FEATURES[featureId]
      if (feature) {
        writeCliMessage(chalk.gray(`  • ${feature.name} (${featureId})`))
      }
    }
    writeCliMessage('')
  }

  writeCliMessage('下一步：')
  writeCliMessage(chalk.cyan(`  cd ${options.name}`))
  if (options.appType === 'fullstack')
    writeCliMessage(chalk.cyan(cliM('cli_adminPasswordSaved')))
  if (!options.install) {
    writeCliMessage(chalk.cyan(`  ${getInstallCommand(options.packageManager)}`))
  }
  if (options.appType === 'fullstack' || options.appType === 'api') {
    writeCliMessage(chalk.cyan(`  ${getRunCommand(options.packageManager, 'dev')}`))
    writeCliMessage(chalk.cyan(`  ${getRunCommand(options.packageManager, 'typecheck')}`))
    writeCliMessage(chalk.cyan(`  ${getRunCommand(options.packageManager, 'test')}`))
    writeCliMessage(chalk.cyan(`  ${getRunCommand(options.packageManager, 'test:e2e')}`))
  }
  else {
    writeCliMessage(chalk.cyan(`  ${getRunCommand(options.packageManager, 'dev')}`))
  }
  writeCliMessage('')
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
