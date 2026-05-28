/**
 * @h-ai/core — 配置管理（浏览器占位实现）
 *
 * 浏览器环境没有文件系统，不能加载 / 监听 YAML 配置文件。
 * 该实现保持 `core.config` API 形态与 Node.js 一致，但所有文件相关操作
 * 都返回明确的 SERVICE_UNAVAILABLE，避免运行时出现 `core.config` 为 undefined。
 * @module core-function-config.browser
 */

import type { ZodType } from 'zod'
import type { HaiError, HaiResult } from '../core-types.js'
import type { ConfigFn, WatchCallback } from './core-function-config.node.js'
import { err, HaiCommonError } from '../core-types.js'
import { i18n } from '../i18n/core-i18n-utils.js'

function unsupported<T>(): HaiResult<T> {
  return err(
    HaiCommonError.SERVICE_UNAVAILABLE,
    i18n.coreM('core_configUnsupportedInBrowser'),
  )
}

function unsupportedError(): HaiError {
  const result = unsupported<never>()
  if (!result.success)
    return result.error
  throw new Error(i18n.coreM('core_configUnsupportedInBrowser'))
}

/** 浏览器端 config 占位对象，API 与 Node.js config 保持一致。 */
export const config: ConfigFn = {
  load<T>(_name: string, _filePath: string, _schema?: ZodType<T>): HaiResult<T> {
    return unsupported<T>()
  },

  validate<T>(_name: string, _schema: ZodType<T>): HaiResult<T> {
    return unsupported<T>()
  },

  get<T>(_name: string): T | undefined {
    return undefined
  },

  getOrThrow<T>(_name: string): T {
    throw new Error(i18n.coreM('core_configUnsupportedInBrowser'))
  },

  reload(_name: string): HaiResult<unknown> {
    return unsupported<unknown>()
  },

  has(_name: string): boolean {
    return false
  },

  clear(_name?: string): void {
    // 浏览器端无配置缓存，无需操作。
  },

  keys(): string[] {
    return []
  },

  watch<T = unknown>(_name: string, callback: WatchCallback<T>): () => void {
    callback(null, unsupportedError())
    return () => { }
  },

  unwatch(_name?: string): void {
    // 浏览器端无 watcher，无需操作。
  },

  isWatching(_name: string): boolean {
    return false
  },
}

/** config 子工具类型 */
export type BrowserConfigFn = typeof config
