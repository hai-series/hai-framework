/**
 * @h-ai/core — 字符串操作工具
 * @module core-util-string
 */

/**
 * 首字母大写。
 * @param str - 输入字符串
 * @returns 首字母大写后的字符串
 * @remarks 空字符串返回空字符串。
 *
 * @example
 * ```ts
 * string.capitalize('hello') // 'Hello'
 * ```
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/**
 * 转换为 kebab-case。
 * @param str - 输入字符串
 * @returns kebab-case 字符串
 * @remarks 仅处理驼峰到短横线的转换。
 *
 * @example
 * ```ts
 * string.kebabCase('helloWorld') // 'hello-world'
 * ```
 */
function kebabCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
}

/**
 * 转换为 camelCase。
 * @param str - 输入字符串
 * @returns camelCase 字符串
 * @remarks 仅处理包含 '-' 的字符串。
 *
 * @example
 * ```ts
 * string.camelCase('hello-world') // 'helloWorld'
 * ```
 */
function camelCase(str: string): string {
  return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
}

/**
 * 截断字符串。
 * @param str - 输入字符串
 * @param length - 最大长度
 * @param suffix - 超出长度时的后缀
 * @returns 截断后的字符串
 * @remarks length 小于 0 时返回原字符串。
 *
 * @example
 * ```ts
 * string.truncate('hello world', 5) // 'hello...'
 * ```
 */
function truncate(str: string, length: number, suffix = '...'): string {
  return str.length > length ? str.slice(0, length) + suffix : str
}

/**
 * 转换为 snake_case。
 * @param str - 输入字符串
 * @returns snake_case 字符串
 * @remarks 仅处理驼峰到下划线的转换。
 *
 * @example
 * ```ts
 * string.snakeCase('helloWorld') // 'hello_world'
 * ```
 */
function snakeCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()
}

/**
 * 转换为 PascalCase。
 * @param str - 输入字符串
 * @returns PascalCase 字符串
 * @remarks 支持 '-' 与 '_' 分隔。
 *
 * @example
 * ```ts
 * string.pascalCase('hello-world') // 'HelloWorld'
 * ```
 */
function pascalCase(str: string): string {
  return str
    .replace(/[-_]([a-z])/g, (_, c) => c.toUpperCase())
    .replace(/^[a-z]/, c => c.toUpperCase())
}

/**
 * 移除字符串两端的空白。
 * @param str - 输入字符串
 * @returns 去除两端空白后的字符串
 *
 * @example
 * ```ts
 * string.trim('  hi  ') // 'hi'
 * ```
 */
function trim(str: string): string {
  return str.trim()
}

/**
 * 检查字符串是否为空或只包含空白。
 * @param str - 输入字符串
 * @returns 是否为空或全空白
 *
 * @example
 * ```ts
 * string.isBlank('   ') // true
 * ```
 */
function isBlank(str: string): boolean {
  return str.trim().length === 0
}

/**
 * 检查字符串是否不为空。
 * @param str - 输入字符串
 * @returns 是否非空
 *
 * @example
 * ```ts
 * string.isNotBlank('ok') // true
 * ```
 */
function isNotBlank(str: string): boolean {
  return str.trim().length > 0
}

/**
 * 填充字符串到指定长度（左侧）。
 * @param str - 输入字符串
 * @param length - 目标长度
 * @param char - 填充字符
 * @returns 填充后的字符串
 *
 * @example
 * ```ts
 * string.padStart('1', 3, '0') // '001'
 * ```
 */
function padStart(str: string, length: number, char = ' '): string {
  return str.padStart(length, char)
}

/**
 * 填充字符串到指定长度（右侧）。
 * @param str - 输入字符串
 * @param length - 目标长度
 * @param char - 填充字符
 * @returns 填充后的字符串
 *
 * @example
 * ```ts
 * string.padEnd('1', 3, '0') // '100'
 * ```
 */
function padEnd(str: string, length: number, char = ' '): string {
  return str.padEnd(length, char)
}

/**
 * 字符串操作工具对象。
 *
 * @example
 * ```ts
 * string.capitalize('hello')
 * ```
 */
export const string = {
  capitalize,
  kebabCase,
  camelCase,
  truncate,
  snakeCase,
  pascalCase,
  trim,
  isBlank,
  isNotBlank,
  padStart,
  padEnd,
}
