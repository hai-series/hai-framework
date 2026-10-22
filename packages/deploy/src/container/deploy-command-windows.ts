/** Windows Job Object 桥接：静态代码内嵌在包中，参数只通过私有环境入口传递。 */
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'

// Native 结构与语义按 Windows SDK；创建时挂起，分配成功后才恢复，避免子进程逃离 Job。
// https://learn.microsoft.com/windows/win32/procthread/job-objects
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

/** 生成隐藏 PowerShell 的静态脚本；执行策略不影响内联命令，不加载用户 profile。 */
function powershell(script: string): string[] {
  return ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')]
}

/**
 * 创建命令 Job；参数不插入代码，启动失败直接拒绝，不能降级为无 Job 的裸进程。
 * 只生成 Job helper 的参数和私有环境载荷；调用者必须按约定启动 helper，不能直接恢复裸子进程。
 * @param command - 本地可执行文件名或绝对路径，不是 shell 命令串。
 * @param args - 逐项传入的参数数组，不再自行拼接 shell。
 * @returns Job 名、隐藏 PowerShell 参数与私有环境载荷。
 * @example 模块内部上下文
 * ```ts
 * const job = windowsCommand(process.execPath, ['--version'])
 * const probe = windowsJobProbe(job.name)
 * // job.args/env 供隐藏 powershell.exe 使用；不要记录其中的私有参数。
 * ```
 */
export function windowsCommand(command: string, args: string[]): { name: string, args: string[], env: Record<string, string> } {
  const name = `Local\\hai-deploy-${randomUUID()}`
  const key = `__HAI_DEPLOY_JOB_${randomUUID().replaceAll('-', '')}`
  const script = `$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; $InformationPreference='SilentlyContinue'
try {
  Add-Type -TypeDefinition @'
${nativeJob}
'@
  $inputConfig = [Environment]::GetEnvironmentVariable('${key}') | ConvertFrom-Json
  [Environment]::SetEnvironmentVariable('${key}', $null)
  exit ([HaiCommandJob]::Run([string]$inputConfig.name, [string]$inputConfig.command, [string[]]$inputConfig.args))
} catch { [Console]::Error.WriteLine('Windows command job failed'); exit 125 }`
  return { name, args: powershell(script), env: { [key]: JSON.stringify({ name, command, args }) } }
}

/**
 * 查询 Job 的真实成员数；不存在表示全部退出，任何检查故障均不能声称终止确认。
 * 名称必须来自 windowsCommand，不能把外部任意文本插入 PowerShell 探测脚本。
 * @param name - 由 windowsCommand 生成的内部 Job 名称。
 * @returns 探测静态脚本的 PowerShell 参数；探测返回码另行检查。
 * @example 模块内部上下文
 * ```ts
 * const job = windowsCommand(process.execPath, ['--version'])
 * const probeArgs = windowsJobProbe(job.name)
 * // 仅对本函数配套创建的 Job 名执行探测；0为空、1仍有成员、2为探测故障。
 * ```
 */
export function windowsJobProbe(name: string): string[] {
  return powershell(`$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; $InformationPreference='SilentlyContinue'
try {
  Add-Type -TypeDefinition @'
${nativeJob}
'@
  if ([HaiCommandJob]::Empty('${name}')) { exit 0 } else { exit 1 }
} catch { exit 2 }`)
}
