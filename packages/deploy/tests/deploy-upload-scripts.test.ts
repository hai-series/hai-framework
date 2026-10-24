import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import process from 'node:process'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { createUploadScripts } from '../src/container/deploy-scripts.js'

const temporary: string[] = []
const shell = process.platform === 'win32' ? 'C:/Program Files/Git/usr/bin/bash.exe' : '/bin/sh'
const powershell = process.platform === 'win32' ? 'powershell.exe' : 'pwsh'
const hasPowerShell = spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', 'exit 0'], { windowsHide: true }).status === 0
const hasPwsh = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', 'exit 0'], { windowsHide: true }).status === 0
let nativeTools: string | undefined
type Script = 'sh' | 'ps1'

afterEach(() => {
  for (const directory of temporary.splice(0))
    rmSync(directory, { recursive: true, force: true })
})

afterAll(() => {
  if (nativeTools)
    rmSync(nativeTools, { recursive: true, force: true })
})

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
public static class Capture {
  public static int Main(string[] args) {
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
    writeFileSync(join(bin, command), `#!/bin/sh\nprintf '%s\\0' '${command}' "$@" >> "$HAI_TEST_COMMANDS"\nprintf '\\n' >> "$HAI_TEST_COMMANDS"\nif [ -n "\${HAI_TEST_EXPECTED_PASSWORD+x}" ]; then\n password=$("$SSH_ASKPASS") || exit 8\n test "$password" = "$HAI_TEST_EXPECTED_PASSWORD" || exit 8\n printf '%s\\n' "$SSH_ASKPASS" >> "$HAI_TEST_AUTH"\n printf '%s' "$password"\n printf '%s' "$password" >&2\nfi\nexit "\${HAI_TEST_COMMAND_EXIT:-0}"\n`, { mode: 0o700 })
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
  $global:LASTEXITCODE = if ($env:HAI_TEST_COMMAND_EXIT) { [int]$env:HAI_TEST_COMMAND_EXIT } else { 0 }
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
$previousSystemRoot = [Environment]::GetEnvironmentVariable('SystemRoot', 'Process')
& $env:HAI_TEST_SCRIPT
if ([Environment]::GetEnvironmentVariable('SystemRoot', 'Process') -ne $previousSystemRoot) { throw 'Deployment script did not restore SystemRoot.' }
`}`)
  const execute = (script: Script, options: { env?: NodeJS.ProcessEnv, args?: string[], powershell?: string } = {}) => {
    const env = {
      ...process.env,
      PATH: [bin, ...(process.platform === 'win32' ? ['C:/Program Files/Git/usr/bin'] : []), process.env.PATH].join(delimiter),
      HAI_TEST_COMMANDS: log.replaceAll('\\', '/'),
      HAI_TEST_AUTH: authLog,
      HAI_TEST_SCRIPT: join(directory, `deploy.${script}`),
      HAI_DEPLOY_IDENTITY_FILE: '',
      HAI_DEPLOY_KNOWN_HOSTS_FILE: '',
      HAI_TEST_COMMAND_EXIT: '0',
      ...options.env,
    }
    return script === 'sh'
      ? spawnSync(shell, [join(directory, 'deploy.sh'), ...options.args ?? []], { cwd: unrelated, env, encoding: 'utf8', windowsHide: true })
      : spawnSync(options.powershell ?? powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', wrapper], { cwd: unrelated, env, encoding: 'utf8', windowsHide: true })
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
  return { directory, target, execute, commands, authLog }
}

describe.each<Script>(['sh', 'ps1'])('deploy.%s target configuration', (script) => {
  const test = script === 'ps1' && !hasPowerShell ? it.skip : it
  const passwordTest = script === 'ps1' && process.platform !== 'win32' ? it.skip : test

  test('reads edited JSON after moving the package and starting from another working directory', () => {
    const { target, execute, commands } = fixture()
    const result = execute(script)
    expect(result.error).toBeUndefined()
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
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

  passwordTest('复用本机密码环境执行三步、原值不进入参数或日志并清理helper', () => {
    const { directory, target, execute, commands, authLog } = fixture()
    const password = ' 0019 中 "$value" '
    writeFileSync(join(directory, 'deploy-target.json'), JSON.stringify({ ...target, auth: 'password', passwordEnv: 'HAI_DEPLOY_PROVIDER_SSH_PASSWORD' }))
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = execute(script, { env: { HAI_DEPLOY_PROVIDER_SSH_PASSWORD: password, HAI_TEST_EXPECTED_PASSWORD: password } })
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
      expect(`${result.stdout}\n${result.stderr}`).not.toContain(password)
    }
    const calls = commands(script)
    expect(calls).toHaveLength(6)
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
    if (password)
      expect(`${result.stdout}\n${result.stderr}`).not.toContain(password)
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
  const result = execute('ps1', { powershell: 'pwsh', env: { HAI_DEPLOY_PROVIDER_SSH_PASSWORD: password, HAI_TEST_EXPECTED_PASSWORD: password } })
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
  expect(`${result.stdout}\n${result.stderr}`).not.toContain(password)
  const calls = commands('ps1')
  expect(calls).toHaveLength(3)
  for (const call of calls) {
    expect(call).not.toContain('--run')
    expect(call).toContain('BatchMode=no')
    expect(call).not.toContain('-i')
  }
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
