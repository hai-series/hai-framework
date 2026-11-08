/**
 * =============================================================================
 * @h-ai/ui - 自动导入预处理器测试
 * =============================================================================
 * 验证 autoImportHaiUi 预处理器的核心功能：
 * - 运行时组件注册表与真实导出一致
 * - global d.ts 与运行时注册表一致
 * - 模板中使用的组件自动注入 import
 * - 显式导入例外保持稳定
 * - 跳过第三方依赖、@h-ai/ui 包自身文件与非 .svelte 文件
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compile, parse, preprocess } from 'svelte/compiler'
import { describe, expect, it } from 'vitest'
import { autoImportHaiUi } from '../auto-import.js'

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const AUTO_IMPORT_FILE = join(PACKAGE_ROOT, 'auto-import.js')
const AUTO_IMPORT_DTS_FILE = join(PACKAGE_ROOT, 'auto-import.d.ts')
const COMPONENT_EXPORT_INDEX_FILES = [
  'src/lib/components/primitives/index.ts',
  'src/lib/components/compounds/index.ts',
  'src/lib/components/scenes/app/index.ts',
  'src/lib/components/scenes/charts/index.ts',
  'src/lib/components/scenes/ai/index.ts',
  'src/lib/components/scenes/crud/index.ts',
  'src/lib/components/scenes/crypto/index.ts',
  'src/lib/components/scenes/error/index.ts',
  'src/lib/components/scenes/iam/index.ts',
  'src/lib/components/scenes/guide/index.ts',
  'src/lib/components/scenes/storage/index.ts',
].map(relativePath => join(PACKAGE_ROOT, relativePath))

/**
 * 与浏览器原生值重名的组件保持显式导入，避免模板全局值声明与 DOM 构造器冲突。
 */
const EXPLICIT_IMPORT_COMPONENTS = ['Range'] as const

/** 取得预处理器实例 */
const preprocessor = autoImportHaiUi()

/** 调用 markup 的快捷方法 */
function process(content: string, filename = '/app/src/routes/+page.svelte') {
  return preprocessor.markup({ content, filename })
}

/** 用真实 Svelte 解析结果断言运行时绑定，避免只匹配字符串却生成无效 import。 */
function runtimeUiNames(content: string): string[] {
  const ast = parse(content, { modern: true })
  return (ast.instance?.content.body ?? []).flatMap((statement) => {
    if (statement.type !== 'ImportDeclaration' || statement.source.value !== '@h-ai/ui'
      || ('importKind' in statement && statement.importKind === 'type')) {
      return []
    }
    return statement.specifiers.flatMap(specifier => 'importKind' in specifier && specifier.importKind === 'type'
      ? []
      : [specifier.local.name])
  })
}

function uniqueSorted(values: string[]): string[] {
  return [
    ...new Set(values),
  ].sort((left, right) => left.localeCompare(right))
}

function readRuntimeRegistry(): string[] {
  const source = readFileSync(AUTO_IMPORT_FILE, 'utf8')
  const setMatch = source.match(/const UI_COMPONENTS = new Set\(\[(?<items>[\s\S]*?)\]\)/)
  const items = setMatch?.groups?.items ?? ''

  return uniqueSorted(
    [
      ...items.matchAll(/'([A-Z][A-Za-z0-9]+)'/g),
    ].map(match => match[1]!),
  )
}

function readGlobalDeclarations(): string[] {
  const source = readFileSync(AUTO_IMPORT_DTS_FILE, 'utf8')
  return uniqueSorted(
    [
      ...source.matchAll(/^\s*const\s+([A-Z][A-Za-z0-9]*)\s*:/gm),
    ].map(match => match[1]!),
  )
}

function readExportedComponentNames(): string[] {
  return uniqueSorted(
    COMPONENT_EXPORT_INDEX_FILES.flatMap((filePath) => {
      const source = readFileSync(filePath, 'utf8')
      return [
        ...source.matchAll(/export\s+\{\s*default\s+as\s+([A-Z][A-Za-z0-9]*)\s*\}/g),
      ].map(match => match[1]!)
    }),
  )
}

describe('组件注册表一致性', () => {
  it('运行时组件注册表应覆盖所有允许自动导入的公开组件', () => {
    const exportedComponents = readExportedComponentNames().filter(
      name => !EXPLICIT_IMPORT_COMPONENTS.includes(name as typeof EXPLICIT_IMPORT_COMPONENTS[number]),
    )

    expect(readRuntimeRegistry()).toEqual(exportedComponents)
  })

  it('显式导入例外不应进入运行时注册表', () => {
    const runtimeRegistry = readRuntimeRegistry()

    for (const componentName of EXPLICIT_IMPORT_COMPONENTS) {
      expect(runtimeRegistry).not.toContain(componentName)
    }
  })

  it('global d.ts 声明应与运行时注册表保持一致', () => {
    expect(readGlobalDeclarations()).toEqual(readRuntimeRegistry())
  })
})

