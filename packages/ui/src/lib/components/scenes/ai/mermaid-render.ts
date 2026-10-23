/**
 * @h-ai/ui — Mermaid 图表渲染助手
 *
 * 以懒加载方式引入 mermaid，把图表源码渲染为安全的 SVG。
 * 使用 `securityLevel: 'strict'`，由 mermaid 自身完成消毒，避免 {@html} 注入风险。
 */

/** mermaid 模块只在首次渲染时动态加载，并缓存初始化后的实例。 */
let mermaidLoader: Promise<MermaidApi> | null = null

/** render id 需要在页面内唯一，递增计数器即可保证不冲突。 */
let renderSeq = 0

/**
 * mermaid 默认导出在本仓库未提供类型声明，这里只声明用到的最小子集。
 *
 * @example 模块内部上下文
 * ```ts
 * const api: MermaidApi = (await import('mermaid')).default
 * api.initialize({ securityLevel: 'strict' })
 * const result = await api.render('diagram-example', 'graph TD; A-->B')
 * const svg = result.svg
 * ```
 */
interface MermaidApi {
  initialize: (config: Record<string, unknown>) => void
  render: (id: string, code: string) => Promise<{ svg: string }>
}

/**
 * 判断 fence 语言是否为 mermaid。
 * @param language - 待识别的语言标记。
 * @returns 语言标记是否属于 Mermaid。
 *
 * @example 模块内部上下文
 * ```ts
 * const supported = isMermaidLanguage('mermaid')
 * ```
 */
export function isMermaidLanguage(language: string | undefined | null): boolean {
  return (language ?? '').trim().toLowerCase() === 'mermaid'
}

/**
 * 懒加载并初始化 mermaid，多次调用复用同一实例。
 */
async function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidLoader) {
    mermaidLoader = import('mermaid').then((module) => {
      const mermaid = module.default as unknown as MermaidApi
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'default',
      })
      return mermaid
    })
  }

  return mermaidLoader
}

/**
 * 把 mermaid 源码渲染为 SVG 字符串；语法错误时抛出由调用方兜底展示。
 * @param code - Mermaid 或待渲染的代码源码。
 * @returns 严格模式渲染并移除样式节点后的 SVG。
 * @throws 浏览器渲染、第三方解析或下载失败时抛出异常，由交互边界显示错误。
 *
 * @example 模块内部上下文
 * ```ts
 * const svg = await renderMermaidDiagram('graph TD; A-->B')
 * // 在浏览器异步渲染，失败由调用交互边界处理。
 * ```
 */
export async function renderMermaidDiagram(code: string): Promise<string> {
  const mermaid = await loadMermaid()
  const renderId = `hai-mermaid-${Date.now()}-${renderSeq++}`
  const { svg } = await mermaid.render(renderId, code)
  return svg
}

/**
 * Mermaid 11.x 会在 SVG 内写入很长的 style 标签内容；在 contenteditable 预览区里，
 * 部分浏览器会把这些 CSS 当成正文显示。这里保留 SVG 图形，剥离内联样式文本。
 * @param svg - 待移除样式节点的 SVG。
 * @returns 移除 style 元素后的 SVG 字符串。
 *
 * @example 模块内部上下文
 * ```ts
 * const svg = stripMermaidSvgStyleElements('<svg><style>.x{fill:red}</style><path d="M0 0"/></svg>')
 * ```
 */
export function stripMermaidSvgStyleElements(svg: string): string {
  return svg.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
}
