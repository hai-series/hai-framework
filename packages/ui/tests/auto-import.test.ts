/**
 * =============================================================================
 * @h-ai/ui - 自动导入预处理器测试
 * =============================================================================
 * 验证 autoImportHaiUi 预处理器的核心功能：
 * - 运行时组件注册表与真实导出一致
 * - global d.ts 与运行时注册表一致
 * - 模板中使用的组件自动注入 import
 * - 显式导入例外保持稳定
 * - 跳过 @h-ai/ui 包自身文件与非 .svelte 文件
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { autoImportHaiUi } from '../auto-import.js'

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const AUTO_IMPORT_FILE = join(PACKAGE_ROOT, 'auto-import.js')
const AUTO_IMPORT_DTS_FILE = join(PACKAGE_ROOT, 'auto-import.d.ts')
const COMPONENT_EXPORT_INDEX_FILES = [
  'src/lib/components/primitives/index.ts',
  'src/lib/components/compounds/index.ts',
  'src/lib/components/scenes/app/index.ts',
  'src/lib/components/scenes/ai/index.ts',
  'src/lib/components/scenes/crud/index.ts',
  'src/lib/components/scenes/crypto/index.ts',
  'src/lib/components/scenes/error/index.ts',
  'src/lib/components/scenes/iam/index.ts',
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

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

function readRuntimeRegistry(): string[] {
  const source = readFileSync(AUTO_IMPORT_FILE, 'utf8')
  const setMatch = source.match(/const UI_COMPONENTS = new Set\(\[(?<items>[\s\S]*?)\]\)/)
  const items = setMatch?.groups?.items ?? ''

  return uniqueSorted(
    [...items.matchAll(/'([A-Z][A-Za-z0-9]+)'/g)].map(match => match[1]!),
  )
}

function readGlobalDeclarations(): string[] {
  const source = readFileSync(AUTO_IMPORT_DTS_FILE, 'utf8')
  return uniqueSorted(
    [...source.matchAll(/^\s*const\s+([A-Z][A-Za-z0-9]*)\s*:/gm)].map(match => match[1]!),
  )
}

function readExportedComponentNames(): string[] {
  return uniqueSorted(
    COMPONENT_EXPORT_INDEX_FILES.flatMap((filePath) => {
      const source = readFileSync(filePath, 'utf8')
      return [...source.matchAll(/export\s+\{\s*default\s+as\s+([A-Z][A-Za-z0-9]*)\s*\}/g)].map(match => match[1]!)
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

  it('range 应保持显式导入，避免和 DOM Range 构造器冲突', () => {
    const result = process('<script lang="ts"></script>\n<Range />')
    expect(result.code).not.toContain(`from '@h-ai/ui'`)
  })
})

describe('跳过规则', () => {
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

  it('应跳过非 .svelte 文件', () => {
    const result = process('<Button>测试</Button>', '/app/src/utils.ts')
    expect(result.code).not.toContain(`from '@h-ai/ui'`)
  })

  it('不应识别未注册的大写组件', () => {
    const result = process('<script lang="ts"></script>\n<MyCustomComponent />')
    expect(result.code).not.toContain(`from '@h-ai/ui'`)
  })
})