describe('自动注入', () => {
  it('模板中使用的组件应自动注入 import 语句', () => {
    const input = `<script lang="ts">
  let name = $state('')
</script>

<Card title="测试">
  <Input bind:value={name} />
  <Button variant="primary">提交</Button>
</Card>`

    const result = process(input)
    expect(result.code).toContain(`from '@h-ai/ui'`)
    expect(result.code).toContain('Card')
    expect(result.code).toContain('Input')
    expect(result.code).toContain('Button')
  })

  it('新增的 AI / CRUD 组件也应被自动导入', () => {
    const input = `<script lang="ts">
  let rows = $state([])
</script>

<AiDocumentEditor content="# demo" />
<AiTableEditor columns={[]} rows={rows} />
<CrudPage />
<CrudDetailPanel />
<CrudEditPanel />`

    const result = process(input)
    expect(result.code).toContain('AiDocumentEditor')
    expect(result.code).toContain('AiTableEditor')
    expect(result.code).toContain('CrudPage')
    expect(result.code).toContain('CrudDetailPanel')
    expect(result.code).toContain('CrudEditPanel')
    expect(result.code).toContain(`from '@h-ai/ui'`)
  })

  it('已有 @h-ai/ui import 时应合并而非重复', () => {
    const input = `<script lang="ts">
  import { toast } from '@h-ai/ui';
  let val = $state('')
</script>

<Button>点击</Button>
<Input bind:value={val} />`

    const result = process(input)
    expect(result.code).toContain('toast')
    expect(result.code).toContain('Button')
    expect(result.code).toContain('Input')
    expect((result.code.match(/@h-ai\/ui/g) || []).length).toBe(1)
  })

  it('没有 script 标签时应自动创建', () => {
    const result = process('<Button variant="primary">提交</Button>')
    expect(result.code).toContain('<script lang="ts">')
    expect(result.code).toContain(`import { Button } from '@h-ai/ui'`)
  })

  it('连续无分号的公开子路径导入不应被重复注入', () => {
    const input = `<script lang="ts">
  import type { Snippet } from 'svelte'
  import { Avatar, Button } from '@h-ai/ui/components/primitives/index'
  import {
    Alert,
    Skeleton,
  } from '@h-ai/ui/components/compounds/index'
  import * as m from './messages.js'
  let name = $state('')
</script>
<Avatar name={name} /><Button /><Alert /><Skeleton />`
    expect(process(input).code).toBe(input)
  })

  it.each([
    `import { Button as OtherButton, type Card } from './other.js'`,
    `import type Card from './other.js'`,
    `import type * as Card from './other.js'`,
  ])('外部同名类型不可安全合并时给出明确构建诊断：%s', (declaration) => {
    const input = `<script lang="ts">
  ${declaration}
</script>
<Button /><OtherButton /><Card />`
    expect(() => process(input, '/app/src/routes/conflict/+page.svelte'))
      .toThrow('[auto-import-hai-ui] /app/src/routes/conflict/+page.svelte: Cannot auto-import component(s) Card')
    expect(() => process(input))
      .toThrow('Alias the type-only import or explicitly import the component under a different local name.')
  })

  it('外部类型设置别名后保留原类型并正确注入运行时组件', () => {
    const declaration = `import { Button as OtherButton, type Card as CardProps } from './other.js'`
    const result = process(`<script lang="ts">${declaration}</script><Button /><OtherButton /><Card />`)
    expect(result.code).toContain(declaration)
    expect(runtimeUiNames(result.code)).toEqual(['Button', 'Card'])
  })

  it('外部类型同名时允许显式使用另一个本地名的组件', () => {
    const declarations = `import type { Card } from './other.js'\nimport { Card as UiCard } from '@h-ai/ui'`
    const input = `<script lang="ts">${declarations}</script><UiCard />`
    const result = process(input)
    expect(result.code).toBe(input)
    expect(runtimeUiNames(result.code)).toEqual(['UiCard'])
  })

  it('同包类型组件被提升，外部组件别名保持原样', () => {
    const input = `<script lang="ts">
  import { Button as OtherButton } from './other.js'
  import type { Card } from '@h-ai/ui'
</script>
<Button /><OtherButton /><Card />`
    const result = process(input)
    expect(runtimeUiNames(result.code).sort()).toEqual(['Button', 'Card'])
    expect(result.code).toContain('Button as OtherButton')
  })

  it.each([
    `const text = "import { Card } from '@h-ai/ui'"`,
    `/* import { Card } from '@h-ai/ui' */`,
  ])('字符串和注释中的伪 import 保持原样：%s', (script) => {
    const input = `<script lang="ts">${script}</script><Button />`
    const result = process(input)
    expect(result.code).toContain(script)
    expect(runtimeUiNames(result.code)).toEqual(['Button'])
  })

  it('按具名绑定范围合并，保留别名、内部注释和尾逗号', () => {
    const input = `<script lang="ts">
  import {
    toast as showToast /* comment with } and import { Fake } */,
    type UserProfileProps,
  } from '@h-ai/ui';
</script><Button />`
    const result = process(input)
    expect(runtimeUiNames(result.code)).toEqual(['showToast', 'Button'])
    expect(result.code).toContain('toast as showToast /* comment with } and import { Fake } */')
    expect(result.code).toContain('type UserProfileProps, Button,')
    expect((result.code.match(/from '@h-ai\/ui'/g) ?? [])).toHaveLength(1)
  })

  it('只提升被用作组件的类型绑定，其他类型仍无运行时导入', () => {
    const input = `<script lang="ts">
  import /* keep type note */ type { Button, UserProfileProps } from '@h-ai/ui'
</script><Button />`
    const result = process(input)
    expect(runtimeUiNames(result.code)).toEqual(['Button'])
    expect(result.code).toContain('/* keep type note */')
    expect(result.code).toContain('type UserProfileProps')
  })

  it('内联类型别名提升时保留其显式组件映射', () => {
    const result = process(`<script lang="ts">import { type Button as Card, toast } from '@h-ai/ui'</script><Card /><Input />`)
    expect(runtimeUiNames(result.code)).toEqual(['Card', 'toast', 'Input'])
    expect(result.code).toContain('Button as Card')
  })

  it('命名空间和无关类型导入不被重写成具名组件导入', () => {
    const script = `import * as Ui from '@h-ai/ui'\nimport type { Props } from './other.js'`
    const result = process(`<script lang="ts">${script}</script><Button />`)
    expect(result.code).toContain(script)
    expect(runtimeUiNames(result.code)).toEqual(['Button', 'Ui'])
  })

  it('约32KiB的伪import文本保留且真实导入只补缺失组件', () => {
    const text = `${'import {'.repeat(4000)}} invalid`
    const script = `const example = ${JSON.stringify(text)};\nimport { Card } from '@h-ai/ui'`
    const result = process(`<script lang="ts">${script}</script><Button />`)
    expect(result.code).toContain(`const example = ${JSON.stringify(text)}`)
    expect(runtimeUiNames(result.code)).toEqual(['Card', 'Button'])
  })

  it.each([
    '<!-- <script>fake</script> -->',
    '<textarea><script>fake</script></textarea>',
  ])('注释和原始文本中的伪脚本保持原样并注入真实实例：%s', (fragment) => {
    const result = process(`${fragment}\n<Button />`)
    expect(result.code).toContain(fragment)
    expect(runtimeUiNames(result.code)).toEqual(['Button'])
    expect(compile(result.code, { generate: 'server' }).js.code)
      .toContain('import { Button } from \'@h-ai/ui\'')
  })

  it.each(['module', 'context="module"'])('保留%s脚本，识别真实实例已有绑定', (moduleAttribute) => {
    const module = `<script ${moduleAttribute} lang="ts">export const metadata = 1</script>`
    const input = `${module}\n<script lang="ts">import Button from './custom.svelte'</script>\n<Button />`
    const result = process(input)
    expect(result.code).toBe(input)
    expect(runtimeUiNames(result.code)).toEqual([])
    expect(compile(result.code, { generate: 'server' }).js.code).toContain('from \'./custom.svelte\'')
  })

  it.each(['module', 'context="module"'])('模板复用%s中的运行时组件绑定，不重复注入', (moduleAttribute) => {
    const input = `<script ${moduleAttribute}>import { Button } from '@h-ai/ui'</script>\n<Button />`
    const result = process(input)
    expect(result.code).toBe(input)
    expect(compile(result.code, { generate: 'server' }).js.code)
      .toContain('import { Button } from \'@h-ai/ui\'')
  })

  it('泛型属性中的大于号不截断脚本，原属性及BOM保持原样', () => {
    const opening = '<script lang="ts" generics="T extends Record<string, unknown>">'
    const result = process(`\uFEFF${opening}const count = 1</script>\n<Button />`)
    expect(result.code.startsWith(`\uFEFF${opening}`)).toBe(true)
    expect(result.code).toContain('const count = 1')
    expect(runtimeUiNames(result.code)).toEqual(['Button'])
    expect(compile(result.code, { generate: 'server' }).js.code)
      .toContain('import { Button } from \'@h-ai/ui\'')
  })

  it.each(['before', 'after'])('受控样式转换先执行，样式位于脚本%s且伪style文本保持有效', async (position) => {
    const originalStyle = '<style lang="scss">$tone: red; .actual { color: $tone; }</style>'
    const convertedStyle = '<style>.actual { color: red; }</style>'
    const fragment = '<!-- <style>$fake</style> -->\n<textarea><style></textarea>'
    const script = '<script lang="ts">const example = "<style>"</script>'
    const body = `${fragment}\n${script}\n<Button class="actual" />`
    const input = position === 'before'
      ? originalStyle + body
      : body + originalStyle
    const result = await preprocess(input, [
      {
        // 受控语言转换器只处理本例已知的样式块，验证公开预处理顺序，不仿造通用 SCSS 引擎。
        markup: ({ content }) => ({
          code: content.replace(originalStyle, convertedStyle),
        }),
      },
      preprocessor,
    ], { filename: '/app/src/routes/styled/+page.svelte' })
    expect(result.code).toContain(fragment)
    expect(result.code).toContain(script.slice('<script lang="ts">'.length, -'</script>'.length))
    expect(result.code).toContain(convertedStyle)
    expect(runtimeUiNames(result.code)).toEqual(['Button'])
    const compiled = compile(result.code, { generate: 'server' })
    expect(compiled.js.code).toContain('import { Button } from \'@h-ai/ui\'')
    expect(compiled.css?.code).toContain('color: red')
  })

  it('range 应保持显式导入，避免和 DOM Range 构造器冲突', () => {
    const result = process('<script lang="ts"></script>\n<Range />')
    expect(result.code).not.toContain(`from '@h-ai/ui'`)
  })
})

