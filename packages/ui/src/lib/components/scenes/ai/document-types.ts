import type { DataAttributes } from '../../../types.js'

/**
 * 内容来源种类，用于区分 Markdown 正文、文档面板和纯代码展示。
 *
 * @example 模块内部上下文
 * ```ts
 * const example: MarkdownSourceKind = 'document'
 * ```
 */
export type MarkdownSourceKind = 'markdown' | 'document' | 'code'

/**
 * 文档目录节点，绑定稳定锚点、标题级别和编号标题。
 *
 * @example
 * ```ts
 * import type { MarkdownOutlineItem } from '@h-ai/ui'
 * const example: MarkdownOutlineItem = { id: 'intro', text: '简介', level: 1, numberedTitle: '1 简介' }
 * ```
 */
export interface MarkdownOutlineItem {
  /** 目录导航与标题同步使用的稳定锚点 ID。 */
  id: string
  /** 不含行内 Markdown 格式的纯文本标题。 */
  text: string
  /** 标题级别 1..6，对应 h1..h6。 */
  level: number
  /** 用于目录展示的编号标题。 */
  numberedTitle: string
}

/**
 * 代码块的原始源码及语言标记，供复制和预览复用。
 *
 * @example
 * ```ts
 * import type { MarkdownCodeBlockItem } from '@h-ai/ui'
 * const example: MarkdownCodeBlockItem = { id: 'code-1', code: 'const count = 42', language: 'typescript' }
 * ```
 */
export interface MarkdownCodeBlockItem {
  /** 预览与 DOM 关联使用的稳定代码块 ID。 */
  id: string
  /** 语法高亮前的原始源码。 */
  code: string
  /** 解析到的语言标记，可省略。 */
  language?: string
}

/**
 * 代码块运行请求；由宿主按来源和语言决定是否允许执行。
 *
 * @example
 * ```ts
 * import type { MarkdownCodeRunRequest } from '@h-ai/ui'
 * const example: MarkdownCodeRunRequest = { blockId: 'code-1', code: '1 + 1', language: 'javascript', sourceKind: 'code' }
 * ```
 */
export interface MarkdownCodeRunRequest {
  /** 用于将运行结果写回对应预览槽的代码块 ID。 */
  blockId: string
  /** 原始代码文本。 */
  code: string
  /** 供宿主选择运行方式的代码语言。 */
  language?: string
  /** 用于预览元信息的当前文档标题。 */
  title?: string
  /** 供宿主判断运行权限与上下文的内容来源。 */
  sourceKind: MarkdownSourceKind
}

/**
 * 宿主返回的预览内容及渲染种类；HTML 脚本必须显式授权。
 *
 * @example
 * ```ts
 * import type { MarkdownCodeRunResult } from '@h-ai/ui'
 * const example: MarkdownCodeRunResult = { kind: 'text', content: '2', title: '计算结果', allowScripts: false }
 * ```
 */
export interface MarkdownCodeRunResult {
  /** 预览渲染使用的输出种类。 */
  kind?: 'text' | 'markdown' | 'html' | 'mermaid'
  /** 预览输出正文。 */
  content: string
  /** 预览标题，省略时使用默认文案。 */
  title?: string
  /** 可选的预览说明。 */
  description?: string
  /**
   * 预览 iframe 是否允许执行脚本。
   *
   * 默认值为空，组件会以最严格的 sandbox 渲染 HTML 预览；
   * 只有调用方显式声明后才会放开 `allow-scripts`。
   */
  allowScripts?: boolean
}

/**
 * 选区改写菜单的稳定动作标识和已本地化文案。
 *
 * @example
 * ```ts
 * import type { MarkdownRewriteAction } from '@h-ai/ui'
 * const example: MarkdownRewriteAction = { id: 'shorten', label: '精简' }
 * ```
 */
export interface MarkdownRewriteAction {
  /** 回调使用的改写动作标识。 */
  id: string
  /** 已经本地化的改写动作名称。 */
  label: string
}

