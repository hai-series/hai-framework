/**
 * @h-ai/cli — 模块增量添加命令
 *
 * 向现有 hai 项目增量启用模块。
 * @module cli-add
 */

import type { FeatureId, GlobalOptions } from '../cli-types.js'
import path from 'node:path'
import { parseEnv } from 'node:util'
import chalk from 'chalk'
import fse from 'fs-extra'
import ora from 'ora'
import prompts from 'prompts'
import { detectPackageManager, fileExists, getCliVersion, writeCliError, writeCliMessage, writeFile } from '../cli-utils.js'
import { generateConfigFile, generateProductionEnvironment } from './cli-config-templates.js'
import { detectProject } from './cli-create.js'

/**
 * add 命令选项
 * 省略 module 时交互选择；install=false 只写项目依赖/配置与支持文件，不安装依赖。
 * @example 模块内部上下文
 * ```ts
 * const options: AddModuleOptions = { cwd: '/workspace/shop', module: 'ai', install: false }
 * ```
 */
export interface AddModuleOptions extends GlobalOptions {
  /** 要添加的模块 */
  module?: FeatureId
  /** 是否安装依赖 */
  install?: boolean
}

// 可添加的模块与对应包
const MODULE_MAP: Record<string, { packages: string[], deps?: string[], configKey?: string, description: string }> = {
  // iam 依赖 crypto（password hash）/ db（user 存储）/ cache（session 缓存）
  'iam': { packages: ['@h-ai/iam'], deps: ['crypto', 'db', 'cache'], configKey: 'iam', description: '身份与访问管理' },
  // 'db' 和 'reldb' 都映射到 @h-ai/reldb，兼容用户习惯（hai add db 和 hai add reldb 均可）
  'db': { packages: ['@h-ai/reldb'], configKey: 'db', description: '数据库' },
  'reldb': { packages: ['@h-ai/reldb'], configKey: 'db', description: '数据库' },
  'cache': { packages: ['@h-ai/cache'], configKey: 'cache', description: '缓存' },
  'ai': { packages: ['@h-ai/ai'], deps: ['db', 'vecdb'], configKey: 'ai', description: 'AI 集成' },
  'storage': { packages: ['@h-ai/storage'], configKey: 'storage', description: '文件存储' },
  'crypto': { packages: ['@h-ai/crypto'], deps: ['db'], description: '加密模块' },
  'kit': { packages: ['@h-ai/kit'], description: 'SvelteKit 集成工具' },
  'ui': { packages: ['@h-ai/ui'], description: 'UI 组件库' },
  'deploy': { packages: ['@h-ai/deploy'], configKey: 'deploy', description: '自动化部署' },
  'vecdb': { packages: ['@h-ai/vecdb'], configKey: 'vecdb', description: '向量数据库' },
  'datapipe': { packages: ['@h-ai/datapipe'], description: '数据处理管道' },
  'reach': { packages: ['@h-ai/reach'], configKey: 'reach', description: '消息推送' },
  'scheduler': { packages: ['@h-ai/scheduler'], deps: ['db'], configKey: 'scheduler', description: '任务调度' },
  'audit': { packages: ['@h-ai/audit'], deps: ['db'], configKey: 'audit', description: '审计日志' },
  'payment': { packages: ['@h-ai/payment'], configKey: 'payment', description: '支付' },
  'capacitor': { packages: ['@h-ai/capacitor'], description: '移动端能力' },
  'api-client': { packages: ['@h-ai/api-client'], description: 'HTTP 客户端' },
}

/**
 * 增量添加模块到现有项目
 * 写入失败与安装失败会抛出异常；未检测到项目、未知或已安装模块等分支打印诊断后返回。
 * @param options - 命令参数；对应命令的工作目录、非交互与可选功能。
 * @returns 依赖/配置与支持文件处理结束；部分诊断分支打印提示后直接返回。
 * @example 模块内部上下文
 * ```ts
 * // 前提：当前目录是要修改的现有 hai 项目。
 * await addModule({ cwd: process.cwd(), module: 'ai', install: false })
 * // 然后自行安装依赖，并在应用启动链路初始化新增模块；此命令不修改业务启动代码。
 * ```
 */
