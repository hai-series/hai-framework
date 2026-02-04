/**
 * =============================================================================
 * @hai/core - 字符串操作工具
 * =============================================================================
 */

/**
 * 首字母大写
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/**
 * 转换为 kebab-case
 */
function kebabCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
}

/**
 * 转换为 camelCase
 */
function camelCase(str: string): string {
  return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
}

/**
 * 截断字符串
 */
function truncate(str: string, length: number, suffix = '...'): string {
  return str.length > length ? str.slice(0, length) + suffix : str
}

/**
 * 转换为 snake_case
 */
function snakeCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()
}

/**
 * 转换为 PascalCase
 */
function pascalCase(str: string): string {
  return str
    .replace(/[-_]([a-z])/g, (_, c) => c.toUpperCase())
    .replace(/^[a-z]/, c => c.toUpperCase())
}

/**
 * 移除字符串两端的空白
 */
function trim(str: string): string {
  return str.trim()
}

/**
 * 检查字符串是否为空或只包含空白
 */
function isBlank(str: string): boolean {
  return str.trim().length === 0
}

/**
 * 检查字符串是否不为空
 */
function isNotBlank(str: string): boolean {
  return str.trim().length > 0
}

/**
 * 填充字符串到指定长度（左侧）
 */
function padStart(str: string, length: number, char = ' '): string {
  return str.padStart(length, char)
}

/**
 * 填充字符串到指定长度（右侧）
 */
function padEnd(str: string, length: number, char = ' '): string {
  return str.padEnd(length, char)
}

/**
 * 字符串操作工具对象
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
