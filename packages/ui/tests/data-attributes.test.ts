// @vitest-environment jsdom
/**
 * =============================================================================
 * @h-ai/ui - data-* 属性透传契约测试
 * =============================================================================
 */

import { readFileSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { flushSync, mount, unmount } from 'svelte'
import { parse } from 'svelte/compiler'
import { describe, expect, it } from 'vitest'
import CrudFilterBar from '../src/lib/components/scenes/crud/CrudFilterBar.svelte'

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const COMPONENT_INDEX_FILES = [
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

function readExportedSvelteComponents(): string[] {
  return COMPONENT_INDEX_FILES.flatMap((indexFile) => {
    const source = readFileSync(indexFile, 'utf8')
    return [...source.matchAll(/export\s+\{\s+default\s+as\s+\w+\s+\}\s+from\s+'(?<path>[^']+\.svelte)'/g)]
      .map((match) => {
        const componentPath = match.groups?.path
        if (!componentPath)
          throw new Error(`Cannot read component export path in ${indexFile}`)
        return normalize(join(dirname(indexFile), componentPath))
      })
  }).sort((left, right) => left.localeCompare(right))
}

function hasTemplateHost(source: string): boolean {
  function hasElement(node: unknown): boolean {
    if (Array.isArray(node))
      return node.some(hasElement)
    if (!node || typeof node !== 'object')
      return false
    if ('type' in node && (node.type === 'RegularElement' || node.type === 'SvelteElement'))
      return true
    return Object.values(node).some(hasElement)
  }
  // 组件包装器不创建 DOM；条件分支、snippet 和动态元素中的真实宿主仍须覆盖。
  return hasElement(parse(source, { modern: true }).fragment)
}

describe('公开 Svelte 组件 data-* 透传', () => {
  it('按模板AST识别实际宿主，不把组件名和脚本中的HTML字符串当作DOM', () => {
    expect(hasTemplateHost('<script>const example = "<div>"</script><TableToolbar />')).toBe(false)
    expect(hasTemplateHost('{#if visible}<section />{/if}')).toBe(true)
    expect(hasTemplateHost('<svelte:element this={tag} />')).toBe(true)
  })

  it('有宿主节点的组件应该统一使用 getDataAttributes 并挂载 dataAttributes', () => {
    const missing = readExportedSvelteComponents()
      .filter((componentPath) => {
        const source = readFileSync(componentPath, 'utf8')
        if (!hasTemplateHost(source))
          return false
        return !source.includes('getDataAttributes(restProps)') || !source.includes('{...dataAttributes}')
      })

    expect(missing).toEqual([])
  })

  it('纯组件包装的CrudFilterBar仍将data-*传到真实工具栏宿主', async () => {
    const target = document.body.appendChild(document.createElement('div'))
    const component = mount(CrudFilterBar, { target, props: { 'data-testid': 'orders-filters', 'data-loading': false, 'data-count': 0 } })
    try {
      flushSync()
      const host = target.querySelector('[data-testid="orders-filters"]')
      expect(host).not.toBeNull()
      expect(host?.getAttribute('data-loading')).toBe('false')
      expect(host?.getAttribute('data-count')).toBe('0')
      expect(host?.querySelector('form')).not.toBeNull()
      expect(target.querySelectorAll('[data-testid="orders-filters"]')).toHaveLength(1)
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })
})
