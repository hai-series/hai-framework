/** 已知秘密的跨块字面量脱敏；不会把秘密当成正则语法。 */

/**
 * 单个逻辑文本流的脱敏器；UTF-8解码由调用方的StringDecoder完成。
 * @example const masked = createSecretMasker(['private']).write('public')
 */
export interface SecretMasker {
  /** 接收已正确解码的下一块，仅释放不可能与后续块组成秘密的前缀。 */
  write: (text: string) => string
  /** 正常流结束时释放最后一块；重复调用为空，异常终止可丢弃未释放尾部。 */
  end: () => string
}

/**
 * 创建精确字面量流式脱敏器；最多保留最长秘密长度减一的尾部。
 * @param secrets - 已知敏感值；忽略空值、去重，优先匹配同位置的较长值，总长度上限1Mi UTF-16单元
 * @returns 每次write/end的安全输出按顺序拼接得到完整脱敏文本
 * @throws 秘密总长度超限或底层表达式不能编译时抛错，调用方必须失败关闭
 * @example
 * const stream = createSecretMasker(['private-token'])
 * const output = stream.write('private-') + stream.write('token public') + stream.end()
 * // output === '*** public'
 */
export function createSecretMasker(secrets: readonly string[] = []): SecretMasker {
  const values = [...new Set(secrets.filter(Boolean))].sort((a, b) => b.length - a.length)
  if (values.reduce((total, value) => total + value.length, 0) > 1048576)
    throw new RangeError('Secret redaction input is too large')
  const pattern = values.length ? new RegExp(values.map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g') : undefined
  const tailLength = Math.max(0, (values[0]?.length ?? 1) - 1)
  let pending = ''
  let ended = false

  /** 在原文边界上计算释放位置；不能从掩码中间切分后再释放其原文尾部。 */
  function drain(final: boolean): string {
    let end = final ? pending.length : Math.max(0, pending.length - tailLength)
    // 避免向分别编码/显示回调片段的消费者交付半个Unicode代理对。
    if (end > 0 && end < pending.length && /[\uD800-\uDBFF]/.test(pending[end - 1]!) && /[\uDC00-\uDFFF]/.test(pending[end]!))
      end--
    if (end === 0)
      return ''
    let cursor = 0
    let output = ''
    if (pattern) {
      pattern.lastIndex = 0
      let match = pattern.exec(pending)
      while (match && match.index < end) {
        output += `${pending.slice(cursor, match.index)}***`
        cursor = pattern.lastIndex
        // 跨释放边界的完整匹配整体消费，不能在后续write重新暴露其后半段。
        end = Math.max(end, cursor)
        match = pattern.exec(pending)
      }
    }
    output += pending.slice(cursor, end)
    pending = pending.slice(end)
    return output
  }

  return {
    write(text) {
      if (ended)
        throw new Error('Secret masker has ended')
      pending += text
      return drain(false)
    },
    end() {
      if (ended)
        return ''
      ended = true
      return drain(true)
    },
  }
}
