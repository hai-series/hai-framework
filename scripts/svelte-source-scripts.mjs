/** 仓库源码门禁共用真实 Svelte AST 的脚本边界，保留原始文件坐标。 */
import { parse } from 'svelte/compiler'

/** 仅返回真实 module/instance 内容；注释与原始文本中的示例不属于脚本。 */
export function svelteSourceScripts(content, filename) {
  // Svelte 会移除 BOM；主动分离后还原坐标，避免调用方覆盖第一个脚本字符。
  const prefixLength = content.startsWith('\uFEFF')
    ? 1
    : 0
  const root = parse(content.slice(prefixLength), { filename, modern: true })
  return [root.module, root.instance].filter(Boolean).map(script => ({
    start: script.content.start + prefixLength,
    end: script.content.end + prefixLength,
  })).sort((a, b) => a.start - b.start)
}
