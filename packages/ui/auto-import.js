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
  'FilterBar',
  'WorkspaceLayout',
  'CodeWorkspace',
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
  // scenes - charts
  'Chart',
  'DashboardGrid',
  'MetricCard',
  'ReportCard',
  // scenes - error
  'ErrorPage',
])

const WINDOWS_PATH_SEPARATOR_REGEX = /\\/g

/** 解构绑定与普通名称共用同一收集路径，类型注解不会创建运行时值。 */
function bindPattern(pattern, bindings) {
  if (!pattern)
    return
  if (pattern.type === 'Identifier') {
    bindings.add(pattern.name)
  }
  else if (pattern.type === 'RestElement' || pattern.type === 'SpreadElement') {
    bindPattern(pattern.argument, bindings)
  }
  else if (pattern.type === 'AssignmentPattern') {
    bindPattern(pattern.left, bindings)
  }
  else if (pattern.type === 'ArrayPattern' || pattern.type === 'ArrayExpression') {
    pattern.elements.forEach(element => bindPattern(element, bindings))
  }
  else if (pattern.type === 'ObjectPattern' || pattern.type === 'ObjectExpression') {
    pattern.properties.forEach(property => bindPattern(['RestElement', 'SpreadElement'].includes(property.type)
      ? property.argument
      : property.value, bindings))
  }
}

/** 只记录顶层真实值声明；声明在函数体里的同名局部值不影响组件模板。 */
function bindDeclaration(statement, bindings) {
  const declaration = statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration'
    ? statement.declaration
    : statement
  if (!declaration)
    return
  if (declaration.type === 'VariableDeclaration') {
    declaration.declarations.forEach(item => bindPattern(item.id, bindings))
  }
  else if ([
    'FunctionDeclaration',
    'ClassDeclaration',
    'TSEnumDeclaration',
    'TSModuleDeclaration',
  ].includes(declaration.type)) {
    bindPattern(declaration.id, bindings)
  }
}

/** 组件只来自模板 AST，同时尊重脚本与 each/await/snippet/let 的词法绑定。 */
function collectUsedComponents(ast) {
  const used = new Set()
  const outer = new Set([
    ...analyzeScript(ast.module).bindings,
    ...analyzeScript(ast.instance).bindings,
  ])
  const pending = [
    { node: ast.fragment, bindings: outer },
  ]
  while (pending.length) {
    const { node, bindings } = pending.pop()
    if (!node || typeof node !== 'object')
      continue
    if (Array.isArray(node)) {
      for (let index = node.length - 1; index >= 0; index--)
        pending.push({ node: node[index], bindings })
      continue
    }
    if (node.type === 'Component' && UI_COMPONENTS.has(node.name) && !bindings.has(node.name))
      used.add(node.name)
    if (node.type === 'EachBlock') {
      const body = new Set(bindings)
      bindPattern(node.context, body)
      if (node.index)
        body.add(node.index)
      pending.push({ node: node.fallback, bindings }, { node: node.body, bindings: body })
      continue
    }
    if (node.type === 'AwaitBlock') {
      const then = new Set(bindings)
      const caught = new Set(bindings)
      bindPattern(node.value, then)
      bindPattern(node.error, caught)
      pending.push({ node: node.catch, bindings: caught }, { node: node.then, bindings: then }, { node: node.pending, bindings })
      continue
    }
    if (node.type === 'SnippetBlock') {
      const body = new Set(bindings)
      bindPattern(node.expression, body)
      node.parameters.forEach(parameter => bindPattern(parameter, body))
      pending.push({ node: node.body, bindings: body })
      continue
    }
    let scoped = bindings
    if (node.type === 'Fragment') {
      scoped = new Set(bindings)
      for (const child of node.nodes) {
        if (child.type === 'SnippetBlock')
          bindPattern(child.expression, scoped)
        else if (child.type === 'ConstTag' || child.type === 'DeclarationTag')
          bindDeclaration(child.declaration, scoped)
      }
    }
    for (const attribute of node.attributes ?? []) {
      if (attribute.type === 'LetDirective') {
        if (scoped === bindings)
          scoped = new Set(bindings)
        bindPattern(attribute.expression ?? { type: 'Identifier', name: attribute.name }, scoped)
      }
    }
    // 仅遍历模板子节点；脚本、属性表达式和样式中的文本不会成为组件节点。
    for (const key of [
      'fragment',
      'nodes',
      'consequent',
      'alternate',
    ]) {
      if (node[key])
        pending.push({ node: node[key], bindings: scoped })
    }
  }
  return used
}

/** 一次解析同时提供运行时绑定与真实 import 范围，不再扫描字符串/注释中的伪 import。 */
function analyzeScript(script) {
  const bindings = new Set()
  const externalTypeBindings = new Set()
  const declarations = []
  for (const statement of script?.content.body ?? []) {
    if (statement.type !== 'ImportDeclaration') {
      bindDeclaration(statement, bindings)
      continue
    }
    for (const specifier of statement.specifiers) {
      if (statement.importKind !== 'type' && specifier.importKind !== 'type')
        bindings.add(specifier.local.name)
      else if (statement.source.value !== '@h-ai/ui')
        externalTypeBindings.add(specifier.local.name)
    }
    if (statement.source.value === '@h-ai/ui')
      declarations.push(statement)
  }
  return {
    bindings,
    externalTypeBindings,
    declarations,
    offset: script?.content.start ?? 0,
  }
}

