/**
 * @h-ai/deploy — 命令执行器。
 * command与args分离，不经过shell；流式回调、捕获结果和错误使用相同秘密脱敏边界。
 * @module deploy-command
 */
import type { HaiResult } from '@h-ai/core'
import { spawn } from 'node:child_process'
import process from 'node:process'
import { core, err, ok } from '@h-ai/core'
import { deployM } from '../deploy-i18n.js'
import { HaiDeployError } from '../deploy-types.js'
import { createSecretMasker } from './deploy-secret-masker.js'

const logger = core.logger.child({ module: 'deploy', scope: 'command' })

/**
 * 命令执行选项；secrets必须列出可能输出的已知敏感值。
 * @example const options: CommandOptions = { secrets: ['private-token'], maxCaptureChars: 65536 }
 */
export interface CommandOptions {
  /** 正确UTF-8解码且跨块脱敏的stdout片段；顺序完整，末尾可能延迟至close。 */
  onOutput?: (output: string) => void | Promise<void>
  /** 工作目录。 */
  cwd?: string
  /** 追加环境；不会自动将全部环境值视为秘密。 */
  env?: Record<string, string>
  /** 超时毫秒；超时不代表远程进程已终止。 */
  timeoutMs?: number
  /** 通过stdin传入的内容。 */
  input?: string
  /** 已知敏感字面量；总长度最多1Mi UTF-16单元，超限失败关闭。 */
  secrets?: string[]
  /** 每条捕获流保留的尾部字符上限，默认1Mi，最大16Mi；回调仍接收全部安全stdout。 */
  maxCaptureChars?: number
}

/**
 * 已脱敏的有界命令结果；解析结构化输出前必须拒绝截断结果。
 * @example if (result.stdoutTruncated) return reportIncompleteOutput()
 */
export interface CommandResult {
  /** 实际退出码。 */
  code: number
  /** 已脱敏stdout尾部。 */
  stdout: string
  /** 已脱敏stderr尾部。 */
  stderr: string
  /** stdout是否超过捕获上限。 */
  stdoutTruncated: boolean
  /** stderr是否超过捕获上限。 */
  stderrTruncated: boolean
}

/**
 * 对完整文本进行同样的精确字面量脱敏。
 * @param text - 完整文本
 * @param secrets - 已知秘密
 * @returns 脱敏文本
 * @example maskSecrets('token=private', ['private']) // 'token=***'
 */
export function maskSecrets(text: string, secrets: string[] = []): string {
  const masker = createSecretMasker(secrets)
  return masker.write(text) + masker.end()
}

/**
 * 执行外部命令，捕获与回调在UTF-8解码后以逻辑流为单位脱敏。
 * @param command - 可执行文件名或路径，不使用shell
 * @param args - 独立参数
 * @param options - 超时、输入、已知秘密及安全输出选项
 * @returns 失败返回REMOTE_COMMAND_FAILED；不暴露原始spawn/callback异常cause
 * @example const result = await runCommand('podman', ['version'], { timeoutMs: 30000 })
 */
