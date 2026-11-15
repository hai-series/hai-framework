import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'
import process from 'node:process'
import { z } from 'zod'
import { ACPFailure } from './ai-acp-errors.js'

const sha = /^[a-f\d]{40}(?:[a-f\d]{24})?$/u
const revisionSchema = z.string().max(256).refine(value => sha.test(value) || /^refs\/(?:heads|tags|remotes)\/[\w./-]+$/u.test(value))
const directorySchema = z.string().min(1).max(4096).refine(value => isAbsolute(value) && !value.includes('\0'))
/**
 * 单次受管 Git 文件树的最大字节数。
 * @example 模块内部上下文
 * ```ts
 * const tooLarge = Buffer.byteLength('source') > projectBudget
 * ```
 */
export const projectBudget = 16 * 1024 * 1024
const projectFiles = 512
const patchBudget = projectBudget * 3

/**
 * 已授权的 Git 提交文件树，包含规范 Base64 数据。
 * @example
 * ```ts
 * import type { ACPProjectSnapshot } from '@h-ai/ai'
 * function revision(snapshot: ACPProjectSnapshot) { return snapshot.revision }
 * ```
 */
export interface ACPProjectSnapshot {
  revision: string
  files: Record<string, string>
}

/**
 * 当前文件树相对于授权提交的改动。
 * @example
 * ```ts
 * import type { ACPProjectChanges } from '@h-ai/ai'
 * const empty: ACPProjectChanges = { patch: '', paths: [] }
 * ```
 */
export interface ACPProjectChanges {
  patch: string
  paths: string[]
}

function pathAllowed(path: string) {
  return path.length > 0 && path.length <= 512 && !/[\p{Cc}\\]/u.test(path)
    && path.split('/').every(part => part.length > 0 && part.length <= 128 && part !== '.' && part !== '..' && part.toLowerCase() !== '.git')
}

function assertTree(tree: Record<string, string>) {
  const entries = Object.entries(tree)
  if (entries.length > projectFiles || entries.reduce((sum, [, value]) => sum + value.length, 0) > 4 * (Math.ceil(projectBudget / 3) + entries.length))
    throw new ACPFailure('invalid', { parameter: 'files' })
  let bytes = 0
  for (const [name, value] of entries) {
    if (!pathAllowed(name) || typeof value !== 'string')
      throw new ACPFailure('invalid', { parameter: 'files' })
    const data = Buffer.from(value, 'base64')
    bytes += data.length
    if (bytes > projectBudget || data.toString('base64') !== value)
      throw new ACPFailure('invalid', { parameter: 'files' })
  }
}

function git(directory: string, args: string[], options: {
  signal?: AbortSignal
  maxBuffer?: number
  input?: string
  diff?: boolean
  env?: NodeJS.ProcessEnv
} = {}) {
  return new Promise<Buffer>((resolve, reject) => {
    const env = {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: process.platform === 'win32'
        ? 'NUL'
        : '/dev/null',
      GIT_TERMINAL_PROMPT: '0',
      LC_ALL: 'C',
      ...options.env,
    }
    const child = execFile('git', ['-C', directory, '--no-pager', ...args], {
      encoding: 'buffer',
      timeout: 60_000,
      windowsHide: true,
      maxBuffer: options.maxBuffer ?? 1024 * 1024,
      signal: options.signal,
      env,
    }, (error, stdout) => {
      if (!error || (options.diff && error.code === 1)) {
        resolve(stdout)
        return
      }
      reject(new ACPFailure(error.code === 'ENOENT'
        ? 'gitMissing'
        : options.signal?.aborted ? 'cancelled' : 'conflict'))
    })
    child.stdin?.on('error', () => {})
    child.stdin?.end(options.input)
  })
}

/**
 * 从可信仓库目录读取指定提交的有界普通文件树。
 * @example 模块内部上下文
 * ```ts
 * async function read(directory: string) { return readGitSnapshot({ directory, revision: 'refs/heads/main' }) }
 * ```
 */
export async function readGitSnapshot(input: { directory: string, revision: string, maxBytes?: number }, signal?: AbortSignal): Promise<ACPProjectSnapshot> {
  const directory = directorySchema.parse(input.directory)
  const source = revisionSchema.parse(input.revision)
  const maxBytes = z.number().int().positive().max(projectBudget).default(projectBudget).parse(input.maxBytes)
  const revision = (await git(directory, [
    'rev-parse',
    '--verify',
    '--end-of-options',
    `${source}^{commit}`,
  ], { signal })).toString().trim()
  if (!sha.test(revision))
    throw new ACPFailure('missing')
  const names = (await git(directory, [
    'ls-tree',
    '-r',
    '-z',
    '--full-tree',
    revision,
  ], { signal })).toString().split('\0').filter(Boolean)
  if (names.length > projectFiles)
    throw new ACPFailure('invalid', { parameter: 'files' })
  const objects = names.map((entry) => {
    const tab = entry.indexOf('\t')
    const [mode, type, oid] = entry.slice(0, tab).split(' ')
    const path = entry.slice(tab + 1)
    if (tab < 0 || !oid || !sha.test(oid) || type !== 'blob' || !['100644', '100755'].includes(mode ?? '') || !pathAllowed(path))
      throw new ACPFailure('unsupported', { parameter: 'workspace' })
    return { path, oid }
  })
  const content = await git(directory, ['cat-file', '--batch'], {
    signal,
    maxBuffer: maxBytes + 65536,
    input: objects.map(entry => `${entry.oid}\n`).join(''),
  })
  let cursor = 0
  let total = 0
  const files = Object.fromEntries(objects.map(({ path, oid }) => {
    const end = content.indexOf(10, cursor)
    const [id, type, size] = content.subarray(cursor, end).toString().split(' ')
    const length = Number(size)
    const start = end + 1
    cursor = start + length + 1
    total += length
    if (end < 0 || id !== oid || type !== 'blob' || !Number.isSafeInteger(length) || length < 0 || total > maxBytes || content[cursor - 1] !== 10)
      throw new ACPFailure('invalid', { parameter: 'workspace' })
    return [
      path,
      content.subarray(start, cursor - 1).toString('base64'),
    ]
  }))
  return { revision, files }
}

