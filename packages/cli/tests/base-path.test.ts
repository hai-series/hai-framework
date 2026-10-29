import { mkdtemp, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { core } from '@h-ai/core'
import { expect, it } from 'vitest'
import { buildTemplateContext, generateFromTemplates } from '../src/commands/cli-template-engine.js'

it.each(['admin', 'h5', 'website'] as const)('svelteKit %s使用同一公开挂载前缀校验，支持多级目录并拒绝非法地址', async (appType) => {
  const root = await mkdtemp(path.join(fileURLToPath(new URL('../../../tmp/', import.meta.url)), 'hai-base-path-'))
  try {
    await generateFromTemplates(root, buildTemplateContext({ name: 'prefix-app', appType, features: [], packageManager: 'pnpm' }))
    const source = (await readFile(path.join(root, 'scripts/public-base-path.mjs'), 'utf8')).replace(/^import .+\n/gm, '').replace(/^export /gm, '')
    const evaluate = (base: string | undefined) => runInNewContext(`${source}\nresolvePublicBasePath()`, { core, process: { env: { PUBLIC_BASE_PATH: base } } })
    expect(evaluate(undefined)).toBe('')
    expect(evaluate('/yyy')).toBe('/yyy')
    expect(evaluate('/yyy/sub')).toBe('/yyy/sub')
    for (const value of ['/', '//host', 'https://host/yyy', '/yyy/', '/a/../b', '/a/./b', '/a%2fb', '/a?x=1', '/a#b', '/a\\b'])
      expect(() => evaluate(value)).toThrow('PUBLIC_BASE_PATH')
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})
