/**
 * @h-ai/payment — Provider HTTP 辅助
 *
 * 为各支付 Provider 的 fetch 请求统一附加超时控制。
 * @module payment-provider-http
 */

const DEFAULT_PROVIDER_TIMEOUT_MS = 15_000

/**
 * 支付渠道的有界 fetch；组合调用方取消与请求超时，不代替协议响应校验。
 * @param input - 受信支付渠道 URL；不得传入未经验证的用户目标地址。
 * @param init - 原生 fetch 请求设置；若带 signal，会与模块超时信号组合。
 * @param timeoutMs - 请求期限，单位毫秒，默认 10000。
 * @returns 原生 Response；HTTP 非成功状态仍由调用 Provider 检查。
 * @throws 网络错误、取消或超时会拒绝 Promise，由渠道 Provider 转为 HaiResult。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const response = await fetchWithTimeout('https://api.stripe.com/v1/account', {
 *   method: 'GET', signal: AbortSignal.timeout(2_000),
 * }, 5_000)
 * if (!response.ok) throw new Error('Payment channel rejected the request')
 * // 这里只说明有界 HTTP；真实请求还须由对应 Provider 注入商户凭据与协议字段。
 * ```
 */
export async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS): Promise<Response> {
  return fetch(input, {
    ...init,
    signal: init.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)])
      : AbortSignal.timeout(timeoutMs),
  })
}
