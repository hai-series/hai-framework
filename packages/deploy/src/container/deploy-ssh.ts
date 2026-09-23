/**
 * @h-ai/deploy — SSH 执行器
 *
 * 基于用户机器已有的 OpenSSH 客户端（ssh / scp）封装远程命令执行与文件上传。
 * 复用 ~/.ssh/config、ssh-agent 与 OpenSSH 证书，避免引入 Node SSH SDK 的密钥兼容问题。
 * 所有调用均以 command + args 数组构造，禁止字符串拼接，防止命令注入。
 * @module deploy-ssh
 */

import type { HaiResult } from '@h-ai/core'
import type { SshConfig } from '../deploy-config.js'
import type { CommandResult } from './deploy-command.js'
import { core, err, ok } from '@h-ai/core'
import { deployM } from '../deploy-i18n.js'
import { HaiDeployError } from '../deploy-types.js'
import { runCommand } from './deploy-command.js'

const logger = core.logger.child({ module: 'deploy', scope: 'ssh' })

/** SSH 执行器接口 */
export interface SshExecutor {
  /** 在远程主机执行命令（通过远程登录 shell 运行） */
  exec: (remoteCommand: string, options?: { timeoutMs?: number, secrets?: string[] }) => Promise<HaiResult<CommandResult>>
  /** 上传本地文件到远程路径 */
  upload: (localPath: string, remotePath: string) => Promise<HaiResult<void>>
  /** 远程连通性预检（执行 true 命令） */
  ping: () => Promise<HaiResult<void>>
}

/** 构造 ssh 公共连接选项。 */
function buildConnectOptions(config: SshConfig): string[] {
  const args: string[] = ['-o', 'BatchMode=yes']
  args.push('-o', `ConnectTimeout=${config.connectTimeoutSeconds}`)
  args.push('-o', `StrictHostKeyChecking=${config.strictHostKeyChecking ? 'accept-new' : 'no'}`)
  if (config.knownHostsFile)
    args.push('-o', `UserKnownHostsFile=${config.knownHostsFile}`)
  if (config.identityFile) {
    args.push('-i', config.identityFile)
    args.push('-o', 'IdentitiesOnly=yes')
  }
  return args
}

/**
 * 构造 ssh 执行命令的参数数组。
 *
 * remoteCommand 作为单个参数传入，不经过本地 shell 解析，避免本地命令注入。
 *
 * @param config - SSH 连接配置
 * @param remoteCommand - 远程命令字符串
 */
export function buildSshExecArgs(config: SshConfig, remoteCommand: string): string[] {
  return [
    ...buildConnectOptions(config),
    '-p',
    String(config.port),
    `${config.username}@${config.host}`,
    remoteCommand,
  ]
}

/**
 * 构造 scp 上传命令的参数数组。
 *
 * @param config - SSH 连接配置
 * @param localPath - 本地文件路径
 * @param remotePath - 远程目标路径
 */
export function buildScpUploadArgs(config: SshConfig, localPath: string, remotePath: string): string[] {
  return [
    ...buildConnectOptions(config),
    '-P',
    String(config.port),
    localPath,
    `${config.username}@${config.host}:${remotePath}`,
  ]
}

/**
 * 创建 SSH 执行器。
 *
 * @param config - SSH 连接配置
 * @returns SSH 执行器实例
 */
export function createSshExecutor(config: SshConfig): SshExecutor {
  const exec: SshExecutor['exec'] = async (remoteCommand, options) => {
    // runCommand 失败时已返回 REMOTE_COMMAND_FAILED（含 ssh stderr），无需重复包装
    return runCommand('ssh', buildSshExecArgs(config, remoteCommand), {
      timeoutMs: options?.timeoutMs,
      secrets: options?.secrets,
    })
  }

  const upload: SshExecutor['upload'] = async (localPath, remotePath) => {
    const args = buildScpUploadArgs(config, localPath, remotePath)
    const result = await runCommand('scp', args, {})
    if (!result.success) {
      return err(
        HaiDeployError.IMAGE_TRANSFER_FAILED,
        deployM('deploy_imageTransferFailed', { params: { error: result.error.message } }),
        result.error,
      )
    }
    return ok(undefined)
  }

  const ping: SshExecutor['ping'] = async () => {
    logger.debug('SSH preflight', { host: config.host, port: config.port })
    const result = await exec('true', { timeoutMs: 20_000 })
    if (!result.success) {
      return err(
        HaiDeployError.REMOTE_CONNECT_FAILED,
        deployM('deploy_remoteConnectFailed', { params: { host: config.host, error: result.error.message } }),
        result.error,
      )
    }
    return ok(undefined)
  }

  return { exec, upload, ping }
}
