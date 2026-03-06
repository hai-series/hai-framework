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
