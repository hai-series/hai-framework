const unsafeSvgElements = new Set([
  'a',
  'script',
  'style',
  'foreignobject',
  'iframe',
  'object',
  'embed',
  'link',
  'meta',
  'image',
  'use',
  'animate',
  'animatemotion',
  'animatetransform',
  'set',
])

/**
 * 校验 IconButton 字符串图标是否属于保守的内联 SVG 子集。
 *
 * 字符串入口只服务由应用代码内置的简单 path/circle 等图标。涉及链接、外部资源、
 * CSS、动画或可执行事件的 SVG 一律拒绝；复杂图标应使用 Svelte Snippet。
 */
export function sanitizeInlineSvg(markup: string): string {
  const trimmed = markup.trim()
  if (!trimmed || !/^<svg(?:\s[^>]*)?>[\s\S]*<\/svg>$/i.test(trimmed))
    return ''

  const hasUnsafeElement = [...trimmed.matchAll(/<\s*([a-z][\w-]*)\b/gi)]
    .some(([, tagName]) => tagName && unsafeSvgElements.has(tagName.toLowerCase()))
  const hasUnsafeAttribute = /\s(?:on[a-z]+|style|href|xlink:href|src)\s*=/i.test(trimmed)
  const hasExternalReference = /url\s*\(|@import|javascript:|vbscript:|data:text\/html|<\s*!/i.test(trimmed)

  return hasUnsafeElement || hasUnsafeAttribute || hasExternalReference ? '' : trimmed
}
