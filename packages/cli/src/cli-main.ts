/**
 * @h-ai/cli — 主入口
 *
 * hai Agent Framework CLI
 * @module cli-main
 */

import type { AppType, CreateProjectOptions, FeatureId, FrontendTarget, GeneratorType } from './cli-types.js'
import process from 'node:process'
import { cac } from 'cac'
import chalk from 'chalk'
import { getCliVersion, writeCliMessage } from './cli-utils.js'
import { addModule, buildCommand, createProject, deployCommand, generate, initProject } from './commands/cli-commands.js'

// CLI 版本（从 package.json 动态读取，避免硬编码与 npm 发布版本不一致）
const VERSION = getCliVersion()

// 创建 CLI
const cli = cac('hai')

// 全局选项
cli.option('-v, --verbose', '显示详细输出')
cli.option('-C, --cwd <path>', '工作目录')

// 创建项目命令
cli
  .command('create [name]', '创建新的 hai 项目')
  .option('--type <type>', '应用类型 (admin, website, h5, api, mobile-app, fullstack)')
  .option('--frontends <targets>', '前后端分离工程前端目标 (逗号分隔: web,app,miniapp,desktop)')
  .option('-t, --template <template>', '项目模板 (minimal, default, full, custom)')
  .option('-f, --features <features>', '功能列表 (逗号分隔: iam,db,cache,ai,storage,crypto)')
  .option('--examples', '添加示例代码')
  .option('--no-examples', '不添加示例代码')
  .option('--no-install', '不安装依赖')
  .option('-p, --package-manager <pm>', '包管理器 (pnpm, npm, yarn)')
  .option('--no-git', '不初始化 Git')
  .option('--git-remote <url>', 'Git 远程仓库地址')
  .option('-y, --yes', '使用默认配置，跳过交互')
  .action(async (name: string | undefined, options: Record<string, unknown>) => {
    try {
      // 解析功能列表
      const features = typeof options.features === 'string'
        ? options.features.split(',').map(f => f.trim()) as CreateProjectOptions['features']
        : undefined
      const frontends = typeof options.frontends === 'string'
        ? options.frontends.split(',').map(f => f.trim()).filter(Boolean) as FrontendTarget[]
        : undefined

      await createProject({
        name: name ?? '',
        appType: options.type as AppType,
        frontends,
        template: options.template as CreateProjectOptions['template'],
        features,
        examples: options.examples as boolean,
        install: options.install as boolean,
        packageManager: options.packageManager as CreateProjectOptions['packageManager'],
        git: options.git as boolean,
        gitRemote: options.gitRemote as string,
        yes: options.yes as boolean,
        verbose: options.verbose as boolean,
        cwd: options.cwd as string,
      })
    }
    catch {
      // 保留自然退出，让终端/管道中的失败详情写完。
      process.exitCode = 1
    }
  })

// 增量添加模块
cli
  .command('add [module]', '向现有项目添加模块')
  .option('--no-install', '不安装依赖')
  .action(async (module: string | undefined, options: Record<string, unknown>) => {
    try {
      await addModule({
        module: module as FeatureId,
        install: options.install as boolean,
        verbose: options.verbose as boolean,
        cwd: options.cwd as string,
      })
    }
    catch {
      process.exit(1)
    }
  })

// 初始化/校验配置
cli
  .command('init', '初始化/校验项目配置')
  .option('-f, --force', '强制重新生成配置')
  .action(async (options: Record<string, unknown>) => {
    try {
      await initProject({
        force: options.force as boolean,
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

// 构建与部署分别执行；构建不读取部署环境配置。
cli
  .command('build', '构建源码、Docker 镜像或 Tauri 安装包（不区分部署环境）')
  .option('--target <target>', '产物类型：compile（默认）/ docker / desktop')
  .option('--runtime <runtime>', '本地容器引擎：auto（优先 Podman）/ podman / docker')
  .option('--network <network>', '容器构建网络（默认引擎设置），例如 rootless Podman 的 pasta')
  .option('--platform <platform>', 'Tauri 目标系统：windows / linux / macos（在对应系统构建）')
  .option('--arch <arch>', 'Tauri 目标架构：x64 / arm64')
  .option('--sqlite-prebuild-mirror <url>', 'SQLite 预编译二进制镜像根地址')
  .option('--no-http-proxy', 'Podman 构建不继承本机代理')
  .action(async (options: Parameters<typeof buildCommand>[0]) => {
    try {
      await buildCommand(options)
    }
    catch (error) {
      writeCliMessage(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    }
  })

// 部署命令
cli
  .command('deploy [appDir]', '部署应用到云平台')
  .option('--env <environment>', '部署环境（test / prod 等，必须存在对应环境文件）')
  .option('--env-dir <path>', '环境文件所在目录（默认自动查找）')
  .option('-y, --yes', '按当前后端默认配置部署，目标环境已有完整配置时保持不变')
  .option('--project-name <name>', '项目名称（默认服务包名，缺失时为目录名；附加环境后缀）')
  .option('--skip-middleware', '配置已完备，跳过全部中间件处理，直接部署')
  .option('--artifact-dir <path>', '已有镜像构建产物目录（含 manifest.json）')
  .option('--bundle-only', '只生成 Compose 部署 tar，手工搬运；不连接 SSH')
  .option('--output <path>', '部署 tar 输出路径，自动补应用版本后缀')
  .action(async (appDir: string | undefined, options: Record<string, unknown>) => {
    try {
      await deployCommand({
        appDir,
        env: options.env as string,
        envDir: options.envDir as string,
        yes: options.yes as boolean,
        projectName: options.projectName as string,
        skipMiddleware: options.skipMiddleware as boolean,
        artifactDir: options.artifactDir as string,
        bundleOnly: options.bundleOnly as boolean,
        output: options.output as string,
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

// 版本和帮助
cli.version(VERSION, '-V, --version')
cli.help()

// 解析参数
const parsed = cli.parse()

// 无命令且未请求帮助/版本时显示帮助
if (!cli.matchedCommand && !parsed.options.help && !parsed.options.version) {
  writeCliMessage('')
  writeCliMessage(chalk.cyan('hai Agent Framework CLI'))
  writeCliMessage('')
  cli.outputHelp()
}
