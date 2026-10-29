/**
 * @h-ai/ui — Toast 状态管理
 *
 * Toast 通知的状态管理，使用 Svelte 5 Runes
 * @module toast.svelte
 */

import type { ToastProps } from './types.js'
import { core } from '@h-ai/core'
import { untrack } from 'svelte'

/**
 * Toast 项
 *
 * @example
 * ```ts
 * import type { ToastItem } from '@h-ai/ui'
 * const example: ToastItem = { id: 'toast-1', message: '保存完成', variant: 'success', duration: 3000 }
 * ```
 */
export interface ToastItem extends ToastProps {
  id: string
}

/** 兼容安全错误消息中的追踪编号，将排查信息从用户说明中分离。 */
function normalizeMessage(message: string, explicitTraceId?: string): Pick<ToastProps, 'message' | 'traceId'> {
  let traceId = explicitTraceId && /^[\w.:-]{1,128}$/.test(explicitTraceId) ? explicitTraceId : undefined
  const parts: string[] = []
  let cursor = 0
  // 先找固定标记，再移除相邻空白；无标记的长空白不会从每个字符重新回溯。
  for (const match of message.matchAll(/\(traceId: ([\w.:-]{1,128})\)/g)) {
    let end = match.index
    while (end > cursor && message[end - 1]!.trim() === '')
      end--
    parts.push(message.slice(cursor, end))
    cursor = match.index + match[0].length
    traceId ??= match[1]
  }
  parts.push(message.slice(cursor))
  const readable = parts.join('').trim()
  return { message: readable || core.i18n.coreM('core_errorInternal'), traceId }
}

/**
 * Toast 状态
 */
class ToastState {
  items = $state<ToastItem[]>([])
  /** 仅队首计时，等待项在展示后才开始计算停留时间。 */
  private timer: ReturnType<typeof setTimeout> | undefined
  private deadline = 0
  private remaining = 0
  private paused = false

  private startTimer(duration = this.items[0]?.duration ?? 0): void {
    const item = this.items[0]
    if (item && (item.duration ?? 0) > 0) {
      this.remaining = duration
      this.deadline = Date.now() + duration
      this.timer = setTimeout(() => this.remove(item.id), duration)
    }
  }

  /**
   * 暂停当前提示的自动关闭，供阅读和交互期间使用；等待项不受影响。
   * @param id - 当前提示 ID。
   * @example
   * ```ts
   * const id = toast.info('同步中')
   * toast.pause(id)
   * toast.resume(id)
   * ```
   */
  pause(id: string): void {
    if (this.items[0]?.id !== id || this.paused)
      return
    this.paused = true
    this.remaining = Math.max(0, this.deadline - Date.now())
    clearTimeout(this.timer)
    this.timer = undefined
  }

  /**
   * 从剩余时间恢复当前提示的自动关闭；手工关闭或清空后不会恢复旧计时器。
   * @param id - 当前提示 ID。
   * @example
   * ```ts
   * const id = toast.info('同步中')
   * toast.pause(id)
   * toast.resume(id)
   * ```
   */
  resume(id: string): void {
    if (this.items[0]?.id !== id || !this.paused)
      return
    this.paused = false
    this.startTimer(this.remaining)
  }

  /**
   * 添加 Toast
   * @param props - 组件的属性对象。
   * @returns 新条目的 ID，可用于提前移除。
   * @example
   * ```ts
   * import { toast } from '@h-ai/ui'
   * // 布局中需挂载 ToastContainer。
   * const id = toast.add({ message: '保存完成', variant: 'success', duration: 3000 })
   * toast.remove(id)
   * ```
   */
  add(props: Omit<ToastProps, 'onclose'>): string {
    const id = Math.random().toString(36).slice(2, 9)
    const item: ToastItem = {
      ...props,
      ...normalizeMessage(props.message, props.traceId),
      id,
      duration: props.duration ?? 3000,
      position: props.position ?? 'bottom-right',
      dismissible: props.dismissible ?? true,
    }

    this.items = [...this.items, item]

    if (this.items.length === 1)
      this.startTimer()

    return id
  }

  /**
   * 移除 Toast
   * @param id - 待移除的条目 ID。
   * @returns {void} 无返回值；同时清理对应的自动关闭定时器。
   * @example
   * ```ts
   * import { toast } from '@h-ai/ui'
   * // 布局中需挂载 ToastContainer。
   * const id = toast.info('同步中', 0)
   * toast.remove(id)
   * ```
   */
  remove(id: string): void {
    const isCurrent = this.items[0]?.id === id
    if (isCurrent) {
      clearTimeout(this.timer)
      this.timer = undefined
      this.paused = false
    }
    this.items = this.items.filter(item => item.id !== id)
    if (isCurrent)
      this.startTimer()
  }

