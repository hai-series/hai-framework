/**
 * @h-ai/ui — 组件导出
 *
 * 组件按三层划分：
 * @module index
 */

// 组合组件
import { createDefaultCronBuilderState, cronBuilderStateToExpression, cronExpressionToBuilderState, isCronExpressionValid } from './compounds/cron-expression-builder.js'
import { normalizeScheduleInputConfig } from './compounds/schedule-input.js'
import { downloadAiDocument, resolveDocumentDownloadActions, resolveDocumentMarkdownContent } from './scenes/ai/document-download.js'
import { renderMarkdownDocument } from './scenes/ai/document-parse.js'
import { highlightCode, isLanguageSupported } from './scenes/ai/highlight.js'
import { parseMarkdown } from './scenes/ai/markdown-parse.js'
import { fromMindElixirData, toMindElixirData } from './scenes/ai/mind/mind-adapter.js'
import { createCrudController, defineCrud, mapPaginated } from './scenes/crud/crud-controller.svelte.js'
import { createBrowserNavAdapter } from './scenes/crud/nav-adapter.js'
import { resolveErrorPreset } from './scenes/error/error-presets.js'
import { authErrorMessage } from './scenes/iam/auth-error-message.js'
import { matchPermission, setPermissionContext, usePermission } from './scenes/iam/permission-context.svelte.js'
import { createSensitiveActions } from './scenes/iam/sensitive-actions.svelte.js'
import { createSessionRecovery } from './scenes/iam/session-recovery.svelte.js'

export { Accordion, ActionSheet, Alert, AppBar, BottomNav, Breadcrumb, Calendar, Card, Combobox, Confirm, CRON_BUILDER_WEEKDAY_ORDER, CronExpressionBuilder, DataTable, DatePicker, Drawer, Dropdown, Empty, FilterBar, Form, FormField, FormLayout, InfiniteScroll, JsonViewer, MessageBoxContainer, MessageBoxDialog, MessageContainer, Modal, PageHeader, Pagination, Popover, PullRefresh, Result, SafeArea, ScheduleInput, Skeleton, Steps, SwipeCell, TableToolbar, Tabs, TagInput, Timeline, ToastContainer, Tooltip } from './compounds/index.js'
export type { AccordionItem, ActionSheetItem, BottomNavItem, CronBuilderMode, CronBuilderState, CronExpressionBuilderLabels, CronExpressionBuilderPreset, CronExpressionBuilderWeekdayOption, CronWeekdayValue, ScheduleInputConfig, SwipeCellAction, TimelineItem } from './compounds/index.js'

// 原子组件
export * from './primitives/index.js'

