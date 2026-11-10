import type { Snippet } from 'svelte'

/** 文件和目录旁的宿主标记。label 提供给辅助技术，text 用于显示简短标记。 */
export interface CodeWorkspaceMarker {
  label: string
  text?: string
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'error'
}

/** 目录 ID 在同一个数据源中唯一。 */
export interface CodeWorkspaceFolder {
  kind: 'folder'
  id: string
  name: string
  markers?: readonly CodeWorkspaceMarker[]
}

/** 同一文件 ID 可以对应多个版本，标签按 ID 和版本去重。 */
export interface CodeWorkspaceFileNode {
  kind: 'file'
  id: string
  name: string
  version?: string
  markers?: readonly CodeWorkspaceMarker[]
}

/** 文件树可呈现的节点。 */
export type CodeWorkspaceNode = CodeWorkspaceFolder | CodeWorkspaceFileNode

/** 坐标从 1 开始，列按 UTF-16 计数，结束位置不包含在范围内。起止相同表示一个位置。 */
export interface CodeWorkspaceRange {
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
}

/** 代码文件随内容加载的行或范围标注。 */
export interface CodeWorkspaceAnnotation {
  range: CodeWorkspaceRange
  label: string
  tone?: CodeWorkspaceMarker['tone']
  display?: 'gutter' | 'range' | 'both'
  /** 在标注起始行显示图标与纯文本浮层，仅适用于含行前标记的标注。 */
  hoverText?: string
}

/** 行前图标和浮层收到的当前文件及标注。 */
export interface CodeWorkspaceAnnotationContext {
  file: CodeWorkspaceFile
  annotation: CodeWorkspaceAnnotation
}

/** 读取文件返回的文档，可指定 Monaco 语言 ID，例如 typescript。 */
export interface CodeWorkspaceFileContent {
  text: string
  language?: string
  version?: string
  annotations?: readonly CodeWorkspaceAnnotation[]
}

/** 提供给宿主界面的当前文档。 */
export interface CodeWorkspaceFile extends CodeWorkspaceFileContent {
  node: CodeWorkspaceFileNode
}

/** 工作区搜索请求。cursor 是数据源上一次返回的分页游标。 */
export interface CodeWorkspaceSearchQuery {
  mode: 'files' | 'content'
  query: string
  cursor?: string
}

/** 工作区命中。目录链从根下第一个目录到父目录，range 对应 node.version。 */
export interface CodeWorkspaceSearchHit {
  node: CodeWorkspaceFileNode
  ancestors?: readonly CodeWorkspaceFolder[]
  range?: CodeWorkspaceRange
  preview?: string
}

/** 工作区搜索结果。省略 nextCursor 表示已到末页。 */
export interface CodeWorkspaceSearchPage {
  hits: readonly CodeWorkspaceSearchHit[]
  nextCursor?: string
}

/**
 * 工作区的读取能力。保持对象引用稳定，切换仓库或分支时替换整个对象。
 * 宿主负责授权和搜索索引，回调可返回数据或 Promise，失败时抛错或拒绝。
 *
 * @example
 * ```ts
 * import type { CodeWorkspaceSource } from '@h-ai/ui/components/scenes/code/index'
 * const source: CodeWorkspaceSource = {
 *   listChildren: () => [{ kind: 'file', id: 'readme', name: 'README.md' }],
 *   readFile: () => ({ text: '# Hello' }),
 * }
 * ```
 */
export interface CodeWorkspaceSource {
  /** parent 为 null 时读取根节点。 */
  listChildren: (parent: CodeWorkspaceFolder | null, signal: AbortSignal) => readonly CodeWorkspaceNode[] | Promise<readonly CodeWorkspaceNode[]>
  readFile: (node: CodeWorkspaceFileNode, signal: AbortSignal) => CodeWorkspaceFileContent | Promise<CodeWorkspaceFileContent>
  search?: (query: CodeWorkspaceSearchQuery, signal: AbortSignal) => CodeWorkspaceSearchPage | Promise<CodeWorkspaceSearchPage>
}

/** 编辑区的初始显示选项，使用者可在工作区内切换。 */
export interface CodeWorkspaceDisplay {
  lineNumbers?: boolean | 'relative'
  minimap?: boolean
  breadcrumbs?: boolean
  wordWrap?: boolean
}

/** 可作为自定义主题基础的预设。 */
export type CodeWorkspaceThemeBase = 'vs-light' | 'vs-dark' | 'hc-light' | 'hc-dark'

/** Monaco 编辑区主题。同一页面中的 Monaco 实例共用主题。 */
export type CodeWorkspaceTheme = 'inherit' | CodeWorkspaceThemeBase | 'github-dark' | {
  base: CodeWorkspaceThemeBase
  colors?: Readonly<Record<string, string>>
  tokens?: readonly { token: string, foreground?: string, background?: string, fontStyle?: string }[]
}

/** 当前文件的主要选区。 */
export interface CodeWorkspaceSelection {
  range: CodeWorkspaceRange
  text: string
}

/** 文件与选区快照。 */
export interface CodeWorkspaceSelectionContext {
  file: CodeWorkspaceFile
  selection: CodeWorkspaceSelection
}

/** 右侧检查区的渲染上下文。reveal 仅对生成该上下文的文档生效。 */
export interface CodeWorkspaceInspectorContext {
  file: CodeWorkspaceFile
  selection: CodeWorkspaceSelection | null
  reveal: (range: CodeWorkspaceRange) => void
}

/** 浮动操作的渲染上下文。 */
export interface CodeWorkspaceActionContext extends CodeWorkspaceSelectionContext {
  reveal: (range: CodeWorkspaceRange) => void
  openInspector: () => void
}

/**
 * CodeWorkspace 的参数。只需传入 source 即可浏览文件，按需接入搜索和自定义内容。
 *
 * @example
 * ```ts
 * import type { CodeWorkspaceProps } from '@h-ai/ui/components/scenes/code/index'
 * const props: CodeWorkspaceProps = {
 *   source: {
 *     listChildren: () => [{ kind: 'file', id: 'hello', name: 'hello.ts' }],
 *     readFile: () => ({ text: 'export const hello = 1', language: 'typescript' }),
 *   },
 * }
 * ```
 */
export interface CodeWorkspaceProps {
  source: CodeWorkspaceSource
  initialFile?: CodeWorkspaceFileNode
  initialAncestors?: readonly CodeWorkspaceFolder[]
  options?: CodeWorkspaceDisplay
  theme?: CodeWorkspaceTheme
  inspector?: Snippet<[CodeWorkspaceInspectorContext]>
  /** 自定义行前图标。使用装饰性内容，图标按钮的名称来自标注 label。 */
  annotationIcon?: Snippet<[CodeWorkspaceAnnotationContext]>
  /** 自定义行前浮层。可以包含按钮、链接或其他可交互组件。 */
  annotationHover?: Snippet<[CodeWorkspaceAnnotationContext]>
  selectionActions?: Snippet<[CodeWorkspaceActionContext]>
  /** 工作区容器高度，默认 38rem。 */
  height?: string
  label?: string
  class?: string
}
