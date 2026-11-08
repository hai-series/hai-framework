/** Svelte 文档过滤只修改 AST 确认的真实脚本，不污染页面示例。 */
import { expect, it } from 'vitest'
import { environmentReferenceSource } from '../env-reference-source.mjs'

it('注释与 textarea 的伪脚本保持原文，真实 module/泛型脚本只过滤 JSDoc', () => {
  const source = [
    '\uFEFF<!-- <script>/** process.env.HAI_COMMENT_EXAMPLE */</script> -->',
    '<textarea><script>/** process.env.HAI_TEXTAREA_EXAMPLE */</script></textarea>',
    '<script module lang="ts">/** process.env.HAI_MODULE_DOC */ export const shared = process.env.HAI_MODULE_RUNTIME</script>',
    '<script lang="ts" generics="T extends Record<string, unknown>">',
    '/** process.env.HAI_INSTANCE_DOC */',
    'const actual = process.env.HAI_INSTANCE_RUNTIME',
    '</script>',
  ].join('\n')
  const output = environmentReferenceSource(source, 'fixture.svelte')
  expect(output.length).toBe(source.length)
  expect(output.split('\n').length).toBe(source.split('\n').length)
  for (const variable of [
    'COMMENT_EXAMPLE',
    'TEXTAREA_EXAMPLE',
    'MODULE_RUNTIME',
    'INSTANCE_RUNTIME',
  ])
    expect(output).toContain(`process.env.HAI_${variable}`)
  for (const variable of ['MODULE_DOC', 'INSTANCE_DOC'])
    expect(output).not.toContain(`process.env.HAI_${variable}`)
})
