/** 部署测试专用 Windows Job：沿用已验证的挂起创建→入不可 breakaway Job→恢复语义；不改变运行时 API。 */
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'

const nativeJob = String.raw`
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class HaiCommandJob {
  [StructLayout(LayoutKind.Sequential)] struct BasicLimits {
    public long ProcessTime, JobTime;
    public uint Flags;
    public UIntPtr MinimumWorkingSet, MaximumWorkingSet;
    public uint ActiveProcessLimit;
    public UIntPtr Affinity;
    public uint PriorityClass, SchedulingClass;
  }
  [StructLayout(LayoutKind.Sequential)] struct IoCounters {
    public ulong ReadOperations, WriteOperations, OtherOperations, ReadBytes, WriteBytes, OtherBytes;
  }
  [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits {
    public BasicLimits Basic;
    public IoCounters Io;
    public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
  }
  [StructLayout(LayoutKind.Sequential)] struct Accounting {
    public long UserTime, KernelTime, PeriodUserTime, PeriodKernelTime;
    public uint Faults, Total, Active, Terminated;
  }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct Startup {
    public uint Size;
    public string Reserved, Desktop, Title;
    public uint X, Y, Width, Height, XChars, YChars, Fill, Flags;
    public ushort Show, ReservedSize;
    public IntPtr ReservedData, Input, Output, Error;
  }
  [StructLayout(LayoutKind.Sequential)] struct ProcessInfo {
    public IntPtr Process, Thread;
    public uint ProcessId, ThreadId;
  }
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr CreateJobObject(IntPtr attributes, string name);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr OpenJobObject(uint access, bool inherit, string name);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetInformationJobObject(IntPtr job, int kind, ref ExtendedLimits information, uint size);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool QueryInformationJobObject(IntPtr job, int kind, out Accounting information, uint size, IntPtr length);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CreateProcess(string application, StringBuilder command, IntPtr processAttributes, IntPtr threadAttributes, bool inherit, uint flags, IntPtr environment, string directory, ref Startup startup, out ProcessInfo information);
  [DllImport("kernel32.dll", SetLastError = true)] static extern uint ResumeThread(IntPtr thread);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool TerminateProcess(IntPtr process, uint code);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool TerminateJobObject(IntPtr job, uint code);
  [DllImport("kernel32.dll", SetLastError = true)] static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetExitCodeProcess(IntPtr process, out uint code);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr GetStdHandle(int kind);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetHandleInformation(IntPtr handle, uint mask, uint flags);

  static void Check(bool success) { if (!success) throw new Win32Exception(Marshal.GetLastWin32Error()); }
  static uint Active(IntPtr job) {
    Accounting information;
    Check(QueryInformationJobObject(job, 1, out information, (uint)Marshal.SizeOf(typeof(Accounting)), IntPtr.Zero));
    return information.Active;
  }
  // Windows argv 编码：引号前与结尾的反斜杠加倍，其余字符原样传递，不经过命令 shell。
  static string Quote(string value) {
    StringBuilder result = new StringBuilder("\"");
    int slashes = 0;
    foreach (char current in value) {
      if (current == '\\') { slashes++; continue; }
      if (current == '"') result.Append('\\', slashes * 2 + 1);
      else result.Append('\\', slashes);
      result.Append(current);
      slashes = 0;
    }
    result.Append('\\', slashes * 2).Append('"');
    return result.ToString();
  }
  public static int Run(string name, string command, string[] arguments) {
    IntPtr job = CreateJobObject(IntPtr.Zero, name);
    if (job == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
    ProcessInfo process = new ProcessInfo();
    bool assigned = false;
    try {
      ExtendedLimits limits = new ExtendedLimits();
      limits.Basic.Flags = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE；不允许 breakaway。
      Check(SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(typeof(ExtendedLimits))));
      StringBuilder line = new StringBuilder(Quote(command));
      foreach (string argument in arguments) line.Append(' ').Append(Quote(argument));
      Startup startup = new Startup();
      startup.Size = (uint)Marshal.SizeOf(typeof(Startup));
      startup.Flags = 0x100;
      startup.Input = GetStdHandle(-10); startup.Output = GetStdHandle(-11); startup.Error = GetStdHandle(-12);
      Check(SetHandleInformation(startup.Input, 1, 1));
      Check(SetHandleInformation(startup.Output, 1, 1));
      Check(SetHandleInformation(startup.Error, 1, 1));
      Check(CreateProcess(null, line, IntPtr.Zero, IntPtr.Zero, true, 0x08000004, IntPtr.Zero, null, ref startup, out process));
      Check(AssignProcessToJobObject(job, process.Process));
      assigned = true;
      if (ResumeThread(process.Thread) == 0xFFFFFFFF) throw new Win32Exception(Marshal.GetLastWin32Error());
      if (WaitForSingleObject(process.Process, 0xFFFFFFFF) != 0) throw new Win32Exception(Marshal.GetLastWin32Error());
      uint code;
      Check(GetExitCodeProcess(process.Process, out code));
      while (Active(job) != 0) Thread.Sleep(20);
      return unchecked((int)code);
    }
    finally {
      if (process.Process != IntPtr.Zero) {
        // 分配失败时进程仍挂起，直接终止，不允许裸进程恢复；Job 在其他异常时同样清空。
        if (!assigned) TerminateProcess(process.Process, 125);
        else TerminateJobObject(job, 125);
        WaitForSingleObject(process.Process, 5000);
      }
      if (process.Thread != IntPtr.Zero) CloseHandle(process.Thread);
      if (process.Process != IntPtr.Zero) CloseHandle(process.Process);
      CloseHandle(job);
    }
  }
  public static bool Empty(string name) {
    IntPtr job = OpenJobObject(4, false, name); // JOB_OBJECT_QUERY
    if (job == IntPtr.Zero) {
      if (Marshal.GetLastWin32Error() == 2) return true;
      throw new Win32Exception(Marshal.GetLastWin32Error());
    }
    try { return Active(job) == 0; }
    finally { CloseHandle(job); }
  }
}
`

function powershell(script: string): string[] {
  return ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')]
}

// 测试与生产包没有共用的公开进程控制入口；保留必需的原生结构/argv 编码，不跨包导入私有源码。
const compile = `Add-Type -TypeDefinition ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(nativeJob, 'utf8').toString('base64')}')))`

export function windowsTestCommand(command: string, args: string[]): { name: string, args: string[], env: Record<string, string> } {
  const name = `Local\\hai-deploy-test-${randomUUID()}`
  const key = `__HAI_DEPLOY_TEST_JOB_${randomUUID().replaceAll('-', '')}`
  const script = `$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; $InformationPreference='SilentlyContinue'
try {
  ${compile}
  $config = [Environment]::GetEnvironmentVariable('${key}') | ConvertFrom-Json
  [Environment]::SetEnvironmentVariable('${key}', $null)
  exit ([HaiCommandJob]::Run([string]$config.name, [string]$config.command, [string[]]$config.args))
} catch { [Console]::Error.WriteLine('Windows deployment test command job failed'); exit 125 }`
  return { name, args: powershell(script), env: { [key]: JSON.stringify({ name, command, args }) } }
}

export function windowsTestJobProbe(name: string): string[] {
  return powershell(`$ErrorActionPreference='Stop'; try { ${compile}; if ([HaiCommandJob]::Empty('${name}')) { exit 0 } else { exit 1 } } catch { exit 2 }`)
}
