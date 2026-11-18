import type { AiMindMapData, AiMindMapNode } from './mind-types.js'

/**
 * 画布引擎接受的最小节点形状，只保留 id、主题和子树。
 *
 * @example 模块内部上下文
 * ```ts
 * const example: EngineNode = { id: 'root', topic: '中心主题', children: [] }
 * ```
 */
interface EngineNode {
  id: string
  topic: string
  children?: EngineNode[]
}

/**
 * 把项目协议转换为引擎最小输入，避免把协议外字段送入画布。
 *
 * @example
 * ```ts
 * import { toMindElixirData } from '@h-ai/ui'
 * const map = toMindElixirData({ kind: 'mind/v1', layout: 'right', root: { id: 'root', text: '中心主题', children: [] } })
 * ```
 */
export function toMindElixirData(data: AiMindMapData): { nodeData: EngineNode, direction: 0 | 1 | 2 } {
  return {
    nodeData: toEngineNode(data.root),
    direction: data.layout === 'left'
      ? 0
      : data.layout === 'both'
        ? 2
        : 1,
  }
}

/**
 * 从引擎快照提取项目支持的节点字段，折叠等视图状态不会进入持久化数据。
 *
 * @example
 * ```ts
 * import { fromMindElixirData } from '@h-ai/ui'
 * const data = fromMindElixirData({ nodeData: { id: 'root', topic: '中心主题' } }, 'right')
 * ```
 */
export function fromMindElixirData(value: unknown, layout: AiMindMapData['layout']): AiMindMapData {
  if (!isRecord(value) || !isRecord(value.nodeData))
    throw new TypeError('Mind Elixir returned an invalid map')
  return {
    kind: 'mind/v1',
    layout,
    root: fromEngineNode(value.nodeData),
  }
}

function toEngineNode(node: AiMindMapNode): EngineNode {
  return {
    id: node.id,
    topic: node.text,
    children: node.children.map(toEngineNode),
  }
}

function fromEngineNode(value: Record<string, unknown>): AiMindMapNode {
  if (typeof value.id !== 'string' || typeof value.topic !== 'string')
    throw new TypeError('Mind Elixir returned a node without an id or topic')
  const children = value.children ?? []
  if (!Array.isArray(children) || children.some(child => !isRecord(child)))
    throw new TypeError('Mind Elixir returned invalid child nodes')
  return {
    id: value.id,
    text: value.topic,
    children: children.map(child => fromEngineNode(child as Record<string, unknown>)),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
