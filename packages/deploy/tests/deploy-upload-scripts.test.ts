import { Buffer } from 'node:buffer'
import { spawn, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, delimiter, dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { windowsTestCommand } from '../../../scripts/test-command-windows.js'
import { createUploadScripts, shellArgument } from '../src/container/deploy-scripts.js'
import { deployM } from '../src/deploy-i18n.js'

const temporary: string[] = []
const shell = process.platform === 'win32' ? 'C:/Program Files/Git/usr/bin/bash.exe' : '/bin/sh'
const powershell = process.platform === 'win32' ? 'powershell.exe' : 'pwsh'
const hasPowerShell = spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', 'exit 0'], { windowsHide: true }).status === 0
const hasPwsh = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', 'exit 0'], { windowsHide: true }).status === 0
let nativeTools: string | undefined
type Script = 'sh' | 'ps1'

afterEach(() => {
  for (const directory of temporary.splice(0))
    removeFixture(directory)
})

afterAll(() => {
  if (nativeTools)
    removeFixture(nativeTools)
})

/** 仅回收本文件 mkdtemp 创建的目录；Windows 原生 EXE 映射释放允许有界重试。 */
function removeFixture(directory: string): void {
  const target = resolve(directory)
  expect(dirname(target)).toBe(resolve(tmpdir()))
  expect(basename(target)).toMatch(/^hai-upload-(?:script|native)-[a-z0-9]{6}$/i)
  rmSync(target, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 })
}

/** 原生 EXE 记录进程实际收到的参数，覆盖 PowerShell 5 到 Win32 命令行的编码边界。 */
function createNativeCapture(): string {
  if (nativeTools)
    return join(nativeTools, 'ssh.exe')
  nativeTools = mkdtempSync(join(tmpdir(), 'hai-upload-native-'))
  const executable = join(nativeTools, 'ssh.exe')
  const source = join(nativeTools, 'Capture.cs')
  writeFileSync(source, String.raw`using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading;
public static class Capture {
  public static int Main(string[] args) {
    Console.OutputEncoding = new UTF8Encoding(false);
    string command = Path.GetFileNameWithoutExtension(Environment.GetCommandLineArgs()[0]);
    StringBuilder line = new StringBuilder("native");
    line.Append('\t').Append(command);
    foreach (string argument in args) {
      line.Append('\t').Append(Convert.ToBase64String(Encoding.UTF8.GetBytes(argument)));
    }
    line.Append('\n');
    File.AppendAllText(Environment.GetEnvironmentVariable("HAI_TEST_COMMANDS"), line.ToString(), new UTF8Encoding(false));
    if (Environment.GetEnvironmentVariable("HAI_TEST_EXPECTED_PASSWORD") != null) {
      string helper = Environment.GetEnvironmentVariable("SSH_ASKPASS");
      ProcessStartInfo start = new ProcessStartInfo(helper);
      start.UseShellExecute = false; start.RedirectStandardOutput = true; start.RedirectStandardError = true;
      start.StandardOutputEncoding = new UTF8Encoding(false);
      using (Process child = Process.Start(start)) {
        string password = child.StandardOutput.ReadToEnd().TrimEnd('\r', '\n'); child.WaitForExit();
        if (child.ExitCode != 0 || password != Environment.GetEnvironmentVariable("HAI_TEST_EXPECTED_PASSWORD")) return 8;
        File.AppendAllText(Environment.GetEnvironmentVariable("HAI_TEST_AUTH"), helper + "\n", new UTF8Encoding(false));
        Console.Out.Write(password); Console.Error.Write(password);
      }
    }
    if (command == "scp" && (args.Length < 2 || !File.Exists(args[args.Length - 2]))) {
      Console.Error.WriteLine("Local archive missing from native process directory: " + Directory.GetCurrentDirectory());
      return 9;
    }
    if (Environment.GetEnvironmentVariable("HAI_TEST_SLOW_UPLOAD") == "1") {
      if (command == "scp") Thread.Sleep(3200);
      else if (args.Length > 0 && args[args.Length - 1].StartsWith("wc -c < ")) Console.Out.WriteLine("6");
    }
    Console.Error.WriteLine("native command diagnostic");
    if (args.Length > 0 && args[args.Length - 1].Contains(".contents/apply.sh") && Environment.GetEnvironmentVariable("HAI_TEST_APPLY_EXIT") != null) return int.Parse(Environment.GetEnvironmentVariable("HAI_TEST_APPLY_EXIT"));
    int exitCode;
    return int.TryParse(Environment.GetEnvironmentVariable("HAI_TEST_COMMAND_EXIT"), out exitCode) ? exitCode : 0;
  }
}
`)
  const compiled = spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', '$ErrorActionPreference = \'Stop\'; Add-Type -Language CSharp -TypeDefinition (Get-Content -LiteralPath $env:HAI_TEST_NATIVE_SOURCE -Raw -Encoding UTF8) -OutputType ConsoleApplication -OutputAssembly $env:HAI_TEST_NATIVE_OUTPUT'], {
    env: { ...process.env, HAI_TEST_NATIVE_SOURCE: source, HAI_TEST_NATIVE_OUTPUT: executable },
    encoding: 'utf8',
    windowsHide: true,
  })
  expect(compiled.error).toBeUndefined()
  expect(compiled.status, `${compiled.stdout}\n${compiled.stderr}`).toBe(0)
  return executable
}

