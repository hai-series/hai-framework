/**
 * @h-ai/api-contract — route builder
 *
 * 统一封装 oRPC 的 route builder。应用与契约包通过 `apiContract.route(...)`
 * 定义 HTTP 路由元数据，不需要直接依赖 `@orpc/contract` 或 `@h-ai/serv`。
 */

import type { AnyContractProcedure } from '@orpc/contract'
import { oc } from '@orpc/contract'

/** 创建 oRPC contract 路由节点。 */
export const route: typeof oc.route = (...args) => oc.route(...args)

/**
 * 读取 contract procedure 中声明的业务路径。
 *
 * 路径只在对应 `*-contract.ts` 的 route 定义中维护；transport、client 与
 * middleware 通过本函数读取，避免再维护一份路由常量。
 *
 * @param procedure - 已声明 HTTP route 的 oRPC contract procedure
 * @returns contract 中的绝对业务路径
 */
export function pathOf(procedure: AnyContractProcedure): `/${string}` {
  const path = procedure['~orpc'].route.path
  if (!path)
    throw new Error('Contract procedure must define an HTTP path')
  return path
}
