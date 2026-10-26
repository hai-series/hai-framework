/** 文档门禁必须拒绝遗漏、虚构公开 API 和未收窄的 HaiResult；示例仅编译、不执行。 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { it } from 'vitest'
import { collectDeclarations, extractExamples, typecheckVirtualFiles } from '../check-module-jsdoc.mjs'

it('公开声明、内部类型与 Svelte Props 均参与覆盖检查，模块注释不计入声明文档', () => {
  const records = collectDeclarations('fixture.ts', '/** @module fixture */\nexport const value = 1\n/** 输入。 */\ninterface Input { value: string }')
  assert.equal(records.length, 2)
  assert.equal(records[0].doc, '')
  assert.equal(records[1].exported, false)
  assert.ok(records[1].doc.includes('输入'))
  assert.equal(collectDeclarations('fixture.svelte', '<script lang="ts">interface Props { value: string }</script>')[0].names[0], 'Props')
})

it('内部上下文和 fenced 示例须显式声明，不能用自然语言代替可编译代码', () => {
  assert.deepEqual(extractExamples('@example 模块内部上下文\n```ts\nconst input: Input = { value: "x" }\n```'), [{ internal: true, blocks: [{ language: 'ts', code: 'const input: Input = { value: "x" }' }] }])
  assert.equal(extractExamples('@example call(value)')[0].blocks.length, 0)
  const source = '/**\r\n * 参数。\r\n * @example\r\n * ```ts\r\n * const value = 1\r\n * ```\r\n */\r\nexport const value = 1'
  assert.equal(extractExamples(collectDeclarations('windows.ts', source)[0].doc)[0].blocks[0].code, 'const value = 1')
  const email = extractExamples('@example\n```ts\nconst email = "ada@example.com"\n```')
  assert.equal(email.length, 1)
  assert.equal(email[0].blocks[0].code, 'const email = "ada@example.com"')
})

it('真实公开入口和 HaiResult 收窄通过，虚构入口和未判 success 均失败', () => {
  const file = resolve('scripts/tests/__hai_doc_probe.ts')
  const valid = 'import { ok } from "@h-ai/core"; const result = ok("value"); if (result.success) result.data.toUpperCase()'
  assert.deepEqual(typecheckVirtualFiles(new Map([[file, valid]])), [])
  const diagnostics = typecheckVirtualFiles(new Map([[file, 'import { inventedApi, type HaiResult } from "@h-ai/core"; function read(result: HaiResult<string>) { return result.data }']]))
  assert.ok(diagnostics.some(item => item.code === 2305))
  assert.ok(diagnostics.some(item => item.code === 2339))
})

it('内部 Svelte 依赖保留真实 Props 类型，不通过通用组件 shim 退化为 any', () => {
  const file = resolve('packages/ui/src/lib/components/primitives/__hai_doc_resolver_probe.ts')
  const code = 'import Button from "./Button.svelte"; import type { ComponentProps } from "svelte"; const props: ComponentProps<typeof Button> = { variant: "invalid-variant" }'
  const diagnostics = typecheckVirtualFiles(new Map([[file, code]]))
  assert.ok(diagnostics.some(item => item.code === 2322))
})

it('uI 既有 CSS ambient 声明支持真实样式资产，同时保留组件属性错误', () => {
  const file = resolve('packages/ui/src/lib/components/primitives/__hai_doc_css_probe.ts')
  const code = 'export async function load() { await import("@rrweb/replay/dist/style.css") }'
  assert.ok(existsSync(resolve('node_modules/@rrweb/replay/dist/style.css')))
  assert.ok(typecheckVirtualFiles(new Map([[file, code]])).some(item => item.code === 2307))
  const ambient = resolve('packages/ui/ambient.d.ts')
  const files = new Map([[file, code], [ambient, readFileSync(ambient, 'utf8')]])
  assert.deepEqual(typecheckVirtualFiles(files), [])
  files.set(file, `${code}\nimport Button from "./Button.svelte"; import type { ComponentProps } from "svelte"; const props: ComponentProps<typeof Button> = { variant: "invalid-variant" }`)
  assert.ok(typecheckVirtualFiles(files).some(item => item.code === 2322))
})
