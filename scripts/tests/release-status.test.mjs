import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { commitVersionSync, missingPackages, releaseChannel, releasePending } from '../release-status.mjs'

const packages = [
  { name: '@h-ai/a', version: '1.0.0', directory: 'packages/a' },
  { name: '@h-ai/b', version: '1.0.0', directory: 'packages/b' },
]

describe('release recovery', () => {
  it('publishes GitHub Latest independently from npm prerelease channels', () => {
    const workflow = parse(readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8'))
    const steps = workflow.jobs.release.steps
    const release = steps.find(step => step.name === 'Create GitHub Release')
    const publish = steps.find(step => step.name === 'Publish missing npm packages')
    const decision = steps.find(step => step.id === 'default_promotion')
    const promotion = steps.find(step => step.name === 'Promote verified release to npm latest')
    const defaultDecision = '$' + '{{ steps.default_promotion.outputs.promote }}'
    expect(release.with).toMatchObject({ draft: false, prerelease: false, make_latest: defaultDecision })
    expect(decision.run).toContain('--check-automatic')
    expect(promotion.if).toBe('steps.default_promotion.outputs.promote == \'true\'')
    expect(promotion.run).toContain('--automatic')
    const manual = parse(readFileSync(new URL('../../.github/workflows/npm-promote.yml', import.meta.url), 'utf8'))
    expect(manual.jobs.promote.steps.find(step => step.name === 'Verify release and promote latest').run).toContain('--allow-downgrade')
    expect(publish.env.NPM_DIST_TAG).toMatch(/^\$\{\{ needs\.quality\.outputs\.npm_tag \}\}$/)
    expect(releaseChannel('1.0.0-beta.1').npmTag).toBe('beta')
  })

  it.each([
    ['1.0.0-beta.1', 'beta', true],
    ['0.1.0-alpha.78', 'alpha', true],
    ['1.0.0-rc.2', 'rc', true],
    ['1.0.0-preview.1', 'next', true],
    ['1.0.0-1', 'next', true],
    ['1.0.0', 'release', false],
    ['1.0.0+build-with-hyphens', 'release', false],
  ])('selects the release channel for %s', (version, npmTag, prerelease) => {
    expect(releaseChannel(version)).toEqual({ npmTag, prerelease })
  })
  it('commits after release, tolerates the same sync on retry and refuses concurrent source changes', () => {
    const root = mkdtempSync(join(tmpdir(), 'hai-release-'))
    const remote = join(root, 'remote.git')
    const checkout = join(root, 'checkout')
    const git = (...args) => execFileSync('git', args, {
      cwd: checkout,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
    try {
      mkdirSync(checkout)
      execFileSync('git', ['init', '--bare', remote], { stdio: 'ignore' })
      git('init', '-b', 'main')
      git('config', 'user.name', 'Release test')
      git('config', 'user.email', 'release@example.invalid')
      git('config', 'core.hooksPath', '/dev/null')
      git('remote', 'add', 'origin', remote)
      mkdirSync(join(checkout, 'packages/a'), { recursive: true })
      mkdirSync(join(checkout, 'apps/demo'), { recursive: true })
      mkdirSync(join(checkout, 'packages/cli/templates/base'), { recursive: true })
      writeFileSync(join(checkout, 'package.json'), JSON.stringify({ version: '2.0.0' }))
      const manifest = join(checkout, 'packages/a/package.json')
      const template = join(checkout, 'packages/cli/templates/base/package.json.hbs')
      writeFileSync(manifest, JSON.stringify({ version: '1.0.0', latest: '1.0.0' }))
      writeFileSync(template, 'old')
      writeFileSync(join(checkout, 'apps/demo/package.json'), '{}')
      git('add', '.')
      git('commit', '-m', 'source')
      git('push', 'origin', 'main')
      const source = git('rev-parse', 'HEAD')
      git('tag', 'v2.0.0')
      const sync = () => writeFileSync(manifest, JSON.stringify({ version: '2.0.0' }))
      sync()
      commitVersionSync(checkout)
      const synced = git('rev-parse', 'HEAD')
      expect(synced).not.toBe(source)
      expect(git('rev-parse', 'v2.0.0')).toBe(source)
      git('reset', '--hard', source)
      sync()
      expect(() => commitVersionSync(checkout)).not.toThrow()
      expect(git('rev-parse', 'HEAD')).toBe(source)
      git('reset', '--hard', synced)
      writeFileSync(template, 'later source')
      git('add', '.')
      git('commit', '-m', 'later source')
      git('push', 'origin', 'main')
      const later = git('rev-parse', 'HEAD')
      git('reset', '--hard', source)
      sync()
      expect(() => commitVersionSync(checkout)).toThrow('Branch moved')
      expect(git('ls-remote', 'origin', 'refs/heads/main')).toContain(later)
    }
    finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 30_000)

  it('anchors the verified source before publishing and commits versions independently after release', () => {
    const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8')
    const release = workflow.slice(workflow.indexOf('  release:'), workflow.indexOf('  sync_versions:'))
    expect(release).not.toContain('git commit')
    expect(release.indexOf('Sync versions')).toBeLessThan(release.indexOf('Publish missing npm packages'))
    expect(release.indexOf('Verify existing tag target')).toBeLessThan(release.indexOf('Publish missing npm packages'))
    expect(release.indexOf('Verify existing tag target')).toBeLessThan(release.indexOf('Create tag'))
    expect(release.indexOf('Create tag')).toBeLessThan(release.indexOf('Publish missing npm packages'))
    expect(release.indexOf('Publish missing npm packages')).toBeLessThan(release.indexOf('Create GitHub Release'))
    expect(workflow).toContain('needs.release.result == \'skipped\'')
  })
  it('checks the root release version before package versions are synchronized', async () => {
    const requests = []
    const fetcher = async (url) => {
      requests.push(url)
      return new URL(url).origin === 'https://api.github.com'
        ? Response.json({ draft: false })
        : new Response('', { status: 404 })
    }
    expect(await releasePending(packages, 'owner/repo', '2.0.0', { fetcher })).toBe(true)
    expect(requests.filter(url => new URL(url).origin === 'https://registry.npmjs.org').every(url => url.endsWith('/2.0.0'))).toBe(true)
  })
  it('retries missing npm packages even when a release already exists', async () => {
    const fetcher = async url => new URL(url).pathname.split('/').includes('@h-ai%2fb')
      ? new Response('', { status: 404 })
      : Response.json(new URL(url).origin === 'https://api.github.com'
          ? { draft: false }
          : { version: '1.0.0', latest: '1.0.0' })
    expect((await missingPackages(packages, fetcher)).map(pkg => pkg.name)).toEqual(['@h-ai/b'])
    expect(await releasePending(packages, 'owner/repo', '1.0.0', { fetcher })).toBe(true)
  })

  it('resumes a release whose versions and GitHub Release exist but latest is only partly promoted', async () => {
    const fetcher = async url => Response.json(new URL(url).origin === 'https://api.github.com'
      ? { draft: false }
      : url.endsWith('/dist-tags')
        ? {
            latest: new URL(url).pathname.split('/').includes('@h-ai%2fb')
              ? '0.9.0'
              : '1.0.0',
          }
        : { version: '1.0.0' })
    expect(await releasePending(packages, 'owner/repo', '1.0.0', { fetcher })).toBe(true)
  })

  it('repairs a missing GitHub release after npm publish succeeds', async () => {
    const fetcher = async url => new URL(url).origin === 'https://api.github.com'
      ? new Response('', { status: 404 })
      : Response.json({ version: '1.0.0', latest: '1.0.0' })
    expect(await releasePending(packages, 'owner/repo', '1.0.0', { fetcher })).toBe(true)
  })

  it('recognizes scoped releases through canonical uncached npm requests', async () => {
    const fetcher = async (url, options) => {
      if (new URL(url).origin === 'https://api.github.com')
        return Response.json({ draft: false })
      const target = new URL(url)
      return target.origin === 'https://registry.npmjs.org'
        && /^\/(?:-\/package\/)?@h-ai%2f[^/]+\/(?:1\.0\.0|dist-tags)$/.test(target.pathname)
        && options.cache === 'no-store'
        ? Response.json({ version: '1.0.0', latest: '1.0.0' })
        : new Response('', { status: 404 })
    }
    expect(await releasePending(packages, 'owner/repo', '1.0.0', { fetcher })).toBe(false)
  })

  it('skips only a complete release and never treats lookup failures as missing packages', async () => {
    const fetcher = async url => Response.json(new URL(url).origin === 'https://api.github.com'
      ? { draft: false }
      : { version: '1.0.0', latest: '1.0.0' })
    expect(await releasePending(packages, 'owner/repo', '1.0.0', { fetcher })).toBe(false)
    await expect(missingPackages(packages, async () => new Response('', { status: 503 }))).rejects.toThrow('503')
    await expect(releasePending([], 'owner/repo', '1.0.0', {
      fetcher: async () => new Response('', { status: 401 }),
    })).rejects.toThrow('401')
  })
})
