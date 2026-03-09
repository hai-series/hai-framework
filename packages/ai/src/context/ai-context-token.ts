/**
 * @h-ai/ai — Context Token 估算
 *
 * 提供轻量级 Token 估算能力，无需外部依赖。
 * @module ai-context-token
 */

import type { ChatMessage } from '../llm/ai-llm-types.js'

/**
 * 估算单条文本的 Token 数
 *
 * 使用字符级估算：中文约每字 1-2 token，英文约每 4 字符 1 token。
 * 这是一个保守估算，实际 token 数通常略低于此值。
 *
 * @param text - 文本内容
 * @param tokenRatio - 每字符对应的 token 数（默认 0.25）
 * @returns 估算 token 数
 */
export function estimateTextTokens(text: string, tokenRatio = 0.25): number {
  if (!text)
    return 0

  // 区分中文和非中文字符
  let cjkCount = 0
  let otherCount = 0

  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    // CJK 统一表意文字范围
    if (
      (code >= 0x4E00 && code <= 0x9FFF)
      || (code >= 0x3400 && code <= 0x4DBF)
      || (code >= 0x20000 && code <= 0x2A6DF)
    ) {
      cjkCount++
    }
    else {
      otherCount++
    }
  }

  // 中文：约 1.5 token/字；其他：按 tokenRatio 计算
  return Math.ceil(cjkCount * 1.5 + otherCount * tokenRatio)
}

/**
 * 估算消息列表的总 Token 数
 *
 * 包含消息结构开销（每条消息约 4 token 用于角色标记和分隔）。
 *
 * @param messages - 消息列表
 * @param tokenRatio - 每字符对应的 token 数
 * @returns 估算 token 总数
 */
export function estimateMessagesTokens(messages: ChatMessage[], tokenRatio = 0.25): number {
  let total = 0

  for (const msg of messages) {
    // 每条消息固定开销（角色标记 + 分隔符）
    total += 4

    const content = getMessageContent(msg)
    total += estimateTextTokens(content, tokenRatio)
  }

  // 回复开始标记
  total += 2

  return total
}

/**
 * 提取消息的文本内容
 */
function getMessageContent(msg: ChatMessage): string {
  if (msg.role === 'assistant') {
    const c = msg.content
    if (typeof c === 'string')
      return c
    if (Array.isArray(c))
      return (c as Array<{ type: string, text?: string }>).filter(p => p.type === 'text').map(p => p.text ?? '').join(' ')
    return ''
  }
  if (msg.role === 'tool') {
    const c = msg.content
    if (typeof c === 'string')
      return c
    if (Array.isArray(c))
      return (c as Array<{ type: string, text?: string }>).filter(p => p.type === 'text').map(p => p.text ?? '').join(' ')
    return ''
  }
  // system / user
  const content = (msg as { content: string | Array<{ type: string, text?: string }> }).content
  if (typeof content === 'string')
    return content
  if (Array.isArray(content)) {
    return content
      .filter((c): c is { type: 'text', text: string } => c.type === 'text')
      .map(c => c.text)
      .join(' ')
  }
  return ''
}
