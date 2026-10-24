import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { resolveBuildMetadata } from '../templates/shared/build-metadata.js'

let directory: string
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'hai-artifact-metadata-'))
  vi.stubEnv('HAI_BUILD_ID', undefined)
  vi.stubEnv('HAI_BUILD_COMMIT', undefined)
})
afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(directory, { recursive: true, force: true })
})

it('sSR 配置重入复用本次身份，各目标仍读取自己的 manifest 版本', () => {
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ version: '2.3.4-web' }))
  const first = resolveBuildMetadata(directory)
  expect(first).toMatchObject({ appVersion: '2.3.4-web', commit: 'unknown' })
  expect(first.buildId).toMatch(/^[\w.+-]+$/)
  expect(resolveBuildMetadata(directory)).toEqual(first)
  const service = join(directory, 'service')
  mkdirSync(service)
  writeFileSync(join(service, 'package.json'), JSON.stringify({ version: '5.6.7-service' }))
  expect(resolveBuildMetadata(service)).toEqual({ ...first, appVersion: '5.6.7-service' })
})

it('源码归档不推断父框架提交，真实受控工程读取精确Git SHA', () => {
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ version: '1.0.0' }))
  execFileSync('git', ['init', '--quiet'], { cwd: directory })
  execFileSync('git', ['add', 'package.json'], { cwd: directory })
  execFileSync('git', ['-c', 'user.name=Build fixture', '-c', 'user.email=build@example.invalid', 'commit', '--quiet', '-m', 'fixture'], { cwd: directory })
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: directory, encoding: 'utf8' }).trim()
  expect(resolveBuildMetadata(directory).commit).toBe(commit)
  vi.stubEnv('HAI_BUILD_ID', undefined)
  vi.stubEnv('HAI_BUILD_COMMIT', undefined)
  const nested = join(directory, 'untracked-generated-project')
  mkdirSync(nested)
  writeFileSync(join(nested, 'package.json'), JSON.stringify({ version: '3.0.0' }))
  expect(resolveBuildMetadata(nested).commit).toBe('unknown')
})

it('显式构建tuple只接受有界的非敏感ID与Git SHA，不修改其它环境', () => {
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ version: '1.0.0' }))
  vi.stubEnv('HAI_BUILD_ID', '  release-42  ')
  vi.stubEnv('HAI_BUILD_COMMIT', 'a'.repeat(40))
  vi.stubEnv('HAI_PRIVATE_SECRET', 'untouched-secret')
  expect(resolveBuildMetadata(directory)).toEqual({ appVersion: '1.0.0', buildId: 'release-42', commit: 'a'.repeat(40) })
  expect(process.env.HAI_PRIVATE_SECRET).toBe('untouched-secret')
  vi.stubEnv('HAI_BUILD_ID', 'bad\nidentity')
  vi.stubEnv('HAI_BUILD_COMMIT', 'invalid-commit')
  const fallback = resolveBuildMetadata(directory)
  expect(fallback.buildId).not.toBe('bad\nidentity')
  expect(fallback.commit).toBe('unknown')
})
