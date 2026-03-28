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
 * @remarks 支持连续大写字母拆分（如 `getHTTPSUrl` → `get-https-url`）。
 *
 * @example
 * ```ts
 * string.kebabCase('helloWorld') // 'hello-world'
 * string.kebabCase('getHTTPSUrl') // 'get-https-url'
 * ```
 */
function kebabCase(str: string): string {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
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
 * @param length - 最大长度（小于等于 0 时返回原字符串）
 * @param suffix - 超出长度时的后缀
 * @returns 截断后的字符串
 *
 * @example
 * ```ts
 * string.truncate('hello world', 5) // 'hello...'
 * ```
 */
function truncate(str: string, length: number, suffix = '...'): string {
  if (length <= 0)
    return str
  return str.length > length ? str.slice(0, length) + suffix : str
}

/**
 * 转换为 snake_case。
 * @param str - 输入字符串
 * @returns snake_case 字符串
 * @remarks 支持连续大写字母拆分（如 `getHTTPSUrl` → `get_https_url`）。
 *
 * @example
 * ```ts
 * string.snakeCase('helloWorld') // 'hello_world'
 * string.snakeCase('getHTTPSUrl') // 'get_https_url'
 * ```
 */
function snakeCase(str: string): string {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toLowerCase()
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
 * 常量时间字符串比较。
 *
 * 防止时序侧信道攻击：无论输入差异位置如何，执行时间恒定。
 * 兼容 Node.js 与浏览器环境（纯 JS 实现，无平台依赖）。
 *
 * @param a - 字符串 a
 * @param b - 字符串 b
 * @returns 是否相等
 *
 * @example
 * ```ts
 * string.constantTimeEqual('abc', 'abc') // true
 * string.constantTimeEqual('abc', 'abd') // false
 * ```
 */
function constantTimeEqual(a: string, b: string): boolean {
  // 长度不同时仍遍历较长字符串，避免泄漏长度信息
  const len = Math.max(a.length, b.length)
  let result = a.length ^ b.length
  for (let i = 0; i < len; i++) {
    result |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  }
  return result === 0
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
  constantTimeEqual,
}

/** string 子工具类型 */
export type StringFn = typeof string
