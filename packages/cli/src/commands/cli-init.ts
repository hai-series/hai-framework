/**
 * @h-ai/cli — 项目初始化/校验命令
 *
 * 校验现有项目配置完整性，补全缺失的配置文件。
 * @module cli-init
 */

import type { GlobalOptions, ProjectInfo } from '../cli-types.js'
import path from 'node:path'
import chalk from 'chalk'
import ora from 'ora'
import { fileExists, writeCliError, writeCliMessage, writeFile } from '../cli-utils.js'
import { generateConfigFile } from './cli-config-templates.js'
import { detectProject } from './cli-create.js'

/**
 * init 命令选项
 * @example 模块内部上下文
 * ```ts
 * const options: InitOptions = { cwd: '/workspace/shop', force: false } // force=true 会覆盖已有模块 YAML。
 * ```
 */
export interface InitOptions extends GlobalOptions {
  /** 强制重新生成配置 */
  force?: boolean
}

/**
 * 模块到配置文件的映射
 */
const MODULE_CONFIG_MAP: Record<string, { configKey: string, label: string }> = {
  '@h-ai/core': { configKey: 'core', label: 'Core' },
  '@h-ai/serv': { configKey: 'serv', label: 'Service' },
  '@h-ai/reldb': { configKey: 'db', label: 'Database' },
  '@h-ai/cache': { configKey: 'cache', label: 'Cache' },
  '@h-ai/iam': { configKey: 'iam', label: 'IAM' },
  '@h-ai/storage': { configKey: 'storage', label: 'Storage' },
  '@h-ai/ai': { configKey: 'ai', label: 'AI' },
  '@h-ai/vecdb': { configKey: 'vecdb', label: 'VecDB' },
  '@h-ai/reach': { configKey: 'reach', label: 'Reach' },
  '@h-ai/scheduler': { configKey: 'scheduler', label: 'Scheduler' },
  '@h-ai/audit': { configKey: 'audit', label: 'Audit' },
  '@h-ai/payment': { configKey: 'payment', label: 'Payment' },
  '@h-ai/deploy': { configKey: 'deploy', label: 'Deploy' },
}

/**
 * 校验结果
 * 项目包声明与配置文件存在性的检查结果；不表示连接可用或配置已通过模块 Schema。
 * @example 模块内部上下文
 * ```ts
 * const validation: ValidationResult = { existing: ['core'], missing: [{ pkg: '@h-ai/reldb', configKey: 'db', label: 'Database' }], project: { name: 'shop', version: '1.0.0', isHaiProject: true, haiPackages: ['@h-ai/core', '@h-ai/reldb'] } }
 * ```
 */
interface ValidationResult {
  /** 已存在的配置 */
  existing: string[]
  /** 缺失的配置 */
  missing: Array<{ pkg: string, configKey: string, label: string }>
  /** 项目信息 */
  project: ProjectInfo
}

/**
 * 校验项目配置完整性
 */
async function validateProject(cwd: string): Promise<ValidationResult | null> {
  const project = await detectProject(cwd)
  if (!project) {
    return null
  }

  const existing: string[] = []
  const missing: ValidationResult['missing'] = []

  for (const pkg of project.haiPackages) {
    const mapping = MODULE_CONFIG_MAP[pkg]
    if (!mapping)
      continue

    const configPath = path.join(cwd, 'config', `_${mapping.configKey}.yml`)
    if (await fileExists(configPath)) {
      existing.push(mapping.configKey)
    }
    else {
      missing.push({ pkg, configKey: mapping.configKey, label: mapping.label })
    }
  }

  return { existing, missing, project }
}

/**
 * 初始化/校验项目配置
 * force=true 会重新生成已安装模块的配置；文件操作失败抛错，未检测到项目时打印提示并返回。
 * @param options - 命令参数；对应命令的工作目录、非交互与可选功能。
 * @returns 缺失配置补齐或 force 模式覆盖完成。
 * @example 模块内部上下文
 * ```ts
 * // 前提：当前目录已有 hai 项目的 package.json。
 * await initProject({ cwd: process.cwd(), force: false }) // 等价 hai init；只补缺失配置。
 * ```
 */
