import type { JsonFieldPreview, JsonFieldPreviewOptions } from './ai-llm-types.js'

const escapedCharacters: Readonly<Record<string, string>> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  'b': '\b',
  'f': '\f',
  'n': '\n',
  'r': '\r',
  't': '\t',
}

/**
 * 增量读取 JSON 中指定的顶层字符串，不消费其他字段作为预览。
 * @param field - 需预览的 JSON 键
 * @param options - 预览和累计输入的 UTF-16 上限
 * @returns 每次响应独立使用的前缀读取器
 * @throws 无效字段或限制时抛出 RangeError
 * @example 模块内部上下文
 * ```ts
 * const parser = createJsonFieldPreview('text')
 * const prefix = parser.push('{"text":"收到')
 * ```
 */
export function createJsonFieldPreview(field: string, options: JsonFieldPreviewOptions = {}): JsonFieldPreview {
  const { maxLength = 12_000, maxInputLength = 1_000_000 } = options
  if (!field || !Number.isSafeInteger(maxLength) || maxLength < 1
    || !Number.isSafeInteger(maxInputLength) || maxInputLength < 1) {
    throw new RangeError('Invalid JSON preview limits')
  }

  let received = 0
  let depth = 0
  let phase: 'root' | 'key' | 'colon' | 'value' | 'afterValue' = 'root'
  let inString = false
  let capture: 'key' | 'value' | undefined
  let escaping = false
  let unicode: string | undefined
  let token = ''
  let matches = false
  let preview = ''
  let published = ''
  let finished = false

  function append(character: string): void {
    if (capture === 'key' && token.length <= field.length)
      token += character
    if (capture === 'value' && preview.length < maxLength)
      preview += character
  }

  function readString(character: string): void {
    if (unicode !== undefined) {
      if (!/^[\da-f]$/i.test(character)) {
        finished = true
        return
      }
      unicode += character
      if (unicode.length === 4) {
        append(String.fromCharCode(Number.parseInt(unicode, 16)))
        unicode = undefined
      }
      return
    }
    if (escaping) {
      escaping = false
      if (character === 'u') {
        unicode = ''
      }
      else if (Object.hasOwn(escapedCharacters, character)) {
        append(escapedCharacters[character])
      }
      else {
        finished = true
      }
      return
    }
    if (character === '\\') {
      escaping = true
      return
    }
    if (character !== '"') {
      append(character)
      return
    }

    inString = false
    if (capture === 'key') {
      matches = token === field
      phase = 'colon'
    }
    else if (capture === 'value') {
      finished = true
    }
    capture = undefined
  }

  return {
    push(fragment) {
      received += fragment.length
      if (received > maxInputLength)
        throw new RangeError('JSON stream exceeds its input length limit')
      for (const character of fragment) {
        if (finished)
          break
        if (inString) {
          readString(character)
          continue
        }
        if (/\s/u.test(character))
          continue
        if (phase === 'root') {
          if (character !== '{') {
            finished = true
            break
          }
          depth = 1
          phase = 'key'
          continue
        }
        if (character === '"') {
          inString = true
          if (depth === 1 && phase === 'key') {
            capture = 'key'
            token = ''
          }
          else if (depth === 1 && phase === 'value') {
            capture = matches ? 'value' : undefined
            phase = 'afterValue'
          }
        }
        else if (character === '{' || character === '[') {
          if (depth === 1 && phase === 'value')
            phase = 'afterValue'
          depth++
        }
        else if (character === '}' || character === ']') {
          if (--depth === 0)
            finished = true
        }
        else if (depth === 1) {
          if (character === ':' && phase === 'colon')
            phase = 'value'
          else if (character === ',' && phase === 'afterValue')
            phase = 'key'
          else if (phase === 'value')
            phase = 'afterValue'
        }
      }
      const prefix = preview.slice(0, maxLength).replace(/[\uD800-\uDBFF]$/u, '')
      if (prefix === published)
        return undefined
      published = prefix
      return prefix
    },
  }
}