/** 在可移动的交付目录中真实执行上传入口，仅用替身记录 SSH/SCP 的参数。 */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'hai-upload-script-'))
  temporary.push(root)
  const generated = join(root, 'generated')
  const scripts = generated
  const bin = join(root, 'bin')
  const unrelated = join(root, 'unrelated cwd')
  mkdirSync(scripts, { recursive: true })
  mkdirSync(bin)
  mkdirSync(unrelated)
  const upload = createUploadScripts()
  writeFileSync(join(scripts, 'deploy.sh'), upload.sh)
  writeFileSync(join(scripts, 'deploy.ps1'), upload.ps1)
  writeFileSync(join(scripts, 'read-target.awk'), upload.reader)
  writeFileSync(join(scripts, 'deploy-target.json'), JSON.stringify({ host: 'SERVER_HOST' }))
  const target = {
    host: 'edited.example.test',
    port: 2207,
    username: 'operator',
    identityFile: 'C:\\部署 密钥\\key 🔑 "quoted".pem',
    knownHostsFile: 'C:\\部署 配置\\known "quoted" hosts',
    strictHostKeyChecking: false,
    connectTimeoutSeconds: 37,
    directory: '/srv/hai apps/customer-prod',
    bundle: 'edited-release-1.0.0.tar',
    _comments: { host: 'SERVER_HOST is only an example', nested: { port: 9999, note: '中文说明 "保留" \\ 路径', optional: null } },
  }
  // 创建脚本后再修改 JSON，确保两个入口没有保留生成时的连接快照。
  writeFileSync(join(scripts, 'deploy-target.json'), `${JSON.stringify(target, null, 2)}\n`)
  writeFileSync(join(generated, target.bundle), 'test archive')
  const parent = join(root, 'moved package 中文')
  renameSync(generated, parent)
  const directory = parent
  const log = join(root, 'commands.log')
  const authLog = join(root, 'auth.log')
  for (const command of ['ssh', 'scp']) {
    writeFileSync(join(bin, command), `#!/bin/sh\nprintf '%s\\0' '${command}' "$@" >> "$HAI_TEST_COMMANDS"\nprintf '\\n' >> "$HAI_TEST_COMMANDS"\nif [ -n "\${HAI_TEST_EXPECTED_PASSWORD+x}" ]; then\n password=$("$SSH_ASKPASS") || exit 8\n test "$password" = "$HAI_TEST_EXPECTED_PASSWORD" || exit 8\n printf '%s\\n' "$SSH_ASKPASS" >> "$HAI_TEST_AUTH"\n printf '%s' "$password"\n printf '%s' "$password" >&2\nfi\nif [ "\${HAI_TEST_SLOW_UPLOAD:-}" = 1 ]; then\n if [ '${command}' = scp ]; then sleep 3.2; else case "$*" in *'wc -c < '*) printf '6\\n';; esac; fi\nfi\nprintf 'native command diagnostic\\n' >&2\nif [ -n \"\${HAI_TEST_APPLY_EXIT:-}\" ]; then case \"$*\" in *'.contents/apply.sh'*) exit \"$HAI_TEST_APPLY_EXIT\";; esac; fi\nexit "\${HAI_TEST_COMMAND_EXIT:-0}"\n`, { mode: 0o700 })
  }
  if (process.platform === 'win32' && hasPowerShell) {
    const executable = createNativeCapture()
    for (const command of ['ssh', 'scp'])
      copyFileSync(executable, join(bin, `${command}.exe`))
  }
  const wrapper = join(root, 'invoke.ps1')
  const functions = process.platform === 'win32'
    ? ''
    : String.raw`
function global:ssh {
  $line = ConvertTo-Json -InputObject (@('ssh') + @($args)) -Compress
  [System.IO.File]::AppendAllText($env:HAI_TEST_COMMANDS, $line + [Environment]::NewLine)
  $global:LASTEXITCODE = if ($env:HAI_TEST_APPLY_EXIT -and $args[-1] -match '\.contents/apply\.sh') { [int]$env:HAI_TEST_APPLY_EXIT } elseif ($env:HAI_TEST_COMMAND_EXIT) { [int]$env:HAI_TEST_COMMAND_EXIT } else { 0 }
}
function global:scp {
  $line = ConvertTo-Json -InputObject (@('scp') + @($args)) -Compress
  [System.IO.File]::AppendAllText($env:HAI_TEST_COMMANDS, $line + [Environment]::NewLine)
  $global:LASTEXITCODE = if ($env:HAI_TEST_COMMAND_EXIT) { [int]$env:HAI_TEST_COMMAND_EXIT } else { 0 }
}
`
  writeFileSync(wrapper, `$ErrorActionPreference = 'Stop'\n${functions}\n${String.raw`
if ($env:HAI_TEST_REMOVE_PLATFORM_ENV -eq '1') {
  foreach ($name in @('OS', 'SystemRoot', 'windir')) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
}
if ($env:HAI_TEST_SYSTEMROOT_STATE -eq 'absent') { Remove-Item -LiteralPath Env:SystemRoot -ErrorAction SilentlyContinue }
elseif ($env:HAI_TEST_SYSTEMROOT_STATE -eq 'empty') { [Environment]::SetEnvironmentVariable('SystemRoot', '', 'Process') }
elseif ($env:HAI_TEST_SYSTEMROOT_STATE -eq 'value') { [Environment]::SetEnvironmentVariable('SystemRoot', 'retained-system-root', 'Process') }
$previousSystemRootExists = Test-Path -LiteralPath Env:SystemRoot
$previousSystemRoot = [Environment]::GetEnvironmentVariable('SystemRoot', 'Process')
& $env:HAI_TEST_SCRIPT
if ([Environment]::GetEnvironmentVariable('SystemRoot', 'Process') -ne $previousSystemRoot) { throw 'Deployment script did not restore SystemRoot.' }
if ((Test-Path -LiteralPath Env:SystemRoot) -ne $previousSystemRootExists) { throw 'Deployment script changed SystemRoot presence.' }
`}`)
  const environment = (script: Script, overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
    ...process.env,
    PATH: [bin, ...(process.platform === 'win32' ? ['C:/Program Files/Git/usr/bin'] : []), process.env.PATH].join(delimiter),
    HAI_TEST_COMMANDS: log.replaceAll('\\', '/'),
    HAI_TEST_AUTH: authLog,
    HAI_TEST_SCRIPT: join(directory, `deploy.${script}`),
    HAI_DEPLOY_IDENTITY_FILE: '',
    HAI_DEPLOY_KNOWN_HOSTS_FILE: '',
    HAI_TEST_COMMAND_EXIT: '0',
    ...overrides,
  })
  const execute = (script: Script, options: { env?: NodeJS.ProcessEnv, args?: string[], powershell?: string, timeoutMs?: number } = {}) => {
    const env = environment(script, options.env)
    if (process.platform === 'win32' && script === 'ps1' && options.timeoutMs !== undefined) {
      // 期限终止本次 Job owner，其关闭同时回收编译、SSH 与 askpass 后代，避免只杀脚本父进程。
      const job = windowsTestCommand(options.powershell ?? powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', wrapper])
      return spawnSync('powershell.exe', job.args, { cwd: unrelated, env: { ...env, ...job.env }, encoding: 'utf8', windowsHide: true, timeout: options.timeoutMs, killSignal: 'SIGKILL' })
    }
    return script === 'sh'
      ? spawnSync(shell, [join(directory, 'deploy.sh'), ...options.args ?? []], { cwd: unrelated, env, encoding: 'utf8', windowsHide: true, timeout: options.timeoutMs, killSignal: 'SIGKILL' })
      : spawnSync(options.powershell ?? powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', wrapper], { cwd: unrelated, env, encoding: 'utf8', windowsHide: true, timeout: options.timeoutMs, killSignal: 'SIGKILL' })
  }
  const commands = (script: Script): string[][] => {
    if (!existsSync(log))
      return []
    return readFileSync(log, 'utf8').trimEnd().split('\n').map((line) => {
      if (script === 'sh')
        return line.split('\0').slice(0, -1)
      if (process.platform !== 'win32')
        return JSON.parse(line) as string[]
      const [, command, ...encoded] = line.split('\t')
      return [command!, ...encoded.map(value => Buffer.from(value, 'base64').toString('utf8'))]
    })
  }
  return { directory, target, execute, commands, authLog, environment }
}

const hasTerminalDriver = process.platform !== 'win32' && spawnSync('script', ['--version'], { stdio: 'ignore' }).status === 0

it.skipIf(!hasTerminalDriver).each(['password', 'cancel'] as const)('缺少密码时从真实终端隐藏输入并恢复终端（%s）', async (mode) => {
  const { directory, target, commands, environment } = fixture()
  const passwordEnv = 'HAI_DEPLOY_TEST_PROMPT_PASSWORD'
  const password = ' 0019 中 "$value" '
  writeFileSync(join(directory, 'deploy-target.json'), JSON.stringify({ ...target, auth: 'password', passwordEnv }))
  const command = `before=$(stty -g); sh ${shellArgument(join(directory, 'deploy.sh'))}; code=$?; test "$before" = "$(stty -g)" || exit 91; exit "$code"`
  const child = spawn('script', ['-q', '-e', '-c', command, '/dev/null'], { env: environment('sh', { [passwordEnv]: undefined, HAI_TEST_EXPECTED_PASSWORD: password }), stdio: ['pipe', 'pipe', 'pipe'] })
  let output = ''
  let supplied = false
  const capture = (chunk: Buffer) => {
    output += chunk.toString('utf8')
    if (!supplied && output.includes(`(${passwordEnv}):`)) {
      supplied = true
      child.stdin.write(mode === 'password' ? `${password}\n` : '\x04')
    }
  }
  child.stdout.on('data', capture)
  child.stderr.on('data', capture)
  const closed = new Promise<number | null>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', resolve)
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const code = await Promise.race([closed, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Terminal prompt did not finish: ${output}`)), 10_000)
    })])
    expect(supplied).toBe(true)
    expect(code, output).toBe(mode === 'password' ? 0 : 1)
    expect(output).not.toContain(password)
    expect(commands('sh').map(call => call[0])).toEqual(mode === 'password' ? ['ssh', 'scp', 'ssh'] : [])
    expect(readFileSync(join(directory, 'deploy-target.json'), 'utf8')).not.toContain(password)
  }
  finally {
    clearTimeout(timer)
    if (child.exitCode === null)
      child.kill()
    await closed
  }
}, 15_000)

describe.each<Script>(['sh', 'ps1'])('deploy.%s target configuration', (script) => {
  const test = script === 'ps1' && !hasPowerShell ? it.skip : it
  const passwordTest = script === 'ps1' && process.platform !== 'win32' ? it.skip : test

  test('reads edited JSON after moving the package and starting from another working directory', () => {
    const { target, execute, commands } = fixture()
    const result = execute(script)
    expect(result.error).toBeUndefined()
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(result.stdout).toContain('[UPLOAD] 0%')
    expect(result.stdout).toContain('[UPLOAD] 100%')
    const calls = commands(script)
    expect(calls.map(call => call[0])).toEqual(['ssh', 'scp', 'ssh'])
    for (const call of calls) {
      const portFlag = call[0] === 'ssh' ? '-p' : '-P'
      expect(call[call.indexOf(portFlag) + 1]).toBe(String(target.port))
      expect(call[call.indexOf('-i') + 1]).toBe(target.identityFile)
      expect(call).toContain('IdentitiesOnly=yes')
      expect(call).toContain('StrictHostKeyChecking=no')
      expect(call).toContain('ConnectTimeout=37')
      expect(call).toContain(`UserKnownHostsFile="${target.knownHostsFile.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`)
    }
    expect(calls[0]).toContain(`${target.username}@${target.host}`)
    expect(calls[0]!.at(-1)).toContain(`'${target.directory}/incoming'`)
    expect(calls[1]!.at(-2)!.replaceAll('\\', '/').split('/').at(-1)).toBe(target.bundle)
    expect(calls[1]!.at(-1)).toBe(`${target.username}@${target.host}:${target.directory}/incoming/${target.bundle}`)
    expect(calls[2]!.at(-1)).toContain(`'${target.bundle}.contents/apply.sh' '${target.directory}'`)
  })

  passwordTest('大包上传完成前显示远端已接收字节和百分比', () => {
    const { execute } = fixture()
    const result = execute(script, { env: { HAI_TEST_SLOW_UPLOAD: '1' } })
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(result.stdout).toContain('[UPLOAD] 50% (6/12 bytes)')
    expect(result.stdout.indexOf('[UPLOAD] 50%')).toBeLessThan(result.stdout.indexOf('[UPLOAD] 100%'))
  }, 15_000)

  test.each([7, 255])('远端退出 %s 区分明确失败与未知连接状态', (exitCode) => {
    const { execute, commands } = fixture()
    const result = execute(script, { env: { HAI_TEST_APPLY_EXIT: String(exitCode) } })
    expect(result.status).not.toBe(0)
    expect(commands(script)).toHaveLength(3)
    const output = `${result.stdout}\n${result.stderr}`
    expect(output).toContain(exitCode === 7 ? '[FAIL] Remote deployment failed (exit 7)' : '[UNKNOWN] Remote execution may continue')
    if (exitCode === 7)
      expect(output).not.toContain('[UNKNOWN]')
  })

  test('keeps explicit key and known-hosts environment overrides ahead of JSON', () => {
    const { execute, commands } = fixture()
    const identity = 'C:\\另一组 密钥\\identity.pem'
    const known = 'C:\\另一组 配置\\known hosts'
    const result = execute(script, { env: { HAI_DEPLOY_IDENTITY_FILE: identity, HAI_DEPLOY_KNOWN_HOSTS_FILE: known } })
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    for (const call of commands(script)) {
      expect(call[call.indexOf('-i') + 1]).toBe(identity)
      expect(call).toContain(`UserKnownHostsFile="${known.replaceAll('\\', '\\\\')}"`)
    }
  })

  test('decodes escaped Unicode and surrogate pairs in edited JSON paths', () => {
    const { directory, target, execute, commands } = fixture()
    const escaped = JSON.stringify(target).replace(/[\u0080-\uFFFF]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`)
    writeFileSync(join(directory, 'deploy-target.json'), escaped)
    const result = execute(script)
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    for (const call of commands(script)) {
      expect(call[call.indexOf('-i') + 1]).toBe(target.identityFile)
      expect(call).toContain(`UserKnownHostsFile="${target.knownHostsFile.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`)
    }
  })

  test('stops before upload when native SSH returns a nonzero exit code', () => {
    const { execute, commands } = fixture()
    const result = execute(script, { env: { HAI_TEST_COMMAND_EXIT: '7' } })
    expect(result.error).toBeUndefined()
    expect(result.status).not.toBe(0)
    expect(commands(script).map(call => call[0])).toEqual(['ssh'])
  })

  test.each([
    { port: 0 },
    { port: 65536 },
    { port: '2207 -o ProxyCommand=invalid' },
    { connectTimeoutSeconds: 0 },
    { strictHostKeyChecking: 'false' },
    { host: '-oProxyCommand=invalid' },
    { directory: '/srv/apps\' && touch /tmp/should-not-exist #' },
    { directory: '/srv/../outside' },
  ])('rejects invalid target %j before invoking SSH', (invalid) => {
    const { directory, target, execute, commands } = fixture()
    writeFileSync(join(directory, 'deploy-target.json'), JSON.stringify({ ...target, ...invalid }))
    const result = execute(script)
    expect(result.error).toBeUndefined()
    expect(result.status).not.toBe(0)
    expect(commands(script)).toEqual([])
  })

  test('rejects malformed nested JSON before invoking SSH', () => {
    const { directory, execute, commands } = fixture()
    writeFileSync(join(directory, 'deploy-target.json'), '{"host":"example.test","_comments":{"nested":true,,}}')
    const result = execute(script)
    expect(result.error).toBeUndefined()
    expect(result.status).not.toBe(0)
    expect(commands(script)).toEqual([])
  })

  passwordTest.each([1, 2])('复用本机密码环境执行三步、原值不进入参数或日志并清理helper（第 %s 次）', () => {
    const { directory, target, execute, commands, authLog } = fixture()
    const password = ' 0019 中 "$value" '
    writeFileSync(join(directory, 'deploy-target.json'), JSON.stringify({ ...target, auth: 'password', passwordEnv: 'HAI_DEPLOY_PROVIDER_SSH_PASSWORD' }))
    const result = execute(script, { env: { HAI_DEPLOY_PROVIDER_SSH_PASSWORD: password, HAI_TEST_EXPECTED_PASSWORD: password } })
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(`${result.stdout}\n${result.stderr}`).not.toContain(password)
    expect(`${result.stdout}\n${result.stderr}`).toContain('native command diagnostic')
    expect(`${result.stdout}\n${result.stderr}`).toContain('***')
    const calls = commands(script)
    expect(calls).toHaveLength(3)
    for (const call of calls) {
      expect(call).toContain('BatchMode=no')
      expect(call).toContain('PreferredAuthentications=password')
      expect(call).not.toContain('-i')
      expect(call.join(' ')).not.toContain(password)
    }
    for (const helper of readFileSync(authLog, 'utf8').trimEnd().split('\n'))
      expect(existsSync(helper.trimEnd())).toBe(false)
  })

  test.each(['', 'line\nbreak', '中'.repeat(342)])('无效密码在连接前失败且不泄漏', (password) => {
    const { directory, target, execute, commands } = fixture()
    writeFileSync(join(directory, 'deploy-target.json'), JSON.stringify({ ...target, auth: 'password' }))
    const result = execute(script, { env: { HAI_DEPLOY_PROVIDER_SSH_PASSWORD: password } })
    expect(result.status).not.toBe(0)
    expect(commands(script)).toEqual([])
    expect(`${result.stdout}\n${result.stderr}`).toContain('HAI_DEPLOY_PROVIDER_SSH_PASSWORD')
    if (password)
      expect(`${result.stdout}\n${result.stderr}`).not.toContain(password)
  })

  test('缺失自定义密码变量给出变量名和修复方法，连接前停止', () => {
    const { directory, target, execute, commands } = fixture()
    writeFileSync(join(directory, 'deploy-target.json'), JSON.stringify({ ...target, auth: 'password', passwordEnv: 'HAI_DEPLOY_TEST_MISSING_PASSWORD' }))
    const result = execute(script, { env: { HAI_DEPLOY_TEST_MISSING_PASSWORD: undefined } })
    expect(result.status).not.toBe(0)
    expect(`${result.stdout}\n${result.stderr}`).toContain('HAI_DEPLOY_TEST_MISSING_PASSWORD')
    expect(`${result.stdout}\n${result.stderr}`).toContain(deployM('deploy_uploadPasswordUnavailable'))
    expect(commands(script)).toEqual([])
  })

  test.each([{ auth: 'other' }, { auth: 'password', passwordEnv: 'BAD;command' }, { auth: 'password', password: 'forbidden' }])('拒绝损坏认证配置 %j', (invalid) => {
    const { directory, target, execute, commands } = fixture()
    writeFileSync(join(directory, 'deploy-target.json'), JSON.stringify({ ...target, ...invalid }))
    const result = execute(script)
    expect(result.status).not.toBe(0)
    expect(commands(script)).toEqual([])
  })
})

