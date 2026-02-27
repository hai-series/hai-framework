/**
 * =============================================================================
 * @h-ai/cli - 部署命令
 * =============================================================================
 *
 * 使用: hai deploy [appDir]
 *
 * 自动化部署流程：
 * 1. 加载凭证（~/.hai/credentials.yml）
 * 2. 读取部署配置（config/_deploy.yml）
 * 3. 扫描应用依赖
 * 4. 开通基础设施（Neon/Upstash/R2/Resend/Aliyun）
 * 5. 构建应用
 * 6. 部署到 Vercel
 *
 * @module commands/deploy
 * =============================================================================
 */

import type { GlobalOptions } from '../types.js'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { core } from '@h-ai/core'
import chalk from 'chalk'
import ora from 'ora'
import { parse } from 'yaml'

/** deploy 命令选项 */
export interface DeployCommandOptions extends GlobalOptions {
  /** 应用目录 */
  appDir?: string
  /** 项目名称（覆盖自动检测） */
  projectName?: string
  /** 跳过基础设施开通 */
  skipProvision?: boolean
  /** 跳过构建 */
  skipBuild?: boolean
}

/**
 * 执行部署命令
 *
 * @param options - 部署选项
 */
export async function deployCommand(options: DeployCommandOptions): Promise<void> {
  const spinner = ora()
  const cwd = options.cwd ?? process.cwd()
  const appDir = resolve(cwd, options.appDir ?? '.')

  try {
    // 动态导入 @h-ai/deploy（允许 CLI 在未安装 deploy 时仍可使用其他命令）
    let deployModule: typeof import('@h-ai/deploy')
    try {
      deployModule = await import('@h-ai/deploy')
    }
    catch {
      core.logger.error(chalk.red('Deploy module not found. Install @h-ai/deploy first:'))
      core.logger.info(chalk.cyan('  pnpm add @h-ai/deploy'))
      return
    }

    const { deploy, loadCredentials, scanApp } = deployModule

    // 1. 加载凭证
    spinner.start('Loading credentials...')
    const credResult = loadCredentials()
    if (!credResult.success) {
      spinner.fail(chalk.red(`Failed to load credentials: ${credResult.error.message}`))
      return
    }
    spinner.succeed(`Loaded ${credResult.data.length} credentials`)

    // 2. 读取部署配置
    spinner.start('Loading deploy config...')
    const configPath = resolve(appDir, 'config', '_deploy.yml')
    if (!existsSync(configPath)) {
      spinner.fail(chalk.red(`Deploy config not found: ${configPath}`))
      core.logger.info(chalk.cyan('  Run: hai add deploy  to generate config template'))
      return
    }

    const configContent = readFileSync(configPath, 'utf-8')
    const rawConfig = interpolateEnvFallback(configContent)
    const deployConfig = parse(rawConfig)
    spinner.succeed('Deploy config loaded')

    // 3. 扫描应用
    spinner.start('Scanning application...')
    const scanResult = await scanApp(appDir)
    if (!scanResult.success) {
      spinner.fail(chalk.red(`Scan failed: ${scanResult.error.message}`))
      return
    }
    const scan = scanResult.data
    spinner.succeed(`Scanned: ${scan.appName} (SvelteKit: ${scan.isSvelteKit}, Services: ${scan.requiredServices.join(', ') || 'none'})`)

    // 4. 初始化 deploy 模块
    spinner.start('Initializing deploy module...')
    const initResult = await deploy.init(deployConfig)
    if (!initResult.success) {
      spinner.fail(chalk.red(`Init failed: ${initResult.error.message}`))
      return
    }
    spinner.succeed('Deploy module initialized')

    // 5. 执行部署
    spinner.start('Deploying application...')
    const deployResult = await deploy.deployApp(appDir, {
      projectName: options.projectName,
      skipProvision: options.skipProvision,
      skipBuild: options.skipBuild,
    })

    if (!deployResult.success) {
      spinner.fail(chalk.red(`Deploy failed: ${deployResult.error.message}`))
      await deploy.close()
      return
    }

    spinner.succeed(chalk.green('Deployment successful!'))
    core.logger.info('')
    core.logger.info(chalk.cyan(`  URL: ${deployResult.data.url}`))
    core.logger.info(chalk.gray(`  ID:  ${deployResult.data.deploymentId}`))
    if (deployResult.data.envVarsSet.length > 0) {
      core.logger.info(chalk.gray(`  Env: ${deployResult.data.envVarsSet.join(', ')}`))
    }
    core.logger.info('')

    await deploy.close()
  }
  catch (error) {
    spinner.fail(chalk.red('Deploy command failed'))
    core.logger.error(error instanceof Error ? error.message : String(error))
    throw error
  }
}

/**
 * 简易环境变量插值（fallback，当 core.config.interpolateEnv 不可用时）
 *
 * @param content - 包含 ${VAR:default} 的字符串
 * @returns 插值后的字符串
 */
function interpolateEnvFallback(content: string): string {
  return content.replace(/\$\{([^:}]+)(?::([^}]*))?\}/g, (_match, key: string, defaultValue?: string) => {
    return process.env[key] ?? defaultValue ?? ''
  })
}
