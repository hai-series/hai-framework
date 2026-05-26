/**
 * @h-ai/api-contract — route builder
 *
 * 统一封装 oRPC 的 route builder。应用与契约包通过 `apiContract.route(...)`
 * 定义 HTTP 路由元数据，不需要直接依赖 `@orpc/contract` 或 `@h-ai/serv`。
 */

import { oc } from '@orpc/contract'

/** 创建 oRPC contract 路由节点。 */
export const route: typeof oc.route = (...args) => oc.route(...args)
