/**
 * @h-ai/api-contract — Contract 组合工具
 *
 * 提供将多个领域 contract 组合为应用级 contract 的工厂函数。
 * 仅描述接口边界，不包含任何 procedure 实现。
 * @module create-api-contract
 */

import type { AnyContractRouter } from '@orpc/contract'

/** API contract 组合输入。key 为领域名称，value 为领域 contract 或 false/undefined（跳过该领域）。 */
export type CreateApiContractOptions = Record<string, AnyContractRouter | false | undefined>

/** 根据输入过滤 false/undefined 后得到的应用级 contract 类型。 */
export type CreatedApiContract<T extends CreateApiContractOptions> = {
  readonly [K in keyof T as T[K] extends false | undefined ? never : K]: Exclude<T[K], false | undefined>
}

/**
 * 按领域组合应用级 API contract。
 *
 * contract 只描述接口边界；具体的 procedure 实现由 `@h-ai/serv` 的 feature 模块或应用层提供。
 * 传入 `false` 或 `undefined` 的领域将从最终 contract 中移除，类型也会同步收窄。
 *
 * @param options - 各领域 contract（传 false/undefined 表示禁用该领域）
 * @returns 过滤后的应用级 oRPC contract router
 *
 * @example
 * ```ts
 * import { createApiContract, iamContract, storageContract } from '@h-ai/api-contract'
 *
 * const myContract = createApiContract({
 *   iam: iamContract,
 *   storage: storageContract,
 *   payment: false, // 未启用，不会出现在 contract 或 OpenAPI spec 中
 * })
 * ```
 */
export function createApiContract<const T extends CreateApiContractOptions>(options: T): CreatedApiContract<T> {
  const contract: Record<string, AnyContractRouter> = {}

  for (const [domain, domainContract] of Object.entries(options)) {
    if (domainContract) {
      contract[domain] = domainContract
    }
  }

  return contract as CreatedApiContract<T>
}
