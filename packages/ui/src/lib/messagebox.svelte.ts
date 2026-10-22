/**
 * @h-ai/ui — MessageBox 状态管理
 *
 * 命令式弹框 API，类似 ElementUI MessageBox。
 * 调用 `messageBox.confirm(...)` 或 `messageBox.alert(...)` 返回 Promise<boolean>，
 * 组件内部通过渲染 MessageBoxContainer 消费状态。
 * @module messagebox.svelte
 */

import type { MessageBoxIconType, MessageBoxOptions } from './types.js'
import { uiM } from './messages.js'

/**
 * 内部弹框条目
 *
 * @example
 * ```ts
 * import type { MessageBoxItem } from '@h-ai/ui'
 * const example: MessageBoxItem = { id: 'confirm-1', title: '删除', message: '确认删除？', type: 'confirm', iconType: 'warning', confirmText: '删除', cancelText: '取消', confirmVariant: 'warning', showCancel: true, closeOnClickModal: false, showClose: true, loading: false, resolve: accepted => document.body.setAttribute('data-confirmed', String(accepted)) }
 * ```
 */
export interface MessageBoxItem {
  id: string
  title: string
  message: string
  type: 'confirm' | 'alert'
  iconType: MessageBoxIconType
  confirmText: string
  cancelText: string
  confirmVariant: 'default' | 'primary' | 'warning' | 'error'
  showCancel: boolean
  closeOnClickModal: boolean
  showClose: boolean
  loading: boolean
  /** 外部 resolve 回调 */
  resolve: (value: boolean) => void
  /** 可选的 beforeClose 钩子 */
  beforeClose?: MessageBoxOptions['beforeClose']
}

/**
 * MessageBox 状态
 */
class MessageBoxState {
  items = $state<MessageBoxItem[]>([])

  private createItem(options: MessageBoxOptions): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const id = Math.random().toString(36).slice(2, 9)
      const isAlert = options.type === 'alert'

      const item: MessageBoxItem = {
        id,
        title: options.title ?? uiM('messagebox_title'),
        message: options.message,
        type: options.type ?? 'confirm',
        iconType: options.iconType ?? (isAlert ? 'info' : 'warning'),
        confirmText: options.confirmText ?? '',
        cancelText: options.cancelText ?? '',
        confirmVariant: options.confirmVariant ?? 'primary',
        showCancel: options.showCancel ?? !isAlert,
        closeOnClickModal: options.closeOnClickModal ?? true,
        showClose: options.showClose ?? true,
        loading: false,
        resolve,
        beforeClose: options.beforeClose,
      }

      this.items = [...this.items, item]
    })
  }

  /**
   * 确认弹框（双按钮，返回 Promise<boolean>）
   * @param options - 本次操作的行为与显示选项。
   * @returns 弹框交互的 Promise；确认与取消均须由宿主处理。
   * @example
   * ```ts
   * import { messageBox, message } from '@h-ai/ui'
   * // 布局中需挂载 MessageBoxContainer。
   * const accepted = await messageBox.confirm({ title: '确认', message: '提交资料？', closeOnClickModal: false })
   * if (accepted) message.success('已确认')
   * ```
   */
  confirm(options: MessageBoxOptions | string): Promise<boolean> {
    const opts = typeof options === 'string' ? { message: options } : options
    return this.createItem({ type: 'confirm', ...opts })
  }

  /**
   * 提示弹框（单按钮，返回 Promise<boolean>）
   * @param options - 本次操作的行为与显示选项。
   * @returns 弹框交互的 Promise；确认与取消均须由宿主处理。
   * @example
   * ```ts
   * import { messageBox } from '@h-ai/ui'
   * // 布局中需挂载 MessageBoxContainer。
   * const acknowledged = await messageBox.alert({ title: '提示', message: '资料已保存' })
   * ```
   */
  alert(options: MessageBoxOptions | string): Promise<boolean> {
    const opts = typeof options === 'string' ? { message: options } : options
    return this.createItem({ type: 'alert', showCancel: false, ...opts })
  }

  /**
   * 内部方法：处理确认
   * @param item - 当前弹框队列中的条目。
   * @returns 弹框交互的 Promise；确认与取消均须由宿主处理。
   * @example
   * ```ts
   * import { messageBox } from '@h-ai/ui'
   * // 布局中需挂载 MessageBoxContainer。
   * const response = messageBox.confirm({ message: '提交资料？' })
   * const item = messageBox.items[0]
   * if (!item) throw new Error('Dialog unavailable')
   * await messageBox.handleConfirm(item)
   * const accepted = await response
   * ```
   */
  async handleConfirm(item: MessageBoxItem): Promise<void> {
    if (item.beforeClose) {
      const canClose = await item.beforeClose('confirm', {
        setLoading: (loading: boolean) => {
          item.loading = loading
        },
      })
      if (canClose === false) {
        return
      }
    }
    this.remove(item.id)
    item.resolve(true)
  }

  /**
   * 内部方法：处理取消
   * @param item - 当前弹框队列中的条目。
   * @returns 弹框交互的 Promise；确认与取消均须由宿主处理。
   * @example
   * ```ts
   * import { messageBox } from '@h-ai/ui'
   * // 布局中需挂载 MessageBoxContainer。
   * const response = messageBox.confirm({ message: '提交资料？' })
   * const item = messageBox.items[0]
   * if (!item) throw new Error('Dialog unavailable')
   * await messageBox.handleCancel(item)
   * const accepted = await response
   * ```
   */
  async handleCancel(item: MessageBoxItem): Promise<void> {
    if (item.beforeClose) {
      const canClose = await item.beforeClose('cancel', {
        setLoading: (loading: boolean) => {
          item.loading = loading
        },
      })
      if (canClose === false) {
        return
      }
    }
    this.remove(item.id)
    item.resolve(false)
  }

  /**
   * 内部方法：处理关闭（点击关闭按钮或遮罩）
   * @param item - 当前弹框队列中的条目。
   * @returns 弹框交互的 Promise；确认与取消均须由宿主处理。
   * @example
   * ```ts
   * import { messageBox } from '@h-ai/ui'
   * // 布局中需挂载 MessageBoxContainer。
   * const response = messageBox.confirm({ message: '提交资料？' })
   * const item = messageBox.items[0]
   * if (!item) throw new Error('Dialog unavailable')
   * await messageBox.handleClose(item)
   * const accepted = await response
   * ```
   */
  async handleClose(item: MessageBoxItem): Promise<void> {
    if (item.beforeClose) {
      const canClose = await item.beforeClose('close', {
        setLoading: (loading: boolean) => {
          item.loading = loading
        },
      })
      if (canClose === false) {
        return
      }
    }
    this.remove(item.id)
    item.resolve(false)
  }

  private remove(id: string): void {
    this.items = this.items.filter(i => i.id !== id)
  }
}

/**
 * MessageBox 单例
 *
 * @example
 * ```ts
 * import { messageBox, message } from '@h-ai/ui'
 * // 页面布局需挂载 MessageBoxContainer。
 * const accepted = await messageBox.confirm({ title: '确认', message: '提交这份资料？', closeOnClickModal: false })
 * if (accepted) message.success('已确认')
 * ```
 */
export const messageBox = new MessageBoxState()
