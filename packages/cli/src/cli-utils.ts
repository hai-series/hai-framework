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

/**
 * CLI 交互提示直接写终端，不能交给异步 JSON 日志 transport。
 * @param message - 已完成本地化的终端文案。
 * @example 模块内部上下文
 * ```ts
 * writeCliMessage('hai --help') // 调用方先完成用户文案的本地化。
 * ```
 */
export function writeCliMessage(message: string): void {
  process.stdout.write(`${message}\n`)
}

/**
 * 显示异常的 message，保留子命令输出；Error 的不可枚举属性不能依赖 JSON 序列化。
 * @param message - 已完成本地化的终端文案。
 * @param error - 可选原始错误或包装对象，用于提取诊断信息。
 * @example 模块内部上下文
 * ```ts
 * writeCliError('Build failed', new Error('The compile command exited with code 1'))
 * ```
 */
export function writeCliError(message: string, error?: unknown): void {
  process.stderr.write(`${message}\n`)
  if (error && typeof error === 'object' && 'error' in error)
    error = error.error
  if (error !== undefined)
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
}

/**
 * 显式按显示宽度换行，为 prompts 的前缀和缩进预留空间，避免中文自动折行后擦除不足。
 * @param description - 需按终端显示宽度折行的描述。
 * @returns 为提示前缀预留显示宽度后的文本。
 * @example 模块内部上下文
 * ```ts
 * const description = formatPromptDescription('Redis stores shared sessions across application instances.')
 * ```
 */
export function formatPromptDescription(description: string): string {
  return wrapAnsi(description, Math.max(1, (process.stdout.columns || 80) - 32), { hard: true })
}

/**
 * 转换为驼峰命名
 * @param str - 待转换的名称。
 * @returns 首字母小写的驼峰名称。
 * @example 模块内部上下文
 * ```ts
 * const name = toCamelCase('order-item') // orderItem
 * ```
 */
export function toCamelCase(str: string): string {
  return str
    .replace(CAMEL_CASE_SEPARATOR_REGEX, (_, c) => c ? c.toUpperCase() : '')
    .replace(LEADING_CHAR_REGEX, c => c.toLowerCase())
}

/**
 * 转换为帕斯卡命名
 * @param str - 待转换的名称。
 * @returns 首字母大写的名称。
 * @example 模块内部上下文
 * ```ts
 * const name = toPascalCase('order-item') // OrderItem
 * ```
 */
export function toPascalCase(str: string): string {
  const camel = toCamelCase(str)
  return camel.charAt(0).toUpperCase() + camel.slice(1)
}

/**
 * 转换为短横线命名
 * @param str - 待转换的名称。
 * @returns 小写连字符名称。
 * @example 模块内部上下文
 * ```ts
 * const name = toKebabCase('orderItem') // order-item
 * ```
 */
export function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
}

/**
 * 转换为下划线命名
 * @param str - 待转换的名称。
 * @returns 小写下划线名称。
 * @example 模块内部上下文
 * ```ts
 * const name = toSnakeCase('orderItem') // order_item
 * ```
 */
export function toSnakeCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase()
}

/**
 * 创建模板上下文
 * @param name - 生成对象名称；用于派生四种大小写形式。
 * @param extra - 附加模板字段；同名字段会覆盖自动生成的名称。
 * @returns 四种名称及附加数据组成的模板对象。
 * @example 模块内部上下文
 * ```ts
 * const context = createTemplateContext('order-item', { projectName: 'shop' })
 * const filename = `${context.kebabCase}.ts`
 * ```
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
 * @param template - 可信 Handlebars 模板文本；不自动转义为目标语言字面量。
 * @param context - 已解析的模板上下文。
 * @returns 不进行 HTML 转义的渲染文本。
 * @example 模块内部上下文
 * ```ts
 * const source = renderTemplate('export interface {{pascalCase}} {}', createTemplateContext('order-item'))
 * ```
 */
export function renderTemplate(template: string, context: TemplateContext): string {
  const compiled = Handlebars.compile(template, { noEscape: true })
  return compiled(context)
}

/**
 * 渲染模板文件
 * @param templatePath - 可信模板文件路径。
 * @param context - 已解析的模板上下文。
 * @returns 读取模板后渲染得到的文本。
 * @example 模块内部上下文
 * ```ts
 * // 使用当前项目中已存在的可信模板文件；读取失败向调用方抛出。
 * const source = await renderTemplateFile(path.join(process.cwd(), 'templates/model.hbs'), createTemplateContext('order-item'))
 * ```
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
 * @param filePath - 已由调用方校验的目标文件路径。
 * @param content - 待渲染、解析或写入的完整文本。
 * @returns 父目录创建及文件写入完成。
 * @example 模块内部上下文
 * ```ts
 * // 覆盖目标文件；调用方负责先验证目标路径与覆盖权限。
 * await writeFile(path.join(process.cwd(), 'src/lib/models/order-item.ts'), 'export interface OrderItem { id: string }\n')
 * ```
 */
export async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.ensureDir(path.dirname(filePath))
  await fs.writeFile(filePath, content, 'utf-8')
}

/**
 * 检查文件是否存在
 * @param filePath - 已由调用方校验的目标文件路径。
 * @returns 可访问时为 true；访问失败时为 false。
 * @example 模块内部上下文
 * ```ts
 * const hasManifest = await fileExists(path.join(process.cwd(), 'package.json'))
 * ```
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
 * @param pkgPath - package.json 文件路径。
 * @returns 读取的版本号；读取或解析失败时为 null。
 * @example 模块内部上下文
 * ```ts
 * const version = await getPackageVersion(path.join(process.cwd(), 'package.json'))
 * if (version === null) writeCliError('Cannot read package version')
 * ```
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
 * @returns CLI 自身版本；在限定父目录中找不到时为 0.0.0。
 * @example 模块内部上下文
 * ```ts
 * const version = getCliVersion() // 从 CLI 自身 package.json 查找，不读取目标应用版本。
 * ```
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
 * @param cwd - 项目所在目录。
 * @returns 优先 pnpm，其次 yarn，否则 npm。
 * @example 模块内部上下文
 * ```ts
 * const manager = await detectPackageManager(process.cwd()) // pnpm-lock 优先于 yarn.lock；均不存在时使用 npm。
 * ```
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
 * @param bytes - 字节数，以 1024 为单位递进。
 * @returns 最多以 GB 表示且保留一位小数的大小。
 * @example 模块内部上下文
 * ```ts
 * const size = formatBytes(1536) // 1.5 KB（1024 进制，保留一位小数）
 * ```
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
 * @param ms - 耗时，单位毫秒。
 * @returns 小于一秒使用 ms，其余使用两位小数秒。
 * @example 模块内部上下文
 * ```ts
 * const elapsed = formatDuration(1250) // 1.25s；小于 1000 使用 ms。
 * ```
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`
  }
  return `${(ms / 1000).toFixed(2)}s`
}

/**
 * 注册 Handlebars helpers
 * @example 模块内部上下文
 * ```ts
 * registerHelpers()
 * const source = renderTemplate('{{upper camelCase}}', createTemplateContext('order-item')) // ORDERITEM
 * ```
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
