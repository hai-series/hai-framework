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
 * 直接使用上游类型，避免本地声明与实际依赖版本不一致。
 *
 * @example 模块内部上下文
 * ```ts
 * const api: MermaidApi = (await import('mermaid')).default
 * api.initialize({ securityLevel: 'strict' })
 * const result = await api.render('diagram-example', 'graph TD; A-->B')
 * const svg = result.svg
 * ```
 */
type MermaidApi = (typeof import('mermaid'))['default']

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
      const mermaid = module.default
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'default',
        // 不允许文档指令修改安全策略、消毒规则或注入页面级 CSS。
        secure: ['secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'suppressErrorRendering', 'maxEdges', 'themeCSS', 'themeVariables', 'fontFamily', 'altFontFamily', 'dompurifyConfig'],
      })
      return mermaid
    })
  }

  return mermaidLoader
}

/**
 * 把 mermaid 源码渲染为 SVG 字符串；语法错误时抛出由调用方兜底展示。
 * @param code - Mermaid 或待渲染的代码源码。
 * @returns 严格模式渲染的 SVG；保留节点、连线和文字所需的样式。
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
  // 编辑预览中隐藏样式节点自身，但保留其 CSS 规则；删除规则会使节点成为黑色实心块。
  return svg.replace(/<style>/gi, '<style style="display:none">')
}
