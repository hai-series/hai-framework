/**
 * Mermaid host 同步状态工具。
 *
 * Mermaid 图表通过 {@html} 插入占位节点后异步渲染。流式输出时，HTML 占位可能不变，
 * 但源码正文会持续变化，因此必须用源码签名判断是否需要重渲染。
 *
 * @example 模块内部上下文
 * ```ts
 * const example: MermaidHostRenderActionInput = { status: 'ready', renderedSignature: 'old-source', nextSignature: 'new-source' }
 * ```
 */

export interface MermaidHostRenderActionInput {
  /** 当前 host 上记录的渲染状态。 */
  status?: string
  /** 当前 host 上一次渲染使用的源码签名。 */
  renderedSignature?: string
  /** 本次 Markdown 解析得到的最新源码签名。 */
  nextSignature: string
}

/**
 * 异步 Mermaid 渲染决策；仅 shouldRender=true 时携带提交 token。
 *
 * @example 模块内部上下文
 * ```ts
 * const example: MermaidHostRenderAction = { shouldRender: true, token: 'diagram-1-source' }
 * ```
 */
export type MermaidHostRenderAction
  = | { shouldRender: false }
    | { shouldRender: true, token: string }

/**
 * 为 Mermaid block 生成稳定签名。
 *
 * 签名同时包含 block id 与源码正文，避免流式阶段占位 HTML 未变化时漏掉源码更新。
 * @param blockId - 当前代码块的稳定 ID。
 * @param code - Mermaid 或待渲染的代码源码。
 * @returns 绑定块 id 和完整源码的稳定签名。
 *
 * @example 模块内部上下文
 * ```ts
 * const signature = createMermaidSourceSignature('diagram-1', 'graph TD; A-->B')
 * ```
 */
export function createMermaidSourceSignature(blockId: string, code: string): string {
  return JSON.stringify([blockId, code])
}

/**
 * 判断 Mermaid host 是否需要发起一次新的异步渲染。
 * @param input - 当前状态及目标源码签名。
 * @returns 是否重渲染的决策，需要时携带提交 token。
 *
 * @example 模块内部上下文
 * ```ts
 * const action = getMermaidHostRenderAction({ status: 'ready', renderedSignature: 'old', nextSignature: 'new' })
 * if (action.shouldRender) { const token = action.token }
 * ```
 */
export function getMermaidHostRenderAction(
  input: MermaidHostRenderActionInput,
): MermaidHostRenderAction {
  const status = input.status?.trim()
  const renderedSignature = input.renderedSignature?.trim()
  if (
    (status === 'ready' || status === 'rendering' || status === 'error')
    && renderedSignature === input.nextSignature
  ) {
    return { shouldRender: false }
  }

  return {
    shouldRender: true,
    token: input.nextSignature,
  }
}

/**
 * 判断异步 Mermaid 渲染结果是否仍对应当前 host 源码。
 * @param renderToken - 异步渲染启动时捕获的 token。
 * @param currentSignature - 宿主当前源码签名。
 * @returns 渲染 token 是否仍匹配当前源码签名。
 *
 * @example 模块内部上下文
 * ```ts
 * const accepted = isCurrentMermaidRenderToken('current-source', 'current-source')
 * const stale = isCurrentMermaidRenderToken('old-source', 'current-source')
 * ```
 */
export function isCurrentMermaidRenderToken(
  renderToken: string,
  currentSignature: string | undefined,
): boolean {
  return renderToken === currentSignature
}
