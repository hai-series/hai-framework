/**
 * Mermaid host 同步状态工具。
 *
 * Mermaid 图表通过 {@html} 插入占位节点后异步渲染。流式输出时，HTML 占位可能不变，
 * 但源码正文会持续变化，因此必须用源码签名判断是否需要重渲染。
 */

export interface MermaidHostRenderActionInput {
  /** 当前 host 上记录的渲染状态。 */
  status?: string
  /** 当前 host 上一次渲染使用的源码签名。 */
  renderedSignature?: string
  /** 本次 Markdown 解析得到的最新源码签名。 */
  nextSignature: string
}

export type MermaidHostRenderAction
  = | { shouldRender: false }
    | { shouldRender: true, token: string }

/**
 * 为 Mermaid block 生成稳定签名。
 *
 * 签名同时包含 block id 与源码正文，避免流式阶段占位 HTML 未变化时漏掉源码更新。
 */
export function createMermaidSourceSignature(blockId: string, code: string): string {
  return JSON.stringify([blockId, code])
}

/**
 * 判断 Mermaid host 是否需要发起一次新的异步渲染。
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
 */
export function isCurrentMermaidRenderToken(
  renderToken: string,
  currentSignature: string | undefined,
): boolean {
  return renderToken === currentSignature
}
