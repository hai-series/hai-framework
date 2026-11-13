import { core } from '@h-ai/core'
import en from '../messages/en-US.json'
import ja from '../messages/ja-JP.json'
import zh from '../messages/zh-CN.json'

/**
 * 模块文案。
 * @example 模块内部上下文
 * ```ts
 * const text = runnerM('runner_invalid')
 * ```
 */
export const runnerM = core.i18n.createMessageGetter<keyof typeof zh>({ 'zh-CN': zh, 'en-US': en, 'ja-JP': ja })