export async function addModule(options: AddModuleOptions): Promise<void> {
  const spinner = ora()
  const cwd = options.cwd ?? '.'

  try {
    // 检测项目
    const project = await detectProject(cwd)
    if (!project) {
      writeCliError(chalk.red('未检测到项目（找不到 package.json）'))
      return
    }

    // 交互式选择模块
    let moduleName = options.module
    if (!moduleName) {
      // 过滤已安装的模块
      const installed = new Set(project.haiPackages)
      const choices = Object.entries(MODULE_MAP)
        .filter(([, def]) => !def.packages.every(p => installed.has(p)))
        .map(([key, def]) => ({
          title: `${chalk.bold(key.padEnd(10))} ${chalk.gray(def.description)}`,
          value: key,
        }))

      if (choices.length === 0) {
        writeCliMessage(chalk.green('所有模块已安装！'))
        return
      }

      const { selected } = await prompts({
        type: 'select',
        name: 'selected',
        message: '选择要添加的模块:',
        choices,
      })

      if (!selected)
        return
      moduleName = selected as FeatureId
    }

    const moduleDef = MODULE_MAP[moduleName]
    if (!moduleDef) {
      writeCliError(chalk.red(`未知模块: ${moduleName}`))
      writeCliMessage(`可用模块: ${Object.keys(MODULE_MAP).join(', ')}`)
      return
    }

    const { generateProjectAiSupport, resolveSkillNamesForPackages } = await import('./cli-skill-templates.js')

    // 检查是否已安装
    if (moduleDef.packages.every(p => project.haiPackages.includes(p))) {
      const generatedFiles = await generateProjectAiSupport(
        cwd,
        resolveSkillNamesForPackages(project.haiPackages),
        {
          overwriteSkills: false,
          overwriteBridgeFiles: false,
        },
      )
      if (generatedFiles.length > 0) {
        writeCliMessage(chalk.yellow(`模块 ${moduleName} 已安装，已补全 AI 支持文件`))
        for (const generatedFile of generatedFiles) {
          writeCliMessage(chalk.gray(`  + ${generatedFile} (AI support)`))
        }
      }
      else {
        writeCliMessage(chalk.yellow(`模块 ${moduleName} 已安装`))
      }
      return
    }

    // 收集所有需要安装的包（含依赖模块）
    const allPackages = new Set(moduleDef.packages)
    if (moduleDef.deps) {
      for (const dep of moduleDef.deps) {
        const depDef = MODULE_MAP[dep]
        if (depDef) {
          for (const pkg of depDef.packages) {
            allPackages.add(pkg)
          }
        }
      }
    }

    // 更新 package.json
    spinner.start('更新 package.json...')
    const pkgPath = path.join(cwd, 'package.json')
    const pkg = await fse.readJson(pkgPath)
    if (!pkg.dependencies)
      pkg.dependencies = {}

    const existingHaiSpecifier = Object.entries(pkg.dependencies as Record<string, string>)
      .find(([pkgName]) => pkgName.startsWith('@h-ai/'))?.[1]

    // 已存在的 @h-ai/* 依赖若使用 catalog:，新增模块保持一致；否则固定当前 CLI 对应版本。
    const depVersion = existingHaiSpecifier === 'catalog:' ? 'catalog:' : getCliVersion()

    for (const pkgName of allPackages) {
      if (pkgName === '@h-ai/deploy') {
        pkg.devDependencies ??= {}
        pkg.devDependencies[pkgName] ??= depVersion
      }
      else if (!pkg.dependencies[pkgName]) {
        pkg.dependencies[pkgName] = depVersion
      }
    }
    await fse.writeJson(pkgPath, pkg, { spaces: 2 })
    spinner.succeed()

    // 生成配置文件
    if (moduleDef.configKey) {
      const configDir = path.join(cwd, 'config')
      const configPath = path.join(configDir, `_${moduleDef.configKey}.yml`)
      if (!(await fileExists(configPath))) {
        spinner.start(`生成配置文件 config/_${moduleDef.configKey}.yml...`)
        const content = generateConfigFile(moduleDef.configKey)
        await writeFile(configPath, content)
        spinner.succeed()
      }
      else {
        writeCliMessage(chalk.gray(`配置文件已存在: config/_${moduleDef.configKey}.yml`))
      }
    }

    // 生成依赖模块的配置文件
    if (moduleDef.deps) {
      for (const dep of moduleDef.deps) {
        const depDef = MODULE_MAP[dep]
        if (depDef?.configKey) {
          const depConfigPath = path.join(cwd, 'config', `_${depDef.configKey}.yml`)
          if (!(await fileExists(depConfigPath))) {
            const content = generateConfigFile(depDef.configKey)
            await writeFile(depConfigPath, content)
            writeCliMessage(chalk.gray(`  + config/_${depDef.configKey}.yml (依赖)`))
          }
        }
      }
    }

    const skillPackages = [...project.haiPackages, ...allPackages]
    const generatedFiles = await generateProjectAiSupport(
      cwd,
      resolveSkillNamesForPackages(skillPackages),
      {
        overwriteSkills: false,
        overwriteBridgeFiles: false,
      },
    )
    if (generatedFiles.length > 0) {
      for (const generatedFile of generatedFiles) {
        writeCliMessage(chalk.gray(`  + ${generatedFile} (AI support)`))
      }
    }

    // 安装依赖
    const productionPath = path.join(cwd, '.env.prod')
    const previousProduction = await fileExists(productionPath) ? await fse.readFile(productionPath, 'utf8') : ''
    const configured = new Set([...previousProduction.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map(match => match[1]))
    const previousValues = parseEnv(previousProduction)
    const production = generateProductionEnvironment([moduleName, ...(moduleDef.deps ?? [])] as FeatureId[], previousValues.HAI_DB_TYPE === 'mysql' ? { db: { type: 'mysql', database: previousValues.HAI_DB_DATABASE } } : undefined)
      .split('\n')
      .filter(line => !/^[A-Z][A-Z0-9_]*=/.test(line) || !configured.has(line.split('=')[0]))
    await writeFile(productionPath, `${previousProduction.trimEnd()}\n\n${production.join('\n')}`)

    const doInstall = options.install !== false
    if (doInstall) {
      spinner.start('安装依赖...')
      const { execSync } = await import('node:child_process')
      const pm = await detectPackageManager(cwd)
      execSync(`${pm} install`, { cwd, stdio: 'ignore' })
      spinner.succeed()
    }

    writeCliMessage('')
    writeCliMessage(chalk.green(`✔ 模块 ${moduleName} 添加成功！`))
    writeCliMessage('')
    writeCliMessage('已添加的包:')
    for (const pkg of allPackages) {
      writeCliMessage(chalk.cyan(`  ${pkg}`))
    }
    writeCliMessage('')
  }
  catch (error) {
    spinner.fail()
    writeCliError(chalk.red('添加模块失败:'), { error })
    throw error
  }
}
