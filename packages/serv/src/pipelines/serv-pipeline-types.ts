/**
 * @h-ai/serv — Pipeline 共享类型
 *
 * 统一定义 Hono middleware 与 oRPC procedure wrapper 的最小公共类型，
 * 供默认实现与使用方自定义实现复用。
 * @module pipelines/serv-pipeline-types
 */

import type { HaiResult } from '@h-ai/core'
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

/** oRPC procedure handler 的最小上下文约束。 */
export interface ServProcedureOptions<TInput = unknown> {
  readonly input: TInput
  readonly context: ServContext
}

/** oRPC procedure handler。 */
export type ServProcedureHandler<TInput, TOutput> = (
  options: ServProcedureOptions<TInput>,
) => HaiResult<TOutput> | Promise<HaiResult<TOutput>>

/** 单参数 procedure 包装器（例如 `mapHaiError`、`requireAuth`）。 */
export type ServProcedureWrapper = <TInput, TOutput>(
  handler: ServProcedureHandler<TInput, TOutput>,
) => ServProcedureHandler<TInput, TOutput>

/** 带额外参数的 procedure 包装器（例如 `requirePermission('x', handler)`）。 */
export type ServGuardedProcedureWrapper<TRequirement> = <TInput, TOutput>(
  requirement: TRequirement,
  handler: ServProcedureHandler<TInput, TOutput>,
) => ServProcedureHandler<TInput, TOutput>
