/**
 * @h-ai/api-contract — route builder
 *
 * 统一封装 oRPC 的 route builder。应用与契约包通过 `apiContract.route(...)`
 * 定义 HTTP 路由元数据，不需要直接依赖 `@orpc/contract` 或 `@h-ai/serv`。
 */

import type { AnyContractProcedure } from '@orpc/contract'
import { oc } from '@orpc/contract'

/**
 * 创建单个 HTTP 端点的 oRPC 契约构造器，供 `.input()` 和 `.output()` 添加 Schema。
 * @param route - HTTP 方法、业务路径及可选 OpenAPI 元数据。
 * @example
 * ```ts
 * import { apiContract } from '@h-ai/api-contract'
 * import { z } from 'zod'
 *
 * const health = apiContract.route({ method: 'GET', path: '/health' })
 *   .output(z.object({ healthy: z.boolean() }))
 * void health
 * ```
 */
export const route: typeof oc.route = (...args) => oc.route(...args)

/**
 * 读取 contract procedure 中声明的业务路径。
 *
 * 路径只在对应 `*-contract.ts` 的 route 定义中维护；transport、client 与
 * middleware 通过本函数读取，避免再维护一份路由常量。
 *
 * @param procedure - 路由树的单个端点，如 `apiContract.iam.auth.login`，或 `.route(...).input(...).output(...)` 得到的节点。
 * @returns 声明的路径模板，保留 `{id}` 等占位符。API 前缀由宿主添加。
 * @throws 端点缺少显式 `path` 时抛出 `Error`。
 * @example
 * ```ts
 * import { apiContract } from '@h-ai/api-contract'
 *
 * const loginPath = apiContract.pathOf(apiContract.iam.auth.login)
 * // 传入 login 端点定义，得到 /auth/login，供宿主拼接 API 前缀。
 * void loginPath
 * ```
 */
export function pathOf(procedure: AnyContractProcedure): `/${string}` {
  const path = procedure['~orpc'].route.path
  if (!path)
    throw new Error('Contract procedure must define an HTTP path')
  return path
}