/**
 * 绑定动作、选中文本和当前全文的改写请求。
 *
 * @example
 * ```ts
 * import type { MarkdownRewriteRequest } from '@h-ai/ui'
 * const example: MarkdownRewriteRequest = { actionId: 'shorten', selectedText: '需要精简的段落', content: '# 报告\n需要精简的段落' }
 * ```
 */
export interface MarkdownRewriteRequest {
  /** 当前界面操作关联的改写动作标识。 */
  actionId: string
  /** 当前选中的原文。 */
  selectedText: string
  /** 触发请求时的完整文档内容。 */
  content: string
  /** 当前文档标题。 */
  title?: string
}

/**
 * 块级快捷操作种类：标题或列表。
 *
 * @example
 * ```ts
 * import type { MarkdownBlockFormatKind } from '@h-ai/ui'
 * const example: MarkdownBlockFormatKind = 'heading'
 * ```
 */
export type MarkdownBlockFormatKind
  = | 'heading'
    | 'bullet'

/**
 * 当前工具栏支持的具体段落和标题样式。
 *
 * @example
 * ```ts
 * import type { MarkdownBlockStyleKind } from '@h-ai/ui'
 * const example: MarkdownBlockStyleKind = 'heading2'
 * ```
 */
export type MarkdownBlockStyleKind
  = | 'paragraph'
    | 'heading1'
    | 'heading2'
    | 'heading3'
    | 'heading4'
    | 'orderedList'
    | 'bulletList'

/**
 * 选区工具栏提供的行内格式操作。
 * 高亮与链接同样通过选区操作回调交给宿主处理。
 *
 * @example
 * ```ts
 * import type { MarkdownInlineFormatKind } from '@h-ai/ui'
 * const example: MarkdownInlineFormatKind = 'bold'
 * ```
 */
export type MarkdownInlineFormatKind
  = | 'bold'
    | 'italic'
    | 'strike'
    | 'underline'
    | 'code'
    | 'highlight'
    | 'link'

/**
 * 选区工具栏提供的段落对齐方式。
 *
 * @example
 * ```ts
 * import type { MarkdownTextAlignKind } from '@h-ai/ui'
 * const example: MarkdownTextAlignKind = 'center'
 * ```
 */
export type MarkdownTextAlignKind = 'left' | 'center' | 'right' | 'justify'

/**
 * 纯文本选区偏移快照，DOM 变化后用于恢复或回退定位。
 *
 * @example 模块内部上下文
 * ```ts
 * const example: MarkdownSelectionSnapshot = { start: 0, end: 4, text: '示例文本' }
 * ```
 */
export interface MarkdownSelectionSnapshot {
  /** 选区在文档纯文本中的起始偏移。 */
  start: number
  /** 选区在文档纯文本中的结束偏移。 */
  end: number
  /** 选中纯文本，用于结构变化后的回退定位。 */
  text: string
}

/**
 * 颜色面板一次只会修改前景色或背景色中的一个维度。
 *
 * @example
 * ```ts
 * import type { MarkdownColorFormatRequest } from '@h-ai/ui'
 * const example: MarkdownColorFormatRequest = { target: 'text', value: '#2563eb', selectedText: '重点' }
 * ```
 */
export interface MarkdownColorFormatRequest {
  /** `text` 表示文字颜色，`background` 表示文本底色。 */
  target: 'text' | 'background'
  /** 颜色值为空时表示恢复默认。 */
  value: string | null
  /** 当前工具条记住的选中文本，供外层在 DOM 重建后兜底恢复定位。 */
  selectedText?: string
  /** 当前工具条记住的精确选区偏移，优先用于重复文本场景的恢复。 */
  selectionSnapshot?: MarkdownSelectionSnapshot
}

