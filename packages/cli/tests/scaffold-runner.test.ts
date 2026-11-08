/** 用受控进程结果执行真实 runner，验证分批发现、失败收集、取消和清理，不构建或安装。 */
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const scriptUrl = new URL('./run-scaffold-gates.mjs', import.meta.url).href
const source = readFileSync(new URL(scriptUrl), 'utf8')
  .replace(/^import .*\r?\n/gm, '')
  .replaceAll('import.meta.url', 'scriptUrl')
  .replaceAll('import.meta.resolve(\'vitest/package.json\')', 'vitestManifest')

interface CommandResult {
  status: number | null
  signal?: string | null
  error?: Error
}

function runRunner(results: CommandResult[] = [], args: string[] = [], env: Record<string, string> = {
  npm_execpath: path.join(tmpdir(), 'pnpm entry.cjs'),
}) {
  const archive = path.join(tmpdir(), 'controlled-scaffold-archives')
  const vitestManifest = path.join(tmpdir(), 'vitest/package.json')
  const calls: string[][] = []
  const invocations: Array<{ command: string, args: string[], shell?: boolean }> = []
  const removals = vi.fn()
  let exitCode: number | undefined
  runInNewContext(source, {
    scriptUrl,
    vitestManifest,
    fileURLToPath: (value: string) => value === vitestManifest
      ? value
      : fileURLToPath(value),
    path,
    tmpdir,
    mkdtempSync: () => archive,
    readdirSync: () => [],
    readFileSync: () => '{}',
    rmSync: removals,
    process: {
      argv: [
        'node',
        fileURLToPath(scriptUrl),
        ...args,
      ],
      execPath: process.execPath,
      platform: process.platform,
      env,
      stderr: {
        write: vi.fn(),
      },
      exit: (code: number) => { exitCode = code },
    },
    spawnSync: (command: string, commandArgs: string[], options: { shell?: boolean }) => {
      invocations.push({
        command,
        args: [...commandArgs],
        shell: options.shell,
      })
      if (!commandArgs[0]?.endsWith('vitest.mjs'))
        return { status: 0 }
      calls.push([...commandArgs])
      return results[calls.length - 1] ?? { status: 0 }
    },
  })
  expect(removals).toHaveBeenCalledExactlyOnceWith(archive, { recursive: true, force: true })
  return { calls, exitCode, invocations }
}

describe('scaffold runner 批次契约', () => {
  it('默认覆盖六个文件恰好一次，两个重型文件分批且轻型文件保留', () => {
    const result = runRunner()
    expect(result.exitCode).toBe(0)
    expect(result.calls).toHaveLength(2)
    const files = result.calls.map(args => args.filter(argument => argument.endsWith('.test.ts')))
    expect(files[0]).toEqual([
      'tests/generate-runtime.e2e.test.ts',
      'tests/build-downloads.e2e.test.ts',
      'tests/generate-i18n.test.ts',
      'tests/command-locales.test.ts',
      'tests/environment-output.test.ts',
    ])
    expect(files[1]).toEqual(['tests/scaffold-gates.e2e.test.ts'])
    expect(new Set(files.flat()).size).toBe(6)
  })

  it('普通失败继续下一批且保留首个失败码', () => {
    const result = runRunner([
      { status: 7 },
      { status: 9 },
    ])
    expect(result.calls).toHaveLength(2)
    expect(result.exitCode).toBe(7)
  })

  it.each([130, 143, 3221225786, -1073741510])('取消退出码 %s 停止后续批次并清理归档', (status) => {
    const result = runRunner([
      { status },
    ])
    expect(result.calls).toHaveLength(1)
    expect(result.exitCode).toBe(status)
  })

  it.each([
    { status: null, signal: 'SIGTERM' },
    {
      status: null,
      error: new Error('Controlled spawn failure'),
    },
  ])('信号或启动失败停止后续批次 %j', (failure) => {
    const result = runRunner([failure])
    expect(result.calls).toHaveLength(1)
    expect(result.exitCode).toBe(1)
  })

  it('list 一次完整发现而不拆分 JSON 输出', () => {
    const result = runRunner([], ['--list', '--json'])
    expect(result.calls).toHaveLength(1)
    expect(result.calls[0]?.[1]).toBe('list')
    expect(result.calls[0]?.filter(argument => argument.endsWith('.test.ts'))).toHaveLength(6)
  })

  it('pnpm JS 路径与带空格的测试正则作为独立参数传递，不经过 shell', () => {
    const entry = path.join(tmpdir(), 'pnpm entry.cjs')
    const pattern = 'scaffold with spaces.*api'
    const result = runRunner([], ['--testNamePattern', pattern])
    expect(result.invocations[0]).toMatchObject({
      command: process.execPath,
      args: [
        entry,
        'exec',
        'turbo',
        'run',
        'build',
        '--filter=@h-ai/*',
        '--concurrency=4',
      ],
      shell: false,
    })
    expect(result.calls.every(args => args.includes(pattern))).toBe(true)
    expect(result.invocations.every(call => call.shell === false)).toBe(true)
  })

  it('大小写不同的 npm_execpath 与原生 pnpm 入口也保持原始路径', () => {
    const entry = path.join(tmpdir(), 'pnpm entry.exe')
    const result = runRunner([], [], { NPM_EXECPATH: entry })
    expect(result.invocations[0]).toMatchObject({
      command: entry,
      args: [
        'exec',
        'turbo',
        'run',
        'build',
        '--filter=@h-ai/*',
        '--concurrency=4',
      ],
      shell: false,
    })
  })
})