  /**
   * 清空所有 Toast
   * @returns {void} 无返回值；同时清理对应的自动关闭定时器。
   * @example
   * ```ts
   * import { toast } from '@h-ai/ui'
   * // 布局中需挂载 ToastContainer。
   * toast.info('同步中', 0)
   * toast.clear()
   * ```
   */
  clear(): void {
    clearTimeout(this.timer)
    this.timer = undefined
    this.paused = false
    this.items = []
  }

  /**
   * 快捷方法
   * @param message - 已经本地化的用户提示。
   * @param duration - 提示持续时间，单位毫秒。
   * @returns 新条目的 ID，可用于提前移除。
   * @example
   * ```ts
   * import { toast } from '@h-ai/ui'
   * // 布局中需挂载 ToastContainer。
   * const id = toast.success('操作结果', 3000)
   * toast.remove(id)
   * ```
   */
  success(message: string, duration?: number): string {
    return this.add({ message, variant: 'success', duration })
  }

  /**
   * 处理 error 操作。
   * @param message - 已经本地化的用户提示。
   * @param duration - 提示持续时间，单位毫秒。
   * @returns 新条目的 ID，可用于提前移除。
   * @example
   * ```ts
   * import { toast } from '@h-ai/ui'
   * // 布局中需挂载 ToastContainer。
   * const id = toast.error('操作结果', 3000)
   * toast.remove(id)
   * ```
   */
  error(message: string, duration?: number): string {
    return this.add({ message, variant: 'error', duration })
  }

  /**
   * 处理 warning 操作。
   * @param message - 已经本地化的用户提示。
   * @param duration - 提示持续时间，单位毫秒。
   * @returns 新条目的 ID，可用于提前移除。
   * @example
   * ```ts
   * import { toast } from '@h-ai/ui'
   * // 布局中需挂载 ToastContainer。
   * const id = toast.warning('操作结果', 3000)
   * toast.remove(id)
   * ```
   */
  warning(message: string, duration?: number): string {
    return this.add({ message, variant: 'warning', duration })
  }

  /**
   * 处理 info 操作。
   * @param message - 已经本地化的用户提示。
   * @param duration - 提示持续时间，单位毫秒。
   * @returns 新条目的 ID，可用于提前移除。
   * @example
   * ```ts
   * import { toast } from '@h-ai/ui'
   * // 布局中需挂载 ToastContainer。
   * const id = toast.info('操作结果', 3000)
   * toast.remove(id)
   * ```
   */
  info(message: string, duration?: number): string {
    return this.add({ message, variant: 'info', duration })
  }
}

/**
 * Toast 单例
 *
 * @example
 * ```ts
 * import { toast } from '@h-ai/ui'
 * // 页面布局需挂载 ToastContainer。
 * const id = toast.success('保存完成', 3000)
 * toast.remove(id)
 * toast.clear()
 * ```
 */
export const toast = new ToastState()

/**
 * 在组件初始化时订阅操作提示，统一交给根布局的 ToastContainer 展示。
 * 只跟踪消息来源，不订阅 Toast 队列；同一消息已在队列中时合并，避免父子组件重复提示。
 * 字段校验保留控件关联和定位，提示统一由此入口展示；文案应已经完成安全映射和本地化。
 * 订阅随组件销毁结束，已发出的通知继续由根容器管理。
 * @param message - 响应式消息读取函数；空值表示没有待提示的操作结果。
 * @param variant - 通知类型，默认 error。
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { useToastFeedback } from '@h-ai/ui/toast'
 *   let error = $state('')
 *   useToastFeedback(() => error)
 * </script>
 * ```
 */
export function useToastFeedback(message: () => string | undefined | null, variant: NonNullable<ToastProps['variant']> = 'error'): void {
  let ownId: string | undefined
  $effect(() => {
    const value = message()
    untrack(() => {
      if (ownId)
        toast.remove(ownId)
      ownId = undefined
      if (!value)
        return
      const normalized = normalizeMessage(value)
      if (!toast.items.some(item => item.message === normalized.message && item.traceId === normalized.traceId && item.variant === variant))
        ownId = toast.add({ message: value, variant })
    })
  })
}

/** 成功提示默认停留时长（毫秒）。 */
const SUCCESS_DURATION = 3000
/** 失败提示默认停留时长（毫秒），比成功略长便于阅读错误信息。 */
const ERROR_DURATION = 5000

