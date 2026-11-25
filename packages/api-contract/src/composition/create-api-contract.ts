/**
 * @h-ai/api-contract — Contract 组合工具
 *
 * 提供将多个领域 contract 组合为应用级 contract 的工厂函数。
 * 仅描述接口边界，不包含任何 procedure 实现。
 * @module create-api-contract
 */

import type { AnyContractRouter } from '@orpc/contract'

/**
 * API contract 组合输入。key 为领域名称，value 为领域 contract 或 false/undefined（跳过该领域）。
 * @example
 * ```ts
 *
 * import { type CreateApiContractOptions, apiContract } from '@h-ai/api-contract'
 *
 * const parts = { iam: apiContract.iam, payment: false } satisfies CreateApiContractOptions
 * const contract = apiContract.create(parts)
 * void contract.iam.auth.login
 * ```
 */
export type CreateApiContractOptions = Record<string, AnyContractRouter | false | undefined>

/**
 * 从领域输入类型移除表示禁用的 `false` 和 `undefined`。
 * @example 模块内部上下文
 * ```ts
 * function enabledContract(value: CreateApiContractOptions[string]): EnabledContract<typeof value> | undefined {
 *   return value || undefined
 * }
 * void enabledContract
 * ```
 */
type EnabledContract<T> = Exclude<T, false | undefined>

/**
 * 根据输入过滤 false/undefined 后得到的应用级 contract 类型。
 * 具名字段会保留固定启用的领域，省略固定禁用的领域，并将条件启用的领域标为可选。
 * 提前宽化为字符串索引的字典保留 oRPC router 所需的索引类型。用 `satisfies` 可保留具体字段信息。
 * @example
 * ```ts
 *
 * import { type CreatedApiContract, apiContract } from '@h-ai/api-contract'
 *
 * const parts = { iam: apiContract.iam, payment: false } as const
 * const contract: CreatedApiContract<typeof parts> = apiContract.create(parts)
 * void contract.iam.auth.login
 * ```
 */
export type CreatedApiContract<T extends CreateApiContractOptions>
  = string extends keyof T
    ? { readonly [K in keyof T]: EnabledContract<T[K]> }
    : {
      readonly [K in keyof T as T[K] extends AnyContractRouter ? K : never]: T[K]
    } & {
      readonly [K in keyof T as T[K] extends AnyContractRouter ? never : T[K] extends false | undefined ? never : K]?: EnabledContract<T[K]>
    }

/**
 * 按领域组合应用级 API contract。
 *
 * contract 只描述接口边界；具体的 procedure 实现由 `@h-ai/serv` 的 feature 模块或应用层提供。
 * 传入 `false` 或 `undefined` 的领域将从最终 contract 中移除。条件启用的具名领域可能缺席，访问前应判断是否存在。
 *
 * @param options - 各领域 contract（传 false/undefined 表示禁用该领域）
 * @returns 过滤后的应用级 oRPC contract router
 * @example
 * ```ts
 * import { apiContract } from '@h-ai/api-contract'
 *
 * const contract = apiContract.create({ iam: apiContract.iam, payment: false })
 * const loginPath = apiContract.pathOf(contract.iam.auth.login)
 * void loginPath
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
