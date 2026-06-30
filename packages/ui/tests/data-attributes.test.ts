/**
 * =============================================================================
 * @h-ai/ui - data-* 属性透传契约测试
 * =============================================================================
 */

import { readFileSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url))
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
  const scriptEnd = source.indexOf('</script>')
  if (scriptEnd === -1)
    return false

  const template = source.slice(scriptEnd + '</script>'.length)
  return /<(?!\/|!|style\b|script\b)[A-Za-z][\w:.-]*(?=[\s>])/.test(template)
}

describe('公开 Svelte 组件 data-* 透传', () => {
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
})
