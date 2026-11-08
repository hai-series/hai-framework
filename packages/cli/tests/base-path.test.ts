import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { core } from '@h-ai/core'
import ts from 'typescript'
import { expect, it } from 'vitest'
import { buildTemplateContext, generateFromTemplates } from '../src/commands/cli-template-engine.js'

it('生成的公开目录 helper 在 checkJs 严格检查下满足 Kit 路径类型', async () => {
  const workspace = fileURLToPath(new URL('../../../', import.meta.url))
  const root = await mkdtemp(path.join(workspace, 'tmp', 'hai-base-path-types-'))
  try {
    await generateFromTemplates(root, buildTemplateContext({
      name: 'prefix-types-app',
      appType: 'admin',
      features: [],
      packageManager: 'pnpm',
    }))
    const consumer = path.join(root, 'base-path-consumer.mts')
    await writeFile(consumer, [
      'import { resolvePublicBasePath } from \'./scripts/public-base-path.mjs\'',
      `type Paths = { base?: '' | \`/\${string}\` }`,
      'export const paths: Paths[] = [',
      '  { base: resolvePublicBasePath() },',
      '  { base: resolvePublicBasePath(\'\') },',
      '  { base: resolvePublicBasePath(\'/yyy/sub\') },',
      ']',
    ].join('\n'))
    const program = ts.createProgram([consumer], {
      allowJs: true,
      checkJs: true,
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      types: ['node'],
      typeRoots: [
        path.join(workspace, 'node_modules', '@types'),
      ],
      paths: {
        '@h-ai/core': [
          path.join(workspace, 'packages/core/dist/node.d.ts'),
        ],
      },
    })
    const diagnostics = ts.getPreEmitDiagnostics(program)
    expect(diagnostics.map(item => ts.flattenDiagnosticMessageText(item.messageText, '\n'))).toEqual([])
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)

it.each(['admin', 'h5', 'website'] as const)('svelteKit %s使用同一公开挂载前缀校验，支持多级目录并拒绝非法地址', async (appType) => {
  const root = await mkdtemp(path.join(fileURLToPath(new URL('../../../tmp/', import.meta.url)), 'hai-base-path-'))
  try {
    await generateFromTemplates(root, buildTemplateContext({
      name: 'prefix-app',
      appType,
      features: [],
      packageManager: 'pnpm',
    }))
    const source = (await readFile(path.join(root, 'scripts/public-base-path.mjs'), 'utf8')).replace(/^import[^\n]*\n/gm, '').replace(/^export /gm, '')
    const evaluate = (base: string | undefined) => runInNewContext(`${source}\nresolvePublicBasePath()`, {
      core,
      process: {
        env: { PUBLIC_BASE_PATH: base },
      },
    })
    expect(evaluate(undefined)).toBe('')
    expect(evaluate('/yyy')).toBe('/yyy')
    expect(evaluate('/yyy/sub')).toBe('/yyy/sub')
    for (const value of [
      '/',
      '//host',
      'https://host/yyy',
      '/yyy/',
      '/a/../b',
      '/a/./b',
      '/a%2fb',
      '/a?x=1',
      '/a#b',
      '/a\\b',
    ])
      expect(() => evaluate(value)).toThrow('PUBLIC_BASE_PATH')
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})
