/**
 * @h-ai/ui — Message 状态管理
 *
 * 命令式消息入口，复用 Toast 的显示风格、队列和生命周期。
 * @module message.svelte
 */

import type { MessageOptions } from './types.js'
import { toast } from './toast.svelte.js'

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
  /** 当前统一通知队列的消息视图。 */
  get items(): MessageItem[] {
    return toast.items.map(item => ({
      id: item.id,
      message: item.message,
      type: item.variant === 'success' || item.variant === 'warning' || item.variant === 'error' ? item.variant : 'info',
      duration: item.duration ?? 3000,
      closable: item.dismissible ?? true,
    }))
  }

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
    return toast.add({
      message: opts.message,
      variant: opts.type ?? 'info',
      duration: opts.duration ?? 3000,
      dismissible: opts.closable ?? true,
    })
  }

  /**
   * 移除消息
   * @param id - 待移除的条目 ID。
   * @returns {void} 无返回值；同时清理对应的自动关闭定时器。
   * @example
   * ```ts
   * import { message } from '@h-ai/ui'
   * // 布局中需挂载 MessageContainer。
   * const id = message.info('同步中', 0)
   * message.remove(id)
   * ```
   */
  remove(id: string): void {
    toast.remove(id)
  }

  /**
   * 清空所有消息
   * @returns {void} 无返回值；同时清理对应的自动关闭定时器。
   * @example
   * ```ts
   * import { message } from '@h-ai/ui'
   * // 布局中需挂载 MessageContainer。
   * message.info('同步中', 0)
   * message.clear()
   * ```
   */
  clear(): void {
    toast.clear()
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
