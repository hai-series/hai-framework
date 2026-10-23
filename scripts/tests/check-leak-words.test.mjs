import { Buffer } from 'node:buffer'
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, expect, it } from 'vitest'

const BLOCKED_TERM = 'fixture-blocked-词语'
const LINE_COUNT = 8000
const LARGE_CONTENT = `${'safe '.repeat(32)}\n`.repeat(LINE_COUNT)
let directory
let baseOid

function git(args) {
  return execFileSync('git', args, { cwd: directory, encoding: 'utf8', windowsHide: true }).trim()
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'hai-leak-words-'))
  mkdirSync(join(directory, 'scripts'))
  copyFileSync(resolve(import.meta.dirname, '../check-leak-words.mjs'), join(directory, 'scripts/check-leak-words.mjs'))
  git(['init', '--quiet'])
  git(['config', 'user.name', 'Leak Checker Test'])
  git(['config', 'user.email', 'leak-checker@example.invalid'])
  git(['config', 'core.hooksPath', join(directory, '.git/hooks')])
  git(['config', 'commit.gpgsign', 'false'])
  git(['config', 'core.autocrlf', 'false'])
  writeFileSync(join(directory, 'initial.txt'), 'initial\n')
  git(['add', 'initial.txt'])
  git(['commit', '--quiet', '-m', 'Initial fixture'])
  baseOid = git(['rev-parse', 'HEAD'])
})

afterEach(() => rmSync(directory, { recursive: true, force: true }))

function check(args, input) {
  const result = spawnSync(process.execPath, [join(directory, 'scripts/check-leak-words.mjs'), ...args], {
    cwd: directory,
    encoding: 'utf8',
    env: { ...process.env, LEAK_WORDS: JSON.stringify([BLOCKED_TERM]) },
    input,
    timeout: 10_000,
    windowsHide: true,
  })
  expect(result.error).toBeUndefined()
  return result
}

function checkPatch(mode, content) {
  writeFileSync(join(directory, 'large.txt'), content)
  git(['add', 'large.txt'])
  if (mode === '--staged')
    return check([mode])

  git(['commit', '--quiet', '-m', 'Large patch fixture'])
  const headOid = git(['rev-parse', 'HEAD'])
  if (mode === '--range')
    return check([mode, baseOid, headOid])

  return check([mode], `refs/heads/fixture ${headOid} refs/heads/fixture ${baseOid}\n`)
}

it.each(['--staged', '--range', '--push'])('%s 扫描超过默认缓冲上限的干净补丁', (mode) => {
  expect(Buffer.byteLength(LARGE_CONTENT)).toBeGreaterThan(1024 * 1024)
  const result = checkPatch(mode, LARGE_CONTENT)
  expect(result.status).toBe(0)
  expect(result.stderr).toBe('')
})

it.each(['--staged', '--range', '--push'])('%s 检出大补丁末尾的敏感词并脱敏', (mode) => {
  const result = checkPatch(mode, `${LARGE_CONTENT}before ${BLOCKED_TERM.toUpperCase()} after\n`)
  expect(result.status).toBe(1)
  expect(result.stderr).toContain(`large.txt:${LINE_COUNT + 1} hit 1 blocked term(s)`)
  expect(result.stderr).toContain('before [REDACTED] after')
  expect(result.stderr.toLowerCase()).not.toContain(BLOCKED_TERM)
  expect(result.stderr).not.toContain('ENOBUFS')
})

it('range 仍扫描后来被删除的历史提交内容', () => {
  writeFileSync(join(directory, 'large.txt'), `${LARGE_CONTENT}${BLOCKED_TERM}\n`)
  git(['add', 'large.txt'])
  git(['commit', '--quiet', '-m', 'Introduce fixture content'])
  writeFileSync(join(directory, 'large.txt'), LARGE_CONTENT)
  git(['add', 'large.txt'])
  git(['commit', '--quiet', '-m', 'Remove fixture content'])

  const result = check(['--range', baseOid, git(['rev-parse', 'HEAD'])])
  expect(result.status).toBe(1)
  expect(result.stderr).toContain(`large.txt:${LINE_COUNT + 1} hit 1 blocked term(s)`)
})

it('大补丁仅删除敏感词时不误报', () => {
  writeFileSync(join(directory, 'large.txt'), `${BLOCKED_TERM}\n`)
  git(['add', 'large.txt'])
  git(['commit', '--quiet', '-m', 'Existing fixture content'])

  const result = checkPatch('--staged', LARGE_CONTENT)
  expect(result.status).toBe(0)
})

it('git 补丁读取失败仍阻断检查', () => {
  git(['config', 'diff.algorithm', 'invalid-fixture-algorithm'])
  const result = check(['--staged'])
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('invalid-fixture-algorithm')
})

it('保留提交信息的敏感词检查和脱敏', () => {
  const messagePath = join(directory, 'message.txt')
  writeFileSync(messagePath, `Subject\n\n${BLOCKED_TERM}\n`)
  const result = check(['--commit-msg-file', messagePath])
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('line 3 hit 1 blocked term(s)')
  expect(result.stderr).toContain('[REDACTED]')
  expect(result.stderr).not.toContain(BLOCKED_TERM)
})
