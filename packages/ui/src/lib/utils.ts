/**
 * @h-ai/ui — 样式工具
 *
 * CSS 类名处理工具
 * @module utils
 */

import type { Size, Variant } from './types.js'
import { twMerge } from 'tailwind-merge'

/**
 * 合并类名（支持 Tailwind 类冲突消解）
 *
 * @param classes - 类名列表
 * @returns 合并后的类名字符串
 */
export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return twMerge(classes.filter(Boolean).join(' '))
}

/**
 * 已知前缀的变体类名静态映射
 *
 * 使用静态字符串而非模板字符串拼接，确保 TailwindCSS 可静态扫描到所有类名。
 */
const VARIANT_MAPS: Record<string, Record<Variant, string>> = {
  btn: {
    default: 'btn-neutral',
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    success: 'btn-success',
    warning: 'btn-warning',
    error: 'btn-error',
    info: 'btn-info',
    ghost: 'btn-ghost',
    link: 'btn-link',
    outline: 'btn-outline',
  },
  badge: {
    default: 'badge-neutral',
    primary: 'badge-primary',
    secondary: 'badge-secondary',
    success: 'badge-success',
    warning: 'badge-warning',
    error: 'badge-error',
    info: 'badge-info',
    ghost: 'badge-ghost',
    link: 'badge-link',
    outline: 'badge-outline',
  },
  progress: {
    default: 'progress-neutral',
    primary: 'progress-primary',
    secondary: 'progress-secondary',
    success: 'progress-success',
    warning: 'progress-warning',
    error: 'progress-error',
    info: 'progress-info',
    ghost: 'progress-ghost',
    link: 'progress-link',
    outline: 'progress-outline',
  },
}

/**
 * 已知前缀的尺寸类名静态映射
 */
const SIZE_MAPS: Record<string, Record<Size, string>> = {
  btn: {
    'xs': 'btn-xs',
    'sm': 'btn-sm',
    'md': '',
    'lg': 'btn-lg',
    'xl': 'btn-xl',
    '2xl': 'btn-xl',
    '3xl': 'btn-xl',
    '4xl': 'btn-xl',
  },
  badge: {
    'xs': 'badge-xs',
    'sm': 'badge-sm',
    'md': '',
    'lg': 'badge-lg',
    'xl': 'badge-xl',
    '2xl': 'badge-xl',
    '3xl': 'badge-xl',
    '4xl': 'badge-xl',
  },
}

/**
 * 获取变体类名
 */
export function getVariantClass(variant: Variant, prefix = 'btn'): string {
  const map = VARIANT_MAPS[prefix]
  if (map)
    return map[variant] ?? map.default
  // 未预置的前缀回退为动态拼接（调用方需自行确保 Tailwind 可扫描）
  return `${prefix}-${variant === 'default' ? 'neutral' : variant}`
}

/**
 * 获取尺寸类名
 */
export function getSizeClass(size: Size, prefix = 'btn'): string {
  if (size === 'md')
    return ''
  const map = SIZE_MAPS[prefix]
  if (map)
    return map[size] ?? ''
  return `${prefix}-${size}`
}

/**
 * 输入框尺寸类名
 */
export function getInputSizeClass(size: Size): string {
  const map: Record<Size, string> = {
    'xs': 'input-xs',
    'sm': 'input-sm',
    'md': '',
    'lg': 'input-lg',
    'xl': 'input-xl',
    '2xl': 'input-xl',
    '3xl': 'input-xl',
    '4xl': 'input-xl',
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
    ghost: 'alert',
    link: 'alert',
    outline: 'alert',
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
