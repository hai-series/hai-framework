/**
 * @h-ai/serv — Handler pipeline 入口
 *
 * 提供统一的 procedure handler 拦截器类型和扩展点。
 * 目前主要作为未来接入 metrics/trace 的展位，暂时过透拦截器。
 * @module pipeline/handler
 */

/** Handler 错误拦截器类型。封装 `(options, next)` 模式，类似 koa/express 中间件。 */
export type ServHandlerInterceptor<TOptions, TResult> = (
  options: TOptions,
  next: () => Promise<TResult>,
) => Promise<TResult>

/** handler pipeline 预留入口，便于后续统一接入 metrics/trace。 */
export const handlerPipeline = {
  trace: <TOptions, TResult>(interceptor: ServHandlerInterceptor<TOptions, TResult>) => interceptor,
}
