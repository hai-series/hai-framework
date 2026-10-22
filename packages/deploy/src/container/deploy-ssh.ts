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
import type { CommandOptions, CommandResult } from './deploy-command.js'
import { core, err, ok } from '@h-ai/core'
import { deployM } from '../deploy-i18n.js'
import { getDeployCommandState } from '../deploy-recovery.js'
import { HaiDeployError } from '../deploy-types.js'
import { runCommand } from './deploy-command.js'

const logger = core.logger.child({ module: 'deploy', scope: 'ssh' })

/**
 * SSH 执行器接口
 * 命令通过远端登录 shell 执行；传入的命令文本必须由受信代码构造。远端副作用与本地 SSH 退出状态分开处理。
 * @example 模块内部上下文
 * ```ts
 * const config: SshConfig = { host: 'deploy.example.net', username: 'deploy', port: 22, strictHostKeyChecking: true, connectTimeoutSeconds: 10 }
 * const ssh = createSshExecutor(config)
 * const connected = await ssh.ping()
 * if (!connected.success) throw new Error(connected.error.message)
 * ```
 */
export interface SshExecutor {
  /** 在远程主机执行命令（通过远程登录 shell 运行） */
  exec: (remoteCommand: string, options?: Pick<CommandOptions, 'timeoutMs' | 'terminationTimeoutMs' | 'secrets' | 'maxCaptureChars' | 'onOutput'>) => Promise<HaiResult<CommandResult>>
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
 * @param config - SSH 连接配置
 * @param remoteCommand - 远程命令字符串
 * @returns 交给本地 ssh 可执行文件的参数数组。
 * @example 模块内部上下文
 * ```ts
 * const config: SshConfig = { host: 'deploy.example.net', username: 'deploy', port: 22, strictHostKeyChecking: true, connectTimeoutSeconds: 10 }
 * const args = buildSshExecArgs(config, 'true')
 * // 参数供本地无 shell 的 ssh 进程使用；不是可再次拼接进 shell 的字符串。
 * ```
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
 * 保留参数数组边界；远端路径只使用内部已校验的部署目录。
 * @param config - SSH 连接配置
 * @param localPath - 本地文件路径
 * @param remotePath - 远程目标路径
 * @returns 交给本地 scp 可执行文件的参数数组。
 * @example 模块内部上下文
 * ```ts
 * const config: SshConfig = { host: 'deploy.example.net', username: 'deploy', port: 22, strictHostKeyChecking: true, connectTimeoutSeconds: 10 }
 * const args = buildScpUploadArgs(config, '/workspace/shop/.hai/deploy/shop.tar', '/opt/hai/incoming/shop.tar')
 * ```
 */
export function buildScpUploadArgs(config: SshConfig, localPath: string, remotePath: string): string[] {
  return [
    ...buildConnectOptions(config),
    '-P',
    String(config.port),
    localPath,
    `${config.username}@${config.host.includes(':') ? `[${config.host}]` : config.host}:${remotePath}`,
  ]
}

/**
 * 创建 SSH 执行器。
 * 创建执行器不持有长连接；每次 exec/upload/ping 启动独立受管理本地进程并检查 HaiResult。
 * @param config - SSH 连接配置
 * @returns SSH 执行器实例
 * @example 模块内部上下文
 * ```ts
 * const config: SshConfig = { host: 'deploy.example.net', username: 'deploy', port: 22, strictHostKeyChecking: true, connectTimeoutSeconds: 10 }
 * const ssh = createSshExecutor(config)
 * const connected = await ssh.ping()
 * if (!connected.success) throw new Error(connected.error.message)
 * ```
 */
export function createSshExecutor(config: SshConfig): SshExecutor {
  const exec: SshExecutor['exec'] = async (remoteCommand, options) => {
    const result = await runCommand('ssh', buildSshExecArgs(config, remoteCommand), {
      timeoutMs: options?.timeoutMs,
      terminationTimeoutMs: options?.terminationTimeoutMs,
      maxCaptureChars: options?.maxCaptureChars,
      secrets: options?.secrets,
      onOutput: options?.onOutput,
    })
    if (result.success)
      return result
    const state = getDeployCommandState(result.error)
    // 连接客户端退出并不能证明远端进程结束；只增加安全状态，不暴露远程命令原文。
    return err({ ...result.error, suggestion: deployM('deploy_remoteUnknown'), ext: { ...result.error.ext, commandExecution: { ...state, reason: state?.reason ?? 'exit', localTermination: state?.localTermination ?? 'unknown', remoteExecution: 'unknown' } } })
  }

  const upload: SshExecutor['upload'] = async (localPath, remotePath) => {
    const args = buildScpUploadArgs(config, localPath, remotePath)
    const result = await runCommand('scp', args, { timeoutMs: 600_000 })
    if (!result.success) {
      return err({ ...HaiDeployError.IMAGE_TRANSFER_FAILED, message: deployM('deploy_imageTransferFailed', { params: { error: result.error.message } }), ext: result.error.ext })
    }
    return ok(undefined)
  }

  const ping: SshExecutor['ping'] = async () => {
    logger.debug('SSH preflight', { host: config.host, port: config.port })
    const result = await exec('true', { timeoutMs: 20_000 })
    if (!result.success) {
      return err({ ...HaiDeployError.REMOTE_CONNECT_FAILED, message: deployM('deploy_remoteConnectFailed', { params: { host: config.host, error: result.error.message } }), ext: result.error.ext })
    }
    return ok(undefined)
  }

  return { exec, upload, ping }
}