async function inTemporaryDirectory<T>(use: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'hai-acp-project-'))
  try {
    return await use(directory)
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
}

/**
 * 将两个有界文件树的变化转成可应用的 Git 补丁。
 * @example 模块内部上下文
 * ```ts
 * const changes = await diffSnapshot({ 'notes.txt': 'aGk=' }, { 'notes.txt': 'aGVsbG8=' })
 * ```
 */
export async function diffSnapshot(before: Record<string, string>, after: Record<string, string>, signal?: AbortSignal): Promise<ACPProjectChanges> {
  assertTree(before)
  assertTree(after)
  const paths = [
    ...new Set([
      ...Object.keys(before),
      ...Object.keys(after),
    ]),
  ]
    .filter(path => Object.hasOwn(before, path) !== Object.hasOwn(after, path) || before[path] !== after[path])
    .sort()
  if (!paths.length)
    return { patch: '', paths }
  return inTemporaryDirectory(async (directory) => {
    for (const [side, tree] of [
      ['before', before],
      ['after', after],
    ] as const) {
      await mkdir(join(directory, side))
      for (const path of paths) {
        if (!Object.hasOwn(tree, path))
          continue
        const file = join(directory, side, path)
        await mkdir(dirname(file), { recursive: true })
        await writeFile(file, Buffer.from(tree[path]!, 'base64'), { mode: 0o600, flag: 'wx' })
      }
    }
    const patch = await git(directory, [
      'diff',
      '--no-index',
      '--binary',
      '--no-prefix',
      '--no-ext-diff',
      '--no-textconv',
      '--',
      'before',
      'after',
    ], {
      signal,
      maxBuffer: patchBudget,
      diff: true,
    })
    return {
      paths,
      patch: patch.toString(),
    }
  })
}

/**
 * 应用确认后的发布条件，目标分支固定在 agent/ 下。
 * @example
 * ```ts
 * import type { ACPPublishSnapshot } from '@h-ai/ai'
 * function branch(input: ACPPublishSnapshot) { return input.branch }
 * ```
 */
export interface ACPPublishSnapshot {
  directory: string
  remote: string
  revision: string
  patch: string
  branch: string
  date: string
  author: { name: string, email: string }
}

/**
 * 在独立 Git 目录中应用已验权的补丁，仅向任务分支执行普通 push。
 * @example 模块内部上下文
 * ```ts
 * async function confirmed(input: ACPPublishSnapshot) { return publishSnapshot(input) }
 * ```
 */
export async function publishSnapshot(input: ACPPublishSnapshot, signal?: AbortSignal) {
  const { directory, remote, revision, patch, branch, date, author } = z.strictObject({
    directory: directorySchema,
    remote: z.string().max(4096).refine(value => !/\p{Cc}/u.test(value) && (isAbsolute(value) || /^(?:https|ssh):\/\//u.test(value))),
    revision: z.string().regex(sha),
    patch: z.string().min(1).max(patchBudget),
    branch: z.string().regex(/^agent\/[\da-z-]{1,90}$/iu),
    date: z.iso.datetime(),
    author: z.strictObject({
      name: z.string().trim().min(1).max(100).refine(value => !/[\r\n<>]/u.test(value)),
      email: z.email(),
    }),
  }).parse(input)
  return inTemporaryDirectory(async (temporary) => {
    const clone = join(temporary, 'repo')
    await git(temporary, [
      'clone',
      '--shared',
      '--no-checkout',
      '--template=',
      '--',
      directory,
      clone,
    ], { signal })
    await git(clone, ['read-tree', revision], { signal })
    await git(clone, [
      'apply',
      '--cached',
      '--whitespace=nowarn',
      '-',
    ], { signal, input: patch })
    const tree = (await git(clone, ['write-tree'], { signal })).toString().trim()
    const commit = (await git(clone, [
      'commit-tree',
      tree,
      '-p',
      revision,
      '-m',
      'Apply Agent workspace changes',
    ], {
      signal,
      env: {
        GIT_AUTHOR_NAME: author.name,
        GIT_AUTHOR_EMAIL: author.email,
        GIT_COMMITTER_NAME: author.name,
        GIT_COMMITTER_EMAIL: author.email,
        GIT_AUTHOR_DATE: date,
        GIT_COMMITTER_DATE: date,
      },
    })).toString().trim()
    await git(clone, [
      '-c',
      'core.hooksPath=../disabled-hooks',
      'push',
      '--',
      remote,
      `${commit}:refs/heads/${branch}`,
    ], { signal })
    return { branch, commit }
  })
}
