/**
 * @h-ai/ui — 主入口
 *
 * UI 组件库，提供: - 基于 Svelte 5 Runes 的组件 - DaisyUI 风格 + Bits UI headless 交互 - 完整的类型定义
 * @module index
 */

// ─── 组件导出（从 components/ 统一导出所有三层组件及其类型） ───

export { Accordion, ActionSheet, AiDocumentDownloadMenu, AiDocumentEditor, AiMindMapEditor, AiTableEditor, Alert, AppBar, ArtifactWorkspace, AuthPanel, AuthShell, Avatar, AvatarUpload, Badge, BareButton, BareInput, BottomNav, Breadcrumb, Button, Calendar, Card, ChangePasswordForm, Chart, Checkbox, CodeWorkspace, Combobox, Confirm, CRON_BUILDER_WEEKDAY_ORDER, CronExpressionBuilder, CrudDeleteConfirm, CrudDetailPanel, CrudEditPanel, CrudFilterBar, CrudPage, DashboardGrid, DataTable, DatePicker, Drawer, Dropdown, Empty, EncryptedInput, ERROR_PRESETS, ErrorPage, FeedbackDetail, FeedbackForm, FeedbackList, FeedbackModal, FileList, FileUpload, FilterBar, ForgotPasswordForm, Form, FormField, FormLayout, GuideHost, HashDisplay, HelpCenter, IconButton, ImageUpload, InfiniteScroll, Input, JsonViewer, LanguageSwitch, LoginForm, MarkdownRenderer, MessageBoxContainer, MessageBoxDialog, MessageContainer, MetricCard, Modal, PageHeader, Pagination, PasswordInput, PermGuard, Popover, Progress, PullRefresh, Radio, Range, Rating, ReauthenticationDialog, RegisterForm, ReportCard, ResetPasswordForm, Result, SafeArea, ScheduleInput, Select, SensitiveOperationsForm, SessionRecoveryDialog, SettingsLayout, SettingsModal, SignatureDisplay, Skeleton, Spinner, Steps, SwipeCell, Switch, TableToolbar, Tabs, Tag, TagInput, Textarea, ThemeColorPicker, ThemeSelector, ThemeToggle, Timeline, ToastContainer, ToggleCheckbox, ToggleInput, ToggleRadio, Tooltip, ToolWorkspace, UserProfile, WorkspaceLayout } from './components/index.js'
export type { AccordionItem, ActionSheetItem, AgreementDisplay, AiDocumentDownloadFormat, AiDocumentDownloadRequest, AiDocumentEditorProps, AiDocumentResolvedDownloadAction, AiMindMapChangePayload, AiMindMapData, AiMindMapEditorProps, AiMindMapExportFormat, AiMindMapNode, AiMindMapSelection, AiTableColumn, AiTableColumnType, AiTableCopyPayload, AiTableData, AiTableDownloadPayload, AiTableEditorChangeAction, AiTableEditorChangePayload, AiTableEditorProps, AiTableRow, ArtifactCreateRequest, ArtifactDocument, ArtifactKind, ArtifactRewriteRequest, ArtifactSaveRequest, ArtifactSaveResponse, ArtifactSummary, ArtifactWorkspaceProps, AuthLoginMethod, AuthPanelActions, AuthPanelConfig, AuthPanelMode, AuthPanelProps, AvatarUploadProps, BottomNavItem, ChangePasswordFormData, ChangePasswordFormProps, ChartDataItem, ChartLineVariant, ChartPreset, ChartProps, ChartSeries, ChartSize, ChartTooltipMode, ChartType, CodeWorkspaceActionContext, CodeWorkspaceAnnotation, CodeWorkspaceAnnotationContext, CodeWorkspaceDisplay, CodeWorkspaceFile, CodeWorkspaceFileContent, CodeWorkspaceFileNode, CodeWorkspaceFolder, CodeWorkspaceInspectorContext, CodeWorkspaceMarker, CodeWorkspaceNode, CodeWorkspaceProps, CodeWorkspaceRange, CodeWorkspaceSearchHit, CodeWorkspaceSearchPage, CodeWorkspaceSearchQuery, CodeWorkspaceSelection, CodeWorkspaceSource, CodeWorkspaceTheme, CodeWorkspaceThemeBase, CronBuilderMode, CronBuilderState, CronExpressionBuilderLabels, CronExpressionBuilderPreset, CronExpressionBuilderWeekdayOption, CronWeekdayValue, CrudApi, CrudController, CrudControllerOptions, CrudData, CrudDef, CrudDensity, CrudFieldDef, CrudFieldType, CrudFormConfig, CrudFormVariant, CrudListOptions, CrudOption, CrudPageData, CrudPageProps, CrudPaginationConfig, CrudPermissions, CrudResource, CrudTableColumn, CrudText, DashboardGridProps, EncryptedInputProps, ErrorPreset, ErrorPresetInfo, FeedbackSubmitAction, FeedbackViewActions, FileItem, FileListProps, FileUploadProps, ForgotPasswordFormData, ForgotPasswordFormProps, HashDisplayProps, ImageUploadProps, LoginFormData, LoginFormProps, MarkdownBlockStyleKind, MarkdownCodeBlockItem, MarkdownCodeRunRequest, MarkdownCodeRunResult, MarkdownColorFormatRequest, MarkdownDocumentBlock, MarkdownDocumentHtmlBlock, MarkdownDocumentMermaidBlock, MarkdownDocumentParseOptions, MarkdownInlineFormatKind, MarkdownOutlineItem, MarkdownParseOptions, MarkdownRendererProps, MarkdownRenderResult, MarkdownRewriteAction, MarkdownRewriteRequest, MarkdownSourceRange, MarkdownTextAlignKind, MarkdownToolbarDownloadAction, MetricCardProps, NavAdapter, PasswordInputProps, PasswordPolicy, PermissionContext, ReauthenticationDialogProps, RegisterField, RegisterFormData, RegisterFormProps, ReportCardProps, ResetPasswordFormData, ResetPasswordFormProps, ScheduleInputConfig, SensitiveActions, SensitiveActionsOptions, SessionRecovery, SignatureDisplayProps, SwipeCellAction, TimelineItem, ToolCatalogItem, ToolExample, ToolResource, ToolRun, ToolRunRequest, ToolWorkspaceProps, UploadFile, UploadHandler, UploadHandlerContext, UploadHandlerResult, UploadState, UserProfileData, UserProfileField, UserProfileProps, UserProfileSubmitData, WorkspaceLeaveGuard } from './components/index.js'
export * from './guide-types.js'

