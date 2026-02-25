/**
 * =============================================================================
 * @h-ai/cli - 工具函数
 * =============================================================================
 */

import type { TemplateContext } from './types.js'
import path from 'node:path'
import fs from 'fs-extra'
import Handlebars from 'handlebars'

/**
 * 转换为驼峰命名
 */
export function toCamelCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : '')
    .replace(/^./, c => c.toLowerCase())
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
