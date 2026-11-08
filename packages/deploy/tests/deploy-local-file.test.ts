import type { PathLike } from 'node:fs'
import { appendFileSync, linkSync, lstatSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { readLocalFile, writeLocalFile } from '../src/deploy-local-file.js'

const hooks = vi.hoisted(() => ({
  afterLstat: undefined as (() => void) | undefined,
  afterFstat: undefined as (() => void) | undefined,
  failRename: false,
}))
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    lstatSync: (path: PathLike, options?: { bigint?: boolean }) => {
      const result = options?.bigint
        ? actual.lstatSync(path, { bigint: true })
        : actual.lstatSync(path)
      const callback = hooks.afterLstat
      hooks.afterLstat = undefined
      callback?.()
      return result
    },
    fstatSync: (fd: number, options?: { bigint?: boolean }) => {
      const result = options?.bigint
        ? actual.fstatSync(fd, { bigint: true })
        : actual.fstatSync(fd)
      const callback = hooks.afterFstat
      hooks.afterFstat = undefined
      callback?.()
      return result
    },
    renameSync: (before: PathLike, after: PathLike) => {
      if (hooks.failRename)
        throw new Error('Injected publication failure')
      actual.renameSync(before, after)
    },
  }
})

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'hai-local-file-security-'))
})
afterEach(() => {
  hooks.afterLstat = undefined
  hooks.afterFstat = undefined
  hooks.failRename = false
  rmSync(root, { recursive: true, force: true })
})

it('同一普通文件按现有上限读取，私密写入发布完整内容与0600权限', () => {
  const file = join(root, 'private.env')
  writeLocalFile(file, 'PRIVATE=synthetic\n', true)
  expect(readLocalFile(file, { maxBytes: 64, private: true }).toString()).toBe('PRIVATE=synthetic\n')
  if (process.platform !== 'win32')
    expect(lstatSync(file).mode & 0o777).toBe(0o600)
  expect(() => readLocalFile(file, { maxBytes: 2 })).toThrow()
})

it('lstat后被替换的文件不再冒用旧文件的检查结果', () => {
  const file = join(root, 'private.json')
  const replacement = join(root, 'replacement.json')
  writeFileSync(file, '{}', { mode: 0o600 })
  writeFileSync(replacement, 'x'.repeat(100_000), { mode: 0o600 })
  hooks.afterLstat = () => renameSync(replacement, file)
  expect(() => readLocalFile(file, { maxBytes: 65536, private: true })).toThrow()
})

it('fstat后增长也只读原大小加一字节并拒绝变化', () => {
  const file = join(root, 'growing.env')
  writeFileSync(file, 'ab', { mode: 0o600 })
  hooks.afterFstat = () => appendFileSync(file, 'x'.repeat(100_000))
  expect(() => readLocalFile(file, { maxBytes: 65536 })).toThrow()
})

it('硬链接输入不能被读取或原地写入，外部别名内容不变', () => {
  const outside = join(root, 'public.env')
  const file = join(root, 'private.env')
  writeFileSync(outside, 'unchanged', { mode: 0o600 })
  linkSync(outside, file)
  expect(() => readLocalFile(file)).toThrow()
  expect(() => writeLocalFile(file, 'private-value', true)).toThrow()
  expect(readFileSync(outside, 'utf8')).toBe('unchanged')
})

it.skipIf(process.platform === 'win32')('符号链接不能被读取或用于写入其他文件', () => {
  const outside = join(root, 'outside.env')
  const file = join(root, 'private.env')
  writeFileSync(outside, 'unchanged', { mode: 0o600 })
  symlinkSync(outside, file)
  expect(() => readLocalFile(file)).toThrow()
  expect(() => writeLocalFile(file, 'private-value', true)).toThrow()
  expect(readFileSync(outside, 'utf8')).toBe('unchanged')
})

it('发布失败保持原内容并只清理本次独占临时文件', () => {
  const file = join(root, 'private.env')
  writeFileSync(file, 'old', { mode: 0o600 })
  hooks.failRename = true
  expect(() => writeLocalFile(file, 'new', true)).toThrow('Injected publication failure')
  expect(readFileSync(file, 'utf8')).toBe('old')
  expect(readdirSync(root)).toEqual(['private.env'])
})
