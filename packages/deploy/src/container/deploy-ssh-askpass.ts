/** OpenSSH 的私有 askpass；固定 helper 无密码，凭据只在本次受管理子进程环境中存在。 */
import type { HaiResult } from '@h-ai/core'
import { chmodSync, existsSync, lstatSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import process from 'node:process'
import { err, ok } from '@h-ai/core'
import { deployM } from '../deploy-i18n.js'
import { HaiDeployError } from '../deploy-types.js'
import { runCommand } from './deploy-command.js'

/**
 * 固定 C# 程序仅从环境读取密码，不含编译期或持久化凭据。
 * @example 模块内部上下文
 * ```ts
 * // sourceFile 由调用方在本次私有临时目录中分配；只落盘固定源码。
 * function writeWindowsSource(sourceFile: string): void {
 *   writeFileSync(sourceFile, windowsAskpassSource, { mode: 0o600 })
 * }
 * ```
 */
export const windowsAskpassSource = String.raw`using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading;
public static class HaiDeployAskpass {
  public static int Main(string[] args) {
    if (args.Length >= 2 && args[0] == "--run") return Run(args);
    if (Environment.GetEnvironmentVariable("SSH_ASKPASS_PROMPT") == "confirm") return 1;
    string value = Environment.GetEnvironmentVariable("HAI_DEPLOY_ASKPASS_PASSWORD");
    if (String.IsNullOrEmpty(value) || value.IndexOfAny(new char[] { '\r', '\n', '\0' }) >= 0 || Encoding.UTF8.GetByteCount(value) > 1023) return 1;
    Console.OutputEncoding = new UTF8Encoding(false);
    Console.Out.Write(value);
    Console.Out.Write("\n");
    return 0;
  }
  static string Quote(string value) {
    StringBuilder text = new StringBuilder("\"");
    int slashes = 0;
    foreach (char character in value) {
      if (character == '\\') { slashes++; continue; }
      if (character == '"') { text.Append('\\', slashes * 2 + 1).Append(character); slashes = 0; continue; }
      text.Append('\\', slashes).Append(character); slashes = 0;
    }
    return text.Append('\\', slashes * 2).Append('"').ToString();
  }
  static void Pump(TextReader input, TextWriter output, string secret) {
    char[] buffer = new char[4096];
    StringBuilder pending = new StringBuilder();
    int count;
    while ((count = input.Read(buffer, 0, buffer.Length)) > 0) {
      pending.Append(buffer, 0, count);
      while (pending.Length >= secret.Length) {
        bool matches = true;
        for (int i = 0; i < secret.Length; i++) if (pending[i] != secret[i]) { matches = false; break; }
        if (matches) { output.Write("***"); pending.Remove(0, secret.Length); }
        else { output.Write(pending[0]); pending.Remove(0, 1); }
      }
      output.Flush();
    }
    output.Write(pending.ToString()); output.Flush();
  }
  static int Run(string[] args) {
    try {
      string secret = Environment.GetEnvironmentVariable("HAI_DEPLOY_ASKPASS_PASSWORD");
      if (String.IsNullOrEmpty(secret)) return 1;
      ProcessStartInfo start = new ProcessStartInfo();
      start.FileName = args[1]; start.UseShellExecute = false; start.CreateNoWindow = true;
      start.RedirectStandardOutput = true; start.RedirectStandardError = true;
      start.StandardOutputEncoding = new UTF8Encoding(false); start.StandardErrorEncoding = new UTF8Encoding(false);
      StringBuilder arguments = new StringBuilder();
      for (int i = 2; i < args.Length; i++) { if (i > 2) arguments.Append(' '); arguments.Append(Quote(args[i])); }
      start.Arguments = arguments.ToString();
      using (Process child = Process.Start(start)) {
        Thread stdout = new Thread(() => Pump(child.StandardOutput, Console.Out, secret));
        Thread stderr = new Thread(() => Pump(child.StandardError, Console.Error, secret));
        stdout.Start(); stderr.Start(); child.WaitForExit(); stdout.Join(); stderr.Join(); return child.ExitCode;
      }
    } catch { Console.Error.WriteLine("SSH command failed."); return 1; }
  }
}
`

/**
 * POSIX helper 只输出环境原值；主机信任确认不应由密码代答。
 * @example 模块内部上下文
 * ```ts
 * // helperFile 位于本次私有临时目录；密码由执行时的 child env 提供。
 * function writePosixHelper(helperFile: string): void {
 *   writeFileSync(helperFile, posixAskpassSource, { mode: 0o700 })
 * }
 * ```
 */
export const posixAskpassSource = String.raw`#!/bin/sh
test "\${SSH_ASKPASS_PROMPT:-}" != confirm || exit 1
test -n "\${HAI_DEPLOY_ASKPASS_PASSWORD:-}" || exit 1
printf '%s\n' "$HAI_DEPLOY_ASKPASS_PASSWORD"
`.replaceAll('\\${', '${')

/**
 * Windows PowerShell 5/.NET Framework 编译；不使用不支持原生 ConsoleApplication 的 pwsh。
 * @example 模块内部上下文
 * ```ts
 * // compiler 是系统 Windows PowerShell 5；两个文件路径均由本次私有目录分配。
 * async function compileHelper(compiler: string, sourceFile: string, outputFile: string) {
 *   const compiled = await runCommand(compiler, ['-NoProfile', '-NonInteractive', '-Command', compileAskpassScript], {
 *     env: { HAI_DEPLOY_ASKPASS_SOURCE: sourceFile, HAI_DEPLOY_ASKPASS_OUTPUT: outputFile, HAI_DEPLOY_ASKPASS_PASSWORD: '' },
 *     timeoutMs: 30000,
 *   })
 *   if (!compiled.success) return compiled
 *   return ok(undefined)
 * }
 * ```
 */
export const compileAskpassScript = '$ErrorActionPreference=\'Stop\'; Add-Type -Language CSharp -TypeDefinition ([System.IO.File]::ReadAllText($env:HAI_DEPLOY_ASKPASS_SOURCE, [System.Text.Encoding]::UTF8)) -OutputType ConsoleApplication -OutputAssembly $env:HAI_DEPLOY_ASKPASS_OUTPUT'

/**
 * 本次 helper 的受控环境与清理操作；目录只属于当前命令调用。
 * @example 模块内部上下文
 * ```ts
 * function finishHelper(helper: SshAskpass): HaiResult<void> {
 *   const removed = helper.cleanup()
 *   if (!removed.success) return removed
 *   return ok(undefined)
 * }
 * ```
 */
export interface SshAskpass {
  env: Record<string, string>
  cleanup: () => HaiResult<void>
}

/** 不传播可能包含输入的异常；本地准备失败尚未开始 SSH 远端操作。 */
function helperFailure(key: 'deploy_sshAskpassFailed' | 'deploy_sshAskpassCleanupFailed', reason: 'configuration' | 'timeout' = 'configuration'): HaiResult<never> {
  return err({ ...HaiDeployError.REMOTE_COMMAND_FAILED, message: deployM(key), ext: { commandExecution: { reason, localTermination: 'not-started' } } })
}

/**
 * 为一次命令准备无秘密 helper；准备时间包含在调用者的绝对单调时钟 deadline 内。
 * @param password - 已校验、保持空格和 Unicode 的密码原值。
 * @param deadline - performance.now() 的绝对毫秒期限；Infinity 表示命令没有整体期限。
 * @param terminationTimeoutMs - 原受管理进程树终止核验预算。
 * @returns 固定 helper 环境及清理函数；失败不暴露原异常或降级交互输入。
 * @example 模块内部上下文
 * ```ts
 * async function inspectPreparedHelper(password: string) {
 *   const prepared = await prepareSshAskpass(password, performance.now() + 20000)
 *   if (!prepared.success) return prepared
 *   const askpassMode = prepared.data.env.SSH_ASKPASS_REQUIRE
 *   const removed = prepared.data.cleanup()
 *   if (!removed.success) return removed
 *   return ok(askpassMode)
 * }
 * ```
 */
export async function prepareSshAskpass(password: string, deadline: number, terminationTimeoutMs?: number): Promise<HaiResult<SshAskpass>> {
  let directory: string | undefined
  let temporaryRoot: string | undefined
  const cleanup = (): HaiResult<void> => {
    if (!directory || !existsSync(directory))
      return ok(undefined)
    try {
      if (lstatSync(directory).isSymbolicLink() || dirname(realpathSync(directory)) !== temporaryRoot || !basename(directory).startsWith('hai-ssh-askpass-'))
        return helperFailure('deploy_sshAskpassCleanupFailed')
      rmSync(directory, { recursive: true, force: false })
      return ok(undefined)
    }
    catch { return helperFailure('deploy_sshAskpassCleanupFailed') }
  }
  try {
    temporaryRoot = realpathSync(tmpdir())
    if (deadline <= performance.now())
      return helperFailure('deploy_sshAskpassFailed', 'timeout')
    if (!password || /[\r\n\0]/.test(password) || new TextEncoder().encode(password).length > 1023)
      return helperFailure('deploy_sshAskpassFailed')
    directory = mkdtempSync(join(temporaryRoot, 'hai-ssh-askpass-'))
    chmodSync(directory, 0o700)
    let helper = join(directory, 'askpass.sh')
    if (process.platform === 'win32') {
      helper = join(directory, 'askpass.exe')
      const source = join(directory, 'askpass.cs')
      writeFileSync(source, windowsAskpassSource, { mode: 0o600 })
      const compiler = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      const compiled = await runCommand(compiler, ['-NoProfile', '-NonInteractive', '-Command', compileAskpassScript], {
        env: { HAI_DEPLOY_ASKPASS_SOURCE: source, HAI_DEPLOY_ASKPASS_OUTPUT: helper, HAI_DEPLOY_ASKPASS_PASSWORD: '' },
        timeoutMs: Math.max(1, Math.min(30_000, Math.ceil(deadline - performance.now()))),
        terminationTimeoutMs,
        secrets: [password],
      })
      if (!compiled.success) {
        const removed = cleanup()
        return removed.success ? compiled : removed
      }
      if (!existsSync(helper)) {
        const removed = cleanup()
        return removed.success ? helperFailure('deploy_sshAskpassFailed') : removed
      }
    }
    else {
      writeFileSync(helper, posixAskpassSource, { mode: 0o700 })
    }
    if (deadline <= performance.now()) {
      const removed = cleanup()
      return removed.success ? helperFailure('deploy_sshAskpassFailed', 'timeout') : removed
    }
    return ok({ env: { SSH_ASKPASS: helper, SSH_ASKPASS_REQUIRE: 'force', SSH_ASKPASS_PROMPT: '', DISPLAY: 'hai-deploy:0', HAI_DEPLOY_ASKPASS_PASSWORD: password }, cleanup })
  }
  catch {
    const removed = cleanup()
    return removed.success ? helperFailure('deploy_sshAskpassFailed') : removed
  }
}
