/** 环境目录只把真实源码与模板引用作为入口，JSDoc 的配置说明仍由 Schema 文档提取器读取。 */
import ts from 'typescript'

/** 只处理 AST 节点边界上的真实 JSDoc，不把字符串、正则或模板文本中的注释标记当注释。 */
function withoutJsdoc(content, fileName) {
  const source = ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true)
  const ranges = new Map()
  function collect(comments) {
    for (const comment of comments ?? []) {
      if (comment.kind === ts.SyntaxKind.MultiLineCommentTrivia && content.startsWith('/**', comment.pos))
        ranges.set(comment.pos, comment)
    }
  }
  function visit(node) {
    collect(ts.getLeadingCommentRanges(content, node.pos))
    collect(ts.getTrailingCommentRanges(content, node.end))
    ts.forEachChild(node, visit)
  }
  visit(source)
  // 保留长度与换行，避免删除注释后把相邻词法单元拼成新的变量引用。
  return [...ranges.values()].sort((a, b) => b.pos - a.pos).reduce((text, range) =>
    text.slice(0, range.pos) + text.slice(range.pos, range.end).replace(/[^\r\n]/g, ' ') + text.slice(range.end), content)
}

/**
 * 为环境入口扫描排除实际 JS/TS JSDoc；Svelte 只处理脚本，YAML 与生成模板保留原文。
 * @param content - 文件完整源码；不会执行或读取其中变量。
 * @param fileName - 文件路径，仅用于确定语法类别。
 * @returns 等长源码；仅 JSDoc 的非换行字符替换为空格。
 * @example 模块内部上下文
 * ```ts
 * const { readFile } = await import('node:fs/promises')
 * const source = await readFile('packages/core/src/core-config.ts', 'utf8')
 * const runtime = environmentReferenceSource(source, 'core-config.ts')
 * ```
 */
export function environmentReferenceSource(content, fileName) {
  if (/\.(?:ts|js|mjs)$/.test(fileName))
    return withoutJsdoc(content, fileName)
  if (fileName.endsWith('.svelte')) {
    // 保留模板标记与属性原文，只有真实 JS/TS script 内的 JSDoc 被排除。
    return content.replace(/(<script\b(?:"[^"]*"|'[^']*'|[^'">])*>)([\s\S]*?)(<\/script\s*>)/gi, (whole, opening, script, closing) => {
      const lang = /\blang\s*=\s*["']([^"']+)["']/i.exec(opening)?.[1]
      if (lang && !['ts', 'js', 'typescript', 'javascript'].includes(lang))
        return whole
      return `${opening}${withoutJsdoc(script, `${fileName}.ts`)}${closing}`
    })
  }
  return content
}