export async function runCommand(command: string, args: string[], options: CommandOptions = {}): Promise<HaiResult<CommandResult>> {
  try {
    return await new Promise((resolve) => {
      const maxCapture = options.maxCaptureChars ?? 1048576
      if (!Number.isSafeInteger(maxCapture) || maxCapture <= 0 || maxCapture > 16777216)
        throw new RangeError('Invalid command capture limit')
      const secrets = [...(options.secrets ?? [])]
      const safeCommand = maskSecrets(command, secrets)
      const outputMasker = createSecretMasker(secrets)
      const errorMasker = createSecretMasker(secrets)
      const child = spawn(command, args, { windowsHide: true, cwd: options.cwd, env: options.env ? { ...process.env, ...options.env } : process.env, shell: false })
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      let stdout = ''
      let stderr = ''
      let stdoutTruncated = false
      let stderrTruncated = false
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
      /** 所有捕获发生在脱敏后；流尾部状态和捕获长度均有上限。 */
      const publish = async (text: string): Promise<void> => {
        if (!text || settled)
          return
        stdoutTruncated ||= stdout.length + text.length > maxCapture
        stdout = (stdout + text).slice(-maxCapture)
        try {
          await options.onOutput?.(text)
        }
        catch {
          child.kill('SIGKILL')
          finish(err(HaiDeployError.REMOTE_COMMAND_FAILED, deployM('deploy_commandFailed', { params: { command: safeCommand, error: 'Output callback failed' } })))
        }
      }
      const captureError = (text: string): void => {
        stderrTruncated ||= stderr.length + text.length > maxCapture
        stderr = (stderr + text).slice(-maxCapture)
      }
      if (options.timeoutMs && options.timeoutMs > 0) {
        timer = setTimeout(() => {
          child.kill('SIGKILL')
          logger.error('Command timed out', { command: safeCommand, timeoutMs: options.timeoutMs })
          // 异常结束不释放可能尚未完整的秘密尾部，也不再调用onOutput。
          finish(err(HaiDeployError.REMOTE_COMMAND_FAILED, deployM('deploy_commandTimeout', { params: { command: safeCommand } })))
        }, options.timeoutMs)
      }
      // 异步迭代器在等待回调期间保留pipe背压，不创建无限增长的Promise/输出队列。
      const outputTask = (async () => {
        try {
          for await (const chunk of child.stdout as AsyncIterable<unknown>) {
            if (settled)
              return
            if (typeof chunk !== 'string')
              throw new TypeError('Command output must be UTF-8 decoded')
            await publish(outputMasker.write(chunk))
          }
          if (!settled)
            await publish(outputMasker.end())
        }
        catch {
          child.kill('SIGKILL')
          finish(err(HaiDeployError.REMOTE_COMMAND_FAILED, deployM('deploy_commandFailed', { params: { command: safeCommand, error: 'Command output failed' } })))
        }
      })()
      const errorTask = (async () => {
        try {
          for await (const chunk of child.stderr as AsyncIterable<unknown>) {
            if (settled)
              return
            if (typeof chunk !== 'string')
              throw new TypeError('Command error output must be UTF-8 decoded')
            captureError(errorMasker.write(chunk))
          }
          if (!settled)
            captureError(errorMasker.end())
        }
        catch {
          child.kill('SIGKILL')
          finish(err(HaiDeployError.REMOTE_COMMAND_FAILED, deployM('deploy_commandFailed', { params: { command: safeCommand, error: 'Command error output failed' } })))
        }
      })()
      child.stdin.on('error', () => {
        child.kill('SIGKILL')
        finish(err(HaiDeployError.REMOTE_COMMAND_FAILED, deployM('deploy_commandFailed', { params: { command: safeCommand, error: 'Command input failed' } })))
      })
      child.on('error', (error) => {
        const safeError = maskSecrets(error.message, secrets)
        logger.error('Command failed to start', { command: safeCommand, error: safeError })
        finish(err(HaiDeployError.REMOTE_COMMAND_FAILED, deployM('deploy_commandFailed', { params: { command: safeCommand, error: safeError } })))
      })
      child.on('close', async (code) => {
        await Promise.all([outputTask, errorTask])
        if (settled)
          return
        const exitCode = code ?? -1
        if (exitCode === 0) {
          finish(ok({ code: exitCode, stdout, stderr, stdoutTruncated, stderrTruncated }))
          return
        }
        logger.error('Command exited with non-zero code', { command: safeCommand, code: exitCode, stderr: maskSecrets(stderr, secrets).slice(-500), stdout: maskSecrets(stdout, secrets).slice(-3000), stdoutTruncated, stderrTruncated })
        finish(err(HaiDeployError.REMOTE_COMMAND_FAILED, deployM('deploy_commandFailed', { params: { command: safeCommand, error: maskSecrets(`${stdout.slice(-2500)}\n${stderr || `exit ${exitCode}`}`, secrets).slice(-3000) } })))
      })
      if (options.input !== undefined)
        child.stdin.write(options.input)
      child.stdin.end()
    })
  }
  catch {
    // 参数/正则编译/spawn同步错误可能携带原秘密，使用无cause的固定诊断失败关闭。
    return err(HaiDeployError.REMOTE_COMMAND_FAILED, deployM('deploy_commandFailed', { params: { command: '<command>', error: 'Command execution failed' } }))
  }
}
