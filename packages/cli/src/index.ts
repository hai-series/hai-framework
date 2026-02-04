/**
 * =============================================================================
 * @hai/cli - 主入口
 * =============================================================================
 * hai Admin Framework CLI
 *
 * 命令:
 *   create <name>  - 创建新项目
 *   generate <type> <name> - 生成代码
 * =============================================================================
 */

import type { CreateProjectOptions, GeneratorType } from './types.js'
import process from 'node:process'
import { core } from '@hai/core'
import { cac } from 'cac'
import chalk from 'chalk'
import { createProject, generate } from './commands/index.js'

// CLI 版本
const VERSION = '0.0.1'

// 创建 CLI
const cli = cac('hai')

// 全局选项
cli.option('-v, --verbose', '显示详细输出')
cli.option('-C, --cwd <path>', '工作目录')

// 创建项目命令
cli
  .command('create [name]', '创建新的 hai 项目')
  .option('-t, --template <template>', '项目模板 (minimal, default, full, custom)')
  .option('-f, --features <features>', '功能列表 (逗号分隔: auth,db,ai,storage,mcp,crypto,skills)')
  .option('--examples', '添加示例代码')
  .option('--no-examples', '不添加示例代码')
  .option('--no-install', '不安装依赖')
  .option('-p, --package-manager <pm>', '包管理器 (pnpm, npm, yarn)')
  .option('--no-git', '不初始化 Git')
  .action(async (name: string | undefined, options: Record<string, unknown>) => {
    try {
      // 解析功能列表
      const features = typeof options.features === 'string'
        ? options.features.split(',').map(f => f.trim()) as CreateProjectOptions['features']
        : undefined

      await createProject({
        name: name ?? '',
        template: options.template as CreateProjectOptions['template'],
        features,
        examples: options.examples as boolean,
        install: options.install as boolean,
        packageManager: options.packageManager as CreateProjectOptions['packageManager'],
        git: options.git as boolean,
        verbose: options.verbose as boolean,
        cwd: options.cwd as string,
      })
    }
    catch {
      process.exit(1)
    }
  })

// 代码生成命令
cli
  .command('generate [type] [name]', '生成代码')
  .alias('g')
  .option('-o, --output <path>', '输出路径')
  .option('-f, --force', '覆盖现有文件')
  .action(async (type: string | undefined, name: string | undefined, options: Record<string, unknown>) => {
    try {
      await generate({
        type: type as GeneratorType,
        name: name ?? '',
        output: options.output as string,
        force: options.force as boolean,
        verbose: options.verbose as boolean,
        cwd: options.cwd as string,
      })
    }
    catch {
      process.exit(1)
    }
  })

// 快捷生成命令
cli
  .command('g:page <name>', '生成页面')
  .action(async (name: string, options: Record<string, unknown>) => {
    await generate({ type: 'page', name, cwd: options.cwd as string })
  })

cli
  .command('g:component <name>', '生成组件')
  .action(async (name: string, options: Record<string, unknown>) => {
    await generate({ type: 'component', name, cwd: options.cwd as string })
  })

cli
  .command('g:api <name>', '生成 API')
  .action(async (name: string, options: Record<string, unknown>) => {
    await generate({ type: 'api', name, cwd: options.cwd as string })
  })

cli
  .command('g:model <name>', '生成数据模型')
  .action(async (name: string, options: Record<string, unknown>) => {
    await generate({ type: 'model', name, cwd: options.cwd as string })
  })

cli
  .command('g:skill <name>', '生成技能')
  .action(async (name: string, options: Record<string, unknown>) => {
    await generate({ type: 'skill', name, cwd: options.cwd as string })
  })

// 版本和帮助
cli.version(VERSION)
cli.help()

// 解析参数
cli.parse()

// 无命令时显示帮助
if (!cli.matchedCommand) {
  core.logger.info('', {})
  core.logger.info(chalk.cyan('hai Admin Framework CLI'))
  core.logger.info('', {})
  cli.outputHelp()
}