// 场景组件
export { AiDocumentDownloadMenu, AiDocumentEditor, AiMindMapEditor, AiTableEditor, ArtifactWorkspace, AuthPanel, AuthShell, AvatarUpload, ChangePasswordForm, Chart, CodeWorkspace, CrudDeleteConfirm, CrudDetailPanel, CrudEditPanel, CrudFilterBar, CrudPage, DashboardGrid, EncryptedInput, ERROR_PRESETS, ErrorPage, FeedbackDetail, FeedbackForm, FeedbackList, FeedbackModal, FileList, FileUpload, ForgotPasswordForm, GuideHost, HashDisplay, HelpCenter, ImageUpload, LanguageSwitch, LoginForm, MarkdownRenderer, MetricCard, PasswordInput, PermGuard, ReauthenticationDialog, RegisterForm, ReportCard, ResetPasswordForm, SensitiveOperationsForm, SessionRecoveryDialog, SettingsLayout, SettingsModal, SignatureDisplay, ThemeColorPicker, ThemeSelector, ThemeToggle, ToolWorkspace, UserProfile, WorkspaceLayout } from './scenes/index.js'
export type { AgreementDisplay, AiDocumentDownloadFormat, AiDocumentDownloadRequest, AiDocumentEditorProps, AiDocumentResolvedDownloadAction, AiMindMapChangePayload, AiMindMapData, AiMindMapEditorProps, AiMindMapExportFormat, AiMindMapNode, AiMindMapSelection, AiTableColumn, AiTableColumnType, AiTableCopyPayload, AiTableData, AiTableDownloadPayload, AiTableEditorChangeAction, AiTableEditorChangePayload, AiTableEditorProps, AiTableRow, ArtifactCreateRequest, ArtifactDocument, ArtifactKind, ArtifactRewriteRequest, ArtifactSaveRequest, ArtifactSaveResponse, ArtifactSummary, ArtifactWorkspaceProps, AuthLoginMethod, AuthPanelActions, AuthPanelConfig, AuthPanelMode, AuthPanelProps, AvatarUploadProps, ChangePasswordFormData, ChangePasswordFormProps, ChartDataItem, ChartLineVariant, ChartPreset, ChartProps, ChartSeries, ChartSize, ChartTooltipMode, ChartType, CodeWorkspaceActionContext, CodeWorkspaceAnnotation, CodeWorkspaceAnnotationContext, CodeWorkspaceDisplay, CodeWorkspaceFile, CodeWorkspaceFileContent, CodeWorkspaceFileNode, CodeWorkspaceFolder, CodeWorkspaceInspectorContext, CodeWorkspaceMarker, CodeWorkspaceNode, CodeWorkspaceProps, CodeWorkspaceRange, CodeWorkspaceSearchHit, CodeWorkspaceSearchPage, CodeWorkspaceSearchQuery, CodeWorkspaceSelection, CodeWorkspaceSource, CodeWorkspaceTheme, CodeWorkspaceThemeBase, CrudApi, CrudController, CrudControllerOptions, CrudData, CrudDef, CrudDensity, CrudFieldDef, CrudFieldType, CrudFormConfig, CrudFormVariant, CrudListOptions, CrudOption, CrudPageData, CrudPageProps, CrudPaginationConfig, CrudPermissions, CrudResource, CrudTableColumn, CrudText, DashboardGridProps, EncryptedInputProps, ErrorPreset, ErrorPresetInfo, FeedbackSubmitAction, FeedbackViewActions, FileItem, FileListProps, FileUploadProps, ForgotPasswordFormData, ForgotPasswordFormProps, HashDisplayProps, ImageUploadProps, LoginFormData, LoginFormProps, MarkdownBlockStyleKind, MarkdownCodeBlockItem, MarkdownCodeRunRequest, MarkdownCodeRunResult, MarkdownColorFormatRequest, MarkdownDocumentBlock, MarkdownDocumentHtmlBlock, MarkdownDocumentMermaidBlock, MarkdownDocumentParseOptions, MarkdownInlineFormatKind, MarkdownOutlineItem, MarkdownParseOptions, MarkdownRendererProps, MarkdownRenderResult, MarkdownRewriteAction, MarkdownRewriteRequest, MarkdownSourceRange, MarkdownTextAlignKind, MarkdownToolbarDownloadAction, MetricCardProps, NavAdapter, PasswordInputProps, PasswordPolicy, PermissionContext, ReauthenticationDialogProps, RegisterField, RegisterFormData, RegisterFormProps, ReportCardProps, ResetPasswordFormData, ResetPasswordFormProps, SensitiveActions, SensitiveActionsOptions, SessionRecovery, SignatureDisplayProps, ToolCatalogItem, ToolExample, ToolResource, ToolRun, ToolRunRequest, ToolWorkspaceProps, UploadFile, UploadHandler, UploadHandlerContext, UploadHandlerResult, UploadState, UserProfileData, UserProfileField, UserProfileProps, UserProfileSubmitData, WorkspaceLeaveGuard } from './scenes/index.js'

/**
 * 此组件子路径提供的运行工具。
 * @example
 * ```ts
 * import { ui } from '@h-ai/ui/components/index'
 *
 * // 将已提供的 Markdown 转为渲染结果。
 * const rendered = ui.parseMarkdown('## 示例')
 * void rendered
 * ```
 */
export const ui = {
  createDefaultCronBuilderState,
  cronBuilderStateToExpression,
  cronExpressionToBuilderState,
  isCronExpressionValid,
  normalizeScheduleInputConfig,
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
