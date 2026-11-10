import type { Snippet } from 'svelte'

/**
 * 文件和目录旁的宿主标记。label 提供给辅助技术，text 用于显示简短标记。
 *
 * @example
 * ```ts
 * import type { CodeWorkspaceMarker } from '@h-ai/ui/components/scenes/code/index'
 * const marker: CodeWorkspaceMarker = { label: 'Uncommitted changes', text: 'M', tone: 'warning' }
 * ```
 */
export interface CodeWorkspaceMarker {
  label: string
  text?: string
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'error'
}

/**
 * 目录 ID 在同一个数据源中唯一。
 *
 * @example
 * ```ts
 * import type { CodeWorkspaceFolder } from '@h-ai/ui/components/scenes/code/index'
 * const folder: CodeWorkspaceFolder = { kind: 'folder', id: 'src', name: 'src' }
 * ```
 */
export interface CodeWorkspaceFolder {
  kind: 'folder'
  id: string
  name: string
  markers?: readonly CodeWorkspaceMarker[]
}

/**
 * 同一文件 ID 可以对应多个版本，标签按 ID 和版本去重。
 *
 * @example
 * ```ts
 * import type { CodeWorkspaceFileNode } from '@h-ai/ui/components/scenes/code/index'
 * const file: CodeWorkspaceFileNode = { kind: 'file', id: 'src/app.ts', name: 'app.ts', version: 'rev-1' }
 * ```
 */
export interface CodeWorkspaceFileNode {
  kind: 'file'
  id: string
  name: string
  version?: string
  markers?: readonly CodeWorkspaceMarker[]
}

/**
 * 文件树可呈现的节点。
 *
 * @example
 * ```ts
 * import type { CodeWorkspaceNode } from '@h-ai/ui/components/scenes/code/index'
 * const node: CodeWorkspaceNode = { kind: 'file', id: 'readme', name: 'README.md' }
 * ```
 */
export type CodeWorkspaceNode = CodeWorkspaceFolder | CodeWorkspaceFileNode

/**
 * 坐标从 1 开始，列按 UTF-16 计数，结束位置不包含在范围内。起止相同表示一个位置。
 *
 * @example
 * ```ts
 * import type { CodeWorkspaceRange } from '@h-ai/ui/components/scenes/code/index'
 * const firstWord: CodeWorkspaceRange = { startLine: 1, startColumn: 1, endLine: 1, endColumn: 6 }
 * ```
 */
export interface CodeWorkspaceRange {
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
}

/**
 * 代码文件随内容加载的行或范围标注。
 *
 * @example
 * ```ts
 * import type { CodeWorkspaceAnnotation } from '@h-ai/ui/components/scenes/code/index'
 * const annotation: CodeWorkspaceAnnotation = {
 *   label: 'Local changes',
 *   range: { startLine: 4, startColumn: 1, endLine: 5, endColumn: 1 },
 *   tone: 'info',
 *   hoverText: 'This line has uncommitted changes.',
 * }
 * ```
 */
export interface CodeWorkspaceAnnotation {
  range: CodeWorkspaceRange
  label: string
  tone?: CodeWorkspaceMarker['tone']
  display?: 'gutter' | 'range' | 'both'
  /** 在标注起始行显示图标与纯文本浮层，仅适用于含行前标记的标注。 */
  hoverText?: string
}

/**
 * 行前图标和浮层收到的当前文件及标注。
 *
 * @example
 * ```ts
 * import type { CodeWorkspaceAnnotationContext } from '@h-ai/ui/components/scenes/code/index'
 * function tooltip({ file, annotation }: CodeWorkspaceAnnotationContext) {
 *   return file.node.name + ': ' + (annotation.hoverText ?? annotation.label)
 * }
 * ```
 */
export interface CodeWorkspaceAnnotationContext {
  file: CodeWorkspaceFile
  annotation: CodeWorkspaceAnnotation
}

/**
 * 读取文件返回的文档，可指定 Monaco 语言 ID，例如 typescript。
 *
 * @example
 * ```ts
 * import type { CodeWorkspaceFileContent } from '@h-ai/ui/components/scenes/code/index'
 * const content: CodeWorkspaceFileContent = { text: 'export const value = 1', language: 'typescript' }
 * ```
 */
export interface CodeWorkspaceFileContent {
  text: string
  language?: string
  version?: string
  annotations?: readonly CodeWorkspaceAnnotation[]
}

/**
 * 提供给宿主界面的当前文档。
 *
 * @example
 * ```ts
 * import type { CodeWorkspaceFile } from '@h-ai/ui/components/scenes/code/index'
 * const file: CodeWorkspaceFile = {
 *   node: { kind: 'file', id: 'readme', name: 'README.md' },
 *   text: '# Getting started',
 *   language: 'markdown',
 * }
 * ```
 */
export interface CodeWorkspaceFile extends CodeWorkspaceFileContent {
  node: CodeWorkspaceFileNode
}