export async function initProject(options: InitOptions): Promise<void> {
  const spinner = ora()
  const cwd = options.cwd ?? '.'

  try {
    // 检测项目
    spinner.start('检测项目...')
    const result = await validateProject(cwd)

    if (!result) {
      spinner.fail(chalk.red('未检测到项目（找不到 package.json）'))
      return
    }

    const { project, existing, missing } = result
    spinner.succeed(`检测到项目: ${chalk.cyan(project.name)}`)

    // 即使配置齐备，也补全新增 AI 参考资源；已有项目规则与 Skill 不覆盖。
    if (project.isHaiProject) {
      const { generateProjectAiSupport, resolveSkillNamesForPackages } = await import('./cli-skill-templates.js')
      const generatedFiles = await generateProjectAiSupport(cwd, resolveSkillNamesForPackages(project.haiPackages), {
        overwriteSkills: false,
        overwriteBridgeFiles: false,
      })
      for (const generatedFile of generatedFiles) {
        writeCliMessage(chalk.gray(`  + ${generatedFile}`))
      }
    }

    // 显示项目状态
    writeCliMessage('')
    writeCliMessage(chalk.bold('项目状态:'))
    writeCliMessage(`  名称: ${chalk.cyan(project.name)}`)
    writeCliMessage(`  版本: ${project.version}`)
    writeCliMessage(`  已安装模块: ${project.haiPackages.length > 0 ? project.haiPackages.map(p => chalk.cyan(p)).join(', ') : chalk.gray('无')}`)
    writeCliMessage('')

    // 显示配置状态
    if (existing.length > 0) {
      writeCliMessage(chalk.bold('已有配置:'))
      for (const key of existing) {
        writeCliMessage(chalk.green(`  ✔ config/_${key}.yml`))
      }
    }

    // 无缺失配置
    if (missing.length === 0 && !options.force) {
      writeCliMessage('')
      writeCliMessage(chalk.green('✔ 所有配置文件已就绪！'))
      return
    }

    // 补全缺失配置
    if (missing.length > 0) {
      writeCliMessage('')
      writeCliMessage(chalk.bold('缺失配置:'))
      for (const item of missing) {
        writeCliMessage(chalk.yellow(`  ✘ config/_${item.configKey}.yml (${item.label})`))
      }
      writeCliMessage('')

      spinner.start('生成缺失配置文件...')
      let generated = 0
      for (const item of missing) {
        const configPath = path.join(cwd, 'config', `_${item.configKey}.yml`)
        const content = generateConfigFile(item.configKey)
        await writeFile(configPath, content)
        generated++
      }
      spinner.succeed(`已生成 ${generated} 个配置文件`)
    }

    // 强制模式：重新生成所有配置
    if (options.force && existing.length > 0) {
      writeCliMessage('')
      spinner.start('强制重新生成所有配置文件...')
      let regenerated = 0
      for (const pkg of project.haiPackages) {
        const mapping = MODULE_CONFIG_MAP[pkg]
        if (!mapping)
          continue
        const configPath = path.join(cwd, 'config', `_${mapping.configKey}.yml`)
        const content = generateConfigFile(mapping.configKey)
        await writeFile(configPath, content)
        regenerated++
      }
      spinner.succeed(`已重新生成 ${regenerated} 个配置文件`)
    }

    // 检查 core 配置（始终需要）
    const coreConfigPath = path.join(cwd, 'config', '_core.yml')
    if (!(await fileExists(coreConfigPath))) {
      spinner.start('生成核心配置 config/_core.yml...')
      const content = generateConfigFile('core')
      await writeFile(coreConfigPath, content)
      spinner.succeed()
    }

    writeCliMessage('')
    writeCliMessage(chalk.green('✔ 项目配置初始化完成！'))
    writeCliMessage('')
    writeCliMessage(chalk.gray('下一步:'))
    writeCliMessage(chalk.gray('  1. 编辑 config/ 中的配置文件'))
    writeCliMessage(chalk.gray('  2. 运行 pnpm dev 启动开发服务'))
    writeCliMessage('')
  }
  catch (error) {
    spinner.fail()
    writeCliError(chalk.red('初始化失败:'), { error })
    throw error
  }
}
