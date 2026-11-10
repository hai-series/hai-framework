import type { CodeWorkspaceTheme, CodeWorkspaceThemeBase } from './code-types.js'
import { editor, Uri } from 'monaco-editor'

// 使用独立入口和静态 URL，由宿主构建工具生成同源 worker 资源。
function getWorker(_id: string, label: string): Worker {
  switch (label) {
    case 'css':
    case 'less':
    case 'scss':
      return new Worker(new URL('./workers/css.worker.js', import.meta.url), { type: 'module' })
    case 'html':
    case 'handlebars':
    case 'razor':
      return new Worker(new URL('./workers/html.worker.js', import.meta.url), { type: 'module' })
    case 'json':
      return new Worker(new URL('./workers/json.worker.js', import.meta.url), { type: 'module' })
    case 'typescript':
    case 'javascript':
      return new Worker(new URL('./workers/ts.worker.js', import.meta.url), { type: 'module' })
    default:
      return new Worker(new URL('./workers/editor.worker.js', import.meta.url), { type: 'module' })
  }
}

// 保留宿主已有的 worker 设置。
if (!globalThis.MonacoEnvironment?.getWorker && !globalThis.MonacoEnvironment?.getWorkerUrl) {
  globalThis.MonacoEnvironment = {
    ...globalThis.MonacoEnvironment,
    getWorker,
  }
}

const builtinThemes: Record<CodeWorkspaceThemeBase, editor.BuiltinTheme> = {
  'vs-light': 'vs',
  'vs-dark': 'vs-dark',
  'hc-dark': 'hc-black',
  'hc-light': 'hc-light',
}

let githubDefined = false
let customSignature: string | undefined

function inheritedTheme(host: HTMLElement): editor.BuiltinTheme {
  const scheme = getComputedStyle(host).colorScheme
  const dark = scheme === 'dark' || (scheme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)
  if (matchMedia('(forced-colors: active)').matches)
    return dark ? 'hc-black' : 'hc-light'
  return dark ? 'vs-dark' : 'vs'
}

export function workspaceThemeName(theme: CodeWorkspaceTheme, host: HTMLElement): string {
  if (theme === 'inherit')
    return inheritedTheme(host)

  if (theme === 'github-dark') {
    if (!githubDefined) {
      editor.defineTheme('hai-github-dark', {
        base: 'vs-dark',
        inherit: true,
        colors: {
          'editor.background': '#0D1117',
          'editor.foreground': '#E6EDF3',
          'editor.lineHighlightBackground': '#161B22',
          'editorLineNumber.foreground': '#8B949E',
          'editorLineNumber.activeForeground': '#E6EDF3',
          'editor.selectionBackground': '#264F78',
        },
        rules: [
          { token: 'comment', foreground: '8B949E' },
          { token: 'keyword', foreground: 'FF7B72' },
          { token: 'string', foreground: 'A5D6FF' },
          { token: 'type', foreground: 'D2A8FF' },
        ],
      })
      githubDefined = true
    }
    return 'hai-github-dark'
  }

  if (typeof theme === 'string')
    return builtinThemes[theme]

  const signature = JSON.stringify(theme)
  if (signature !== customSignature) {
    editor.defineTheme('hai-code-custom', {
      base: builtinThemes[theme.base],
      inherit: true,
      colors: { ...theme.colors },
      rules: theme.tokens?.map(token => ({ ...token })) ?? [],
    })
    customSignature = signature
  }
  return 'hai-code-custom'
}

export { editor, Uri }
