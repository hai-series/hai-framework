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
   *
   * @example
   * ```ts
   * const ok = await messageBox.confirm({
   *   title: '提示',
   *   message: '确定要删除吗？',
   *   confirmText: '确定',
   *   cancelText: '取消',
   * })
   * if (ok) { ... }
   * ```
   */
  confirm(options: MessageBoxOptions | string): Promise<boolean> {
    const opts = typeof options === 'string' ? { message: options } : options
    return this.createItem({ type: 'confirm', ...opts })
  }

  /**
   * 提示弹框（单按钮，返回 Promise<boolean>）
   *
   * @example
   * ```ts
   * await messageBox.alert({
   *   title: '提示',
   *   message: '操作成功',
   * })
   * ```
   */
  alert(options: MessageBoxOptions | string): Promise<boolean> {
    const opts = typeof options === 'string' ? { message: options } : options
    return this.createItem({ type: 'alert', showCancel: false, ...opts })
  }

  /**
   * 内部方法：处理确认
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
 */
export const messageBox = new MessageBoxState()
