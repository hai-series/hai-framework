/**
 * @h-ai/ui — 场景组件 (Scenes)
 *
 * 面向具体业务场景的完整 UI 流程，通常对应一个完整的用户任务。
 * @module index
 */

// AI 场景组件
import { downloadAiDocument, resolveDocumentDownloadActions, resolveDocumentMarkdownContent } from './ai/document-download.js'
import { renderMarkdownDocument } from './ai/document-parse.js'
import { highlightCode, isLanguageSupported } from './ai/highlight.js'
import { parseMarkdown } from './ai/markdown-parse.js'
import { fromMindElixirData, toMindElixirData } from './ai/mind/mind-adapter.js'
import { createCrudController, defineCrud, mapPaginated } from './crud/crud-controller.svelte.js'
import { createBrowserNavAdapter } from './crud/nav-adapter.js'
import { resolveErrorPreset } from './error/error-presets.js'
import { authErrorMessage } from './iam/auth-error-message.js'
import { matchPermission, setPermissionContext, usePermission } from './iam/permission-context.svelte.js'
import { createSensitiveActions } from './iam/sensitive-actions.svelte.js'
import { createSessionRecovery } from './iam/session-recovery.svelte.js'

export { AiDocumentDownloadMenu, AiDocumentEditor, AiMindMapEditor, AiTableEditor, MarkdownRenderer } from './ai/index.js'
export type { AiDocumentDownloadFormat, AiDocumentDownloadRequest, AiDocumentEditorProps, AiDocumentResolvedDownloadAction, AiMindMapChangePayload, AiMindMapData, AiMindMapEditorProps, AiMindMapExportFormat, AiMindMapNode, AiMindMapSelection, AiTableColumn, AiTableColumnType, AiTableCopyPayload, AiTableData, AiTableDownloadPayload, AiTableEditorChangeAction, AiTableEditorChangePayload, AiTableEditorProps, AiTableRow, MarkdownBlockStyleKind, MarkdownCodeBlockItem, MarkdownCodeRunRequest, MarkdownCodeRunResult, MarkdownColorFormatRequest, MarkdownDocumentBlock, MarkdownDocumentHtmlBlock, MarkdownDocumentMermaidBlock, MarkdownDocumentParseOptions, MarkdownInlineFormatKind, MarkdownOutlineItem, MarkdownParseOptions, MarkdownRenderResult, MarkdownRewriteAction, MarkdownRewriteRequest, MarkdownSourceRange, MarkdownTextAlignKind, MarkdownToolbarDownloadAction } from './ai/index.js'

// App 应用级场景组件
export * from './app/index.js'

// Chart 图表场景组件
export * from './charts/index.js'

// 代码工作区场景组件
export * from './code/index.js'

// CRUD 场景组件
export { CrudDeleteConfirm, CrudDetailPanel, CrudEditPanel, CrudFilterBar, CrudPage } from './crud/index.js'
export type { CrudApi, CrudController, CrudControllerOptions, CrudData, CrudDef, CrudDensity, CrudFieldDef, CrudFieldType, CrudFormConfig, CrudFormVariant, CrudListOptions, CrudOption, CrudPageData, CrudPageProps, CrudPaginationConfig, CrudPermissions, CrudResource, CrudTableColumn, CrudText, NavAdapter } from './crud/index.js'

// Crypto 场景组件
export * from './crypto/index.js'

// 错误页场景组件
export { ERROR_PRESETS, ErrorPage } from './error/index.js'
export type { ErrorPreset, ErrorPresetInfo } from './error/index.js'

export * from './guide/index.js'

// IAM 场景组件
export { AuthPanel, AuthShell, ChangePasswordForm, ForgotPasswordForm, LoginForm, PasswordInput, PermGuard, ReauthenticationDialog, RegisterForm, ResetPasswordForm, SensitiveOperationsForm, SessionRecoveryDialog, UserProfile } from './iam/index.js'
export type { PermissionContext, SensitiveActions, SensitiveActionsOptions, SessionRecovery } from './iam/index.js'

// Storage 场景组件
export * from './storage/index.js'

// 工具和产物工作台
export * from './tools/index.js'
// 场景组件类型
export * from './types.js'

/**
 * 此组件子路径提供的运行工具。
 * @example
 * ```ts
 * import { ui } from '@h-ai/ui/components/scenes/index'
 *
 * // 将已提供的 Markdown 转为渲染结果。
 * const rendered = ui.parseMarkdown('## 示例')
 * void rendered
 * ```
 */
export const ui = {
  downloadAiDocument,
  resolveDocumentDownloadActions,
  resolveDocumentMarkdownContent,
  renderMarkdownDocument,
  highlightCode,
  isLanguageSupported,
  parseMarkdown,
  fromMindElixirData,
  toMindElixirData,
  createBrowserNavAdapter,
  mapPaginated,
  defineCrud,
  createCrudController,
  resolveErrorPreset,
  authErrorMessage,
  matchPermission,
  setPermissionContext,
  usePermission,
  createSensitiveActions,
  createSessionRecovery,
}
