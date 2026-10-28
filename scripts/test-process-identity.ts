/** Windows 进程测试使用 PID 和内核创建时间识别实例；校验、终止及等待始终持有同一句柄。 */
import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { promisify } from 'node:util'

const execute = promisify(execFile)

export interface FixtureProcessIdentity {
  pid: number
  creationTime: string
}

const identitySource = String.raw`
using System;
using System.ComponentModel;
using System.Globalization;
using System.Runtime.InteropServices;
public static class HaiFixtureIdentity {
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetProcessTimes(IntPtr process, out long creation, out long exit, out long kernel, out long user);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateProcess(IntPtr process, uint code);
  [DllImport("kernel32.dll", SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  public static bool Stopped(uint pid, string expectedCreation, bool terminate) {
    IntPtr process=OpenProcess(0x101000u | (terminate ? 1u : 0u), false, pid);
    if(process==IntPtr.Zero) {
      int error=Marshal.GetLastWin32Error();
      if(error==87) return true;
      throw new Win32Exception(error);
    }
    try {
      long creation, exit, kernel, user;
      if(!GetProcessTimes(process,out creation,out exit,out kernel,out user)) throw new Win32Exception(Marshal.GetLastWin32Error());
      // PID 复用表示原实例已结束；绝不终止占用相同编号的新实例。
      if(creation.ToString(CultureInfo.InvariantCulture)!=expectedCreation) return true;
      uint state=WaitForSingleObject(process,0);
      if(state==0) return true;
      if(state!=258) throw new Win32Exception(Marshal.GetLastWin32Error());
      if(!terminate) return false;
      if(!TerminateProcess(process,125)) throw new Win32Exception(Marshal.GetLastWin32Error());
      state=WaitForSingleObject(process,5000);
      if(state==0) return true;
      if(state==258) return false;
      throw new Win32Exception(Marshal.GetLastWin32Error());
    } finally { CloseHandle(process); }
  }
}
`

/** 从夹具自己的父进程和实际创建实例记录身份，不从子进程的 PPID 推断所有权。 */
export function windowsTreeFixture(childFile: string, identityFile: string, heartbeatFile: string, earlyExit?: number): { command: string, args: string[] } {
  const quote = (value: string) => `'${value.replaceAll('\'', '\'\'')}'`
  const exit = earlyExit === undefined ? '' : `if(Test-Path -LiteralPath ${quote(heartbeatFile)}){exit ${earlyExit}}`
  const script = `$ErrorActionPreference='Stop'
$parent=[Diagnostics.Process]::GetCurrentProcess()
$start=New-Object Diagnostics.ProcessStartInfo
$start.FileName=${quote(process.execPath)}
$start.Arguments=${quote(`"${childFile}"`)}
$start.UseShellExecute=$false
$start.CreateNoWindow=$true
$start.RedirectStandardOutput=$true
$start.RedirectStandardError=$true
$child=[Diagnostics.Process]::Start($start)
$identities=@{parent=@{pid=$PID;creationTime=$parent.StartTime.ToFileTimeUtc().ToString([Globalization.CultureInfo]::InvariantCulture)};child=@{pid=$child.Id;creationTime=$child.StartTime.ToFileTimeUtc().ToString([Globalization.CultureInfo]::InvariantCulture)}} | ConvertTo-Json -Depth 3 -Compress
[IO.File]::WriteAllText(${quote(identityFile)},$identities,(New-Object Text.UTF8Encoding($false)))
$streams=@(@{Reader=$child.StandardOutput;Pending=$child.StandardOutput.ReadLineAsync();Writer=[Console]::Out},@{Reader=$child.StandardError;Pending=$child.StandardError.ReadLineAsync();Writer=[Console]::Error})
while($true){foreach($stream in $streams){if($null -ne $stream.Pending -and $stream.Pending.IsCompleted){$line=$stream.Pending.GetAwaiter().GetResult();if($null -eq $line){$stream.Pending=$null}else{$stream.Writer.WriteLine($line);$stream.Pending=$stream.Reader.ReadLineAsync()}}};${exit};Start-Sleep -Milliseconds 10}`
  return { command: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')] }
}

/** 创建时间保留十进制字符串，避免 FILETIME 超出 JavaScript 安全整数精度。 */
export async function readWindowsFixtureProcesses(file: string): Promise<FixtureProcessIdentity[]> {
  const value: unknown = JSON.parse(await readFile(file, 'utf8'))
  if (!value || typeof value !== 'object')
    throw new Error('Missing fixture process identities')
  return ['parent', 'child'].map((name) => {
    const identity: unknown = Reflect.get(value, name)
    if (!identity || typeof identity !== 'object')
      throw new Error('Missing fixture process identity')
    const pid: unknown = Reflect.get(identity, 'pid')
    const creationTime: unknown = Reflect.get(identity, 'creationTime')
    if (typeof pid !== 'number' || !Number.isSafeInteger(pid) || pid <= 1 || typeof creationTime !== 'string' || !/^\d+$/.test(creationTime))
      throw new Error('Invalid fixture process identity')
    return { pid, creationTime }
  })
}

/** 查询失败不等同于退出；清理时原生句柄同时约束目标身份和最终退出事实。 */
export async function windowsFixtureProcessesStopped(identities: FixtureProcessIdentity[], terminate = false): Promise<boolean> {
  if (!identities.length)
    return true
  const compile = `Add-Type -TypeDefinition ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(identitySource).toString('base64')}')))`
  const script = `$ErrorActionPreference='Stop';${compile};$items=$env:HAI_TEST_OWNED_PROCESSES | ConvertFrom-Json;foreach($item in $items){if(-not [HaiFixtureIdentity]::Stopped([uint32]$item.pid,[string]$item.creationTime,$${terminate})){exit 1}};exit 0`
  try {
    await execute('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
      env: { ...process.env, HAI_TEST_OWNED_PROCESSES: JSON.stringify(identities) },
      windowsHide: true,
      timeout: 10_000,
    })
    return true
  }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 1)
      return false
    throw error
  }
}