it.skipIf(process.platform !== 'win32' || !hasPwsh)('pwsh password模式执行helper而不是向ssh/scp传--run', () => {
  const { directory, target, execute, commands } = fixture()
  const password = ' 0019 中 "$value" '
  writeFileSync(join(directory, 'deploy-target.json'), JSON.stringify({ ...target, auth: 'password' }))
  const result = execute('ps1', { powershell: 'pwsh', timeoutMs: 12_000, env: { HAI_DEPLOY_PROVIDER_SSH_PASSWORD: password, HAI_TEST_EXPECTED_PASSWORD: password } })
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
  expect(`${result.stdout}\n${result.stderr}`).not.toContain(password)
  const calls = commands('ps1')
  expect(calls).toHaveLength(3)
  for (const call of calls) {
    expect(call).not.toContain('--run')
    expect(call).toContain('BatchMode=no')
    expect(call).not.toContain('-i')
  }
}, 15_000)

describe('powershell SystemRoot restoration', () => {
  it.skipIf(!hasPowerShell && !hasPwsh).each(['absent', 'empty', 'value'])('保留 SystemRoot 的 %s 状态及原值', (state) => {
    const { execute, commands } = fixture()
    const result = execute('ps1', { powershell: hasPwsh ? 'pwsh' : powershell, env: { HAI_TEST_SYSTEMROOT_STATE: state } })
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(commands('ps1').map(call => call[0])).toEqual(['ssh', 'scp', 'ssh'])
  })
})

describe.each([{ engine: 'powershell.exe', available: hasPowerShell }, { engine: 'pwsh', available: hasPwsh }])('filtered Windows environment in $engine', ({ engine, available }) => {
  it.skipIf(process.platform !== 'win32' || !available)('不依赖OS或SystemRoot环境变量完成密码上传并清理helper', () => {
    const { directory, target, execute, commands, authLog } = fixture()
    const password = ' 0019 中 "$value" '
    writeFileSync(join(directory, 'deploy-target.json'), JSON.stringify({ ...target, auth: 'password' }))
    const result = execute('ps1', { powershell: engine, env: { OS: undefined, SystemRoot: undefined, windir: undefined, HAI_TEST_REMOVE_PLATFORM_ENV: '1', HAI_DEPLOY_PROVIDER_SSH_PASSWORD: password, HAI_TEST_EXPECTED_PASSWORD: password } })
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(`${result.stdout}\n${result.stderr}`).not.toContain(password)
    expect(commands('ps1').map(call => call[0])).toEqual(['ssh', 'scp', 'ssh'])
    for (const helper of readFileSync(authLog, 'utf8').trimEnd().split('\n'))
      expect(existsSync(helper.trimEnd())).toBe(false)
  })
})
