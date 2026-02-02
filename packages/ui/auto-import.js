/**
 * =============================================================================
 * @hai/ui - 自动导入预处理器
 * =============================================================================
 * 目标：在 Svelte 编译阶段自动注入 @hai/ui 组件 import，避免页面显式引入。
 * 说明：该预处理器会在 svelte-check 与 Vite 编译时生效。
 * =============================================================================
 */

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
  'Range',
  'Rating',
  'Select',
  'Spinner',
  'Switch',
  'Tag',
  'Textarea',
  'ToggleCheckbox',
  'ToggleRadio',
  // compounds
  'Accordion',
  'Alert',
  'Breadcrumb',
  'Card',
  'Confirm',
  'DataTable',
  'Drawer',
  'Dropdown',
  'Empty',
  'FeedbackModal',
  'Form',
  'FormField',
  'LanguageSwitch',
  'Modal',
  'MultiSelect',
  'PageHeader',
  'Pagination',
  'Popover',
  'Result',
  'ScoreBar',
  'SettingsModal',
  'SeverityBadge',
  'Skeleton',
  'Steps',
  'Table',
  'Tabs',
  'TagInput',
  'ThemeSelector',
  'ThemeToggle',
  'Timeline',
  'Toast',
  'ToastContainer',
  'Tooltip',
  // scenes - iam
  'ChangePasswordForm',
  'ForgotPasswordForm',
  'LoginForm',
  'PasswordInput',
  'RegisterForm',
  'ResetPasswordForm',
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
])

const TAG_REGEX = /<([A-Z][A-Za-z0-9]*)\b/g
const SCRIPT_REGEX = /<script\b([^>]*)>([\s\S]*?)<\/script>/g
const UI_IMPORT_REGEX = /import\s*\{([^}]+)\}\s*from\s*['"]@hai\/ui['"];?/

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
  const lines = scriptContent.split('\n')
  let buffer = ''

  const flushImport = (statement) => {
    const fromIndex = statement.lastIndexOf(' from ')
    if (fromIndex === -1)
      return

    let clause = statement.slice('import '.length, fromIndex).trim()
    clause = clause.replace(/^type\s+/, '')
    if (!clause)
      return

    // default + named: Button, { Input as UiInput }
    if (clause.includes('{')) {
      const [defaultPart, namedPart] = clause.split('{')
      const defaultName = defaultPart.replace(',', '').trim()
      if (defaultName)
        imported.add(defaultName)

      const raw = namedPart.replace('}', '')
      for (const segment of raw.split(',')) {
        const cleaned = segment.trim().replace(/^type\s+/, '')
        if (!cleaned)
          continue
        const [original] = cleaned.split(/\s+as\s+/i)
        if (original)
          imported.add(original.trim())
      }
      return
    }

    // namespace import: * as name
    if (clause.startsWith('* as ')) {
      const name = clause.replace('* as ', '').trim()
      if (name)
        imported.add(name)
      return
    }

    // default import
    imported.add(clause)
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!buffer) {
      if (!trimmed.startsWith('import '))
        continue
      buffer = trimmed
      if (trimmed.endsWith(';')) {
        flushImport(buffer)
        buffer = ''
      }
      continue
    }

    buffer += ` ${trimmed}`
    if (trimmed.endsWith(';')) {
      flushImport(buffer)
      buffer = ''
    }
  }

  if (buffer)
    flushImport(buffer)

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
    const updated = `import { ${merged.join(', ')} } from '@hai/ui'`
    return scriptContent.replace(UI_IMPORT_REGEX, updated)
  }

  return `import { ${components.join(', ')} } from '@hai/ui'\n${scriptContent}`
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

      // 跳过 @hai/ui 包自身的文件，避免重复导入
      const normalizedPath = filename.replace(/\\/g, '/')
      if (normalizedPath.includes('/packages/ui/') || normalizedPath.includes('/@hai/ui/')) {
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
        const isModule = /context\s*=\s*['"]module['"]/i.test(attrs)
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