/**
 * 工作区搜索请求。cursor 是数据源上一次返回的分页游标。
 *
 * @example
 * ```ts
 * import type { CodeWorkspaceSearchQuery } from '@h-ai/ui/components/scenes/code/index'
 * const query: CodeWorkspaceSearchQuery = { mode: 'content', query: 'summarize', cursor: 'page-2' }
 * ```
 */
export interface CodeWorkspaceSearchQuery {
  mode: 'files' | 'content'
  query: string
  cursor?: string
}

/**
 * 工作区命中。目录链从根下第一个目录到父目录，range 对应 node.version。
 *
 * @example
 * ```ts
 * import type { CodeWorkspaceSearchHit } from '@h-ai/ui/components/scenes/code/index'
 * const hit: CodeWorkspaceSearchHit = {
 *   node: { kind: 'file', id: 'readme', name: 'README.md', version: 'rev-1' },
 *   range: { startLine: 1, startColumn: 3, endLine: 1, endColumn: 8 },
 *   preview: '# Hello',
 * }
 * ```
 */
export interface CodeWorkspaceSearchHit {
  node: CodeWorkspaceFileNode
  ancestors?: readonly CodeWorkspaceFolder[]
  range?: CodeWorkspaceRange
  preview?: string
}

/**
 * 工作区搜索结果。省略 nextCursor 表示已到末页。
 *
 * @example
 * ```ts
 * import type { CodeWorkspaceSearchPage } from '@h-ai/ui/components/scenes/code/index'
 * const page: CodeWorkspaceSearchPage = { hits: [], nextCursor: 'page-2' }
 * ```
 */
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

/**
 * 编辑区的初始显示选项，使用者可在工作区内切换。
 *
 * @example
 * ```ts
 * import type { CodeWorkspaceDisplay } from '@h-ai/ui/components/scenes/code/index'
 * const display: CodeWorkspaceDisplay = { lineNumbers: 'relative', minimap: false }
 * ```
 */
export interface CodeWorkspaceDisplay {
  lineNumbers?: boolean | 'relative'
  minimap?: boolean
  breadcrumbs?: boolean
  wordWrap?: boolean
}

/**
 * 可作为自定义主题基础的预设。
 *
 * @example
 * ```ts
 * import type { CodeWorkspaceThemeBase } from '@h-ai/ui/components/scenes/code/index'
 * const base: CodeWorkspaceThemeBase = 'hc-dark'
 * ```
 */
export type CodeWorkspaceThemeBase = 'vs-light' | 'vs-dark' | 'hc-light' | 'hc-dark'

/**
 * Monaco 编辑区主题。同一页面中的 Monaco 实例共用主题。
 *
 * @example
 * ```ts
 * import type { CodeWorkspaceTheme } from '@h-ai/ui/components/scenes/code/index'
 * const theme: CodeWorkspaceTheme = {
 *   base: 'vs-dark',
 *   colors: { 'editor.background': '#121820' },
 * }
 * ```
 */
export type CodeWorkspaceTheme = 'inherit' | CodeWorkspaceThemeBase | 'github-dark' | {
  base: CodeWorkspaceThemeBase
  colors?: Readonly<Record<string, string>>
  tokens?: readonly { token: string, foreground?: string, background?: string, fontStyle?: string }[]
}

/**
 * 当前文件的主要选区。
 *
 * @example
 * ```ts
 * import type { CodeWorkspaceSelection } from '@h-ai/ui/components/scenes/code/index'
 * const selection: CodeWorkspaceSelection = {
 *   text: 'const',
 *   range: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 6 },
 * }
 * ```
 */
export interface CodeWorkspaceSelection {
  range: CodeWorkspaceRange
  text: string
}

/**
 * 编辑器内部传递的文件与选区快照。
 *
 * @example 模块内部上下文
 * ```ts
 * function selectedText(context: CodeWorkspaceSelectionContext) {
 *   return context.selection.text
 * }
 * ```
 */
export interface CodeWorkspaceSelectionContext {
  file: CodeWorkspaceFile
  selection: CodeWorkspaceSelection
}

/**
 * 右侧检查区的渲染上下文。reveal 仅对生成该上下文的文档生效。
 *
 * @example
 * ```ts
 * import type { CodeWorkspaceInspectorContext } from '@h-ai/ui/components/scenes/code/index'
 * function revealFirstAnnotation(context: CodeWorkspaceInspectorContext) {
 *   const first = context.file.annotations?.[0]
 *   if (first)
 *     context.reveal(first.range)
 * }
 * ```
 */
export interface CodeWorkspaceInspectorContext {
  file: CodeWorkspaceFile
  selection: CodeWorkspaceSelection | null
  reveal: (range: CodeWorkspaceRange) => void
}

/**
 * 浮动操作的渲染上下文。
 *
 * @example
 * ```ts
 * import type { CodeWorkspaceActionContext } from '@h-ai/ui/components/scenes/code/index'
 * function inspectSelection({ selection, openInspector }: CodeWorkspaceActionContext) {
 *   if (selection.text.trim())
 *     openInspector()
 * }
 * ```
 */
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
