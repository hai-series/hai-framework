/**
 * @h-ai/ui — Shiki 语法高亮引擎
 *
 * 基于 Shiki 的同步语法高亮工具，使用 CSS Variables 主题实现 DaisyUI 自适应。
 * 替代 highlight.js，解决 CJS 兼容性问题（SSR / Vite 预构建）。
 *
 * @module highlight
 */

import langBash from '@shikijs/langs/bash'
import langC from '@shikijs/langs/c'

// ─── 语言定义导入（静态，同步解析） ───

import langCpp from '@shikijs/langs/cpp'
import langCsharp from '@shikijs/langs/csharp'
import langCss from '@shikijs/langs/css'
import langDiff from '@shikijs/langs/diff'
import langGo from '@shikijs/langs/go'
import langGraphql from '@shikijs/langs/graphql'
import langHtml from '@shikijs/langs/html'
import langJava from '@shikijs/langs/java'
import langJavascript from '@shikijs/langs/javascript'
import langJson from '@shikijs/langs/json'
import langKotlin from '@shikijs/langs/kotlin'
import langLua from '@shikijs/langs/lua'
import langMarkdown from '@shikijs/langs/markdown'
import langPhp from '@shikijs/langs/php'
import langPython from '@shikijs/langs/python'
import langRuby from '@shikijs/langs/ruby'
import langRust from '@shikijs/langs/rust'
import langScss from '@shikijs/langs/scss'
import langShell from '@shikijs/langs/shellscript'
import langSql from '@shikijs/langs/sql'
import langSwift from '@shikijs/langs/swift'
import langToml from '@shikijs/langs/toml'
import langTypescript from '@shikijs/langs/typescript'
import langXml from '@shikijs/langs/xml'
import langYaml from '@shikijs/langs/yaml'
import { createCssVariablesTheme, createHighlighterCoreSync } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'

// ─── CSS Variables 主题（DaisyUI 自适应色彩由组件 CSS 定义） ───

const haiTheme = createCssVariablesTheme({
  name: 'hai-adaptive',
  variablePrefix: '--hai-hl-',
  variableDefaults: {},
  fontStyle: true,
})

const THEME_NAME = 'hai-adaptive'

// ─── 创建同步高亮器 ───

const highlighter = createHighlighterCoreSync({
  themes: [haiTheme],
  langs: [
    langJavascript,
    langTypescript,
    langPython,
    langJava,
    langGo,
    langRust,
    langC,
    langCpp,
    langCsharp,
    langRuby,
    langPhp,
    langSwift,
    langKotlin,
    langSql,
    langBash,
    langShell,
    langHtml,
    langXml,
    langCss,
    langScss,
    langJson,
    langYaml,
    langToml,
    langMarkdown,
    langDiff,
    langGraphql,
    langLua,
  ],
  engine: createJavaScriptRegexEngine(),
})

// ─── 语言别名映射（hljs 兼容 + 常见别名） ───

const LANG_ALIASES: Record<string, string> = {
  'js': 'javascript',
  'ts': 'typescript',
  'py': 'python',
  'rb': 'ruby',
  'rs': 'rust',
  'sh': 'bash',
  'shell': 'bash',
  'zsh': 'bash',
  'yml': 'yaml',
  'c++': 'cpp',
  'c#': 'csharp',
  'cs': 'csharp',
  'kt': 'kotlin',
  'gql': 'graphql',
  'md': 'markdown',
  'objc': 'objective-c',
  'plaintext': 'text',
  'plain': 'text',
  'txt': 'text',
}

/**
 * 解析语言标识符为 Shiki 支持的语言名
 */
function resolveLang(lang: string): string | null {
  const normalized = lang.toLowerCase().trim()
  if (normalized === '' || normalized === 'text' || normalized === 'plaintext')
    return null

  const resolved = LANG_ALIASES[normalized] ?? normalized
  const loaded = highlighter.getLoadedLanguages()
  return loaded.includes(resolved) ? resolved : null
}

/**
 * 从 codeToHtml 输出中提取 <code> 标签内的 innerHTML
 */
function extractCodeInnerHtml(html: string): string {
  const startTag = '<code>'
  const endTag = '</code>'
  const start = html.indexOf(startTag)
  const end = html.lastIndexOf(endTag)
  if (start === -1 || end === -1)
    return html
  return html.slice(start + startTag.length, end)
}

/**
 * 检查给定语言标识符是否受支持
 *
 * @param lang - 语言标识符（支持别名如 js、ts、py）
 * @returns 是否支持该语言
 */
export function isLanguageSupported(lang: string): boolean {
  return resolveLang(lang) !== null
}

/**
 * 使用 Shiki 执行代码高亮
 *
 * 输出为 HTML 片段（不含 <pre><code> 包裹），可直接嵌入自定义容器。
 * 使用 CSS Variables 主题，颜色通过 `--hai-hl-*` CSS 变量控制。
 *
 * @param text - 代码文本
 * @param lang - 语言标识符
 * @returns 高亮后的 HTML 片段
 */
export function highlightCode(text: string, lang: string): string {
  const resolved = resolveLang(lang)
  if (!resolved)
    return ''

  const html = highlighter.codeToHtml(text, { lang: resolved, theme: THEME_NAME })
  return extractCodeInnerHtml(html)
}