/** 整条 type import 提升为混合导入时，跳过词法空白和注释，只移除解析器确认的 type 关键字。 */
function typeKeywordStart(scriptContent, declarationStart) {
  let cursor = declarationStart + 'import'.length
  while (cursor < scriptContent.length) {
    if (/\s/.test(scriptContent[cursor])) {
      cursor++
    }
    else if (scriptContent.startsWith('/*', cursor)) {
      const end = scriptContent.indexOf('*/', cursor + 2)
      if (end === -1)
        break
      cursor = end + 2
    }
    else if (scriptContent.startsWith('//', cursor)) {
      const end = scriptContent.indexOf('\n', cursor + 2)
      if (end === -1)
        break
      cursor = end + 1
    }
    else {
      break
    }
  }
  if (scriptContent.slice(cursor, cursor + 4) !== 'type')
    throw new Error('Unable to locate the parsed type-only import keyword')
  return cursor
}

function mergeHaiUiImport(scriptContent, components, analysis) {
  if (components.length === 0)
    return scriptContent

  const missing = new Set(components)
  const edits = []
  let target
  for (const declaration of analysis.declarations) {
    const named = declaration.specifiers.filter(specifier => specifier.type === 'ImportSpecifier')
    if (named.length === 0)
      continue
    const typeOnly = declaration.importKind === 'type'
    const promoted = named.filter(specifier => (typeOnly || specifier.importKind === 'type') && missing.has(specifier.local.name))
    if (typeOnly) {
      if (promoted.length === 0)
        continue
      const start = typeKeywordStart(scriptContent, declaration.start - analysis.offset)
      edits.push({ start, end: start + 4, text: '' })
      // 仅被用作组件的类型绑定提升为值；同声明内其它类型继续保持 type，不引入不存在的运行时导出。
      for (const specifier of named) {
        if (!promoted.includes(specifier)) {
          const start = specifier.start - analysis.offset
          edits.push({ start, end: start, text: 'type ' })
        }
      }
    }
    else {
      for (const specifier of promoted) {
        const start = specifier.start - analysis.offset
        edits.push({ start, end: start + 'type'.length, text: '' })
      }
    }
    for (const specifier of promoted)
      missing.delete(specifier.local.name)
    target ??= named[named.length - 1]
  }

  if (missing.size > 0) {
    if (target) {
      const start = target.end - analysis.offset
      // 在最后一个真实具名绑定后插入；已有注释、别名、尾逗号和导入属性保持原样。
      edits.push({ start, end: start, text: `, ${[...missing].join(', ')}` })
    }
    else {
      edits.push({ start: 0, end: 0, text: `import { ${[...missing].join(', ')} } from '@h-ai/ui'\n` })
    }
  }
  let result = scriptContent
  for (const edit of edits.sort((left, right) => right.start - left.start))
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end)
  return result
}

function updateScriptBlock(scriptContent, usedComponents, filename, ast) {
  const analysis = analyzeScript(ast.instance)
  // 模块脚本的运行时 import 同样可供模板使用，但只向实例脚本注入缺失项。
  for (const name of analyzeScript(ast.module).bindings)
    analysis.bindings.add(name)
  const missing = [...usedComponents].filter(name => !analysis.bindings.has(name))
  const conflicts = missing.filter(name => analysis.externalTypeBindings.has(name))
  if (conflicts.length > 0) {
    throw new Error(`[auto-import-hai-ui] ${filename}: Cannot auto-import component(s) ${conflicts.join(', ')} because a type-only import from another module uses the same local name. Alias the type-only import or explicitly import the component under a different local name.`)
  }
  return mergeHaiUiImport(scriptContent, missing, analysis)
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

      // 先由语言预处理器转换样式/模板，再按整份 Svelte AST 选择真实实例脚本。
      // Svelte parse 会移除 BOM；局部坐标基于去除 BOM 的源码，输出仍保留它。
      const prefix = content.startsWith('\uFEFF')
        ? '\uFEFF'
        : ''
      const source = content.slice(prefix.length)
      const ast = parse(source, { modern: true })
      const usedComponents = collectUsedComponents(ast)
      if (usedComponents.size === 0)
        return { code: content }
      const instance = ast.instance
      if (!instance) {
        const scriptContent = updateScriptBlock('', usedComponents, filename, ast)
        if (!scriptContent)
          return { code: content }
        return { code: `${prefix}<script lang="ts">${scriptContent}</script>\n${source}` }
      }

      const { start, end } = instance.content
      const scriptContent = updateScriptBlock(source.slice(start, end), usedComponents, filename, ast)
      return { code: prefix + source.slice(0, start) + scriptContent + source.slice(end) }
    },
  }
}

export { autoImportHaiUi }
