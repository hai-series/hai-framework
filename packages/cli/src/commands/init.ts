/**
 * =============================================================================
 * @hai/cli - 项目初始化/校验命令
 * =============================================================================
 * 校验现有项目配置完整性，补全缺失的配置文件。
 *
 * 使用: hai init
 * =============================================================================
 */

import type { GlobalOptions, ProjectInfo } from '../types.js'
import path from 'node:path'
import { core } from '@hai/core'
import chalk from 'chalk'
import ora from 'ora'
import { fileExists, writeFile } from '../utils.js'
import { generateConfigFile } from './config-templates.js'
import { detectProject } from './create.js'

/**
 * init 命令选项
 */
export interface InitOptions extends GlobalOptions {
  /** 强制重新生成配置 */
  force?: boolean
}

/**
 * 模块到配置文件的映射
 */
const MODULE_CONFIG_MAP: Record<string, { configKey: string, label: string }> = {
  '@hai/core': { configKey: 'core', label: 'Core' },
  '@hai/db': { configKey: 'db', label: 'Database' },
  '@hai/cache': { configKey: 'cache', label: 'Cache' },
  '@hai/iam': { configKey: 'iam', label: 'IAM' },
  '@hai/storage': { configKey: 'storage', label: 'Storage' },
  '@hai/ai': { configKey: 'ai', label: 'AI' },
}

/**
 * 校验结果
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

    // 显示项目状态
    core.logger.info('')
    core.logger.info(chalk.bold('项目状态:'))
    core.logger.info(`  名称: ${chalk.cyan(project.name)}`)
    core.logger.info(`  版本: ${project.version}`)
    core.logger.info(`  已安装模块: ${project.haiPackages.length > 0 ? project.haiPackages.map(p => chalk.cyan(p)).join(', ') : chalk.gray('无')}`)
    core.logger.info('')

    // 显示配置状态
    if (existing.length > 0) {
      core.logger.info(chalk.bold('已有配置:'))
      for (const key of existing) {
        core.logger.info(chalk.green(`  ✔ config/_${key}.yml`))
      }
    }

    // 无缺失配置
    if (missing.length === 0 && !options.force) {
      core.logger.info('')
      core.logger.info(chalk.green('✔ 所有配置文件已就绪！'))
      return
    }

    // 补全缺失配置
    if (missing.length > 0) {
      core.logger.info('')
      core.logger.info(chalk.bold('缺失配置:'))
      for (const item of missing) {
        core.logger.info(chalk.yellow(`  ✘ config/_${item.configKey}.yml (${item.label})`))
      }
      core.logger.info('')

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
      core.logger.info('')
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

    core.logger.info('')
    core.logger.info(chalk.green('✔ 项目配置初始化完成！'))
    core.logger.info('')
    core.logger.info(chalk.gray('下一步:'))
    core.logger.info(chalk.gray('  1. 编辑 config/ 中的配置文件'))
    core.logger.info(chalk.gray('  2. 运行 pnpm dev 启动开发服务'))
    core.logger.info('')
  }
  catch (error) {
    spinner.fail()
    core.logger.error(chalk.red('初始化失败:'), { error })
    throw error
  }
}
