/**
 * @h-ai/cli — 工具函数
 * @module cli-utils
 */

import type { TemplateContext } from './cli-types.js'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { wrapAnsi } from 'fast-wrap-ansi'
import fs from 'fs-extra'
import Handlebars from 'handlebars'

const CAMEL_CASE_SEPARATOR_REGEX = /[-_\s]+(.)?/g
const LEADING_CHAR_REGEX = /^./

/** CLI 交互提示直接写终端，不能交给异步 JSON 日志 transport。 */
export function writeCliMessage(message: string): void {
  process.stdout.write(`${message}\n`)
}

/** 显示异常的 message，保留子命令输出；Error 的不可枚举属性不能依赖 JSON 序列化。 */
export function writeCliError(message: string, error?: unknown): void {
  process.stderr.write(`${message}\n`)
  if (error && typeof error === 'object' && 'error' in error)
    error = error.error
  if (error !== undefined)
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
}

/** 显式按显示宽度换行，为 prompts 的前缀和缩进预留空间，避免中文自动折行后擦除不足。 */
export function formatPromptDescription(description: string): string {
  return wrapAnsi(description, Math.max(1, (process.stdout.columns || 80) - 32), { hard: true })
}

/**
 * 转换为驼峰命名
 */
export function toCamelCase(str: string): string {
  return str
    .replace(CAMEL_CASE_SEPARATOR_REGEX, (_, c) => c ? c.toUpperCase() : '')
    .replace(LEADING_CHAR_REGEX, c => c.toLowerCase())
}

/**
 * 转换为帕斯卡命名
 */
export function toPascalCase(str: string): string {
  const camel = toCamelCase(str)
  return camel.charAt(0).toUpperCase() + camel.slice(1)
}

/**
 * 转换为短横线命名
 */
export function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
}

/**
 * 转换为下划线命名
 */
export function toSnakeCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase()
}

/**
 * 创建模板上下文
 */
export function createTemplateContext(name: string, extra: Record<string, unknown> = {}): TemplateContext {
  return {
    camelCase: toCamelCase(name),
    pascalCase: toPascalCase(name),
    kebabCase: toKebabCase(name),
    snakeCase: toSnakeCase(name),
    ...extra,
  }
}

/**
 * 渲染模板
 */
export function renderTemplate(template: string, context: TemplateContext): string {
  const compiled = Handlebars.compile(template, { noEscape: true })
  return compiled(context)
}

/**
 * 渲染模板文件
 */
export async function renderTemplateFile(
  templatePath: string,
  context: TemplateContext,
): Promise<string> {
  const template = await fs.readFile(templatePath, 'utf-8')
  return renderTemplate(template, context)
}

/**
 * 写入文件（创建目录）
 */
export async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.ensureDir(path.dirname(filePath))
  await fs.writeFile(filePath, content, 'utf-8')
}

/**
 * 检查文件是否存在
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  }
  catch {
    return false
  }
}

/**
 * 获取包版本
 */
export async function getPackageVersion(pkgPath: string): Promise<string | null> {
  try {
    const pkg = await fs.readJson(pkgPath)
    return pkg.version
  }
  catch {
    return null
  }
}

/**
 * 读取 CLI 自身版本号
 *
 * 从当前模块所在目录向上查找 `@h-ai/cli` 的 package.json，
 * 兼容源码布局（src/）与打包产物布局（dist/）以及 npm 安装后的 node_modules 布局。
 * 用于生成项目时固定 `@h-ai/*` 依赖版本，避免硬编码与预发布版本漂移。
 */
export function getCliVersion(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 6; i++) {
    try {
      const pkg = fs.readJsonSync(path.join(dir, 'package.json')) as { name?: string, version?: string }
      if (pkg.name === '@h-ai/cli')
        return pkg.version ?? '0.0.0'
    }
    catch {
      // 当前目录无 package.json，继续向上查找
    }
    const parent = path.dirname(dir)
    if (parent === dir)
      break
    dir = parent
  }
  return '0.0.0'
}

/**
 * 检测包管理器
 */
export async function detectPackageManager(cwd: string): Promise<'pnpm' | 'npm' | 'yarn'> {
  if (await fileExists(path.join(cwd, 'pnpm-lock.yaml'))) {
    return 'pnpm'
  }
  if (await fileExists(path.join(cwd, 'yarn.lock'))) {
    return 'yarn'
  }
  return 'npm'
}

/**
 * 格式化字节
 */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`
}

/**
 * 格式化时间
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`
  }
  return `${(ms / 1000).toFixed(2)}s`
}

/**
 * 注册 Handlebars helpers
 */
export function registerHelpers(): void {
  // 条件判断
  Handlebars.registerHelper('if_eq', function (this: unknown, a: unknown, b: unknown, options: Handlebars.HelperOptions) {
    return a === b ? options.fn(this) : options.inverse(this)
  })

  // 日期格式化
  Handlebars.registerHelper('date', () => {
    return new Date().toISOString().split('T')[0]
  })

  // 年份
  Handlebars.registerHelper('year', () => {
    return new Date().getFullYear()
  })

  // 大写
  Handlebars.registerHelper('upper', (str: string) => {
    return str.toUpperCase()
  })

  // 小写
  Handlebars.registerHelper('lower', (str: string) => {
    return str.toLowerCase()
  })
}

// 初始化时注册 helpers
registerHelpers()