/**
 * 添加、修改或移除选区链接的请求；href=null 表示移除链接。
 *
 * @example 模块内部上下文
 * ```ts
 * const example: MarkdownLinkFormatRequest = { href: 'https://example.com/help', selectedText: '帮助' }
 * ```
 */
export interface MarkdownLinkFormatRequest {
  /** 为空时表示移除当前链接。 */
  href: string | null
  /** 当前工具条记住的精确选区偏移。 */
  selectionSnapshot?: MarkdownSelectionSnapshot
  /** 当前工具条记住的选中文本，供宿主做文本兜底。 */
  selectedText?: string
}

/**
 * 文档下载菜单动作；内置格式直接使用对应格式名，自定义动作交给宿主处理。
 *
 * @example
 * ```ts
 * import type { MarkdownToolbarDownloadAction } from '@h-ai/ui'
 * const example: MarkdownToolbarDownloadAction = { id: 'markdown', label: 'Markdown', badgeLabel: 'MD' }
 * ```
 */
export interface MarkdownToolbarDownloadAction {
  /** 下载动作标识。 */
  id: string
  /** 下载菜单显示的已本地化文案。 */
  label: string
  /** 菜单文案旁可选的短标签。 */
  badgeLabel?: string
}

/**
 * Svelte 事件属性使用双变型参数检查，保留组件回调的推导方式。
 * 该类型仅约束回调签名，不负责验证宿主执行权限或业务数据。
 * @typeParam Args - 回调参数元组类型。
 * @typeParam Return - 转换结果的数据类型。
 *
 * @example 模块内部上下文
 * ```ts
 * const example: BivariantCallback<[string], void> = value => { document.body.setAttribute('data-format', value) }
 * ```
 */
type BivariantCallback<Args extends unknown[], Return = void> = {
  bivarianceHack: (...args: Args) => Return
}['bivarianceHack']

/**
 * 文档编辑器的数据、预览安全策略和宿主交互回调；不在组件中实现 AI 业务请求。
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { AiDocumentEditor } from '@h-ai/ui'
 *   import type { AiDocumentEditorProps } from '@h-ai/ui'
 *   const props: AiDocumentEditorProps = { content: '# 报告\n正文', title: '报告', sourceKind: 'document', allowHtmlTags: false, allowUnsafeCodePreview: false }
 * </script>
 * <AiDocumentEditor {...props} />
 * ```
 */
