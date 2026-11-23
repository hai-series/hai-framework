import { createDefaultCronBuilderState, cronBuilderStateToExpression, cronExpressionToBuilderState, isCronExpressionValid } from './components/compounds/cron-expression-builder.js'
import { normalizeScheduleInputConfig } from './components/compounds/schedule-input.js'
import { downloadAiDocument, resolveDocumentDownloadActions, resolveDocumentMarkdownContent } from './components/scenes/ai/document-download.js'
import { renderMarkdownDocument } from './components/scenes/ai/document-parse.js'
import { highlightCode, isLanguageSupported } from './components/scenes/ai/highlight.js'
import { parseMarkdown } from './components/scenes/ai/markdown-parse.js'
import { fromMindElixirData, toMindElixirData } from './components/scenes/ai/mind/mind-adapter.js'
import { createCrudController, defineCrud, mapPaginated } from './components/scenes/crud/crud-controller.svelte.js'
import { createBrowserNavAdapter } from './components/scenes/crud/nav-adapter.js'
import { resolveErrorPreset } from './components/scenes/error/error-presets.js'
import { authErrorMessage } from './components/scenes/iam/auth-error-message.js'
import { matchPermission, setPermissionContext, usePermission } from './components/scenes/iam/permission-context.svelte.js'
import { createSensitiveActions } from './components/scenes/iam/sensitive-actions.svelte.js'
import { createSessionRecovery } from './components/scenes/iam/session-recovery.svelte.js'
import { createGuide, resolveGuideText } from './guide.svelte.js'
import { createLocaleStore, detectBrowserLocale, getGlobalLocale, interpolate, isLocaleSupported, resolveLocale } from './i18n.svelte.js'
import { registerClipboardHostWriter, writeTextToClipboard } from './internal/browser-safety.js'
import { changeUILocale as setGlobalLocale } from './internal/locale.js'
import { message } from './message.svelte.js'
import { messageBox } from './messagebox.svelte.js'
import { applyTheme, createThemeBootstrapScript, getCurrentTheme, getSavedTheme, getThemeInfo, getThemeInitScript, isDarkTheme, normalizeHexColor, normalizeThemeId, resolveThemeTone } from './theme-config.js'
import { errorMessage, notifyError, notifyInfo, notifySuccess, notifyWarning, toast, useToastFeedback } from './toast.svelte.js'
import { cn, generateId, getAlertVariantClass, getBadgeSizeClass, getBadgeVariantClass, getDataAttributes, getInputSizeClass, getProgressVariantClass, getSizeClass, getVariantClass, portal } from './utils.js'
import { detectPlatform, isMobile, isNativeApp, usePlatform } from './utils/platform.svelte.js'

const helpers = {
  applyTheme,
  authErrorMessage,
  cn,
  createBrowserNavAdapter,
  createCrudController,
  createDefaultCronBuilderState,
  createGuide,
  createLocaleStore,
  createSensitiveActions,
  createSessionRecovery,
  createThemeBootstrapScript,
  cronBuilderStateToExpression,
  cronExpressionToBuilderState,
  defineCrud,
  detectBrowserLocale,
  detectPlatform,
  downloadAiDocument,
  errorMessage,
  fromMindElixirData,
  generateId,
  getAlertVariantClass,
  getBadgeSizeClass,
  getBadgeVariantClass,
  getCurrentTheme,
  getDataAttributes,
  getGlobalLocale,
  getInputSizeClass,
  getProgressVariantClass,
  getSavedTheme,
  getSizeClass,
  getThemeInfo,
  getThemeInitScript,
  getVariantClass,
  highlightCode,
  interpolate,
  isCronExpressionValid,
  isDarkTheme,
  isLanguageSupported,
  isLocaleSupported,
  isMobile,
  isNativeApp,
  mapPaginated,
  matchPermission,
  normalizeHexColor,
  normalizeScheduleInputConfig,
  normalizeThemeId,
  notifyError,
  notifyInfo,
  notifySuccess,
  notifyWarning,
  parseMarkdown,
  portal,
  registerClipboardHostWriter,
  renderMarkdownDocument,
  resolveDocumentDownloadActions,
  resolveDocumentMarkdownContent,
  resolveErrorPreset,
  resolveGuideText,
  resolveLocale,
  resolveThemeTone,
  setGlobalLocale,
  setPermissionContext,
  toMindElixirData,
  usePermission,
  usePlatform,
  useToastFeedback,
  writeTextToClipboard,
}

/**
 * UI 运行工具与命令式状态的统一入口；组件仍按原名导入。
 * @example
 * ```ts
 * import { ui } from '@h-ai/ui'
 *
 * // 发送提示并通过同一状态对象移除它。
 * const id = ui.notifySuccess('已保存', 0)
 * ui.toast.remove(id)
 * ```
 */
export const ui: typeof helpers & { message: typeof message, messageBox: typeof messageBox, toast: typeof toast } = {
  ...helpers,
  message,
  messageBox,
  toast,
}