// ─── i18n 国际化（Paraglide 辅助工具） ───

export { DEFAULT_LOCALE, DEFAULT_LOCALES } from './i18n.svelte.js'
export type { InterpolationParams, Locale, LocaleInfo } from './i18n.svelte.js'

// ─── 浏览器剪贴板辅助（宿主注册与安全写入） ───

export type { ClipboardHostWriter } from './internal/browser-safety.js'

// ─── Message 轻量消息提示（类似 ElementUI Message） ───

export type { MessageItem } from './message.svelte.js'

// ─── MessageBox 命令式弹框（类似 ElementUI MessageBox） ───

export type { MessageBoxItem } from './messagebox.svelte.js'

// ─── 主题配置 ───

export { DAISYUI_THEMES_CONFIG, DARK_THEMES, DEFAULT_THEME, DEFAULT_THEME_COLOR, DEFAULT_THEME_COLOR_CSS_VAR, SUPPORTED_THEME_IDS, THEME_COLOR_PRESETS, THEME_GROUPS, THEME_STORAGE_KEY, THEMES } from './theme-config.js'
export type { ThemeBootstrapLocaleConfig, ThemeBootstrapScriptOptions, ThemeColorPreset, ThemeGroup, ThemeInfo } from './theme-config.js'

// ─── Toast 状态管理 ───

export type { ToastItem } from './toast.svelte.js'

// ─── 基础类型与工具 ───

export * from './types.js'
export { ui } from './ui-main.js'

// ─── 平台检测与移动端工具 ───

export type { ForwardedDataAttributes } from './utils.js'

export type { Platform } from './utils/platform.svelte.js'
