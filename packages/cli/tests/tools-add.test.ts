import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { addModule } from '../src/commands/cli-add.js'

it('adds optional tools and its skill without requiring AI, Runner or a lifecycle configuration', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'hai-add-tools-'))
  try {
    await writeFile(path.join(directory, 'package.json'), JSON.stringify({
      name: 'custom-tools',
      version: '0.1.0',
      dependencies: { '@h-ai/core': 'catalog:' },
    }))
    await addModule({ module: 'tools', install: false, cwd: directory })
    const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'))
    expect(manifest.dependencies['@h-ai/tools']).toBe('catalog:')
    expect(manifest.dependencies['@h-ai/ai']).toBeUndefined()
    expect(manifest.dependencies['@h-ai/runner']).toBeUndefined()
    await expect(readFile(path.join(directory, 'config/_tools.yml'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    const skill = await readFile(path.join(directory, '.agents/skills/hai-tools/SKILL.md'), 'utf8')
    expect(skill).toContain('name: hai-tools')
    await addModule({ module: 'tools', install: false, cwd: directory })
    const repeated = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'))
    expect(repeated.dependencies).toEqual(manifest.dependencies)
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
})
