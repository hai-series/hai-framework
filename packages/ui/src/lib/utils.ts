/**
 * =============================================================================
 * @hai/ui - 样式工具
 * =============================================================================
 * CSS 类名处理工具
 * =============================================================================
 */

import type { Size, Variant } from './types.js'

/**
 * 合并类名
 *
 * @param classes - 类名列表
 * @returns 合并后的类名字符串
 */
export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

/**
 * 变体到 CSS 类名映射
 */
export const variantClasses: Record<Variant, string> = {
  default: 'btn-neutral',
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  success: 'btn-success',
  warning: 'btn-warning',
  error: 'btn-error',
  info: 'btn-info',
}

/**
 * 获取变体类名
 */
export function getVariantClass(variant: Variant, prefix = 'btn'): string {
  const map: Record<Variant, string> = {
    default: `${prefix}-neutral`,
    primary: `${prefix}-primary`,
    secondary: `${prefix}-secondary`,
    success: `${prefix}-success`,
    warning: `${prefix}-warning`,
    error: `${prefix}-error`,
    info: `${prefix}-info`,
  }
  return map[variant] ?? map.default
}

/**
 * 尺寸到 CSS 类名映射
 */
export const sizeClasses: Record<Size, string> = {
  xs: 'btn-xs',
  sm: 'btn-sm',
  md: '',
  lg: 'btn-lg',
  xl: 'btn-xl',
}

/**
 * 获取尺寸类名
 */
export function getSizeClass(size: Size, prefix = 'btn'): string {
  if (size === 'md')
    return ''
  return `${prefix}-${size}`
}

/**
 * 输入框尺寸类名
 */
export function getInputSizeClass(size: Size): string {
  const map: Record<Size, string> = {
    xs: 'input-xs',
    sm: 'input-sm',
    md: '',
    lg: 'input-lg',
    xl: 'input-xl',
  }
  return map[size] ?? ''
}

/**
 * 徽章变体类名
 */
export function getBadgeVariantClass(variant: Variant): string {
  return getVariantClass(variant, 'badge')
}

/**
 * 徽章尺寸类名
 */
export function getBadgeSizeClass(size: Size): string {
  return getSizeClass(size, 'badge')
}

/**
 * 警告框变体类名
 */
export function getAlertVariantClass(variant: Variant): string {
  const map: Record<Variant, string> = {
    default: 'alert',
    primary: 'alert-primary',
    secondary: 'alert-secondary',
    success: 'alert-success',
    warning: 'alert-warning',
    error: 'alert-error',
    info: 'alert-info',
  }
  return map[variant] ?? map.default
}

/**
 * 进度条变体类名
 */
export function getProgressVariantClass(variant: Variant): string {
  return getVariantClass(variant, 'progress')
}

/**
 * 生成唯一 ID
 */
export function generateId(prefix = 'hai'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}
