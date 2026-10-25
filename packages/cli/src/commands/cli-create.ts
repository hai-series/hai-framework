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
import type { ConfigEnvironmentVariable } from './cli-config-environment.js'
import { Buffer } from 'node:buffer'
import { execFileSync, execSync } from 'node:child_process'
import { createECDH, randomBytes } from 'node:crypto'
import path from 'node:path'
import process from 'node:process'
import chalk from 'chalk'
import fse from 'fs-extra'
import ora from 'ora'
import prompts from 'prompts'
import { cliM } from '../cli-i18n.js'
import { detectPackageManager, fileExists, formatPromptDescription, writeCliError, writeCliMessage, writeFile } from '../cli-utils.js'
import { renderEnvironment, runtimeEnvironmentVariables } from './cli-config-environment.js'
import { buildTemplateContext, generateFromTemplates } from './cli-template-engine.js'

// =============================================================================
// 应用类型定义
// =============================================================================

/** Git 远程地址校验 */
const RE_HTTPS_URL = /^https:\/\/.+/
const RE_GIT_SSH_URL = /^git@.+:.+/

/**
 * 应用类型定义；展示字段延迟读取当前 locale，避免模块首次导入时固定语言。
 */
const APP_TYPES: Record<AppType, { name: string, description: string, defaultFeatures: FeatureId[] }> = {
  'admin': {
    get name() {
      return cliM('cli_appAdminName')
    },
    get description() {
      return cliM('cli_appAdminDescription')
    },
    defaultFeatures: ['iam', 'db', 'cache', 'crypto'],
  },
  'website': {
    get name() {
      return cliM('cli_appWebsiteName')
    },
    get description() {
      return cliM('cli_appWebsiteDescription')
    },
    defaultFeatures: ['db', 'cache'],
  },
  'h5': {
    get name() {
      return cliM('cli_appH5Name')
    },
    get description() {
      return cliM('cli_appH5Description')
    },
    defaultFeatures: ['db', 'cache'],
  },
  'api': {
    get name() {
      return cliM('cli_appApiName')
    },
    get description() {
      return cliM('cli_appApiDescription')
    },
    defaultFeatures: ['db', 'cache'],
  },
  'mobile-app': {
    get name() {
      return cliM('cli_appMobileName')
    },
    get description() {
      return cliM('cli_appMobileDescription')
    },
    defaultFeatures: ['api-client', 'capacitor'],
  },
  'fullstack': {
    get name() {
      return cliM('cli_appFullstackName')
    },
    get description() {
      return cliM('cli_appFullstackDescription')
    },
    defaultFeatures: ['iam', 'db', 'cache', 'crypto', 'storage', 'audit'],
  },
}

const FRONTEND_TARGETS: Record<FrontendTarget, { name: string, description: string, implemented: boolean }> = {
  web: { name: 'Web', get description() {
    return cliM('cli_frontendWebDescription')
  }, implemented: true },
  app: { name: 'App', get description() {
    return cliM('cli_frontendAppDescription')
  }, implemented: true },
  miniapp: {
    get name() {
      return cliM('cli_frontendMiniappName')
    },
    get description() {
      return cliM('cli_frontendMiniappDescription')
    },
    implemented: false,
  },
  desktop: {
    get name() {
      return cliM('cli_frontendDesktopName')
    },
    get description() {
      return cliM('cli_frontendDesktopDescription')
    },
    implemented: true,
  },
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
    get name() {
      return cliM('cli_featureIamName')
    },
    get description() {
      return cliM('cli_featureIamDescription')
    },
    packages: ['@h-ai/iam'],
    dependencies: ['crypto', 'db', 'cache'],
  },
  'db': {
    id: 'db',
    get name() {
      return cliM('cli_featureDbName')
    },
    get description() {
      return cliM('cli_featureDbDescription')
    },
    packages: ['@h-ai/reldb'],
  },
  'cache': {
    id: 'cache',
    get name() {
      return cliM('cli_featureCacheName')
    },
    get description() {
      return cliM('cli_featureCacheDescription')
    },
    packages: ['@h-ai/cache'],
  },
  'ai': {
    id: 'ai',
    get name() {
      return cliM('cli_featureAiName')
    },
    get description() {
      return cliM('cli_featureAiDescription')
    },
    packages: ['@h-ai/ai'],
    dependencies: ['db', 'vecdb'],
  },
  'storage': {
    id: 'storage',
    get name() {
      return cliM('cli_featureStorageName')
    },
    get description() {
      return cliM('cli_featureStorageDescription')
    },
    packages: ['@h-ai/storage'],
  },
  'crypto': {
    id: 'crypto',
    get name() {
      return cliM('cli_featureCryptoName')
    },
    get description() {
      return cliM('cli_featureCryptoDescription')
    },
    packages: ['@h-ai/crypto'],
    dependencies: ['db'],
  },
  'audit': {
    id: 'audit',
    get name() {
      return cliM('cli_featureAuditName')
    },
    get description() {
      return cliM('cli_featureAuditDescription')
    },
    packages: ['@h-ai/audit'],
    dependencies: ['db'],
  },
  'reach': {
    id: 'reach',
    get name() {
      return cliM('cli_featureReachName')
    },
    get description() {
      return cliM('cli_featureReachDescription')
    },
    packages: ['@h-ai/reach'],
  },
  'feedback': {
    id: 'feedback',
    get name() {
      return cliM('cli_featureFeedbackName')
    },
    get description() {
      return cliM('cli_featureFeedbackDescription')
    },
    packages: ['@h-ai/feedback'],
    dependencies: ['db', 'storage', 'iam'],
  },
  'payment': {
    id: 'payment',
    get name() {
      return cliM('cli_featurePaymentName')
    },
    get description() {
      return cliM('cli_featurePaymentDescription')
    },
    packages: ['@h-ai/payment'],
    dependencies: ['db'],
  },
  'vecdb': {
    id: 'vecdb',
    get name() {
      return cliM('cli_featureVecdbName')
    },
    get description() {
      return cliM('cli_featureVecdbDescription')
    },
    packages: ['@h-ai/vecdb'],
  },
  'datapipe': {
    id: 'datapipe',
    get name() {
      return cliM('cli_featureDatapipeName')
    },
    get description() {
      return cliM('cli_featureDatapipeDescription')
    },
    packages: ['@h-ai/datapipe'],
  },
  'scheduler': {
    id: 'scheduler',
    get name() {
      return cliM('cli_featureSchedulerName')
    },
    get description() {
      return cliM('cli_featureSchedulerDescription')
    },
    packages: ['@h-ai/scheduler'],
    dependencies: ['db'],
  },
  'deploy': {
    id: 'deploy',
    get name() {
      return cliM('cli_featureDeployName')
    },
    get description() {
      return cliM('cli_featureDeployDescription')
    },
    packages: ['@h-ai/deploy'],
  },
  'api-client': {
    id: 'api-client',
    get name() {
      return cliM('cli_featureApiClientName')
    },
    get description() {
      return cliM('cli_featureApiClientDescription')
    },
    packages: ['@h-ai/api-client'],
  },
  'capacitor': {
    id: 'capacitor',
    get name() {
      return cliM('cli_featureCapacitorName')
    },
    get description() {
      return cliM('cli_featureCapacitorDescription')
    },
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
  'feedback',
  'payment',
  'vecdb',
  'datapipe',
  'scheduler',
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
    get description() {
      return cliM('cli_templateMinimalDescription')
    },
    features: [] as FeatureId[],
  },
  default: {
    name: 'default',
    get description() {
      return cliM('cli_templateDefaultDescription')
    },
    features: ['iam', 'db', 'cache', 'crypto'] as FeatureId[],
  },
  full: {
    name: 'full',
    get description() {
      return cliM('cli_templateFullDescription')
    },
    features: [
      'iam',
      'db',
      'cache',
      'crypto',
      'ai',
      'storage',
      'audit',
      'reach',
      'feedback',
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
    get description() {
      return cliM('cli_templateCustomDescription')
    },
    features: [] as FeatureId[],
  },
}

