/**
 * @h-ai/ui — Toast 状态管理
 *
 * Toast 通知的状态管理，使用 Svelte 5 Runes
 * @module toast.svelte
 */

import type { ToastProps } from './types.js'

/**
 * Toast 项
 */
export interface ToastItem extends ToastProps {
  id: string
}

/**
 * Toast 状态
 */
class ToastState {
  items = $state<ToastItem[]>([])
  /** 自动关闭定时器 */
  private timers = new Map<string, ReturnType<typeof setTimeout>>()

  /**
   * 添加 Toast
   */
  add(props: Omit<ToastProps, 'onclose'>): string {
    const id = Math.random().toString(36).slice(2, 9)
    const item: ToastItem = {
      ...props,
      id,
      duration: props.duration ?? 3000,
      position: props.position ?? 'top-right',
      dismissible: props.dismissible ?? true,
    }

    this.items = [...this.items, item]

    // 自动关闭
    if ((item.duration ?? 0) > 0) {
      const timer = setTimeout(() => {
        this.timers.delete(id)
        this.remove(id)
      }, item.duration)
      this.timers.set(id, timer)
    }

    return id
  }

  /**
   * 移除 Toast
   */
  remove(id: string): void {
    const timer = this.timers.get(id)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(id)
    }
    this.items = this.items.filter(item => item.id !== id)
  }

  /**
   * 清空所有 Toast
   */
  clear(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer)
    }
    this.timers.clear()
    this.items = []
  }

  /**
   * 快捷方法
   */
  success(message: string, duration?: number): string {
    return this.add({ message, variant: 'success', duration })
  }

  error(message: string, duration?: number): string {
    return this.add({ message, variant: 'error', duration })
  }

  warning(message: string, duration?: number): string {
    return this.add({ message, variant: 'warning', duration })
  }

  info(message: string, duration?: number): string {
    return this.add({ message, variant: 'info', duration })
  }
}

/**
 * Toast 单例
 */
export const toast = new ToastState()

/** 成功提示默认停留时长（毫秒）。 */
const SUCCESS_DURATION = 3000
/** 失败提示默认停留时长（毫秒），比成功略长便于阅读错误信息。 */
const ERROR_DURATION = 5000

/**
 * 弹出操作成功提示（右上角）。
 *
 * @description 统一封装 toast 单例，业务应用无需自建 toast 工具文件即可获得一致的成功反馈。
 *
 * @param message - 用户可见的成功文案（已本地化）。
 * @param duration - 可选停留时长（毫秒），默认 3000。
 *
 * @example
 * notifySuccess(m.submit_submitted())
 */
export function notifySuccess(message: string, duration: number = SUCCESS_DURATION): string {
  return toast.success(message, duration)
}

/**
 * 弹出操作失败提示（右上角）。
 *
 * @description 接受 `Error` 或字符串；`Error` 取其 message，其余回退到 fallback，
 *   避免各业务页面重复实现错误文案兜底逻辑。
 *
 * @param error - 错误对象或已本地化的错误文案。
 * @param fallback - 当 error 非 Error 且为空时使用的兜底文案。
 * @param duration - 可选停留时长（毫秒），默认 5000。
 *
 * @example
 * notifyError(error, m.submit_failed())
 */
export function notifyError(error: unknown, fallback = '', duration: number = ERROR_DURATION): string {
  const message = error instanceof Error
    ? error.message
    : (typeof error === 'string' ? error : fallback)
  return toast.error(message || fallback, duration)
}

/**
 * 弹出信息提示（右上角）。
 *
 * @param message - 用户可见文案（已本地化）。
 * @param duration - 可选停留时长（毫秒），默认 3000。
 *
 * @example
 * notifyInfo(m.common_saved())
 */
export function notifyInfo(message: string, duration: number = SUCCESS_DURATION): string {
  return toast.info(message, duration)
}

/**
 * 弹出警告提示（右上角）。
 *
 * @param message - 用户可见文案（已本地化）。
 * @param duration - 可选停留时长（毫秒），默认 5000。
 *
 * @example
 * notifyWarning(m.quota_almost_reached())
 */
export function notifyWarning(message: string, duration: number = ERROR_DURATION): string {
  return toast.warning(message, duration)
}
