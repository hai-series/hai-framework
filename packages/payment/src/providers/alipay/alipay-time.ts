/** 支付宝协议中的北京时间格式化与真实日历校验。 */

const beijingFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

/**
 * 格式化为支付宝要求的北京时间，不依赖当前节点的 TZ。
 * @param date - 待格式化的有效时间
 * @returns yyyy-MM-dd HH:mm:ss 格式的北京时间
 * @example formatAlipayTime(new Date('2026-10-22T00:00:00Z')) // '2026-10-22 08:00:00'
 */
export function formatAlipayTime(date: Date): string {
  const parts = Object.fromEntries(beijingFormatter.formatToParts(date).map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`
}

/**
 * 严格解析北京时间；回读校验拒绝 2 月 30 日等会被 Date 自动归一化的值。
 * @param value - 支付宝协议的北京时间字符串
 * @returns 对应的绝对时间；格式或日历非法时为 undefined
 * @example parseAlipayTime('2026-10-22 08:00:00')?.toISOString() // '2026-10-22T00:00:00.000Z'
 */
export function parseAlipayTime(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value))
    return undefined
  const date = new Date(`${value.replace(' ', 'T')}+08:00`)
  return Number.isFinite(date.getTime()) && formatAlipayTime(date) === value ? date : undefined
}
