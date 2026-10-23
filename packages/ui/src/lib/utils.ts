/**
 * @h-ai/ui — 样式工具
 *
 * CSS 类名处理工具
 * @module utils
 */

import type { DataAttributes, Size, Variant } from './types.js'
import { twMerge } from 'tailwind-merge'

/**
 * 合并类名（支持 Tailwind 类冲突消解）
 *
 * @param classes - 类名列表
 * @returns 合并后的类名字符串
 *
 * @example
 * ```ts
 * import { cn } from '@h-ai/ui'
 * const classes = cn('px-2', 'px-4', false, 'font-medium')
 * // classes 为冲突合并后的类名，可直接用于元素 class。
 * ```
 */
export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return twMerge(classes.filter(Boolean).join(' '))
}

/**
 * 实际可转发的 data-* 原子值映射，不包含 null 或 undefined。
 *
 * @example
 * ```ts
 * import type { ForwardedDataAttributes } from '@h-ai/ui'
 * const example: ForwardedDataAttributes = { 'data-testid': 'profile-save' }
 * ```
 */
export type ForwardedDataAttributes = Record<`data-${string}`, string | number | boolean>

/**
 * 从组件未声明 props 中提取 data-* 属性，避免把普通未知属性透传到 DOM。
 * @param props - 组件的属性对象。
 * @returns 只包含安全原子值的 data-* 属性对象。
 *
 * @example
 * ```ts
 * import { getDataAttributes } from '@h-ai/ui'
 * const attributes = getDataAttributes({ 'data-testid': 'save', 'data-loading': false, onclick: 'ignored' })
 * // 仅保留安全类型的 data-* 字段。
 * ```
 */
export function getDataAttributes(props: DataAttributes | Record<string, unknown>): ForwardedDataAttributes {
  const dataAttributes: ForwardedDataAttributes = {}

  for (const [key, value] of Object.entries(props)) {
    if (!key.startsWith('data-') || value === null || value === undefined) {
      continue
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      dataAttributes[key as `data-${string}`] = value
    }
  }

  return dataAttributes
}

/**
 * 已知前缀的变体类名静态映射
 *
 * 使用静态字符串而非模板字符串拼接，确保 TailwindCSS 可静态扫描到所有类名。
 */
const VARIANT_MAPS: Record<string, Record<Variant, string>> = {
  btn: {
    default: '',
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
 * @param variant - 语义变体。
 * @param prefix - 类名前缀或界面 ID 前缀。
 * @returns 对应前缀和变体的 DaisyUI 类名；未知前缀按约定拼接。
 *
 * @example
 * ```ts
 * import { getVariantClass } from '@h-ai/ui'
 * const classes = getVariantClass('primary', 'btn')
 * ```
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
 * @param size - 组件尺寸预设。
 * @param prefix - 类名前缀或界面 ID 前缀。
 * @returns 对应尺寸的类名，中号尺寸使用空字符串。
 *
 * @example
 * ```ts
 * import { getSizeClass } from '@h-ai/ui'
 * const classes = getSizeClass('lg', 'btn')
 * ```
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
 * @param size - 组件尺寸预设。
 * @returns 输入框尺寸类名；大于 xl 的预设统一使用 input-xl。
 *
 * @example
 * ```ts
 * import { getInputSizeClass } from '@h-ai/ui'
 * const classes = getInputSizeClass('sm')
 * ```
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
 * @param variant - 语义变体。
 * @returns 徽章语义变体类名。
 *
 * @example
 * ```ts
 * import { getBadgeVariantClass } from '@h-ai/ui'
 * const classes = getBadgeVariantClass('success')
 * ```
 */
export function getBadgeVariantClass(variant: Variant): string {
  return getVariantClass(variant, 'badge')
}

/**
 * 徽章尺寸类名
 * @param size - 组件尺寸预设。
 * @returns 徽章尺寸类名。
 *
 * @example
 * ```ts
 * import { getBadgeSizeClass } from '@h-ai/ui'
 * const classes = getBadgeSizeClass('sm')
 * ```
 */
export function getBadgeSizeClass(size: Size): string {
  return getSizeClass(size, 'badge')
}

/**
 * 警告框变体类名
 * @param variant - 语义变体。
 * @returns 警告框语义变体类名。
 *
 * @example
 * ```ts
 * import { getAlertVariantClass } from '@h-ai/ui'
 * const classes = getAlertVariantClass('warning')
 * ```
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
 * @param variant - 语义变体。
 * @returns 进度条语义变体类名。
 *
 * @example
 * ```ts
 * import { getProgressVariantClass } from '@h-ai/ui'
 * const classes = getProgressVariantClass('success')
 * ```
 */
export function getProgressVariantClass(variant: Variant): string {
  return getVariantClass(variant, 'progress')
}

/**
 * 生成唯一 ID
 * @param prefix - 类名前缀或界面 ID 前缀。
 * @returns 用于界面节点关联的随机 ID，不具备安全令牌或分布式主键保证。
 *
 * @example
 * ```ts
 * import { generateId } from '@h-ai/ui'
 * const inputId = generateId('profile-email')
 * // 仅用于界面节点关联，不用作安全令牌或分布式业务主键。
 * ```
 */
export function generateId(prefix = 'hai'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Portal action：将节点移动到目标容器（默认 document.body）下渲染。
 *
 * 用于弹出层（下拉、气泡等）逃逸祖先的 `overflow: hidden` 裁剪与
 * 堆叠上下文（stacking context）限制，避免被相邻控件遮挡。
 *
 * @param node - 要移动的节点
 * @param target - 目标容器或选择器；默认 body
 * @returns 包含 update 和 destroy 的 Svelte action 句柄。
 *
 * @example
 * ```ts
 * import { portal } from '@h-ai/ui'
 * const popup = document.createElement('div')
 * const action = portal(popup, document.body)
 * action.update(document.body)
 * action.destroy()
 * ```
 */
export function portal(node: HTMLElement, target: HTMLElement | string = 'body') {
  function mount(to: HTMLElement | string) {
    const targetEl = typeof to === 'string' ? document.querySelector<HTMLElement>(to) : to
    targetEl?.appendChild(node)
  }
  mount(target)
  return {
    update(next: HTMLElement | string) {
      mount(next)
    },
    destroy() {
      node.parentNode?.removeChild(node)
    },
  }
}
