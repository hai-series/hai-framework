/**
 * @h-ai/datapipe — 文本清洗功能
 *
 * 提供文本清洗工具，支持移除 HTML、URL、Email、标准化空白等。
 * @module datapipe-clean
 */

import type { HaiResult } from '@h-ai/core'

import type { CleanOptionsInput } from './datapipe-config.js'
import { core } from '@h-ai/core'

import { CleanOptionsSchema } from './datapipe-config.js'
import { datapipeConfigError, datapipeM } from './datapipe-i18n.js'
import { HaiDatapipeError } from './datapipe-types.js'

const HTML_TAG_OPEN = /<(\/?)[a-z][\w.:-]*/iy
const HTML_DOCTYPE = /<!doctype[\t\n\f\r ]+html[\t\n\f\r ]*>/iy
const HTML_SPACE = /[\t\n\f\r ]*/y

const HTML_ATTRIBUTE_NAME = /[^\t\n\f\r \0"'<>/=]+/y

const HTML_ATTRIBUTE_VALUE = /[^\t\n\f\r \0"'`=<>]+/y

function skipHtmlSpace(text: string, offset: number): number {
  HTML_SPACE.lastIndex = offset
  HTML_SPACE.test(text)
  return HTML_SPACE.lastIndex
}

/** 扫到下一个解析位置。无效标签原样保留，可在未加引号的下一个开头处恢复。 */
function scanHtmlTag(text: string, start: number): { next: number, complete: boolean } {
  if (text.startsWith('<!', start)) {
    HTML_DOCTYPE.lastIndex = start
    if (HTML_DOCTYPE.test(text))
      return { next: HTML_DOCTYPE.lastIndex, complete: true }
  }
  HTML_TAG_OPEN.lastIndex = start
  const opening = HTML_TAG_OPEN.exec(text)
  if (!opening)
    return { next: start + 1, complete: false }

  const closing = opening[1] === '/'
  let cursor = HTML_TAG_OPEN.lastIndex
  while (cursor < text.length) {
    const attributeStart = skipHtmlSpace(text, cursor)
    if (text[attributeStart] === '>')
      return { next: attributeStart + 1, complete: true }
    if (closing)
      return { next: attributeStart, complete: false }
    if (text.startsWith('/>', attributeStart))
      return { next: attributeStart + 2, complete: true }
    if (attributeStart === cursor)
      return { next: cursor, complete: false }

    HTML_ATTRIBUTE_NAME.lastIndex = attributeStart
    if (!HTML_ATTRIBUTE_NAME.test(text))
      return { next: attributeStart, complete: false }

    cursor = HTML_ATTRIBUTE_NAME.lastIndex
    const equals = skipHtmlSpace(text, cursor)
    if (text[equals] !== '=')
      continue

    const valueStart = skipHtmlSpace(text, equals + 1)
    const quote = text[valueStart]
    if (quote === '"' || quote === '\'') {
      const valueEnd = text.indexOf(quote, valueStart + 1)
      if (valueEnd < 0)
        return { next: text.length, complete: false }
      cursor = valueEnd + 1
    }
    else {
      HTML_ATTRIBUTE_VALUE.lastIndex = valueStart
      if (!HTML_ATTRIBUTE_VALUE.test(text))
        return { next: valueStart, complete: false }
      cursor = HTML_ATTRIBUTE_VALUE.lastIndex
    }
  }
  return { next: cursor, complete: false }
}

/** 移除完整标签和注释，保留正文；结果不能用于 HTML 渲染时的安全消毒。 */
function stripHtmlTags(text: string): string {
  const parts: string[] = []
  let cursor = 0
  let retained = 0
  while (cursor < text.length) {
    const start = text.indexOf('<', cursor)
    if (start < 0)
      break
    if (text.startsWith('<!--', start)) {
      const end = text.indexOf('-->', start + 4)
      if (end < 0)
        break
      parts.push(text.slice(retained, start))
      cursor = end + 3
      retained = cursor
      continue
    }
    const tag = scanHtmlTag(text, start)
    cursor = tag.next
    if (tag.complete) {
      parts.push(text.slice(retained, start))
      retained = cursor
    }
  }
  parts.push(text.slice(retained))
  return parts.join('')
}

/**
 * URL 正则（HTTP/HTTPS）
 */
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g

/**
 * Email 正则
 */
const EMAIL_REGEX = /(?<![\w.%+-])[\w.%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi

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
 * @example
 * ```ts
 * import { datapipe } from '@h-ai/datapipe'
 * const result = datapipe.clean('<p>Hello</p>', { removeHtml: true })
 * if (result.success) result.data.toUpperCase()
 * else result.error.message
 * ```
 */
export function cleanText(text: string, options?: CleanOptionsInput): HaiResult<string> {
  const parseResult = CleanOptionsSchema.safeParse(options ?? {})
  if (!parseResult.success)
    return datapipeConfigError(parseResult.error)

  const opts = parseResult.data
  let result = text

  try {
    // 移除 HTML 标签
    if (opts.removeHtml) {
      result = stripHtmlTags(result)
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
          return core.err(HaiDatapipeError.CONFIG_ERROR, datapipeM('datapipe_configError', {
            params: {
              error: String(regexError),
            },
          }), regexError)
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

    return core.ok(result)
  }
  catch (error) {
    return core.err(HaiDatapipeError.CLEAN_FAILED, datapipeM('datapipe_cleanFailed', {
      params: {
        error: String(error),
      },
    }), error)
  }
}
