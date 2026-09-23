/**
 * @h-ai/deploy — 命令执行器
 *
 * 统一封装本地/远程命令调用：command 与 args 分离、支持超时、输出捕获与敏感信息脱敏。
 * 供 docker / podman / ssh / scp 复用，禁止字符串拼接执行以避免命令注入。
 * @module deploy-command
 */

import type { HaiResult } from '@h-ai/core'
import type { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import process from 'node:process'
import { core, err, ok } from '@h-ai/core'
import { deployM } from '../deploy-i18n.js'
import { HaiDeployError } from '../deploy-types.js'

const logger = core.logger.child({ module: 'deploy', scope: 'command' })

/** 命令执行选项 */
export interface CommandOptions {
  /** 工作目录 */
  cwd?: string
  /** 追加的环境变量 */
  env?: Record<string, string>
  /** 超时（毫秒），默认无超时 */
  timeoutMs?: number
  /** 通过 stdin 传入的内容 */
  input?: string
  /** 日志中需要脱敏的敏感片段（如密钥内容） */
  secrets?: string[]
}

/** 命令执行结果 */
export interface CommandResult {
  /** 退出码 */
  code: number
  /** 标准输出 */
  stdout: string
  /** 标准错误 */
  stderr: string
}

/** 将文本中的敏感片段替换为掩码，用于安全日志。 */
export function maskSecrets(text: string, secrets: string[] | undefined): string {
  if (!secrets || secrets.length === 0)
    return text
  let masked = text
  for (const secret of secrets) {
    if (secret && secret.length > 0)
      masked = masked.split(secret).join('***')
  }
  return masked
}

/**
 * 执行外部命令（command + args 分离，不经过 shell）。
 *
 * 非零退出码或超时返回 `REMOTE_COMMAND_FAILED`；进程无法启动返回同码并携带原始错误。
 *
 * @param command - 可执行文件名（docker / podman / ssh / scp）
 * @param args - 参数数组
 * @param options - 执行选项
 * @returns 命令结果（stdout / stderr / code）
 */
export function runCommand(
  command: string,
  args: string[],
  options: CommandOptions = {},
): Promise<HaiResult<CommandResult>> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      shell: false,
    })

    let stdout = ''
    let stderr = ''
    let settled = false
    let timer: NodeJS.Timeout | undefined

    const finish = (result: HaiResult<CommandResult>): void => {
      if (settled)
        return
      settled = true
      if (timer)
        clearTimeout(timer)
      resolve(result)
    }

    if (options.timeoutMs && options.timeoutMs > 0) {
      timer = setTimeout(() => {
        child.kill('SIGKILL')
        logger.error('Command timed out', { command, timeoutMs: options.timeoutMs })
        finish(err(
          HaiDeployError.REMOTE_COMMAND_FAILED,
          deployM('deploy_commandTimeout', { params: { command } }),
        ))
      }, options.timeoutMs)
    }

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf-8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8')
    })

    child.on('error', (error) => {
      logger.error('Command failed to start', { command, error: maskSecrets(String(error), options.secrets) })
      finish(err(
        HaiDeployError.REMOTE_COMMAND_FAILED,
        deployM('deploy_commandFailed', {
          params: { command, error: maskSecrets(error.message, options.secrets) },
        }),
        error,
      ))
    })

    child.on('close', (code) => {
      const exitCode = code ?? -1
      if (exitCode === 0) {
        finish(ok({ code: exitCode, stdout, stderr }))
        return
      }
      logger.error('Command exited with non-zero code', {
        command,
        code: exitCode,
        stderr: maskSecrets(stderr, options.secrets).slice(-500),
      })
      finish(err(
        HaiDeployError.REMOTE_COMMAND_FAILED,
        deployM('deploy_commandFailed', {
          params: { command, error: maskSecrets(stderr || `exit ${exitCode}`, options.secrets).slice(-500) },
        }),
      ))
    })

    if (options.input !== undefined) {
      child.stdin.write(options.input)
      child.stdin.end()
    }
    else {
      // 关闭 stdin，避免子进程（如 ssh）等待输入
      child.stdin.end()
    }
  })
}
