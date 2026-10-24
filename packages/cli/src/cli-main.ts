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
import { cliM } from './cli-i18n.js'
import { getCliVersion, writeCliMessage } from './cli-utils.js'
import { addModule, buildCommand, createProject, deployCommand, feedbackCommand, generate, initProject } from './commands/cli-commands.js'

// CLI 版本（从 package.json 动态读取，避免硬编码与 npm 发布版本不一致）
const VERSION = getCliVersion()

// 创建 CLI
const cli = cac('hai')

// 全局选项
cli.option('-v, --verbose', cliM('cli_help_verbose'))
cli.option('-C, --cwd <path>', cliM('cli_help_cwd'))

// 创建项目命令
cli
  .command('create [name]', cliM('cli_help_create'))
  .option('--type <type>', cliM('cli_help_appType'))
  .option('--frontends <targets>', cliM('cli_help_frontends'))
  .option('-t, --template <template>', cliM('cli_help_template'))
  .option('-f, --features <features>', cliM('cli_help_features'))
  .option('--examples', cliM('cli_help_examples'))
  .option('--no-examples', cliM('cli_help_noExamples'))
  .option('--no-install', cliM('cli_help_noInstall'))
  .option('--no-deploy', cliM('cli_help_noDeploy'))
  .option('-p, --package-manager <pm>', cliM('cli_help_packageManager'))
  .option('--no-git', cliM('cli_help_noGit'))
  .option('--git-remote <url>', cliM('cli_help_gitRemote'))
  .option('-y, --yes', cliM('cli_help_yes'))
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
        deploy: options.deploy as boolean,
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
  .command('add [module]', cliM('cli_help_add'))
  .option('--no-install', cliM('cli_help_noInstall'))
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
  .command('init', cliM('cli_help_init'))
  .option('-f, --force', cliM('cli_help_forceConfig'))
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
  .command('generate [type] [name]', cliM('cli_help_generate'))
  .option('-w, --workspace <name>', cliM('cli_help_workspace'))
  .alias('g')
  .option('-o, --output <path>', cliM('cli_help_output'))
  .option('-f, --force', cliM('cli_help_force'))
  .action(async (type: string | undefined, name: string | undefined, options: Record<string, unknown>) => {
    try {
      await generate({
        type: type as GeneratorType,
        name: name ?? '',
        output: options.output as string,
        ...(options.workspace ? { workspace: String(options.workspace) } : {}),
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
  .command('build', cliM('cli_help_build'))
  .option('--target <target>', cliM('cli_help_target'))
  .option('--images <names>', cliM('cli_help_images'))
  .option('--runtime <runtime>', cliM('cli_help_buildRuntime'))
  .option('--network <network>', cliM('cli_help_buildNetwork'))
  .option('--platform <platform>', cliM('cli_help_platform'))
  .option('--arch <arch>', cliM('cli_help_arch'))
  .option('--sqlite-prebuild-mirror <url>', cliM('cli_help_sqliteMirror'))
  .option('--no-http-proxy', cliM('cli_help_noHttpProxy'))
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
  .command('deploy [appDir]', cliM('cli_help_deploy'))
  .option('--env <environment>', cliM('cli_help_environment'))
  .option('--env-dir <path>', cliM('cli_help_envDir'))
  .option('-y, --yes', cliM('cli_help_deployYes'))
  .option('--project-name <name>', cliM('cli_help_projectName'))
  .option('--skip-middleware', cliM('cli_help_skipMiddleware'))
  .option('--artifact-dir <path>', cliM('cli_help_artifactDir'))
  .option('--services <names>', cliM('cli_help_services'))
  .option('--build', cliM('cli_help_deployBuild'))
  .option('--network <network>', cliM('cli_help_deployNetwork'))
  .option('--sqlite-prebuild-mirror <url>', cliM('cli_help_deploySqliteMirror'))
  .option('--no-http-proxy', cliM('cli_help_deployNoProxy'))
  .option('--runtime <runtime>', cliM('cli_help_deployRuntime'))
  .option('--bundle-only', cliM('cli_help_bundleOnly'))
  .option('--output <path>', cliM('cli_help_bundleOutput'))
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
        services: options.services as string,
        build: options.build as boolean,
        network: options.network as string,
        sqlitePrebuildMirror: options.sqlitePrebuildMirror as string,
        httpProxy: options.httpProxy as boolean,
        runtime: options.runtime as 'auto' | 'podman' | 'docker',
        bundleOnly: options.bundleOnly as boolean,
        output: options.output as string,
        verbose: options.verbose as boolean,
        cwd: options.cwd as string,
      })
    }
    catch {
      process.exitCode = 1
    }
  })

// 快捷生成命令
cli
  .command('feedback <action> <bundle>', cliM('cli_help_feedback'))
  .option('--page <number>', cliM('cli_feedback_page'))
  .option('--page-size <number>', cliM('cli_feedback_pageSize'))
  .option('--kind <kind>', cliM('cli_feedback_kind'))
  .option('--request-id <id>', cliM('cli_feedback_requestId'))
  .option('--error-id <id>', cliM('cli_feedback_errorId'))
  .option('--from <timestamp>', cliM('cli_feedback_from'))
  .option('--to <timestamp>', cliM('cli_feedback_to'))
  .option('--port <number>', cliM('cli_feedback_port'))
  .action(async (action: string, bundle: string, options: Record<string, unknown>) => {
    try {
      const numberOption = (value: unknown) => value === undefined ? undefined : Number(value)
      await feedbackCommand(action, bundle, {
        cwd: options.cwd as string,
        page: numberOption(options.page),
        pageSize: numberOption(options.pageSize),
        kind: options.kind as string,
        requestId: options.requestId as string,
        errorId: options.errorId as string,
        from: numberOption(options.from),
        to: numberOption(options.to),
        port: numberOption(options.port),
      })
    }
    catch (error) {
      writeCliMessage(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    }
  })

// 快捷生成命令
cli
  .command('g:page <name>', cliM('cli_help_generatePage'))
  .option('-w, --workspace <name>', cliM('cli_help_workspace'))
  .action(async (name: string, options: Record<string, unknown>) => {
    await generate({ type: 'page', name, cwd: options.cwd as string, ...(options.workspace ? { workspace: String(options.workspace) } : {}) })
  })

cli
  .command('g:component <name>', cliM('cli_help_generateComponent'))
  .option('-w, --workspace <name>', cliM('cli_help_workspace'))
  .action(async (name: string, options: Record<string, unknown>) => {
    await generate({ type: 'component', name, cwd: options.cwd as string, ...(options.workspace ? { workspace: String(options.workspace) } : {}) })
  })

cli
  .command('g:api <name>', cliM('cli_help_generateApi'))
  .option('-w, --workspace <name>', cliM('cli_help_workspace'))
  .action(async (name: string, options: Record<string, unknown>) => {
    await generate({ type: 'api', name, cwd: options.cwd as string, ...(options.workspace ? { workspace: String(options.workspace) } : {}) })
  })

cli
  .command('g:model <name>', cliM('cli_help_generateModel'))
  .option('-w, --workspace <name>', cliM('cli_help_workspace'))
  .action(async (name: string, options: Record<string, unknown>) => {
    await generate({ type: 'model', name, cwd: options.cwd as string, ...(options.workspace ? { workspace: String(options.workspace) } : {}) })
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