describe('跳过规则', () => {
  it.each([
    '<!-- <Button /> -->',
    '<textarea><Button /></textarea>',
    '<script lang="ts">const example = "<Button />"</script>',
  ])('仅示例中的组件不产生真实导入：%s', (input) => {
    expect(process(input).code).toBe(input)
  })

  it.each([
    '<script lang="ts">const Button = () => null</script><Button />',
    '<script module lang="ts">export const Button = () => null</script><Button />',
    '<script lang="ts">const { Button } = { Button: () => null }</script><Button />',
    '<script lang="ts">const components = [() => null]</script>{#each components as Button}<Button />{/each}',
    '<script lang="ts">const task = Promise.resolve(() => null)</script>{#await task then Button}<Button />{/await}',
    '{#snippet example(Button)}<Button />{/snippet}',
  ])('已有脚本与模板作用域的组件绑定不重复导入：%s', (input) => {
    const result = process(input)
    expect(result.code).toBe(input)
    expect(compile(result.code, { generate: 'server' }).js.code).toBeTruthy()
  })

  it('模板局部绑定不会隐藏作用域之外的真实 UI 组件', () => {
    const result = process('<script lang="ts">const components = [() => null]</script>{#each components as Button}<Button />{/each}<Button />')
    expect(runtimeUiNames(result.code)).toEqual(['Button'])
    expect(compile(result.code, { generate: 'server' }).js.code).toBeTruthy()
  })

  it('应跳过 @h-ai/ui 包自身的文件', () => {
    const input = `<script lang="ts"></script>\n<Button>测试</Button>`
    const result = process(input, '/workspaces/hai-framework/packages/ui/src/lib/components/compounds/Modal.svelte')
    expect(result.code).not.toContain(`from '@h-ai/ui'`)
  })

  it('应跳过 node_modules 中的 @h-ai/ui 文件', () => {
    const input = `<script lang="ts"></script>\n<Button>测试</Button>`
    const result = process(input, '/app/node_modules/@h-ai/ui/src/Button.svelte')
    expect(result.code).not.toContain(`from '@h-ai/ui'`)
  })

  it('应跳过 node_modules 中的第三方 Svelte 源码', () => {
    const input = `<script lang="ts">
  const Tooltip = {}
</script>

<Tooltip.Root />`
    const result = process(input, '/app/node_modules/layerchart/dist/components/charts/DefaultTooltip.svelte')
    expect(result.code).toBe(input)
  })

  it('应跳过非 .svelte 文件', () => {
    const result = process('<Button>测试</Button>', '/app/src/utils.ts')
    expect(result.code).not.toContain(`from '@h-ai/ui'`)
  })

  it('不应识别未注册的大写组件', () => {
    const result = process('<script lang="ts"></script>\n<MyCustomComponent />')
    expect(result.code).not.toContain(`from '@h-ai/ui'`)
  })
})