// =============================================================================
// 创建项目（主入口）
// =============================================================================

/**
 * 创建项目
 * 按应用类型生成工程并补齐功能硬依赖；--no-install 不安装依赖，--no-git 不初始化仓库。
 * @throws Error - 选项、目标目录、模板生成、依赖安装或 Git 初始化失败。
 * @param options - 命令参数；对应命令的工作目录、非交互与可选功能。
 * @returns 生成及所选安装/Git 步骤完成。
 * @example 模块内部上下文
 * ```ts
 * // 在当前目录创建新的 shop 子目录；目标必须不存在或为空。
 * await createProject({ cwd: process.cwd(), name: 'shop', appType: 'api', features: ['ai'], packageManager: 'pnpm', yes: true, install: false, git: false, deploy: false })
 * // 对应 hai create shop --type api --features ai -y --no-install --no-git --no-deploy。
 * ```
 */
export async function createProject(options: CreateProjectOptions): Promise<void> {
  const spinner = ora()

  try {
    // 交互式获取选项
    const resolvedOptions = await resolveOptions(options)

    // 安全校验：项目名必须仅含小写字母、数字和连字符，防止路径遍历
    if (!PROJECT_NAME_REGEX.test(resolvedOptions.name))
      throw new Error(cliM('cli_createInvalidName', { params: { name: resolvedOptions.name } }))

    const projectPath = path.resolve(resolvedOptions.cwd ?? '.', resolvedOptions.name)

    // 检查目录是否存在
    if (await fileExists(projectPath)) {
      const { overwrite } = await prompts({
        type: 'confirm',
        active: cliM('cli_yes'),
        inactive: cliM('cli_no'),
        name: 'overwrite',
        message: cliM('cli_createOverwrite', { params: { name: resolvedOptions.name } }),
        initial: false,
      })

      if (!overwrite) {
        writeCliMessage(chalk.yellow(cliM('cli_cancelled')))
        return
      }

      await fse.remove(projectPath)
    }

    spinner.start(cliM('cli_createDirectory'))
    await fse.ensureDir(projectPath)
    spinner.succeed()

    // ─── 基于模板生成项目文件 ───
    spinner.start(cliM('cli_createFiles'))

    const context = buildTemplateContext({
      name: resolvedOptions.name,
      appType: resolvedOptions.appType,
      features: resolvedOptions.features,
      deploy: resolvedOptions.deploy,
      frontends: resolvedOptions.frontends,
      moduleConfigs: resolvedOptions.moduleConfigs,
      packageManager: resolvedOptions.packageManager!,
    })

    // 拷贝模板 + 渲染动态文件
    await generateFromTemplates(projectPath, context)

    {
      // 生成配置文件（config/*.yml）
      const { generateConfigFile, generateEnvExample, generateProductionEnvironment } = await import('./cli-config-templates.js')
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
        if (configKey && configKey !== 'deploy') {
          const configPath = path.join(configDir, `_${configKey}.yml`)
          // fullstack 已用模块配置 helper 渲染完整配置，不能再覆盖 Reach 模板等应用默认值。
          if (isFullstack && await fse.pathExists(configPath))
            continue
          const baseConfig = generateConfigFile(configKey, configs)
          const renderedConfig = baseConfig
          await writeFile(configPath, configKey === 'feedback' ? renderedConfig.replace('HAI_FEEDBACK_APPID:my-app', `HAI_FEEDBACK_APPID:${resolvedOptions.name}`) : renderedConfig)
        }
      }

      if (!isApiWorkspace && !isFullstack) {
        // 始终生成 core 配置
        await writeFile(
          path.join(configDir, '_core.yml'),
          generateConfigFile('core', configs),
        )
      }

      const configContents: Record<string, string> = {}
      for (const file of await fse.readdir(configDir)) {
        if (/^_.*\.yml$/.test(file))
          configContents[file.slice(1, -4)] = await fse.readFile(path.join(configDir, file), 'utf8')
      }
      const envFeatures: FeatureId[] = isFullstack ? [...new Set<FeatureId>([...resolvedOptions.features, 'reach'])] : resolvedOptions.features
      const envContents = generateEnvExample(envFeatures, configs, isFullstack, configContents)
      let envExample = isApiWorkspace
        ? envContents
        : isFullstack
          ? `${envContents}\n# First-start administrator password; must satisfy the IAM password policy.\nHAI_ADMIN_DEFAULT_PASSWORD=\n\n# Public API origin; never include credentials.\nPUBLIC_API_BASE=http://127.0.0.1:3000\n`
          : context.isSvelteOnlyApp
            ? `${envContents}\n# Public API URL including /api/v1; never include credentials.\nPUBLIC_API_BASE=http://10.0.2.2:3000/api/v1\n`
            : envContents

      const runtimeVariables = new Map<string, ConfigEnvironmentVariable>()
      for (const file of await fse.readdir(projectPath, { recursive: true, encoding: 'utf8' })) {
        if (!/\.(?:ts|js|mjs|svelte|envsh)$/.test(file))
          continue
        for (const variable of runtimeEnvironmentVariables(await fse.readFile(path.join(projectPath, file), 'utf8')))
          runtimeVariables.set(variable.name, variable)
      }
      const existingNames = new Set([...envExample.matchAll(/^(?:#\s*)?([A-Z][A-Z0-9_]*)=/gm)].map(match => match[1]))
      const runtimeExample = renderEnvironment([...runtimeVariables.values()].filter(variable => !existingNames.has(variable.name)))
      if (runtimeExample)
        envExample += `\n# 可选运行入口（按用途注入，不进入公共默认值）：\n${runtimeExample.split('\n').map(line => line && !line.startsWith('#') ? `# ${line}` : line).join('\n')}\n`

      await writeFile(envExamplePath, envExample)
      const envDirectory = path.dirname(envExamplePath)
      const sharedVariables = envExample.split('\n').filter(line => /^[A-Z][A-Z0-9_]*=/.test(line))
      await writeFile(path.join(envDirectory, '.env'), `# 公共基础配置（可提交）；完整字段说明见 .env.example。\n${sharedVariables.join('\n')}\n`)
      for (const [mode, environment] of [['dev', 'development'], ['test', 'test'], ['prod', 'production']] as const) {
        const values = mode === 'prod'
          ? generateProductionEnvironment(envFeatures, configs)
          : `# 公共 ${mode} 环境配置；本机私有值放 .env.local，进程环境变量优先。\nHAI_CORE_ENV=${environment}\nHAI_CORE_LOGGING_LEVEL=${mode === 'test' ? 'warn' : 'debug'}\n`
        await writeFile(path.join(envDirectory, `.env.${mode}`), values)
      }
      const privateEntries: string[] = []
      if (isFullstack) {
        // 每个项目使用独立随机密码，保证四类字符；真实凭据只写入被忽略的本地文件。
        const password = `Aa1!${randomBytes(24).toString('base64url')}`
        privateEntries.push(`HAI_ADMIN_DEFAULT_PASSWORD=${password}`)
      }
      if (isFullstack || (isApiWorkspace && resolvedOptions.features.includes('crypto'))) {
        // 仅在项目创建时生成一次本机开发 Secret；运行时禁止隐式生成，部署时由 Secret Manager 分发。
        const key = createECDH('SM2')
        key.generateKeys()
        const id = `bootstrap-${randomBytes(6).toString('hex')}`
        const ring = { activeKeyId: id, keys: { [id]: { publicKey: key.getPublicKey('hex'), privateKey: key.getPrivateKey('hex').padStart(64, '0') } } }
        privateEntries.push(`HAI_CRYPTO_TRANSPORT_SERVERKEYRING='${JSON.stringify(ring)}'`)
      }
      await fse.writeFile(path.join(envDirectory, '.env.local'), `# 本机私有配置，不提交 Git；部署凭据由目标环境单独提供。\n${privateEntries.join('\n')}\n`, { mode: 0o600 })
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
    const appTypeLabel = cliM(`cli_app${({ 'admin': 'Admin', 'website': 'Website', 'h5': 'H5', 'api': 'Api', 'mobile-app': 'Mobile', 'fullstack': 'Fullstack' } as const)[resolvedOptions.appType]}Name`, { locale: 'zh-CN' })
    const readmeContent = resolvedOptions.appType === 'fullstack'
      ? generateFullstackReadme(resolvedOptions.name, resolvedOptions.packageManager!, resolvedOptions.frontends, resolvedOptions.features.includes('feedback'))
      : resolvedOptions.appType === 'api'
        ? generateApiWorkspaceReadme(resolvedOptions.name, resolvedOptions.packageManager!)
        : generateReadme(resolvedOptions.name, appTypeLabel, resolvedOptions.packageManager!, resolvedOptions.appType)
    await writeFile(
      path.join(projectPath, 'README.md'),
      resolvedOptions.deploy === false
        ? readmeContent.replace(/### 构建与部署[\s\S]*?(?=\n#{2,3} |$)/, '### 构建\n\npnpm build\npnpm build --target docker\n\n本项目创建时关闭了部署工具。\n')
        : readmeContent,
    )

    spinner.succeed()

    // 初始化 Git
    if (resolvedOptions.git) {
      spinner.start(cliM('cli_createGit'))
      execSync('git init', { cwd: projectPath, stdio: 'ignore' })
      if (resolvedOptions.gitRemote) {
        // 使用 execFileSync + 数组参数，避免 shell 注入
        // 同时在非交互模式下补充校验（交互模式在 prompts.validate 中已校验）
        const gitRemote = resolvedOptions.gitRemote
        if (!RE_HTTPS_URL.test(gitRemote) && !RE_GIT_SSH_URL.test(gitRemote)) {
          spinner.fail()
          throw new Error(cliM('cli_createRemoteFailure', { params: { remote: gitRemote } }))
        }
        execFileSync('git', ['remote', 'add', 'origin', gitRemote], { cwd: projectPath, stdio: 'ignore' })
      }
      spinner.succeed()
    }

    // 安装依赖
    if (resolvedOptions.install) {
      spinner.start(cliM('cli_createInstall', { params: { manager: resolvedOptions.packageManager } }))
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
  writeCliMessage(chalk.gray(cliM('cli_createTagline')))
  writeCliMessage('')

  const onCancel = () => {
    writeCliMessage(chalk.red(cliM('cli_cancelledLine')))
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
      message: cliM('cli_createNamePrompt'),
      initial: 'my-app',
      validate: (value: string) => {
        if (!value.trim())
          return cliM('cli_createNameRequired')
        if (!PROJECT_NAME_REGEX.test(value))
          return cliM('cli_createNamePattern')
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
      message: cliM('cli_createTypePrompt'),
      hint: `\n${formatPromptDescription(cliM('cli_selectHint'))}`,
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
        message: cliM('cli_createTemplatePrompt'),
        hint: `\n${formatPromptDescription(cliM('cli_selectHint'))}`,
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
    // 省略功能列表时交付反馈入口；显式列表保留用户对可选模块的选择。
    selectedFeatures = resolveFeatureDependencies([...appTypeDefaults, ...(options.features ?? ['feedback'])])
  }
  else if (options.features) {
    selectedFeatures = resolveFeatureDependencies(options.features)
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
      hint: `\n${formatPromptDescription(cliM('cli_multiselectHint'))}`,
      instructions: false,
    }, { onCancel })

    selectedFeatures = features || []
    selectedFeatures = resolveFeatureDependencies(selectedFeatures)
  }
  else {
    const templateFeatures = PROJECT_TEMPLATES[selectedTemplate as keyof typeof PROJECT_TEMPLATES]?.features || []
    const merged = new Set([...templateFeatures, ...appTypeDefaults])
    selectedFeatures = resolveFeatureDependencies(Array.from(merged))
  }

  selectedFeatures = selectedFeatures.filter(feature => feature !== 'deploy')
  if (options.deploy !== false)
    selectedFeatures.push('deploy')

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
      active: cliM('cli_yes'),
      inactive: cliM('cli_no'),
      name: 'examples',
      message: cliM('cli_createExamplesPrompt'),
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
      hint: `\n${formatPromptDescription(cliM('cli_selectHint'))}`,
      name: 'pm',
      message: cliM('cli_createManagerPrompt'),
      choices: [
        { title: cliM('cli_createPnpmRecommended'), value: 'pnpm' },
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
      active: cliM('cli_yes'),
      inactive: cliM('cli_no'),
      name: 'doInstall',
      message: cliM('cli_createInstallPrompt'),
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
      active: cliM('cli_yes'),
      inactive: cliM('cli_no'),
      name: 'initGit',
      message: cliM('cli_createGitPrompt'),
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
      message: cliM('cli_createRemotePrompt'),
      initial: '',
      validate: (value: string) => {
        if (!value.trim())
          return true
        if (RE_HTTPS_URL.test(value) || RE_GIT_SSH_URL.test(value))
          return true
        return cliM('cli_createRemoteInvalid')
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
    deploy: options.deploy !== false,
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
    // 独立行显示帮助，避免宽字符让 prompts 按字符数清除时遗留折行。
    hint: `\n${formatPromptDescription(cliM('cli_multiselectHint'))}`,
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
 * 迭代展开功能硬依赖直到集合稳定，避免仅处理一层依赖导致初始化缺项；保留输入顺序并去重。
 * @param features - 调用方选择的功能。
 * @returns 包含传递硬依赖的功能列表。
 * @example 模块内部上下文
 * ```ts
 * const features = resolveFeatureDependencies(['iam', 'ai'])
 * const complete = ['db', 'cache', 'crypto', 'vecdb'].every(feature => features.some(selected => selected === feature))
 * ```
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
    writeCliMessage(chalk.red(cliM('cli_cancelledLine')))
    process.exit(1)
  }

  writeCliMessage('')
  writeCliMessage(chalk.bold(cliM('cli_createModuleConfig')))
  writeCliMessage(chalk.gray(cliM('cli_createModuleConfigHint')))
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
  writeCliMessage(chalk.cyan(cliM('cli_createCoreConfig')))
  const { defaultLocale } = await prompts({
    type: 'select',
    hint: `\n${formatPromptDescription(cliM('cli_selectHint'))}`,
    name: 'defaultLocale',
    message: cliM('cli_createLocalePrompt'),
    choices: [
      { title: cliM('cli_createChineseLocale'), value: 'zh-CN' },
      { title: cliM('cli_createEnglishLocale'), value: 'en-US' },
      { title: cliM('cli_createJapaneseLocale'), value: 'ja-JP' },
    ],
    initial: 0,
  }, { onCancel })
  return { name: projectName, defaultLocale }
}

/**
 * 收集 db 模块配置
 */
async function promptDbConfig(projectName: string, onCancel: () => void): Promise<ModuleConfigs['db']> {
  writeCliMessage(chalk.cyan(cliM('cli_createDbConfig')))
  const { type } = await prompts({
    type: 'select',
    hint: `\n${formatPromptDescription(cliM('cli_selectHint'))}`,
    name: 'type',
    message: cliM('cli_createDbTypePrompt'),
    choices: [
      { title: cliM('cli_createSqliteOption'), value: 'sqlite' },
      { title: 'PostgreSQL', value: 'postgresql' },
      { title: 'MySQL', value: 'mysql' },
    ],
    initial: 0,
  }, { onCancel })

  if (type === 'sqlite') {
    const { database } = await prompts({
      type: 'text',
      name: 'database',
      message: cliM('cli_createSqlitePathPrompt'),
      initial: './data/app.db',
    }, { onCancel })
    return { type, database }
  }

  const answers = await prompts([
    { type: 'text', name: 'host', message: cliM('cli_createDbHostPrompt', { params: { backend: type === 'postgresql' ? 'PostgreSQL' : 'MySQL' } }), initial: 'localhost' },
    { type: 'number', name: 'port', message: cliM('cli_createPortPrompt'), initial: type === 'postgresql' ? 5432 : 3306 },
    { type: 'text', name: 'database', message: cliM('cli_createDatabasePrompt'), initial: projectName },
  ], { onCancel })

  return { type, host: answers.host, port: answers.port, database: answers.database }
}

/**
 * 收集 cache 模块配置
 */
async function promptCacheConfig(onCancel: () => void): Promise<ModuleConfigs['cache']> {
  writeCliMessage(chalk.cyan(cliM('cli_createCacheConfig')))
  const { type } = await prompts({
    type: 'select',
    hint: `\n${formatPromptDescription(cliM('cli_selectHint'))}`,
    name: 'type',
    message: cliM('cli_createCacheTypePrompt'),
    choices: [
      { title: cliM('cli_createMemoryOption'), value: 'memory' },
      { title: 'Redis', value: 'redis' },
    ],
    initial: 0,
  }, { onCancel })

  if (type === 'memory')
    return { type }

  const answers = await prompts([
    { type: 'text', name: 'host', message: cliM('cli_createRedisHostPrompt'), initial: 'localhost' },
    { type: 'number', name: 'port', message: cliM('cli_createRedisPortPrompt'), initial: 6379 },
  ], { onCancel })

  return { type, host: answers.host, port: answers.port }
}

/**
 * 收集 iam 模块配置
 */
async function promptIamConfig(onCancel: () => void): Promise<ModuleConfigs['iam']> {
  writeCliMessage(chalk.cyan(cliM('cli_createIamConfig')))
  const answers = await prompts([
    { type: 'confirm', active: cliM('cli_yes'), inactive: cliM('cli_no'), name: 'loginPassword', message: cliM('cli_createPasswordPrompt'), initial: true },
    { type: 'confirm', active: cliM('cli_yes'), inactive: cliM('cli_no'), name: 'loginOtp', message: cliM('cli_createOtpPrompt'), initial: false },
  ], { onCancel })
  return { loginPassword: answers.loginPassword, loginOtp: answers.loginOtp }
}

/**
 * 收集 storage 模块配置
 */
async function promptStorageConfig(onCancel: () => void): Promise<ModuleConfigs['storage']> {
  writeCliMessage(chalk.cyan(cliM('cli_createStorageConfig')))
  const { type } = await prompts({
    type: 'select',
    hint: `\n${formatPromptDescription(cliM('cli_selectHint'))}`,
    name: 'type',
    message: cliM('cli_createStorageTypePrompt'),
    choices: [
      { title: cliM('cli_createLocalStorageOption'), value: 'local' },
      { title: 'S3 / MinIO / OSS', value: 's3' },
    ],
    initial: 0,
  }, { onCancel })

  if (type === 'local') {
    const { localPath } = await prompts({
      type: 'text',
      name: 'localPath',
      message: cliM('cli_createStoragePathPrompt'),
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
  writeCliMessage(chalk.cyan(cliM('cli_createAiConfig')))
  const { defaultProvider } = await prompts({
    type: 'select',
    hint: `\n${formatPromptDescription(cliM('cli_selectHint'))}`,
    name: 'defaultProvider',
    message: cliM('cli_createProviderPrompt'),
    choices: [
      { title: 'OpenAI', value: 'openai' },
      { title: 'Anthropic (Claude)', value: 'anthropic' },
      { title: cliM('cli_createCompatibleAiOption'), value: 'custom' },
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
    message: cliM('cli_createModelPrompt'),
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
    feedback: 'feedback',
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

/**
 * 同步子命令异常中可读取的诊断字段；输出可能为 Buffer 或字符串，因此先以 unknown 接收并规范化。
 * @example 模块内部上下文
 * ```ts
 * const failure: CommandFailureLike = { status: 1, signal: null, stderr: Buffer.from('Install failed'), stdout: '' }
 * const details = formatCommandFailure('pnpm install', failure)
 * ```
 */
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

/** 生成各类项目共用的 AI 开发入口说明。 */
function generateAiDevelopmentReadme(): string {
  return `### AI 辅助开发

从本项目根目录打开所用编码工具，先读取 [AGENTS.md](./AGENTS.md)。Claude Code 通过 [CLAUDE.md](./CLAUDE.md) 加载项目规则；GitHub Copilot 使用 [.github/copilot-instructions.md](./.github/copilot-instructions.md)，OpenCode 使用 AGENTS.md 和 [opencode.json](./opencode.json)。

生成的页面和业务规则是起点，可以按需求调整。把功能、权限和验收条件告诉 AI，再让它读取对应技能与当前安装版本的 API。

普通功能开发使用 [应用开发 Skill](./.agents/skills/hai-app-create/SKILL.md)。需求文档较多时，先用 [文档审查 Skill](./.agents/skills/hai-spec-review/SKILL.md) 找出缺失和矛盾，再用 [文档实施 Skill](./.agents/skills/hai-spec-implement/SKILL.md) 维护 docs/task-list.md 与 docs/tasks/，逐项实现、测试和交付。

已有项目可运行 hai init 补齐缺失的 AI 入口；它保留已有自定义内容。升级框架使用 [框架升级 Skill](./.agents/skills/hai-framework-sync/SKILL.md)，同时核对依赖、配置、代码和技能。

`
}

/** 生成各类工程共用的配置与命令说明，放在开发/部署章节之间。 */
function generateEnvironmentReadme(): string {
  return `### 分环境配置

运行参数在 \`.env.example\` 中逐项说明用途、枚举和范围。\`.env\` 为公共基础，\`.env.dev\` / \`.env.test\` / \`.env.prod\` 为环境覆盖，均提交 Git；\`.env.local\` 为本机私有覆盖，不提交 Git。优先级为进程环境 > \`.env.local\` > 环境文件 > \`.env\`。YAML 显式引用 \`HAI_<配置名>_<路径>\` 并保留本地回退，camelCase 不拆词。完整命令、加载优先级和 Provider 切换见 [环境配置](.agents/skills/hai-app-create/development.md#环境配置)。

生产 .env.prod 按已启用模块选择共享 PostgreSQL（明确选择 MySQL 时保留）、Redis、S3、Qdrant，默认使用 Compose 内部服务名 db/cache/storage/vecdb。密码、S3 凭据、模型 Key 与受保护 Qdrant 的 Key 只由私有环境注入；容器外运行覆盖内部连接地址。生产 Reach 必须注入真实 HAI_REACH_PROVIDERS JSON，公共空数组会拒绝启动。AI 自动补全 db+vecdb 依赖，并在二者就绪后初始化，失败逆序清理。

| 用途 | 命令 |
| --- | --- |
| 开发 / 测试模式 / 生产模式预览 | \`pnpm dev\` / \`dev:test\` / \`dev:prod\` |
| 类型检查（check 为别名） | \`pnpm typecheck\` |
| 检查 / 自动修复格式 | \`pnpm lint\` / \`lint:fix\` |
| 源码构建 / 镜像构建 | \`pnpm build\` / \`pnpm build --target docker\` |
| 单元测试 / 监听 / 浏览器验收 | \`pnpm test\` / \`test:watch\` / \`test:e2e\` |
| Node 服务按环境启动（构建后） | \`pnpm start\` / \`start:test\` / \`start:prod\` |

Vite 客户端使用 \`preview\` 预览静态产物，Node 服务使用 \`start\`；纯 contract/shared 库只提供适用的构建和质量命令。API workspace 的环境文件位于 \`apps/<name>-service\`，fullstack 位于工程根。`
}

/** 生成与项目脚本一致的构建、离线交付和增量更新说明。 */
function generateBuildDeploymentReadme(pm: string, appDir: string): string {
  return `### 构建与部署

创建时默认包含部署工具；不需要时使用 hai create --no-deploy。
每个镜像对应 images/ 中一个 Dockerfile，根 hai.json 的 build 分区指定文件，deploy 分区保存整个项目的部署配置。
下载、安装和整理生产依赖复用同一份包缓存与 SQLite 驱动缓存，避免重复下载。
默认容器用于 CPU 运行或连接远程 AI 服务，不额外下载 GPU 运行库；需要使用部署机器上的 GPU 时，自行定制镜像和容器运行参数。

\`\`\`sh
${pm} build
${pm} build --target docker
# 构建和部署一次完成
${pm} exec hai deploy ${appDir} --env test --build
# 复用已有镜像；只生成完整离线包及跨平台部署脚本
${pm} exec hai deploy ${appDir} --env prod --bundle-only
# 只更新前端（工程存在 web 镜像时）
${pm} build --target docker --images web
${pm} exec hai deploy ${appDir} --env prod --services web
\`\`\`

构建不读取部署环境；产物位于 .hai/build/docker/<buildId>，用 --artifact-dir 精确选择。
应用根 package.json.version 驱动版本，同版本允许重新构建和发布；清单记录独立构建编号与校验和。
完整离线包自动携带自建中间件镜像；准备中间件镜像需要构建机有可用 Podman/Docker，缺镜像时在打包阶段拉取。
服务器需要 Linux、Docker/Podman、Docker Compose v2 或 podman-compose 1.6.0 及以上、sh、tar、sha256sum、awk、curl、util-linux flock 和支持 flock 的文件系统，启动阶段不联网拉取。
固定 .deploy.lock 内核锁覆盖部署及恢复；禁止删除或替换，所有持有进程退出或重启后自动释放。强杀后须核对结果文件、current 和容器状态，再用新包恢复。
每次离线交付生成独立目录，外层仅含 tar、deploy.ps1（Windows）、deploy.sh（Linux/macOS）、deploy-target.json、read-target.awk、deploy-local.sh 和 README.txt；Compose、运行环境和清单仅在 tar 内。交互式打包在构建和中间件配置后最后询问是否保存或修改 SSH 信息，写入 .env.<环境>.local 并用于本次和后续 target；--yes 复用已有配置，复制整个目录即可。脚本按已保存的 SSH 参数上传、导入、启动并验证 HTTP。
完全隔离时复制整个交付目录，运行 sh deploy-local.sh 自动解包并部署；可传入部署目录覆盖默认位置。
部分更新要求已有成功的完整部署，保留未选服务及数据卷；失败返回非零退出码，已有部署尝试恢复选中服务。
中间件连接齐全时使用 --skip-middleware 跳过配置向导。包中包含私有配置，不提交 Git。
`
}

function generateReadme(name: string, appTypeLabel: string, pm: 'pnpm' | 'npm' | 'yarn', appType: AppType): string {
  const install = getInstallCommand(pm)
  return `# ${name}

## 简介

基于 hai Agent Framework 构建的${appTypeLabel}应用。

## 核心功能清单

- 开发服务器、源码编译与浏览器测试。
- 按所选模块提供页面和服务配置。
- 独立 Dockerfile 与镜像归档，便于交付。

## 使用入门

### 页面布局与路由

页面统一继承根布局的 header/footer。${appType === 'mobile-app' ? '页面放 src/lib/pages/**/*.svelte，hash 路由自动发现，刷新与前进后退恢复当前页。' : '使用 SvelteKit 自动文件路由，新增 +page.svelte 无需维护路由表；刷新定位与服务端鉴权保持一致。'}${appType === 'mobile-app' ? '\n\n选择 IAM 或 crypto 的移动客户端默认启用加密 transport，先初始化 crypto，再初始化 typed API client；结束时按相反顺序关闭。仅明确连接匹配的明文 API 时设置 PUBLIC_API_TRANSPORT=off；PUBLIC_API_KEY_EXCHANGE_PATH 仅覆盖公开协商子路径。握手失败不会退回明文，服务端私钥不进入客户端。未选择 crypto 的客户端保留明文 API 模式。' : ''}

### 开发

\`\`\`bash
${install}
${getRunCommand(pm, 'dev')}
\`\`\`

${generateEnvironmentReadme()}

### 构建

\`\`\`bash
${getRunCommand(pm, 'build')}
${getRunCommand(pm, 'paraglide:compile')}
${getRunCommand(pm, 'preview')}
\`\`\`

${generateBuildDeploymentReadme(pm, `.`)}

${generateAiDevelopmentReadme()}### 文档

- [hai Agent Framework](https://github.com/hai-series/hai-framework)
- [Svelte 5](https://svelte.dev/)

## 开发测试

\`\`\`sh
${getRunCommand(pm, 'typecheck')}
${getRunCommand(pm, 'lint')}
${getRunCommand(pm, 'build')}
${getRunCommand(pm, 'test')}
${getRunCommand(pm, 'test:e2e')}
\`\`\`

## 许可证

Apache-2.0
`
}

function generateApiWorkspaceReadme(name: string, pm: 'pnpm' | 'npm' | 'yarn'): string {
  return `# ${name}

## 简介

后端 API 工程，接口定义与服务实现分包维护，客户端可复用同一份接口类型。

## 核心功能清单

- 共享 contract、输入输出校验与服务 procedures。
- 模块配置、健康检查和 HTTP 服务。
- 独立镜像构建与离线交付。

## 使用入门

### 工程结构

- \`apps/${name}-contract\`：共享 API contract、Zod schema 与类型
- \`apps/${name}-service\`：后端 API service，基于 \`@h-ai/serv\` 暴露 HTTP 应用

### 开发

\`\`\`bash
${pm} install
${pm} dev
\`\`\`

${generateEnvironmentReadme()}


${generateBuildDeploymentReadme(pm, `apps/${name}-service`)}

### 扩展建议

- 在 \`${name}-contract\` 中维护应用级 contract，前后端共用同一份类型与路径定义。
- 在 \`${name}-service\` 中扩展 procedures、模块初始化与配置。
- 需要 IAM / storage / ai 时，优先复用 \`@h-ai/api-contract\` 与 \`@h-ai/serv/features/*\`。

${generateAiDevelopmentReadme()}### 文档

- [hai Agent Framework](https://github.com/hai-series/hai-framework)
- [@h-ai/serv](./.agents/skills/hai-serv/SKILL.md)
- [@h-ai/api-contract](./.agents/skills/hai-api-contract/SKILL.md)
- [@h-ai/api-client](./.agents/skills/hai-api-client/SKILL.md)

## 开发测试

\`\`\`bash
${pm} typecheck
${pm} lint
${pm} build
${pm} test
${pm} test:e2e
\`\`\`

## 许可证

Apache-2.0
`
}

function generateFullstackReadme(name: string, pm: string, frontends: FrontendTarget[], hasFeedback: boolean): string {
  const enabledFrontends = frontends.map(target => FRONTEND_TARGETS[target].name).join(' / ')
  return `# ${name}

## 简介

前后端分离工程，API 与 Web、移动端、桌面端共享接口类型和管理界面，可按实际业务调整。

## 核心功能清单

- API 服务、共享界面与按需生成的客户端。
- 用户管理、角色、审计和个人设置示例。
- 登录、主题、语言、新手引导和帮助中心。
- API/Web 独立 Dockerfile 与镜像归档。

## 使用入门

### 工程结构

- \`packages/${name}-contract\`：前后端共享 API 契约、Zod Schema 与类型
- \`packages/${name}-serv\`：后端 API Service（通过 \`@h-ai/serv\` 暴露最小 HTTP App 抽象，不直接暴露 Hono）
- \`packages/${name}-shared\`：跨端共享 Shell、主题、语言切换、API client 与共享 messages
- \`apps/${name}-web\`：Web 前端${frontends.includes('web') ? '' : '（未启用）'}
- \`apps/${name}-app\`：移动端 App/H5 前端${frontends.includes('app') ? '' : '（未启用）'}
- \`apps/${name}-desktop\`：桌面端前端${frontends.includes('desktop') ? '' : '（未启用）'}
- \`apps/${name}-miniapp\`：小程序预留说明与本端 inlang messages${frontends.includes('miniapp') ? '（占位，不参与构建）' : '（未启用）'}

已启用前端：${enabledFrontends || 'Web / App / Desktop'}

### 页面布局与路由

Web/App/Desktop 共享 AppShell 的 header/footer。新增页面放 shared/src/lib/pages/**/*.svelte，由 HashRouter 自动发现并按需加载；菜单只维护入口。地址使用 #/页面路径，支持刷新、查询串与浏览器前进后退；API 权限仍由服务端校验。

### 默认管理功能

以下描述可运行示例的初始业务，可按实际需求调整或移除，并同步代码、数据、鉴权、界面、测试和文档。

默认启用 IAM、reldb、cache、audit、storage 和 crypto${hasFeedback ? '、feedback 和 Reach' : ''}。初始管理员可以管理用户（新增、编辑、禁用、删除、角色分配、头像上传）、查看 admin/user 角色及人数、维护角色说明、分页筛选审计日志；初始普通用户进入个人资料、头像、语言、主题和密码设置。默认密码修改后全部会话失效，需要重新登录；角色模型、访问范围和会话策略由业务需求决定。

${hasFeedback ? '登录用户可从顶部“问题反馈”提交说明、截图与日志；只有管理员显示反馈管理菜单并能查看、处理、撤销和导出问题包。服务端继续按可信身份与应用范围授权。开发通知使用 Console，生产须在 _feedback.yml 与 _reach.yml 配置管理员和真实邮件。' : ''}

CLI 已在根目录生成 \`.env.local\`，其中 \`HAI_ADMIN_DEFAULT_PASSWORD\` 是每个项目独立生成的随机强密码。直接运行 \`dev\` / \`start\` 即可，首次登录使用用户名 \`admin\` 和该密码；也可通过同名环境变量覆盖。密码须满足 \`_iam.yml\` 策略，启动失败会显示具体校验原因及错误码。\`.env.local\` 已被 Git 和容器构建忽略，\`.env.example\` 不含真实密码；部署时设置目标环境自己的密码。已有用户时不会重复创建管理员或重设密码。

本地开发默认 \`PUBLIC_API_BASE=http://127.0.0.1:3000\`，Vite 使用同源代理；部署时改为实际公网 API Origin，Android 模拟器访问宿主机时使用 \`http://10.0.2.2:3000\`。不要将密钥放入任何 \`PUBLIC_\` 或 \`VITE_\` 变量。

服务端版本化传输密钥环在创建时一次性写入被忽略的 \`.env.local\`，变量为 \`HAI_CRYPTO_TRANSPORT_SERVERKEYRING\`；运行时不生成密钥。部署由 Secret Manager 向所有节点分发同一受管 ring，配合共享 registry。私钥不进入公开配置、PUBLIC_/VITE_ 或日志。

所有业务 JSON 请求和响应默认通过 \`@h-ai/crypto\` transport 双向加密（含登录、刷新、头像上传）；前端统一使用共享 typed API client。Web 访问令牌仅存内存、刷新令牌由 HttpOnly Cookie 保存；受信原生端使用平台安全存储或内存。头像为随机路径只读图片资源，支持 PNG/JPEG/WebP，最大 512 KiB。健康检查和只读头像图片可直接访问。

应用显示名称、版本、环境、默认语言和日志设置来自后端 \`config/_core.yml\`，前端通过 \`app.info\` 获取安全元信息。开发默认 SQLite、本地存储与内存缓存；生产启动拒绝这些本地 Provider，必须将所有节点连接到同一共享数据库、Redis 与 S3。传输必须在所有节点注入相同受管版本化密钥环与共享 registry，无需会话粘性；重启读取原 ring，轮换先分发新旧版本再切 activeKeyId。生产需显式配置允许的 CORS Origin。业务提交后的审计写入采用最大努力，失败记录结构化错误日志，保留已完成业务的原始结果。

### 配置扩展

服务端 \`packages/${name}-serv/config/\` 始终保留 core、serv、db、cache、iam、storage、audit、reach、ai、vecdb、payment、scheduler、feedback 共 13 份 YAML；构建部署配置统一位于项目根 hai.json。已用模块保留工作默认值，未启用模块整份注释，可选字段和替代 Provider 按块注释；根 \`.env.example\` 也保留未启用模块的凭据示例。Reach 默认为开发控制台通知，feedback 使用 email 别名；生产按 \`_reach.yml\` 注释替换为 SMTP、短信或 API Provider，并保持名称唯一。

自动生成的 \`.env\` 包含已启用模块的环境参数；YAML 显式引用相同变量并保留本地回退。编辑环境参数优先修改对应 \`.env\`；未启用模块仍保留注释。

扩展时先在服务端 workspace 安装需要的包，在 \`src/server/runtime.ts\` 按模块公开 Schema 校验配置、初始化并反序关闭，再接入 contract/procedure 和界面。整份注释文件先去掉一层外层注释，可选块继续按需开启；配置文件存在不代表业务功能已接入。\`crypto.init()\` 无配置参数，datapipe 为纯函数，不生成虚构 YAML。

环境变量只覆盖 YAML 已有路径，注释键须先启用，或用 \`HAI_DB\` / \`HAI_CACHE\` 等整体对象覆盖。camelCase 不拆词，例如 \`connectTimeout\` 对应 \`HAI_CACHE_CONNECTTIMEOUT\`。修改配置后重启服务；语言列表在各前端/shared 的 \`project.inlang/settings.json\` 中同步。\`**/data/\` 忽略任意层级的数据目录及 \`.gitkeep\`，运行数据不入 Git，运行时自动创建目录。

${generateEnvironmentReadme()}

### 开发与构建

\`\`\`bash
${pm} install
${pm} dev
${pm} typecheck
${pm} build
${pm} test
${pm} test:e2e
${frontends.includes('desktop') ? `${pm} build --target desktop --platform windows # Windows 主机；Linux/macOS 在对应主机构建` : ''}
\`\`\`

Tauri 需要目标系统的 Rust target、SDK 和打包工具。测试产生的临时工程、截图、报告、容器、镜像与进程应在 finally/teardown 中自动清理，失败也执行。

${generateBuildDeploymentReadme(pm, `packages/${name}-serv`)}

### i18n 与 shared 协同

- shared：\`packages/${name}-shared/project.inlang\` + \`messages/\`，只放跨端共享组件文案。
- web/app/desktop：每个应用都有自己的 \`project.inlang\` + \`messages/\`，用于本端页面与产品文案。
- miniapp：当前是占位，但也有自己的 \`project.inlang\` + \`messages/\`，便于后续接入真实小程序框架。
- 新增 locale 时，shared 与所有启用前端的 \`locales\` 必须同步；语言切换器会同时更新 shared runtime 与宿主应用 runtime。
- \`${pm} i18n:compile\` 会统一编译 shared 与每个启用前端的 Paraglide 输出；各前端也可单独运行 \`${pm} --filter ${name}-web paraglide:compile\` 等命令。

### 自定义建议

- 改全局 Shell/主题/语言切换：编辑 \`packages/${name}-shared\`。
- 改某个前端页面和文案：编辑共享 \`packages/${name}-shared/src/lib/pages\`、本端入口与 \`apps/${name}-*/messages\`。
- 改主题列表：调整脚手架配置中的 \`fullstack.theme.themes\`，或直接编辑各端 \`src/app.css\` 的 daisyUI \`themes\`。


${generateAiDevelopmentReadme()}### 文档

- [hai Agent Framework](https://github.com/hai-series/hai-framework)
- [@h-ai/serv](./.agents/skills/hai-serv/SKILL.md)
- [@h-ai/ui](./.agents/skills/hai-ui/SKILL.md)

## 开发测试

\`\`\`bash
${pm} typecheck
${pm} lint
${pm} build
${pm} test
${pm} test:e2e
\`\`\`

## 许可证

Apache-2.0
`
}

/**
 * 打印完成提示
 */
function printCompletionMessage(options: Required<CreateProjectOptions>): void {
  writeCliMessage('')
  writeCliMessage(chalk.green(cliM('cli_createSuccess')))
  writeCliMessage('')

  // 功能摘要
  if (options.features.length > 0) {
    writeCliMessage(chalk.bold(cliM('cli_createFeatures')))
    for (const featureId of options.features) {
      const feature = FEATURES[featureId]
      if (feature) {
        writeCliMessage(chalk.gray(`  • ${feature.name} (${featureId})`))
      }
    }
    writeCliMessage('')
  }

  writeCliMessage(cliM('cli_nextSteps'))
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
 * 缺少或无法解析 package.json 时返回 null；isHaiProject 仅表示依赖中含 @h-ai/*，不是业务配置验证。
 * @param cwd - 项目所在目录。
 * @returns 解析后的项目信息，文件缺失或解析失败时为 null。
 * @example 模块内部上下文
 * ```ts
 * const project = await detectProject(process.cwd())
 * if (project && project.isHaiProject) writeCliMessage(project.haiPackages.join(', '))
 * ```
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
