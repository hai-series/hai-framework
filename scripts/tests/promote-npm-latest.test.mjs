import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { promoteLatest, releasePackages } from '../promote-npm-latest.mjs'

const packages = ['a', 'b'].map(name => ({ name: `@h-ai/${name}`, version: '1.0.0-beta.1' }))

function registry(initial = {}) {
  const tags = new Map(packages.map(pkg => [
    pkg.name,
    { latest: '0.1.0', beta: pkg.version, ...initial },
  ]))
  const writes = []
  return {
    tags,
    writes,
    fetcher: async (url) => {
      const name = decodeURIComponent(url.split('/').at(-2))
      if (url.endsWith('/dist-tags'))
        return Response.json(tags.get(name))
      return Response.json({ version: packages[0].version })
    },
    addTag: async (pkg) => {
      writes.push(pkg.name)
      tags.get(pkg.name).latest = pkg.version
    },
  }
}

describe('npm latest promotion', () => {
  it.each(['npm', 'github'])('automatic promotion preserves a newer %s default by Git ancestry, while explicit promotion can roll back', async (source) => {
    const root = mkdtempSync(join(tmpdir(), 'hai-release-order-'))
    const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' })
    try {
      git('init', '--quiet')
      writeFileSync(join(root, 'source'), 'old release')
      git('add', '.')
      git('-c', 'user.name=Release fixture', '-c', 'user.email=release@example.invalid', 'commit', '--quiet', '-m', 'old')
      git('tag', `v${packages[0].version}`)
      writeFileSync(join(root, 'source'), 'new release')
      git('add', '.')
      git('-c', 'user.name=Release fixture', '-c', 'user.email=release@example.invalid', 'commit', '--quiet', '-m', 'new')
      // 历史版本名称不能用 SemVer 排序代替真实发布来源。
      git('tag', 'v0.1.0-alpha9')
      const fixture = registry({
        latest: source === 'npm'
          ? '0.1.0-alpha9'
          : undefined,
      })
      await expect(promoteLatest(packages, {
        ...fixture,
        automatic: {
          root,
          additionalDefaults: source === 'github'
            ? ['0.1.0-alpha9']
            : [],
        },
      })).resolves.toBe(0)
      expect(fixture.writes).toEqual([])
      await expect(promoteLatest(packages, fixture)).resolves.toBe(2)
      expect(fixture.writes).toEqual(['@h-ai/a', '@h-ai/b'])
    }
    finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
  it('preflights all versions before any tag writes', async () => {
    vi.useFakeTimers()
    const fixture = registry()
    const fetcher = vi.fn(async url => url.includes('%2fb/')
      ? new Response('', { status: 404 })
      : Response.json({ version: packages[0].version }))
    fixture.fetcher = fetcher
    try {
      const started = Date.now()
      const assertion = expect(promoteLatest(packages, fixture)).rejects.toThrow('Release is incomplete')
      await vi.runAllTimersAsync()
      await assertion
      expect(fixture.writes).toEqual([])
      expect(Date.now() - started).toBe(30 * 60_000)
      expect(vi.getTimerCount()).toBe(0)
    }
    finally { vi.useRealTimers() }
  })

  it('waits through a twelve-minute npm scan without advancing tags early', async () => {
    vi.useFakeTimers()
    const fixture = registry()
    const fetcher = fixture.fetcher
    const started = Date.now()
    fixture.fetcher = async (url) => {
      if (!url.endsWith('/dist-tags') && Date.now() - started < 12 * 60_000)
        return new Response('', { status: 404 })
      return fetcher(url)
    }
    try {
      const result = promoteLatest(packages, fixture).then(value => ({ value }), error => ({ error }))
      await vi.advanceTimersByTimeAsync(11 * 60_000)
      expect(fixture.writes).toEqual([])
      await vi.advanceTimersByTimeAsync(60_000)
      await expect(result).resolves.toEqual({ value: 2 })
      expect(fixture.writes).toEqual(['@h-ai/a', '@h-ai/b'])
    }
    finally { vi.useRealTimers() }
  })

  it('waits for newly published metadata before writing any tags', async () => {
    vi.useFakeTimers()
    const fixture = registry()
    const fetcher = fixture.fetcher
    let versionQueries = 0
    fixture.fetcher = async (url) => {
      if (!url.endsWith('/dist-tags') && ++versionQueries <= packages.length)
        return new Response('', { status: 404 })
      return fetcher(url)
    }
    try {
      const result = promoteLatest(packages, fixture).then(value => ({ value }), error => ({ error }))
      await vi.advanceTimersByTimeAsync(0)
      expect(fixture.writes).toEqual([])
      await vi.advanceTimersByTimeAsync(10_000)
      await expect(result).resolves.toEqual({ value: 2 })
      expect(fixture.writes).toEqual(['@h-ai/a', '@h-ai/b'])
    }
    finally { vi.useRealTimers() }
  })

  it('does not retry registry service failures or write tags', async () => {
    const fixture = registry()
    const fetcher = vi.fn(async () => new Response('', { status: 503 }))
    await expect(promoteLatest(packages, { ...fixture, fetcher })).rejects.toThrow('npm registry status 503')
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fixture.writes).toEqual([])
  })

  it('preserves beta and skips packages already using the target latest', async () => {
    const fixture = registry()
    fixture.tags.get('@h-ai/a').latest = packages[0].version
    await expect(promoteLatest(packages, fixture)).resolves.toBe(2)
    expect(fixture.writes).toEqual(['@h-ai/b'])
    expect([
      ...fixture.tags.values(),
    ]).toEqual(packages.map(pkg => ({ latest: pkg.version, beta: pkg.version })))
  })

  it('recovers a partial mutation without repeating completed writes', async () => {
    const fixture = registry()
    const write = fixture.addTag
    fixture.addTag = async (pkg) => {
      if (pkg.name === '@h-ai/b')
        throw new Error('npm rejected mutation')
      await write(pkg)
    }
    await expect(promoteLatest(packages, fixture)).rejects.toThrow('npm rejected mutation')
    fixture.addTag = write
    await promoteLatest(packages, fixture)
    expect(fixture.writes).toEqual(['@h-ai/a', '@h-ai/b'])
  })

  it('fails when the registry cannot confirm the new tags', async () => {
    const fixture = registry()
    fixture.addTag = async () => {}
    await expect(promoteLatest(packages, fixture)).rejects.toThrow('latest verification failed')
  })

  it('does not mutate tags when the preflight tag lookup fails', async () => {
    const fixture = registry()
    const fetcher = fixture.fetcher
    fixture.fetcher = async url => url.endsWith('/dist-tags')
      ? new Response('', { status: 503 })
      : fetcher(url)
    await expect(promoteLatest(packages, fixture)).rejects.toThrow('tag lookup failed: 503')
    expect(fixture.writes).toEqual([])
  })

  it('rejects unsafe version inputs and mixed releases', async () => {
    expect(() => releasePackages('.', '1.0.0; command')).toThrow('release version')
    await expect(promoteLatest([
      packages[0],
      { ...packages[1], version: '2.0.0' },
    ])).rejects.toThrow('one release')
  })
})
