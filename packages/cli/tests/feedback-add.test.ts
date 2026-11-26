import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { addModule } from '../src/commands/cli-add.js'

describe('feedback 增量添加', () => {
  it('从仅有 core 的工程补齐 IAM 完整直接依赖、配置、环境与 skill', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'hai-add-feedback-'))
    try {
      await writeFile(path.join(directory, 'package.json'), JSON.stringify({
        name: 'feedback-add-sample',
        version: '0.1.0',
        dependencies: { '@h-ai/core': 'catalog:' },
      }))
      await addModule({ module: 'feedback', install: false, cwd: directory })
      const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'))
      for (const name of [
        'feedback',
        'crypto',
        'reldb',
        'cache',
        'iam',
      ])
        expect(manifest.dependencies[`@h-ai/${name}`]).toBe('catalog:')
      for (const module of [
        'feedback',
        'db',
        'cache',
        'iam',
      ])
        expect(await readFile(path.join(directory, 'config', `_${module}.yml`), 'utf8')).not.toBe('')
      for (const module of ['storage', 'reach']) {
        expect(manifest.dependencies[`@h-ai/${module}`]).toBeUndefined()
        await expect(readFile(path.join(directory, 'config', `_${module}.yml`), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
      }
      const feedback = await readFile(path.join(directory, 'config/_feedback.yml'), 'utf8')
      expect(feedback).toContain('HAI_FEEDBACK_APPID:my-app')
      expect(await readFile(path.join(directory, '.env.prod'), 'utf8')).toContain('HAI_CACHE_')
      expect(await readFile(path.join(directory, '.agents/skills/hai-feedback/SKILL.md'), 'utf8')).toContain('name: hai-feedback')
      expect(await readFile(path.join(directory, '.agents/skills/hai-iam/SKILL.md'), 'utf8')).toContain('name: hai-iam')
    }
    finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('首次与重复添加均保留已有 Reach/feedback 私有配置及环境值', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'hai-add-feedback-private-'))
    try {
      await writeFile(path.join(directory, 'package.json'), JSON.stringify({
        name: 'feedback-private-sample',
        version: '0.1.0',
        dependencies: { '@h-ai/core': 'catalog:' },
      }))
      await mkdir(path.join(directory, 'config'))
      const reach = '# Private provider mapping\nproviders:\n  - name: existing-email\n    type: console\n'
      const feedback = 'appId: private-app\n'
      await writeFile(path.join(directory, 'config/_reach.yml'), reach)
      await writeFile(path.join(directory, 'config/_feedback.yml'), feedback)
      await writeFile(path.join(directory, '.env.prod'), 'HAI_CACHE_HOST=private-cache.example.test\n')
      await addModule({ module: 'feedback', install: false, cwd: directory })
      await addModule({ module: 'feedback', install: false, cwd: directory })
      expect(await readFile(path.join(directory, 'config/_reach.yml'), 'utf8')).toBe(reach)
      expect(await readFile(path.join(directory, 'config/_feedback.yml'), 'utf8')).toBe(feedback)
      expect(await readFile(path.join(directory, '.env.prod'), 'utf8')).toContain('HAI_CACHE_HOST=private-cache.example.test')
    }
    finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
