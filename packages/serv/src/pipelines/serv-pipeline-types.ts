/**
 * @h-ai/serv — Pipeline 共享类型
 *
 * 统一定义 Hono middleware 与 oRPC procedure handler 类型。
 * @module pipelines/serv-pipeline-types
 */

import type { HaiResult } from '@h-ai/core'
import type {
  ErrorMap,
  Meta,
  ORPCErrorConstructorMap,
  ProcedureHandler,
  ProcedureHandlerOptions,
} from '@orpc/server'
import type { MiddlewareHandler } from 'hono'
import type { ServContext } from '../serv-context.js'

/** Serv 层 Hono middleware。 */
export type ServMiddleware = MiddlewareHandler

/**
 * Hono middleware 工厂类型。
 *
 * - 无配置 middleware：`ServMiddlewareFactory<void>`
 * - 带配置 middleware：`ServMiddlewareFactory<MyConfig>`
 */
export type ServMiddlewareFactory<TConfig = void> = [TConfig] extends [void]
  ? () => ServMiddleware
  : (config: TConfig) => ServMiddleware

/**
 * 使用 oRPC 公开 `ProcedureHandler` 定义的 HaiResult procedure handler。
 *
 * handler options 完整保留 oRPC 的路径、procedure、signal 与错误构造器信息。
 */
export type ServProcedureOptions<
  TInput = unknown,
  TContext extends ServContext = ServContext,
> = ProcedureHandlerOptions<
  TContext,
  TInput,
  ORPCErrorConstructorMap<ErrorMap>,
  Meta
>

export type ServProcedureHandler<
  TInput,
  TOutput,
  TContext extends ServContext = ServContext,
> = ProcedureHandler<TContext, TInput, HaiResult<TOutput>, ErrorMap, Meta>
