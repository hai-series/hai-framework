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
 *
 * @example
 * ```ts
 * import type { MessageItem } from '@h-ai/ui'
 * const example: MessageItem = { id: 'message-1', message: '保存完成', type: 'success', duration: 3000, closable: true }
 * ```
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
   * @param options - 本次操作的行为与显示选项。
   * @returns 新条目的 ID，可用于提前移除。
   * @example
   * ```ts
   * import { message } from '@h-ai/ui'
   * // 布局中需挂载 MessageContainer。
   * const id = message.add({ message: '保存完成', type: 'success', duration: 3000 })
   * message.remove(id)
   * ```
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
   * @param id - 待移除的条目 ID。
   * @returns 无返回值；同时清理对应的自动关闭定时器。
   * @example
   * ```ts
   * import { message } from '@h-ai/ui'
   * // 布局中需挂载 MessageContainer。
   * const id = message.info('同步中', 0)
   * message.remove(id)
   * ```
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
   * @returns 无返回值；同时清理对应的自动关闭定时器。
   * @example
   * ```ts
   * import { message } from '@h-ai/ui'
   * // 布局中需挂载 MessageContainer。
   * message.info('同步中', 0)
   * message.clear()
   * ```
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
   * @param message - 已经本地化的用户提示。
   * @param duration - 提示持续时间，单位毫秒。
   * @returns 新条目的 ID，可用于提前移除。
   * @example
   * ```ts
   * import { message } from '@h-ai/ui'
   * // 布局中需挂载 MessageContainer。
   * const id = message.info('操作结果', 3000)
   * message.remove(id)
   * ```
   */
  info(message: string, duration?: number): string {
    return this.add({ message, type: 'info', duration })
  }

  /**
   * 处理 success 操作。
   * @param message - 已经本地化的用户提示。
   * @param duration - 提示持续时间，单位毫秒。
   * @returns 新条目的 ID，可用于提前移除。
   * @example
   * ```ts
   * import { message } from '@h-ai/ui'
   * // 布局中需挂载 MessageContainer。
   * const id = message.success('操作结果', 3000)
   * message.remove(id)
   * ```
   */
  success(message: string, duration?: number): string {
    return this.add({ message, type: 'success', duration })
  }

  /**
   * 处理 warning 操作。
   * @param message - 已经本地化的用户提示。
   * @param duration - 提示持续时间，单位毫秒。
   * @returns 新条目的 ID，可用于提前移除。
   * @example
   * ```ts
   * import { message } from '@h-ai/ui'
   * // 布局中需挂载 MessageContainer。
   * const id = message.warning('操作结果', 3000)
   * message.remove(id)
   * ```
   */
  warning(message: string, duration?: number): string {
    return this.add({ message, type: 'warning', duration })
  }

  /**
   * 处理 error 操作。
   * @param message - 已经本地化的用户提示。
   * @param duration - 提示持续时间，单位毫秒。
   * @returns 新条目的 ID，可用于提前移除。
   * @example
   * ```ts
   * import { message } from '@h-ai/ui'
   * // 布局中需挂载 MessageContainer。
   * const id = message.error('操作结果', 3000)
   * message.remove(id)
   * ```
   */
  error(message: string, duration?: number): string {
    return this.add({ message, type: 'error', duration })
  }
}

/**
 * Message 单例
 *
 * @example
 * ```ts
 * import { message } from '@h-ai/ui'
 * // 页面布局需挂载 MessageContainer。
 * const id = message.success('保存完成', 3000)
 * message.remove(id)
 * message.clear()
 * ```
 */
export const message = new MessageState()
