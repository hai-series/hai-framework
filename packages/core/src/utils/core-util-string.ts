/**
 * =============================================================================
 * @hai/core - 字符串操作工具
 * =============================================================================
 */

/**
 * 首字母大写。
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
