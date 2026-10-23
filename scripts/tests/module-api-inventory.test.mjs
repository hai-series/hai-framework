/** 公开 API 清单必须来自发布产物，并保持条件、类型转发和真实导出绑定。 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { expandPackageExports, inspectModuleApi } from '../module-api-inventory.mjs'

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'hai-api-inventory-'))
  const put = (path, value) => {
    const file = join(root, path)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, value)
  }
  try {
    return run(root, put)
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('published module API inventory', () => {
  it('preserves conditional entries and expands only real wildcard files', () => fixture((root, put) => {
    put('dist/button.js', 'export const Button = 1')
    put('dist/button.d.ts', 'export declare const Button: number')
    put('dist/private.txt', 'not exported')
    const entries = expandPackageExports(root, {
      '.': { types: './dist/index.d.ts', browser: './dist/browser.js', import: './dist/index.js' },
      './component/*': { import: './dist/*.js' },
      './blocked': null,
    })
    expect(entries.map(({ subpath, conditions, target }) => ({ subpath, conditions, target }))).toEqual([
      { subpath: '.', conditions: ['types'], target: './dist/index.d.ts' },
      { subpath: '.', conditions: ['browser'], target: './dist/browser.js' },
      { subpath: '.', conditions: ['import'], target: './dist/index.js' },
      { subpath: './component/button', conditions: ['import'], target: './dist/button.js' },
    ])
    expect(expandPackageExports(root, './dist/button.js')[0].subpath).toBe('.')
    expect(() => expandPackageExports(root, { '.': '../private.js' })).toThrow('Invalid export target')
    expect(() => expandPackageExports(root, { '.': './dist/../../private.js' })).toThrow('Invalid export target')
  }))

  it('follows aliases and stars while distinguishing type-only values and ambiguous bindings', () => fixture((root, put) => {
    const base = 'packages/example/'
    put(`${base}package.json`, JSON.stringify({ name: '@test/example', exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } } }))
    put(`${base}dist/a.js`, 'export const value = 1; export const conflict = 2')
    put(`${base}dist/a.d.ts`, 'export declare const value: number; export declare const conflict: number; export interface Options { enabled: boolean }')
    put(`${base}dist/b.js`, 'export const conflict = 3')
    put(`${base}dist/b.d.ts`, 'export declare const conflict: number')
    put(`${base}dist/internal.d.ts`, 'export declare function internal(): void')
    put(`${base}dist/internal.js`, 'export function internal() {}')
    put(`${base}dist/index.d.ts`, 'export { value as renamed } from \'./a.js\'; export type { Options } from \'./a.js\'; export type * from \'./internal.js\'; export * from \'./a.js\'; export * from \'./b.js\'')
    put(`${base}dist/index.js`, 'export { value as renamed } from \'./a.js\'; export * from \'./a.js\'; export * from \'./b.js\'')
    const result = inspectModuleApi(root)
    expect(result.errors).toEqual([])
    const symbols = result.packages[0].entries[0].symbols
    expect(symbols).toContainEqual({ name: 'renamed', kind: 'value', declaration: 'value', declarationKind: 'VariableDeclaration' })
    expect(symbols.find(item => item.name === 'Options')?.kind).toBe('type')
    expect(symbols.find(item => item.name === 'internal')?.kind).toBe('type')
    expect(symbols.find(item => item.name === 'conflict')?.kind).toBe('type')
  }))

  it('reports missing artifacts instead of replacing them with source declarations', () => fixture((root, put) => {
    put('packages/example/package.json', JSON.stringify({ name: '@test/example', exports: { browser: './dist/browser.js' } }))
    put('packages/example/src/browser.ts', 'export const browser = true')
    const result = inspectModuleApi(root)
    expect(result.errors).toEqual(['@test/example [browser]: missing ./dist/browser.js'])
    expect(result.packages[0].entries[0]).toMatchObject({ exists: false, symbols: [] })
  }))
})
