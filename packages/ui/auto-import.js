/**
 * =============================================================================
 * @h-ai/ui - 自动导入预处理器
 * =============================================================================
 * 目标：在 Svelte 编译阶段自动注入 @h-ai/ui 组件 import，避免页面显式引入。
 * 说明：该预处理器会在 svelte-check 与 Vite 编译时生效。
 * =============================================================================
 */

import { parse } from 'svelte/compiler'

const UI_COMPONENTS = new Set([
  // primitives
  'Avatar',
  'Badge',
  'BareButton',
  'BareInput',
  'Button',
  'Checkbox',
  'IconButton',
  'Input',
  'Progress',
  'Radio',
  'Rating',
  'Select',
  'Spinner',
  'Switch',
  'Tag',
  'Textarea',
  'ToggleCheckbox',
  'ToggleInput',
  'ToggleRadio',
  // `Range` 与 DOM Range 构造器重名，保持显式 import 更稳妥。
  // compounds
  'Accordion',
  'ActionSheet',
  'Alert',
  'AppBar',
  'BottomNav',
  'Breadcrumb',
  'Calendar',
  'Card',
  'Combobox',
  'Confirm',
  'DataTable',
  'DatePicker',
  'Drawer',
  'Dropdown',
  'Empty',
  'Form',
  'FormField',
  'FormLayout',
  'InfiniteScroll',
  'JsonViewer',
  'MessageContainer',
  'MessageBoxContainer',
  'MessageBoxDialog',
  'Modal',
  'PageHeader',
  'Pagination',
  'Popover',
  'PullRefresh',
  'Result',
  'SafeArea',
  'Skeleton',
  'Steps',
  'SwipeCell',
  'TableToolbar',
  'Tabs',
  'TagInput',
  'Timeline',
  'ToastContainer',
  'Tooltip',
  // scenes - app
  'FeedbackDetail',
  'FeedbackForm',
  'FeedbackList',
  'FeedbackModal',
  'LanguageSwitch',
  'SettingsLayout',
  'SettingsModal',
  'ThemeColorPicker',
  'ThemeSelector',
  'ThemeToggle',
  'GuideHost',
  'HelpCenter',
  // scenes - iam
  'AuthShell',
  'AuthPanel',
  'ChangePasswordForm',
  'ForgotPasswordForm',
  'LoginForm',
  'PasswordInput',
  'PermGuard',
  'ReauthenticationDialog',
  'RegisterForm',
  'ResetPasswordForm',
  'SensitiveOperationsForm',
  'SessionRecoveryDialog',
  'UserProfile',
  // scenes - storage
  'AvatarUpload',
  'FileList',
  'FileUpload',
  'ImageUpload',
  // scenes - crypto
  'EncryptedInput',
  'HashDisplay',
  'SignatureDisplay',
  // scenes - ai
  'AiDocumentDownloadMenu',
  'AiDocumentEditor',
  'AiTableEditor',
  'MarkdownRenderer',
  // scenes - crud
  'CrudDeleteConfirm',
  'CrudDetailPanel',
  'CrudEditPanel',
  'CrudFilterBar',
  'CrudPage',
  // scenes - error
  'ErrorPage',
])

const TAG_REGEX = /<([A-Z][A-Za-z0-9]*)\b/g
const SCRIPT_REGEX = /<script\b([^>]*)>([\s\S]*?)<\/script>/g
const UI_IMPORT_REGEX = /import\s*\{([^}]+)\}\s*from\s*['"]@h-ai\/ui['"];?/
const WINDOWS_PATH_SEPARATOR_REGEX = /\\/g
const MODULE_CONTEXT_ATTR_REGEX = /context\s*=\s*['"]module['"]/i

function collectUsedComponents(content) {
  const used = new Set()
  for (const match of content.matchAll(TAG_REGEX)) {
    const name = match[1]
    if (UI_COMPONENTS.has(name)) {
      used.add(name)
    }
  }
  return used
}

function collectImportedNames(scriptContent) {
  const imported = new Set()
  // 复用 Svelte 的 TS 解析器识别绑定，兼容无分号、跨行、注释及别名。
  const ast = parse(`<script lang="ts">${scriptContent}</script>`, { modern: true })
  for (const statement of ast.instance?.content.body ?? []) {
    if (statement.type !== 'ImportDeclaration' || statement.importKind === 'type')
      continue
    for (const specifier of statement.specifiers) {
      if (specifier.importKind !== 'type')
        imported.add(specifier.local.name)
    }
  }
  return imported
}

function mergeHaiUiImport(scriptContent, components) {
  if (components.length === 0)
    return scriptContent

  const existingMatch = scriptContent.match(UI_IMPORT_REGEX)
  if (existingMatch) {
    const existing = existingMatch[1]
      .split(',')
      .map(name => name.trim())
      .filter(Boolean)

    const merged = [...existing, ...components.filter(name => !existing.includes(name))]
    const updated = `import { ${merged.join(', ')} } from '@h-ai/ui'`
    return scriptContent.replace(UI_IMPORT_REGEX, updated)
  }

  return `import { ${components.join(', ')} } from '@h-ai/ui'\n${scriptContent}`
}

function updateScriptBlock(scriptContent, usedComponents) {
  const imported = collectImportedNames(scriptContent)
  const missing = [...usedComponents].filter(name => !imported.has(name))
  return mergeHaiUiImport(scriptContent, missing)
}

function autoImportHaiUi() {
  return {
    name: 'auto-import-hai-ui',
    markup({ content, filename }) {
      if (!filename || !filename.endsWith('.svelte')) {
        return { code: content }
      }

      // 自动导入只服务应用源码；第三方依赖和 @h-ai/ui 自身必须保持原样，避免改写依赖内部的同名组件。
      const normalizedPath = filename.replace(WINDOWS_PATH_SEPARATOR_REGEX, '/')
      if (normalizedPath.includes('/node_modules/') || normalizedPath.includes('/packages/ui/') || normalizedPath.includes('/@h-ai/ui/')) {
        return { code: content }
      }

      const usedComponents = collectUsedComponents(content)
      if (usedComponents.size === 0) {
        return { code: content }
      }

      let lastIndex = 0
      let updated = ''
      let applied = false

      for (const match of content.matchAll(SCRIPT_REGEX)) {
        const [fullMatch, attrs, scriptContent] = match
        const isModule = MODULE_CONTEXT_ATTR_REGEX.test(attrs)
        const start = match.index ?? 0

        updated += content.slice(lastIndex, start)
        lastIndex = start + fullMatch.length

        if (!applied && !isModule) {
          const newScript = updateScriptBlock(scriptContent, usedComponents)
          updated += `<script${attrs}>${newScript}</script>`
          applied = true
        }
        else {
          updated += fullMatch
        }
      }

      if (!applied) {
        const scriptBlock = `<script lang="ts">${updateScriptBlock('', usedComponents)}</script>\n`
        return { code: scriptBlock + content }
      }

      updated += content.slice(lastIndex)
      return { code: updated }
    },
  }
}

export { autoImportHaiUi }