/**
 * 弹出操作成功提示（默认右下角）。
 *
 * @description 统一封装 toast 单例，业务应用无需自建 toast 工具文件即可获得一致的成功反馈。
 *
 * @param message - 用户可见的成功文案（已本地化）。
 * @param duration - 可选停留时长（毫秒），默认 3000。
 * @returns 新通知的 ID，可交给 toast.remove 提前移除。
 *
 * @example
 * ```ts
 * import { notifySuccess, toast } from '@h-ai/ui'
 * const id = notifySuccess('保存完成', 3000)
 * toast.remove(id)
 * ```
 */
export function notifySuccess(message: string, duration: number = SUCCESS_DURATION): string {
  return toast.success(message, duration)
}

/**
 * 弹出操作失败提示（默认右下角）。
 *
 * @description 接受完整错误对象或已本地化的安全字符串；普通 Error 隐藏原文，
 *   使用 fallback 或通用错误并保留 traceId。不要把未知 Error.message 转成字符串传入。
 *
 * @param error - 错误对象或已本地化的错误文案。
 * @param fallback - 未识别的异常或缺少错误文案时使用的安全兜底说明。
 * @param duration - 可选停留时长（毫秒），默认 5000。
 * @returns 新错误通知的 ID，可交给 toast.remove 提前移除。
 *
 * @example
 * ```ts
 * import { notifyError, toast } from '@h-ai/ui'
 * const id = notifyError(new Error('提交失败'), '请稍后重试', 5000)
 * toast.remove(id)
 * ```
 */
export function notifyError(error: unknown, fallback = '', duration: number = ERROR_DURATION): string {
  return toast.error(errorMessage(error, fallback), duration)
}

/**
 * 生成安全错误提示；日志保留脱敏原因，字符串携带追踪编号供 ToastContainer 分离展示。
 * @example
 * ```ts
 * import { errorMessage } from '@h-ai/ui'
 * const text = errorMessage(new Error('Internal detail'), '保存失败')
 * ```
 */
export function errorMessage(error: unknown, fallback = ''): string {
  let known: Parameters<typeof core.error.toPublic>[0] | undefined
  // Promise 回调可用原生 Error 携带 HaiError；保留业务原因和追踪信息，同时防止 cause 环。
  let candidate = error
  const visited: Error[] = []
  while (candidate instanceof Error && !visited.includes(candidate) && visited.length < 8) {
    visited.push(candidate)
    candidate = candidate.cause
  }
  if (candidate && typeof candidate === 'object' && !(candidate instanceof Error) && Object.hasOwn(candidate, 'code') && Object.hasOwn(candidate, 'message') && 'code' in candidate && typeof candidate.code === 'string' && 'message' in candidate && typeof candidate.message === 'string')
    known = candidate as Parameters<typeof core.error.toPublic>[0]
  const receivedMessage = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  const embeddedTraceId = /\(traceId: ([\w.:-]{1,128})\)$/.exec(receivedMessage)?.[1]
  const traceId = known?.traceId ?? embeddedTraceId ?? core.context.get().traceId ?? core.context.get().requestId ?? core.id.uuid()
  core.logger.error('User operation failed', { traceId, error })
  let message = fallback || core.i18n.coreM('core_errorInternal')
  if (known)
    message = core.error.toPublic(known, traceId).message
  else if (typeof error === 'string')
    message = receivedMessage
  return core.error.formatMessage({ message, traceId: /\(traceId: [\w.:-]{1,128}\)$/.test(message) ? undefined : traceId })
}

/**
 * 弹出信息提示（默认右下角）。
 *
 * @param message - 用户可见文案（已本地化）。
 * @param duration - 可选停留时长（毫秒），默认 3000。
 * @returns 新提示的 ID。
 *
 * @example
 * ```ts
 * import { notifyInfo, toast } from '@h-ai/ui'
 * const id = notifyInfo('正在同步', 3000)
 * toast.remove(id)
 * ```
 */
export function notifyInfo(message: string, duration: number = SUCCESS_DURATION): string {
  return toast.info(message, duration)
}

/**
 * 弹出警告提示（默认右下角）。
 *
 * @param message - 用户可见文案（已本地化）。
 * @param duration - 可选停留时长（毫秒），默认 5000。
 * @returns 新警告的 ID。
 *
 * @example
 * ```ts
 * import { notifyWarning, toast } from '@h-ai/ui'
 * const id = notifyWarning('请先保存修改', 5000)
 * toast.remove(id)
 * ```
 */
export function notifyWarning(message: string, duration: number = ERROR_DURATION): string {
  return toast.warning(message, duration)
}
