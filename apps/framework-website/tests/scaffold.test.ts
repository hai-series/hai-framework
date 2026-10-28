import type { CoreConfig } from '@h-ai/core'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { core } from '@h-ai/core'
import { describe, expect, it } from 'vitest'
import { load } from '../src/routes/+layout.server'

const rootDir = fileURLToPath(new URL('..', import.meta.url))

describe('generated scaffold', () => {
  it('declares project metadata and quality gate scripts', async () => {
    const packageJsonPath = join(rootDir, 'package.json')
    const pkg = JSON.parse(await readFile(packageJsonPath, 'utf-8')) as {
      name: string
      scripts: Record<string, string>
    }

    expect(pkg.name).toBe('framework-website')
    expect(pkg.scripts.typecheck).toBeDefined()
    expect(pkg.scripts.lint).toBeDefined()
    expect(pkg.scripts.test).toBeDefined()
    expect(pkg.scripts['test:e2e']).toBeDefined()
  })

  it('renders the app shell locale marker', async () => {
    const appHtml = await readFile(join(rootDir, 'src/app.html'), 'utf-8')
    expect(appHtml).toContain('lang="%lang%"')
  })

  it('ships an application config loaded at startup', async () => {
    const result = core.config.load<CoreConfig>('core', join(rootDir, 'config/_core.yml'))
    expect(result.success).toBe(true)
    if (!result.success)
      return
    expect(result.data.name).toBe(process.env.HAI_CORE_NAME ?? 'framework-website')
    expect(result.data.defaultLocale).toBe(process.env.HAI_CORE_DEFAULTLOCALE ?? 'zh-CN')
  })

  it('publishes only public metadata from parsed core configuration', async () => {
    const result = await load()
    expect(Object.keys(result).sort()).toEqual(['navigation', 'version'])
    expect(result.version).toMatch(/^\d+\.\d+\.\d+/)
    expect(result.navigation.sections).toHaveLength(6)
    expect(JSON.stringify(result)).not.toContain('password')
  })
})
