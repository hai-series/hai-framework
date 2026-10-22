/** 各渠道通知共用的 HTTP header 读取规则。 */

/**
 * 大小写无关读取唯一 header；重复大小写变体视为歧义而拒绝。
 * @param headers - 接入层保留的 HTTP headers
 * @param name - 目标名称
 * @returns 唯一字段值；缺失或重复时为 undefined
 * @example getNotifyHeader({ 'Wechatpay-Serial': 'PUB_KEY_ID_1' }, 'wechatpay-serial')
 */
export function getNotifyHeader(headers: Record<string, string>, name: string): string | undefined {
  const values = Object.entries(headers).filter(([key]) => key.toLowerCase() === name.toLowerCase())
  return values.length === 1 ? values[0][1] : undefined
}
