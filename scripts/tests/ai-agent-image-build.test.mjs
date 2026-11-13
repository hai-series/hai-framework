import { writeFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { runAgentBuild } from '../../packages/ai/models/agents/build.mjs'

function driver(id = 'f'.repeat(64), podmanReady = true) {
  const calls = []
  return {
    calls,
    async run(engine, args) {
      calls.push([engine, ...args])
      if (engine === 'podman' && args[0] === 'info' && !podmanReady)
        throw new Error('engine offline')
      if (args[0] === 'build')
        await writeFile(args[args.indexOf('--iidfile') + 1], `sha256:${id}\n`)
    },
  }
}

describe('aCP Agent image build', () => {
  it('defaults to a minimal image and tags the actual local image ID', async () => {
    const { calls, run } = driver()
    const result = await runAgentBuild(['codex-acp'], run)
    expect(result).toEqual({
      engine: 'podman',
      variant: 'minimal',
      image: `hai-ai/codex-acp:2.5.0-minimal-${'f'.repeat(64)}`,
      imageId: `sha256:${'f'.repeat(64)}`,
    })
    expect(calls[1]).toContain('HAI_AGENT_PACKAGES=')
    expect(calls[1]).not.toContain('-t')
    expect(calls[2]).toEqual([
      'podman',
      'tag',
      result.imageId,
      result.image,
    ])
  })

  it('builds separate variants with only their requested packages and uses new tags when image content changes', async () => {
    const first = driver('a'.repeat(64))
    const second = driver('b'.repeat(64))
    const developer = await runAgentBuild([
      'deepseek-harness',
      '--variant=developer',
      '--go',
      '--java',
    ], first.run)
    const rebuilt = await runAgentBuild([
      'deepseek-harness',
      '--java',
      '--variant=developer',
      '--go',
    ], second.run)
    expect(developer.image).toMatch(/-developer-java-go-a{64}$/u)
    expect(rebuilt.image).toMatch(/-developer-java-go-b{64}$/u)
    const developerPackages = first.calls[1].find(value => value.startsWith('HAI_AGENT_PACKAGES='))
    expect(developerPackages).toContain('default-jdk-headless')
    expect(developerPackages).toContain('golang')
    expect(developerPackages).not.toContain('rustc')
    expect(developerPackages).not.toContain('libreoffice')
    const office = driver()
    const browser = driver()
    await runAgentBuild(['goose', '--variant=office'], office.run)
    await runAgentBuild(['goose', '--variant=browser'], browser.run)
    expect(office.calls[1].find(value => value.startsWith('HAI_AGENT_PACKAGES='))).toContain('libreoffice')
    expect(browser.calls[1].find(value => value.startsWith('HAI_AGENT_PACKAGES='))).toContain('chromium')
    expect(browser.calls[1].find(value => value.startsWith('HAI_AGENT_PACKAGES='))).not.toContain('libreoffice')
  })

  it('rejects conflicting options and malformed image IDs before assigning a tag', async () => {
    for (const args of [
      ['codex-acp', '--variant=office', '--go'],
      ['codex-acp', '--engine=podman', '--engine=docker'],
      ['codex-acp', '--variant=browser', '--variant=office'],
      ['codex-acp', '--variant=unknown'],
    ]) {
      const rejected = driver()
      await expect(runAgentBuild(args, rejected.run)).rejects.toThrow()
      expect(rejected.calls).toHaveLength(0)
    }
    const failed = driver('malformed')
    await expect(runAgentBuild(['goose'], failed.run)).rejects.toThrow('image ID')
    expect(failed.calls.map(call => call[1])).toEqual(['info', 'build'])
  })

  it('falls back to Docker only when the engine is automatic', async () => {
    const automatic = driver('c'.repeat(64), false)
    expect((await runAgentBuild(['goose'], automatic.run)).engine).toBe('docker')
    expect(automatic.calls.slice(0, 2)).toEqual([
      ['podman', 'info'],
      ['docker', 'info'],
    ])
    const explicit = driver('c'.repeat(64), false)
    await expect(runAgentBuild(['goose', '--engine=podman'], explicit.run)).rejects.toThrow('No ready podman')
    expect(explicit.calls).toEqual([
      ['podman', 'info'],
    ])
  })
})