export interface AiDocumentEditorProps extends DataAttributes {
  /** Markdown 原始正文。 */
  content?: string
  /** 头部展示的文档标题。 */
  title?: string
  /** 影响渲染与交互的内容来源。 */
  sourceKind?: MarkdownSourceKind
  /** sourceKind=code 时的默认语言。 */
  codeLanguage?: string
  /** 正文字号；数字按 px 解释。 */
  fontSize?: string | number
  /** 外层容器类名。 */
  class?: string
  /** 是否显示代码块复制按钮。 */
  showCopyButton?: boolean
  /** 是否显示代码块运行按钮；是否执行仍由宿主授权。 */
  showRunButton?: boolean
  /** 是否显示代码/预览切换。 */
  showCodePreviewToggle?: boolean
  /** 是否按安全白名单解析原始 HTML。 */
  allowHtmlTags?: boolean
  /**
   * 是否启用内置的高风险代码预览。
   *
   * 默认仅允许 Markdown 预览；HTML / JS / CSS 等会执行或渲染任意代码的内置预览
   * 需要宿主显式开启，或由宿主通过 `oncoderun` 自行提供受控沙箱结果。
   */
  allowUnsafeCodePreview?: boolean
  /** 启用预览切换时语言标签旁的提示。 */
  codePreviewHint?: string
  /** 是否启用语法高亮。 */
  enableHighlight?: boolean
  /** 是否将普通换行渲染为 br。 */
  breaks?: boolean
  /** 是否显示左侧目录。 */
  showOutline?: boolean
  /** 是否显示目录编号。 */
  showOutlineNumbering?: boolean
  /** 是否显示顶部工具栏。 */
  showToolbar?: boolean
  /** 目录的初始折叠状态。 */
  initialOutlineCollapsed?: boolean
  /** 头部或工具栏显示的状态文案。 */
  statusText?: string
  /** 改写流程是否正在执行。 */
  rewritePending?: boolean
  /** 可用改写动作，空列表隐藏菜单。 */
  rewriteActions?: MarkdownRewriteAction[]
  /** 点击关闭时通知宿主。 */
  onclose?: () => void
  /** 是否禁用关闭/返回操作。 */
  closeDisabled?: boolean
  /** 点击撤销时通知宿主。 */
  onundo?: () => void
  /** 是否禁用撤销操作。 */
  undoDisabled?: boolean
  /** 点击重做时通知宿主。 */
  onredo?: () => void
  /** 是否禁用重做操作。 */
  redoDisabled?: boolean
  /** 由宿主执行并返回预览结果的代码回调。 */
  oncoderun?: (
    request: MarkdownCodeRunRequest,
  ) => MarkdownCodeRunResult | void | Promise<MarkdownCodeRunResult | void>
  /** 宿主处理选区改写的回调。 */
  onrewrite?: (request: MarkdownRewriteRequest) => void | Promise<void>
  /** 向宿主暴露滚动容器以同步滚动。 */
  editorScrollHost?: HTMLDivElement | null
  /** 向宿主暴露可编辑内容容器。 */
  previewHost?: HTMLElement | null
  /** 标题上方的辅助标签。 */
  eyebrow?: string
  /** 优先显示的头部说明。 */
  metaText?: string
  /** 标题附近的状态标签。 */
  saveState?: string
  /** 正文是否允许 contenteditable 编辑。 */
  editable?: boolean
  /** 下载菜单项，空列表使用内置动作。 */
  downloadActions?: MarkdownToolbarDownloadAction[]
  /** 历史记录操作文案。 */
  historyActionLabel?: string
  /** 查看版本操作文案。 */
  versionActionLabel?: string
  /** 向宿主同步滚动状态的回调。 */
  ondocumentscroll?: (event: Event) => void
  /** 鼠标释放时同步选区的回调。 */
  onpreviewmouseup?: () => void
  /** 可编辑正文发生输入时的回调。 */
  onpreviewinput?: (event: Event) => void
  /** 失焦时提交编辑的回调。 */
  onpreviewblur?: () => void
  /** 选择下载动作时的回调。 */
  ondownload?: (actionId: string) => void
  /** 点击历史记录时的回调。 */
  onhistory?: () => void
  /** 宿主自定义的整篇复制操作。 */
  oncopydocument?: () => void | Promise<void>
  /** 标题/列表快捷格式操作回调。 */
  onapplyblockformat?: BivariantCallback<[kind: MarkdownBlockFormatKind], void>
  /** 切换段落或具体标题级别的回调。 */
  onapplyblockstyle?: BivariantCallback<[kind: MarkdownBlockStyleKind], void>
  /** 选区工具栏的行内格式回调。 */
  onapplyinlineformat?: BivariantCallback<[kind: MarkdownInlineFormatKind], void>
  /** 选区工具栏的段落对齐回调。 */
  onapplyalignment?: (kind: MarkdownTextAlignKind) => void
  /** 选区工具栏添加、编辑或移除链接的回调。 */
  onapplylink?: BivariantCallback<[
    href: string | null,
    selectionSnapshot?: MarkdownSelectionSnapshot,
    selectedText?: string,
  ], void>
  /** 选区工具栏修改文字色或背景色的回调。 */
  onapplycolor?: (request: MarkdownColorFormatRequest) => void
  /** 宿主自定义的选区复制操作。 */
  oncopyselection?: () => void | Promise<void>
  /** 宿主处理选区注释的回调。 */
  onannotation?: () => void | Promise<void>
}
