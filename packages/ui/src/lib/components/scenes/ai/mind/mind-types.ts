import type { DataAttributes } from '../../../../types.js'

/**
 * 项目脑图持久化协议，不暴露 Mind Elixir 的内部数据形状。
 *
 * @example
 * ```ts
 * import type { AiMindMapNode } from '@h-ai/ui'
 * const node: AiMindMapNode = { id: 'root', text: '中心主题', children: [] }
 * ```
 */
export interface AiMindMapNode {
  /** 在同一脑图生命周期内稳定且全图唯一的节点 ID。 */
  id: string
  /** 用户可见的纯文本节点内容。 */
  text: string
  /** 按兄弟节点展示顺序排列的子节点。 */
  children: AiMindMapNode[]
}

/**
 * 由 Mate 领域校验后交给框架编辑器的 mind/v1 数据。
 *
 * @example
 * ```ts
 * import type { AiMindMapData } from '@h-ai/ui'
 * const data: AiMindMapData = { kind: 'mind/v1', layout: 'right', root: { id: 'root', text: '中心主题', children: [] } }
 * ```
 */
export interface AiMindMapData {
  /** 固定协议标识，未知协议不会交给引擎编辑。 */
  kind: 'mind/v1'
  /** 首版支持的根分支布局。 */
  layout: 'right' | 'left' | 'both'
  /** 脑图唯一根节点。 */
  root: AiMindMapNode
}

/**
 * 编辑器发出的完整数据快照及变更来源。
 *
 * @example
 * ```ts
 * import type { AiMindMapChangePayload } from '@h-ai/ui'
 * const payload: AiMindMapChangePayload = { data: { kind: 'mind/v1', layout: 'right', root: { id: 'root', text: '中心主题', children: [] } }, reason: 'edit' }
 * ```
 */
export interface AiMindMapChangePayload {
  /** 可直接持久化的项目协议快照。 */
  data: AiMindMapData
  /** 编辑器观察到的引擎操作类型，仅作诊断信息，不保证标识具体用户操作来源。 */
  reason: string
}

/**
 * 编辑器导出动作使用的格式标识。
 *
 * @example
 * ```ts
 * import type { AiMindMapExportFormat } from '@h-ai/ui'
 * const format: AiMindMapExportFormat = 'json'
 * ```
 */
export type AiMindMapExportFormat = 'json' | 'csv' | 'xlsx' | 'xmind'

/**
 * 当前画布的稳定节点选择及其改写范围。
 *
 * @example
 * ```ts
 * import type { AiMindMapSelection } from '@h-ai/ui'
 * const selection: AiMindMapSelection = { nodeIds: ['root'], scope: 'subtree', text: '中心主题' }
 * ```
 */
export interface AiMindMapSelection {
  /** 按画布选择顺序去重后的稳定节点 ID。 */
  nodeIds: string[]
  /** 当前编辑首版按选中节点及后代改写。 */
  scope: 'subtree'
  /** 供用户识别引用目标的简短摘要。 */
  text: string
}

/**
 * AiMindMapEditor 受控属性。
 *
 * @example
 * ```ts
 * import type { AiMindMapEditorProps } from '@h-ai/ui'
 * const props: AiMindMapEditorProps = { data: { kind: 'mind/v1', layout: 'right', root: { id: 'root', text: '中心主题', children: [] } }, artifactKey: 'mind-1' }
 * ```
 */
export interface AiMindMapEditorProps extends DataAttributes {
  /** 宿主追加到编辑器根节点的布局类名。 */
  class?: string
  /** 经 mind/v1 校验的完整脑图；同一 artifactKey 下替换时重置引擎历史。 */
  data: AiMindMapData
  /** 产物身份变化时清理上一个实例的本地编辑历史。 */
  artifactKey: string
  /** 面板标题，由宿主 Artifact 元数据提供。 */
  title?: string
  /** false 时禁用编辑和写入操作，同时保留导航能力。 */
  editable?: boolean
  /** 是否为深色主题，用于与宿主工作区保持一致。 */
  dark?: boolean
  /** 宿主提供的保存状态；空值时不占用工具栏空间。 */
  saveState?: string
  /** 真实内容变化后通知宿主保存；视口变化不会触发此回调。 */
  onchange?: (payload: AiMindMapChangePayload) => void
  /** 初始化或数据适配失败时报告错误，避免显示可编辑的空白画布。 */
  onerror?: (error: Error) => void
  /** 请求宿主先冲刷保存，再从传入的同一快照生成文件。 */
  onexport?: (format: AiMindMapExportFormat, data: AiMindMapData) => void | Promise<void>
  /** 关闭当前产物查看器；调用前编辑器会先提交活动中的节点输入。 */
  onclose?: () => void
  /** 把选中的项目 JSON 正文交给宿主校验并写入当前脑图草稿。 */
  onimportjson?: (content: string) => void | Promise<void>
  /** 选择变化时回传节点 ID；不触发数据保存。 */
  onselectionchange?: (selection: AiMindMapSelection | null) => void
  /** 请求宿主把当前节点/分支放入原聊天输入框，不直接调用模型。 */
  onrewrite?: (selection: AiMindMapSelection) => void
}
