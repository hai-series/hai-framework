/**
 * @h-ai/datapipe — 文本清洗功能
 *
 * 提供文本清洗工具，支持移除 HTML、URL、Email、标准化空白等。
 * @module datapipe-clean
 */

import type { HaiResult } from '@h-ai/core'
import type { CleanOptionsInput } from './datapipe-config.js'

import { err, ok } from '@h-ai/core'

import { CleanOptionsSchema } from './datapipe-config.js'
import { datapipeM } from './datapipe-i18n.js'
import { HaiDatapipeError } from './datapipe-types.js'

/**
 * HTML 标签正则
 */
const HTML_TAG_REGEX = /<[^>]*>/g

/**
 * URL 正则（HTTP/HTTPS）
 */
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g

/**
 * Email 正则
 */
const EMAIL_REGEX = /[\w.%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi

/**
 * 多空行正则（3行及以上空行 → 2行）
 */
const MULTI_NEWLINE_REGEX = /\n{3,}/g

/**
 * 多空格正则
 */
const MULTI_SPACE_REGEX = /[ \t]{2,}/g

/**
 * 清洗文本
 *
 * 根据配置选项对文本进行清洗处理。
 *
 * @param text - 原始文本
 * @param options - 清洗选项（可选）
 * @returns 清洗后的文本
 *
 * @example
 * ```ts
 * const result = cleanText('<p>Hello World</p>', { removeHtml: true })
 * // result.data === 'Hello World'
 * ```
 */
export function cleanText(text: string, options?: CleanOptionsInput): HaiResult<string> {
  const parseResult = CleanOptionsSchema.safeParse(options ?? {})
  if (!parseResult.success) {
    return err(HaiDatapipeError.CONFIG_ERROR, datapipeM('datapipe_configError', { params: { error: parseResult.error.message } }), parseResult.error)
  }

  const opts = parseResult.data
  let result = text

  try {
    // 移除 HTML 标签
    if (opts.removeHtml) {
      result = result.replace(HTML_TAG_REGEX, '')
    }

    // 移除 URL
    if (opts.removeUrls) {
      result = result.replace(URL_REGEX, '')
    }

    // 移除 Email
    if (opts.removeEmails) {
      result = result.replace(EMAIL_REGEX, '')
    }

    // 自定义替换
    if (opts.customReplacements) {
      for (const { pattern, replacement } of opts.customReplacements) {
        let regex: RegExp
        try {
          regex = new RegExp(pattern, 'g')
        }
        catch (regexError) {
          return err(HaiDatapipeError.CONFIG_ERROR, datapipeM('datapipe_configError', { params: { error: String(regexError) } }), regexError)
        }
        result = result.replace(regex, replacement)
      }
    }

    // 标准化空白
    if (opts.normalizeWhitespace) {
      result = result.replace(MULTI_SPACE_REGEX, ' ')
      result = result.replace(MULTI_NEWLINE_REGEX, '\n\n')
    }

    // 去除首尾空白
    if (opts.trim) {
      result = result.trim()
    }

    return ok(result)
  }
  catch (error) {
    return err(HaiDatapipeError.CLEAN_FAILED, datapipeM('datapipe_cleanFailed', { params: { error: String(error) } }), error)
  }
}
