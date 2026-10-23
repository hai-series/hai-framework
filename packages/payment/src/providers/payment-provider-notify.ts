/** 各渠道通知共用的 HTTP header 读取规则。 */

/**
 * 按大小写不敏感读取唯一协议头；重复大小写变体视作有歧义。
 * @param headers - 接入层保留的 HTTP headers
 * @param name - 目标名称
 * @returns 唯一字段值；缺失或重复时为 undefined
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const timestamp = getNotifyHeader({ 'Wechatpay-Timestamp': '1792627200' }, 'wechatpay-timestamp')
 * const ambiguous = getNotifyHeader({ Signature: 'first', signature: 'second' }, 'signature')
 * // timestamp 为唯一匹配值；ambiguous 为 undefined，不任选一个冲突头。
 * ```
 */
export function getNotifyHeader(headers: Record<string, string>, name: string): string | undefined {
  const values = Object.entries(headers).filter(([key]) => key.toLowerCase() === name.toLowerCase())
  return values.length === 1 ? values[0][1] : undefined
}
