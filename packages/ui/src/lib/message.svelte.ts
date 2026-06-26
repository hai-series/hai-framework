/**
 * @h-ai/ui — Message 状态管理
 *
 * 命令式轻量消息提示 API，类似 ElementUI Message。
 * 与 Toast 类似但视觉风格不同：顶部居中滑入、带类型图标、可自动关闭。
 * @module message.svelte
 */

import type { MessageOptions } from './types.js'

/**
 * 内部消息条目
 */
export interface MessageItem {
  id: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
  duration: number
  closable: boolean
}

/**
 * Message 状态
 */
class MessageState {
  items = $state<MessageItem[]>([])
  private timers = new Map<string, ReturnType<typeof setTimeout>>()

  /**
   * 添加消息
   */
  add(options: MessageOptions | string): string {
    const opts = typeof options === 'string' ? { message: options } : options
    const id = Math.random().toString(36).slice(2, 9)
    const item: MessageItem = {
      id,
      message: opts.message,
      type: opts.type ?? 'info',
      duration: opts.duration ?? 3000,
      closable: opts.closable ?? false,
    }

    this.items = [...this.items, item]

    if (item.duration > 0) {
      const timer = setTimeout(() => {
        this.timers.delete(id)
        this.remove(id)
      }, item.duration)
      this.timers.set(id, timer)
    }

    return id
  }

  /**
   * 移除消息
   */
  remove(id: string): void {
    const timer = this.timers.get(id)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(id)
    }
    this.items = this.items.filter(i => i.id !== id)
  }

  /**
   * 清空所有消息
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
  info(message: string, duration?: number): string {
    return this.add({ message, type: 'info', duration })
  }

  success(message: string, duration?: number): string {
    return this.add({ message, type: 'success', duration })
  }

  warning(message: string, duration?: number): string {
    return this.add({ message, type: 'warning', duration })
  }

  error(message: string, duration?: number): string {
    return this.add({ message, type: 'error', duration })
  }
}

/**
 * Message 单例
 */
export const message = new MessageState()
