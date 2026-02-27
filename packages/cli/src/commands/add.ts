/**
 * =============================================================================
 * @h-ai/cli - 模块增量添加命令
 * =============================================================================
 * 向现有 hai 项目增量启用模块。
 *
 * 使用: hai add [module]
 * =============================================================================
 */

import type { FeatureId, GlobalOptions } from '../types.js'
import path from 'node:path'
import { core } from '@h-ai/core'
import chalk from 'chalk'
import fse from 'fs-extra'
import ora from 'ora'
import prompts from 'prompts'
import { fileExists, writeFile } from '../utils.js'
import { generateConfigFile } from './config-templates.js'
import { detectProject } from './create.js'

/**
 * add 命令选项
 */
export interface AddModuleOptions extends GlobalOptions {
  /** 要添加的模块 */
  module?: FeatureId
  /** 是否安装依赖 */
  install?: boolean
}

// 可添加的模块与对应包
const MODULE_MAP: Record<string, { packages: string[], deps?: string[], configKey?: string, description: string }> = {
  iam: { packages: ['@h-ai/iam'], deps: ['crypto'], configKey: 'iam', description: '身份与访问管理' },
  db: { packages: ['@h-ai/db'], configKey: 'db', description: '数据库' },
  cache: { packages: ['@h-ai/cache'], configKey: 'cache', description: '缓存' },
  ai: { packages: ['@h-ai/ai'], configKey: 'ai', description: 'AI 集成' },
  storage: { packages: ['@h-ai/storage'], configKey: 'storage', description: '文件存储' },
  crypto: { packages: ['@h-ai/crypto'], description: '加密模块' },
  kit: { packages: ['@h-ai/kit'], description: 'SvelteKit 集成工具' },
  ui: { packages: ['@h-ai/ui'], description: 'UI 组件库' },
  deploy: { packages: ['@h-ai/deploy'], configKey: 'deploy', description: '自动化部署' },
}

/**
 * 增量添加模块到现有项目
 */
export async function addModule(options: AddModuleOptions): Promise<void> {
  const spinner = ora()
  const cwd = options.cwd ?? '.'

  try {
    // 检测项目
    const project = await detectProject(cwd)
    if (!project) {
      core.logger.error(chalk.red('未检测到项目（找不到 package.json）'))
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
        core.logger.info(chalk.green('所有模块已安装！'))
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
      core.logger.error(chalk.red(`未知模块: ${moduleName}`))
      core.logger.info(`可用模块: ${Object.keys(MODULE_MAP).join(', ')}`)
      return
    }

    // 检查是否已安装
    if (moduleDef.packages.every(p => project.haiPackages.includes(p))) {
      core.logger.info(chalk.yellow(`模块 ${moduleName} 已安装`))
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
    for (const pkgName of allPackages) {
      if (!pkg.dependencies[pkgName]) {
        pkg.dependencies[pkgName] = 'workspace:*'
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
        core.logger.info(chalk.gray(`配置文件已存在: config/_${moduleDef.configKey}.yml`))
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
            core.logger.info(chalk.gray(`  + config/_${depDef.configKey}.yml (依赖)`))
          }
        }
      }
    }

    // 生成模块 Skill 文件
    const { generateModuleSkillFile } = await import('./skill-templates.js')
    const skillFile = await generateModuleSkillFile(cwd, moduleName)
    if (skillFile) {
      core.logger.info(chalk.gray(`  + ${skillFile} (AI Skill)`))
    }

    // 安装依赖
    const doInstall = options.install !== false
    if (doInstall) {
      spinner.start('安装依赖...')
      const { execSync } = await import('node:child_process')
      const pm = project.haiPackages.length > 0 ? 'pnpm' : 'pnpm'
      execSync(`${pm} install`, { cwd, stdio: 'ignore' })
      spinner.succeed()
    }

    core.logger.info('')
    core.logger.info(chalk.green(`✔ 模块 ${moduleName} 添加成功！`))
    core.logger.info('')
    core.logger.info('已添加的包:')
    for (const pkg of allPackages) {
      core.logger.info(chalk.cyan(`  ${pkg}`))
    }
    core.logger.info('')
  }
  catch (error) {
    spinner.fail()
    core.logger.error(chalk.red('添加模块失败:'), { error })
    throw error
  }
}
