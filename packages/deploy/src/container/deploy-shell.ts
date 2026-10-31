/**
 * 将可信配置编码为一个 shell 参数。
 * @param value - 受信值，编码为一个远端 shell 参数。
 * @returns 可作为一个远端 shell 参数的编码文本。
 * @example 模块内部上下文
 * ```ts
 * const encoded = shellArgument("Shop's app")
 * void encoded
 * ```
 */
export function shellArgument(value: string): string {
  return `'${value.replaceAll('\'', '\'"\'"\'')}'`
}
